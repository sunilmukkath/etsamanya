const crypto = require("crypto");
const { json, readBody } = require("../../lib/http");
const { withDb, holdStock, storeReady, readDb } = require("../../lib/store");
const { priceItem, needsEnquire, goodsTotal, shippingOf, stockNeeds, pinOk, taxBreakup } = require("../../lib/catalog");
const { hashPassword, readSession } = require("../../lib/auth");

function opOf(req) {
  return String((req.query && req.query.op) || "").replace(/\/$/, "");
}

function txnId() {
  return ("SM" + Date.now().toString(36) + crypto.randomBytes(4).toString("hex")).toUpperCase();
}

module.exports = async function handler(req, res) {
  const op = opOf(req);
  if (op === "create") {
    if (req.method !== "POST") return json(res, 405, { error: "Use POST" });
    if (!storeReady()) return json(res, 503, { error: "The order book is not connected yet." });
    try {
      const body = await readBody(req);
      const session = readSession(req, "user");
      const rawItems = Array.isArray(body.items) ? body.items : [];
      const items = rawItems.map(priceItem).filter((item) => !needsEnquire(item.qty));
      if (!items.length) return json(res, 400, { error: "Add a gift under 25 to pay here." });
      const customer = {
        name: String(body.firstname || body.name || "").trim().slice(0, 80),
        email: String(body.email || "").trim().toLowerCase().slice(0, 120),
        phone: String(body.phone || "").trim().slice(0, 20),
        address: String(body.address || "").trim().slice(0, 400),
        city: String(body.city || "").trim().slice(0, 80),
        pincode: String(body.pincode || "").trim().slice(0, 10),
        state: String(body.state || "").trim().slice(0, 80),
        gstin: String(body.gstin || "").trim().toUpperCase().slice(0, 15)
      };
      if (!customer.name || !customer.email || !customer.phone || !customer.address || !customer.city || !customer.state) {
        return json(res, 400, { error: "Name, email, phone, and address are needed to pack." });
      }
      if (!pinOk(customer.pincode)) return json(res, 400, { error: "Enter a valid 6-digit Indian PIN code." });
      const order = await withDb(async (db) => {
        const goods = goodsTotal(items);
        const shipping = shippingOf(goods, db.settings);
        const payable = goods + shipping;
        const tax = taxBreakup(payable, db.settings.gstRate, customer.state, db.settings.sellerState);
        const stockLines = [];
        items.forEach((item) => {
          stockNeeds(item).forEach((need) => {
            const found = stockLines.find((row) => row.id === need.id);
            if (found) found.qty += need.qty;
            else stockLines.push({ id: need.id, qty: need.qty });
          });
        });
        holdStock(db, stockLines);
        const id = txnId();
        const created = {
          txnid: id,
          status: "pending",
          createdAt: Date.now(),
          items,
          stockLines,
          stockHeld: true,
          customer,
          goods,
          shipping,
          payable,
          tax,
          invoiceToken: crypto.randomBytes(12).toString("hex"),
          userEmail: (session && session.email) || customer.email
        };
        db.orders[id] = created;
        db.orderIds.unshift(id);
        const password = String(body.password || "");
        if (password.length >= 8 && !db.users[customer.email]) {
          db.users[customer.email] = {
            email: customer.email,
            name: customer.name,
            phone: customer.phone,
            password: hashPassword(password),
            createdAt: Date.now()
          };
        }
        return created;
      });
      return json(res, 200, { txnid: order.txnid, payable: order.payable, shipping: order.shipping, goods: order.goods });
    } catch (err) {
      return json(res, err.status || 500, { error: err.message || "Could not create the order." });
    }
  }
  if (op === "lookup") {
    if (req.method !== "POST") return json(res, 405, { error: "Use POST" });
    const body = await readBody(req);
    const txnid = String(body.txnid || "").trim().toUpperCase();
    const email = String(body.email || "").trim().toLowerCase();
    if (!txnid || !email) return json(res, 400, { error: "Order number and email are needed." });
    const db = await readDb();
    const order = db.orders[txnid];
    if (!order || order.customer.email !== email) return json(res, 404, { error: "No order matches that email." });
    return json(res, 200, {
      order: {
        txnid: order.txnid,
        status: order.status,
        payable: order.payable,
        shipping: order.shipping,
        goods: order.goods,
        invoiceNo: order.invoiceNo || "",
        tracking: order.tracking || "",
        awb: order.awb || "",
        createdAt: order.createdAt,
        paidAt: order.paidAt || null,
        items: (order.items || []).map((item) => ({
          label: item.label,
          qty: item.qty,
          price: item.price,
          recipient: item.recipient || "",
          message: item.message || ""
        })),
        customer: {
          name: order.customer.name,
          email: order.customer.email,
          city: order.customer.city,
          pincode: order.customer.pincode,
          state: order.customer.state
        }
      },
      invoiceToken: order.status === "paid" ? order.invoiceToken : ""
    });
  }
  if (op === "receipt") {
    const url = new URL(req.url, "https://samanyastore.com");
    const txnid = String(url.searchParams.get("txnid") || "").trim().toUpperCase();
    if (!txnid) return json(res, 400, { error: "Missing order." });
    const db = await readDb();
    const order = db.orders[txnid];
    if (!order) return json(res, 404, { error: "Order not found." });
    return json(res, 200, {
      txnid: order.txnid,
      status: order.status,
      payable: order.payable,
      invoiceNo: order.invoiceNo || "",
      invoiceToken: order.status === "paid" ? order.invoiceToken : "",
      tracking: order.tracking || "",
      packedNote: db.settings.packedNote
    });
  }
  if (op === "pay") {
    const url = new URL(req.url, "https://samanyastore.com");
    const txnid = String(url.searchParams.get("id") || url.searchParams.get("txnid") || "").trim().toUpperCase();
    const token = String(url.searchParams.get("t") || "").trim();
    if (!txnid || !token) return json(res, 400, { error: "Missing payment link." });
    const db = await readDb();
    const order = db.orders[txnid];
    if (!order || order.invoiceToken !== token) return json(res, 404, { error: "This payment link is not valid." });
    if (order.status === "paid" || order.status === "packed" || order.status === "shipped") {
      return json(res, 200, { paid: true, txnid: order.txnid, invoiceNo: order.invoiceNo || "" });
    }
    if (order.status !== "pending") {
      return json(res, 400, { error: order.status === "expired" ? "This payment link has expired." : "This link is not open for PayU yet." });
    }
    const c = order.customer || {};
    return json(res, 200, {
      txnid: order.txnid,
      payable: order.payable,
      shipping: order.shipping,
      goods: order.goods,
      packedNote: db.settings.packedNote,
      expiresAt: order.expiresAt || null,
      items: (order.items || []).map((item) => ({
        label: item.label,
        qty: item.qty,
        price: item.price
      })),
      customer: {
        name: c.name,
        email: c.email,
        phone: c.phone,
        city: c.city,
        state: c.state
      }
    });
  }
  json(res, 404, { error: "Unknown order route." });
};

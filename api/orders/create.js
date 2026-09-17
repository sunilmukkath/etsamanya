const crypto = require("crypto");
const { json, readBody } = require("../../lib/http");
const { withDb, holdStock, storeReady } = require("../../lib/store");
const { priceItem, needsEnquire, goodsTotal, shippingOf, stockNeeds, pinOk, taxBreakup } = require("../../lib/catalog");
const { hashPassword, readSession } = require("../../lib/auth");

function txnId() {
  return ("SM" + Date.now().toString(36) + crypto.randomBytes(4).toString("hex")).toUpperCase();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Use POST" });
    return;
  }
  if (!storeReady()) {
    json(res, 503, { error: "The order book is not connected yet." });
    return;
  }
  try {
    const body = await readBody(req);
    const session = readSession(req, "user");
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = rawItems.map(priceItem).filter((item) => !needsEnquire(item.qty));
    if (!items.length) {
      json(res, 400, { error: "Add a gift under 25 to pay here." });
      return;
    }
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
      json(res, 400, { error: "Name, email, phone, and address are needed to pack." });
      return;
    }
    if (!pinOk(customer.pincode)) {
      json(res, 400, { error: "Enter a valid 6-digit Indian PIN code." });
      return;
    }
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
        userEmail: session && session.email || customer.email
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
    json(res, 200, { txnid: order.txnid, payable: order.payable, shipping: order.shipping, goods: order.goods });
  } catch (err) {
    json(res, err.status || 500, { error: err.message || "Could not create the order." });
  }
};

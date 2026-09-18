const { json, readBody, originOf } = require("../../lib/http");
const { requireAdmin, adminConfigured, checkAdminPassword, sessionCookie, readSession, clearCookie } = require("../../lib/auth");
const { readDb, withDb, restock, available, storeReady, publicSettings } = require("../../lib/store");
const { notifyPaid, notifyCompose } = require("../../lib/notify");
const { pushOrder } = require("../../lib/shiprocket");
const { assemble, convertEstimate, applyCustomer, payUrl, invoiceUrl } = require("../../lib/compose");
const { ensureDocNumbers } = require("../../lib/invoice");
const { catalogList } = require("../../lib/catalog");

function opOf(req) {
  return String((req.query && req.query.op) || "").replace(/\/$/, "");
}

const SETTING_KEYS = [
  "legalName", "tradeName", "address", "sellerState", "sellerStateCode",
  "email", "phone", "whatsapp", "gstin", "gstRate", "hsn",
  "shippingFlat", "shippingFreeAbove", "notifyEmail", "packedNote"
];

function customersOf(db) {
  const map = {};
  Object.values(db.users || {}).forEach((user) => {
    map[user.email] = {
      email: user.email,
      name: user.name,
      phone: user.phone || "",
      address: "",
      city: "",
      pincode: "",
      state: "",
      registered: true,
      orders: 0,
      spent: 0
    };
  });
  (db.orderIds || []).forEach((id) => {
    const order = db.orders[id];
    if (!order || !order.customer) return;
    const c = order.customer;
    const email = c.email;
    if (!map[email]) {
      map[email] = {
        email,
        name: c.name,
        phone: c.phone || "",
        address: "",
        city: "",
        pincode: "",
        state: "",
        registered: false,
        orders: 0,
        spent: 0
      };
    }
    map[email].orders += 1;
    if (["paid", "packed", "shipped"].includes(order.status)) map[email].spent += Number(order.payable || 0);
    if (!map[email].address && c.address) map[email].address = c.address;
    if (!map[email].city && c.city) map[email].city = c.city;
    if (!map[email].pincode && c.pincode) map[email].pincode = c.pincode;
    if (!map[email].state && c.state) map[email].state = c.state;
    if (!map[email].phone && c.phone) map[email].phone = c.phone;
    if (!map[email].name && c.name) map[email].name = c.name;
  });
  return Object.values(map).sort((a, b) => b.spent - a.spent);
}

module.exports = async function handler(req, res) {
  const op = opOf(req);
  if (op === "login") {
    if (req.method !== "POST") return json(res, 405, { error: "Use POST" });
    if (!adminConfigured()) return json(res, 503, { error: "Set ADMIN_PASSWORD on Vercel, then return here." });
    const body = await readBody(req);
    if (!checkAdminPassword(body.password || "")) return json(res, 401, { error: "That password is not right." });
    return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("admin", { role: "admin" }, 14) });
  }
  if (op === "logout") {
    return json(res, 200, { ok: true }, { "Set-Cookie": clearCookie("samanya_admin") });
  }
  if (op === "session") {
    return json(res, 200, {
      signedIn: Boolean(readSession(req, "admin")),
      adminConfigured: adminConfigured(),
      storeReady: storeReady()
    });
  }
  if (!requireAdmin(req, res)) return;
  if (op === "catalog") {
    return json(res, 200, catalogList());
  }
  if (op === "compose") {
    if (req.method !== "POST") return json(res, 405, { error: "Use POST" });
    if (!storeReady()) return json(res, 503, { error: "The order book is not connected yet." });
    try {
      const body = await readBody(req);
      const origin = originOf(req);
      const saved = await withDb(async (db) => {
        const created = assemble(db, body);
        db.orders[created.txnid] = created;
        db.orderIds.unshift(created.txnid);
        return created;
      });
      let mail = null;
      if (body.send) {
        const db = await readDb();
        mail = await notifyCompose(saved, db.settings, origin);
        await withDb(async (inner) => {
          if (inner.orders[saved.txnid]) inner.orders[saved.txnid].composeMail = mail;
        });
      }
      return json(res, 200, {
        ok: true,
        order: saved,
        payUrl: saved.status === "pending" ? payUrl(origin, saved) : "",
        invoiceUrl: invoiceUrl(origin, saved),
        mail
      });
    } catch (err) {
      return json(res, err.status || 500, { error: err.message || "Could not compose." });
    }
  }
  if (op === "convert") {
    if (req.method !== "POST") return json(res, 405, { error: "Use POST" });
    const body = await readBody(req);
    const id = String(body.txnid || body.id || "").trim().toUpperCase();
    const origin = originOf(req);
    try {
      const order = await withDb(async (db) => {
        const current = db.orders[id];
        if (!current) {
          const err = new Error("Order not found.");
          err.status = 404;
          throw err;
        }
        convertEstimate(db, current, body.days);
        return current;
      });
      let mail = null;
      if (body.send) {
        const db = await readDb();
        mail = await notifyCompose(order, db.settings, origin);
      }
      return json(res, 200, {
        ok: true,
        order,
        payUrl: payUrl(origin, order),
        invoiceUrl: invoiceUrl(origin, order),
        mail
      });
    } catch (err) {
      return json(res, err.status || 500, { error: err.message || "Could not make a payment link." });
    }
  }
  if (op === "orders") {
    if (req.method === "GET") {
      const url = new URL(req.url, "https://samanyastore.com");
      const id = String(url.searchParams.get("id") || "").trim().toUpperCase();
      const db = await readDb();
      if (id) {
        const order = db.orders[id];
        if (!order) return json(res, 404, { error: "Order not found." });
        return json(res, 200, { order });
      }
      const orders = db.orderIds.map((key) => {
        const order = db.orders[key];
        if (!order) return null;
        return {
          txnid: order.txnid,
          status: order.status,
          payable: order.payable,
          createdAt: order.createdAt,
          paidAt: order.paidAt || null,
          name: order.customer.name,
          email: order.customer.email,
          phone: order.customer.phone,
          city: order.customer.city,
          invoiceNo: order.invoiceNo || "",
          estimateNo: order.estimateNo || "",
          tracking: order.tracking || "",
          awb: order.awb || "",
          invoiceToken: order.invoiceToken || "",
          stockWarning: order.stockWarning || "",
          items: (order.items || []).map((item) => item.qty + " × " + item.label)
        };
      }).filter(Boolean);
      return json(res, 200, { orders });
    }
    if (req.method !== "PATCH") return json(res, 405, { error: "Use GET or PATCH" });
    const body = await readBody(req);
    const id = String(body.txnid || body.id || "").trim().toUpperCase();
    try {
      const order = await withDb(async (db) => {
        const current = db.orders[id];
        if (!current) {
          const err = new Error("Order not found.");
          err.status = 404;
          throw err;
        }
        if (body.status) {
          const next = String(body.status);
          if (["cancelled", "refunded"].includes(next) && !["cancelled", "refunded"].includes(current.status)) {
            restock(db, current);
          }
          current.status = next;
          ensureDocNumbers(db, current);
        }
        if (body.tracking != null) current.tracking = String(body.tracking).slice(0, 200);
        if (body.awb != null) current.awb = String(body.awb).slice(0, 80);
        if (body.note != null) current.adminNote = String(body.note).slice(0, 800);
        const customerPatch = body.customer && typeof body.customer === "object" ? { ...body.customer } : {};
        ["name", "email", "phone", "address", "city", "pincode", "state", "gstin"].forEach((key) => {
          if (body[key] != null && customerPatch[key] == null) customerPatch[key] = body[key];
        });
        if (Object.keys(customerPatch).length) {
          applyCustomer(current, customerPatch, db.settings);
        }
        if (body.resend) current.notifiedAt = 0;
        return current;
      });
      if (body.resend && (order.status === "paid" || order.status === "pending" || order.status === "estimate")) {
        const db = await readDb();
        const results = order.status === "paid"
          ? await notifyPaid(order, db.settings, originOf(req))
          : await notifyCompose(order, db.settings, originOf(req));
        await withDb(async (inner) => {
          if (inner.orders[id]) {
            inner.orders[id].notifiedAt = Date.now();
            inner.orders[id].notify = results;
          }
        });
      }
      return json(res, 200, { ok: true, order });
    } catch (err) {
      return json(res, err.status || 500, { error: err.message || "Could not update the order." });
    }
  }
  if (op === "stock") {
    if (req.method === "GET") {
      const db = await readDb();
      const stock = Object.keys(db.stock).map((id) => ({
        id,
        label: db.stock[id].label,
        qty: db.stock[id].qty,
        reserved: db.stock[id].reserved || 0,
        available: available(db, id)
      }));
      return json(res, 200, { stock });
    }
    if (req.method !== "PUT") return json(res, 405, { error: "Use GET or PUT" });
    const body = await readBody(req);
    const rows = Array.isArray(body.stock) ? body.stock : [];
    const stock = await withDb(async (db) => {
      rows.forEach((row) => {
        if (!db.stock[row.id]) return;
        if (row.qty != null) db.stock[row.id].qty = Math.max(0, parseInt(row.qty, 10) || 0);
        if (row.label) db.stock[row.id].label = String(row.label).slice(0, 80);
      });
      return db.stock;
    });
    return json(res, 200, { ok: true, stock });
  }
  if (op === "sales") {
    const url = new URL(req.url, "https://samanyastore.com");
    const days = parseInt(url.searchParams.get("days") || "30", 10) || 30;
    const since = Date.now() - days * 86400000;
    const db = await readDb();
    const paid = db.orderIds.map((id) => db.orders[id]).filter((order) => {
      if (!order) return false;
      if (!["paid", "packed", "shipped"].includes(order.status)) return false;
      return Number(order.paidAt || order.createdAt) >= since;
    });
    const bySku = {};
    let gross = 0;
    let shipping = 0;
    paid.forEach((order) => {
      gross += Number(order.payable || 0);
      shipping += Number(order.shipping || 0);
      (order.items || []).forEach((item) => {
        const key = item.label;
        if (!bySku[key]) bySku[key] = { label: key, qty: 0, amount: 0 };
        bySku[key].qty += item.qty;
        bySku[key].amount += item.price * item.qty;
      });
    });
    const pending = db.orderIds.filter((id) => db.orders[id] && db.orders[id].status === "pending").length;
    return json(res, 200, {
      days,
      orders: paid.length,
      pending,
      gross,
      shipping,
      bySku: Object.values(bySku).sort((a, b) => b.amount - a.amount)
    });
  }
  if (op === "customers") {
    if (req.method === "PATCH") {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      if (!email || !email.includes("@")) return json(res, 400, { error: "A real email is needed." });
      try {
        const saved = await withDb(async (db) => {
          const patch = {
            name: body.name,
            phone: body.phone,
            address: body.address,
            city: body.city,
            pincode: body.pincode,
            state: body.state,
            gstin: body.gstin
          };
          const user = db.users[email];
          if (user) {
            if (body.name != null) user.name = String(body.name).trim().slice(0, 80) || user.name;
            if (body.phone != null) user.phone = String(body.phone).trim().slice(0, 20);
          }
          const matches = db.orderIds.map((id) => db.orders[id]).filter((order) => {
            return order && order.customer && order.customer.email === email;
          });
          const open = matches.filter((order) => order.status === "estimate" || order.status === "pending");
          if (!user && !open.length) {
            const err = new Error("No open estimate or PayU link. Open the order to change a paid invoice.");
            err.status = 400;
            throw err;
          }
          open.forEach((order) => applyCustomer(order, patch, db.settings));
          return { updated: open.map((order) => order.txnid) };
        });
        const db = await readDb();
        return json(res, 200, { ok: true, updated: saved.updated, customers: customersOf(db) });
      } catch (err) {
        return json(res, err.status || 500, { error: err.message || "Could not update the customer." });
      }
    }
    const db = await readDb();
    return json(res, 200, { customers: customersOf(db) });
  }
  if (op === "settings") {
    if (req.method === "GET") {
      const db = await readDb();
      return json(res, 200, { settings: db.settings, public: publicSettings(db) });
    }
    if (req.method !== "PUT") return json(res, 405, { error: "Use GET or PUT" });
    const body = await readBody(req);
    const settings = await withDb(async (db) => {
      SETTING_KEYS.forEach((key) => {
        if (body[key] == null) return;
        if (["gstRate", "shippingFlat", "shippingFreeAbove"].includes(key)) db.settings[key] = Number(body[key]) || 0;
        else if (key === "whatsapp" || key === "phone") db.settings[key] = String(body[key]).replace(/\D/g, "");
        else db.settings[key] = String(body[key]).trim();
      });
      return db.settings;
    });
    return json(res, 200, { ok: true, settings });
  }
  if (op === "shiprocket") {
    if (req.method !== "POST") return json(res, 405, { error: "Use POST" });
    const body = await readBody(req);
    const id = String(body.txnid || "").trim().toUpperCase();
    try {
      const result = await withDb(async (db) => {
        const order = db.orders[id];
        if (!order) {
          const err = new Error("Order not found.");
          err.status = 404;
          throw err;
        }
        if (!["paid", "packed", "shipped"].includes(order.status)) {
          const err = new Error("Only paid orders can go to Shiprocket.");
          err.status = 400;
          throw err;
        }
        const data = await pushOrder(order, db.settings);
        order.shiprocket = data;
        order.awb = data.awb_code || order.awb || "";
        if (data.awb_code) order.status = "shipped";
        return { order, data };
      });
      return json(res, 200, { ok: true, shiprocket: result.data, order: result.order });
    } catch (err) {
      return json(res, err.status || 500, { error: err.message || "Shiprocket failed." });
    }
  }
  json(res, 404, { error: "Unknown admin route." });
};

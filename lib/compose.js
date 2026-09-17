const crypto = require("crypto");
const { priceAdminItem, goodsTotalAll, shippingOf, stockNeeds, taxBreakup, pinOk } = require("./catalog");
const { holdStock } = require("./store");

function parseCustomer(body, loose) {
  const customer = {
    name: String(body.name || body.firstname || "").trim().slice(0, 80),
    email: String(body.email || "").trim().toLowerCase().slice(0, 120),
    phone: String(body.phone || "").trim().slice(0, 20),
    address: String(body.address || "").trim().slice(0, 400),
    city: String(body.city || "").trim().slice(0, 80),
    pincode: String(body.pincode || "").trim().slice(0, 10),
    state: String(body.state || "").trim().slice(0, 80),
    gstin: String(body.gstin || "").trim().toUpperCase().slice(0, 15)
  };
  if (!customer.name || !customer.email || !customer.email.includes("@")) {
    const err = new Error("Name and a real email are needed.");
    err.status = 400;
    throw err;
  }
  if (!loose) {
    if (!customer.phone || !customer.address || !customer.city || !customer.state || !pinOk(customer.pincode)) {
      const err = new Error("Phone, full address, and a 6-digit PIN are needed for a payment link.");
      err.status = 400;
      throw err;
    }
  }
  return customer;
}

function parseItems(raw) {
  const items = (Array.isArray(raw) ? raw : []).map(priceAdminItem);
  if (!items.length) {
    const err = new Error("Add at least one gift.");
    err.status = 400;
    throw err;
  }
  return items;
}

function stockLinesOf(items) {
  const stockLines = [];
  items.forEach((item) => {
    stockNeeds(item).forEach((need) => {
      const found = stockLines.find((row) => row.id === need.id);
      if (found) found.qty += need.qty;
      else stockLines.push({ id: need.id, qty: need.qty });
    });
  });
  return stockLines;
}

function txnId() {
  return ("SM" + Date.now().toString(36) + crypto.randomBytes(4).toString("hex")).toUpperCase();
}

function assemble(db, body) {
  const kind = body.kind === "link" ? "link" : "estimate";
  const customer = parseCustomer(body, kind === "estimate");
  const items = parseItems(body.items);
  const goods = goodsTotalAll(items);
  const shipping = body.shipping != null && body.shipping !== ""
    ? Math.max(0, Math.round(Number(body.shipping) || 0))
    : shippingOf(goods, db.settings);
  const payable = goods + shipping;
  const days = Math.max(1, Math.min(60, parseInt(body.days, 10) || 14));
  const created = {
    txnid: txnId(),
    kind,
    status: kind === "link" ? "pending" : "estimate",
    createdAt: Date.now(),
    expiresAt: kind === "link" ? Date.now() + days * 86400000 : null,
    items,
    stockLines: stockLinesOf(items),
    stockHeld: false,
    customer,
    goods,
    shipping,
    payable,
    tax: taxBreakup(payable, db.settings.gstRate, customer.state, db.settings.sellerState),
    invoiceToken: crypto.randomBytes(12).toString("hex"),
    adminNote: String(body.note || "").slice(0, 800),
    userEmail: customer.email
  };
  if (kind === "link") {
    holdStock(db, created.stockLines);
    created.stockHeld = true;
  }
  return created;
}

function convertEstimate(db, order, days) {
  if (!order || order.status !== "estimate") {
    const err = new Error("Only an estimate can become a payment link.");
    err.status = 400;
    throw err;
  }
  parseCustomer(order.customer || {}, false);
  order.kind = "link";
  order.status = "pending";
  order.expiresAt = Date.now() + Math.max(1, Math.min(60, parseInt(days, 10) || 14)) * 86400000;
  if (!order.stockHeld) {
    holdStock(db, order.stockLines || stockLinesOf(order.items || []));
    order.stockHeld = true;
  }
  return order;
}

function payUrl(origin, order) {
  return origin + "/pay.html?id=" + encodeURIComponent(order.txnid) + "&t=" + encodeURIComponent(order.invoiceToken || "");
}

function invoiceUrl(origin, order, download) {
  return origin + "/api/invoice?id=" + encodeURIComponent(order.txnid) + "&t=" + encodeURIComponent(order.invoiceToken || "") + (download ? "&download=1" : "");
}

module.exports = {
  parseCustomer,
  parseItems,
  assemble,
  convertEstimate,
  payUrl,
  invoiceUrl,
  txnId,
  stockLinesOf
};

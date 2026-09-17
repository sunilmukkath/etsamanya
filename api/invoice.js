const { html, json } = require("../lib/http");
const { readDb } = require("../lib/store");
const { invoiceHtml } = require("../lib/invoice");
const { readSession } = require("../lib/auth");
const { originOf } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "Use GET" });
    return;
  }
  const url = new URL(req.url, "https://samanyastore.com");
  const id = String(url.searchParams.get("id") || "").trim().toUpperCase();
  const token = String(url.searchParams.get("t") || "").trim();
  const db = await readDb();
  const order = db.orders[id];
  if (!order) {
    html(res, 404, "<p>Invoice not found.</p>");
    return;
  }
  const admin = readSession(req, "admin");
  const user = readSession(req, "user");
  const allowed = admin
    || (token && token === order.invoiceToken)
    || (user && user.email === order.customer.email);
  if (!allowed || (order.status !== "paid" && order.status !== "packed" && order.status !== "shipped" && !admin)) {
    html(res, 403, "<p>This invoice is not ready yet.</p>");
    return;
  }
  html(res, 200, invoiceHtml(order, db.settings, originOf(req)));
};

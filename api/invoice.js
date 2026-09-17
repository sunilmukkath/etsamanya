const { html, json, pdf, originOf } = require("../lib/http");
const { readDb, withDb } = require("../lib/store");
const { invoiceHtml, invoicePdf, filenameFor, ensureDocNumbers } = require("../lib/invoice");
const { readSession } = require("../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "Use GET" });
    return;
  }
  const url = new URL(req.url, "https://samanyastore.com");
  const id = String(url.searchParams.get("id") || "").trim().toUpperCase();
  const token = String(url.searchParams.get("t") || "").trim();
  const download = url.searchParams.get("download") === "1" || url.searchParams.get("format") === "pdf";
  const db = await readDb();
  let order = db.orders[id];
  if (!order) {
    html(res, 404, "<p>Document not found.</p>");
    return;
  }
  const admin = readSession(req, "admin");
  const user = readSession(req, "user");
  const allowed = admin
    || (token && token === order.invoiceToken)
    || (user && user.email === order.customer.email);
  const visible = ["paid", "packed", "shipped", "pending", "estimate"].includes(order.status);
  if (!allowed || (!visible && !admin)) {
    html(res, 403, "<p>This document is not ready yet.</p>");
    return;
  }
  if ((order.status === "estimate" && !order.estimateNo) || (["paid", "packed", "shipped"].includes(order.status) && !order.invoiceNo)) {
    order = await withDb(async (inner) => {
      const current = inner.orders[id];
      if (current) ensureDocNumbers(inner, current);
      return current || order;
    });
  }
  const origin = originOf(req);
  if (download) {
    const buf = await invoicePdf(order, db.settings);
    pdf(res, 200, buf, filenameFor(order));
    return;
  }
  html(res, 200, invoiceHtml(order, db.settings, origin));
};

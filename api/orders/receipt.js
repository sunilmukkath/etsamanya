const { json } = require("../../lib/http");
const { readDb } = require("../../lib/store");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "Use GET" });
    return;
  }
  const url = new URL(req.url, "https://samanyastore.com");
  const txnid = String(url.searchParams.get("txnid") || "").trim().toUpperCase();
  if (!txnid) {
    json(res, 400, { error: "Missing order." });
    return;
  }
  const db = await readDb();
  const order = db.orders[txnid];
  if (!order) {
    json(res, 404, { error: "Order not found." });
    return;
  }
  json(res, 200, {
    txnid: order.txnid,
    status: order.status,
    payable: order.payable,
    invoiceNo: order.invoiceNo || "",
    invoiceToken: order.status === "paid" ? order.invoiceToken : "",
    tracking: order.tracking || "",
    packedNote: db.settings.packedNote
  });
};

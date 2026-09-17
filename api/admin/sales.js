const { json } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");
const { readDb } = require("../../lib/store");

module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
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
  let gst = 0;
  let shipping = 0;
  paid.forEach((order) => {
    gross += Number(order.payable || 0);
    gst += Number(order.tax && order.tax.gst || 0);
    shipping += Number(order.shipping || 0);
    (order.items || []).forEach((item) => {
      const key = item.label;
      if (!bySku[key]) bySku[key] = { label: key, qty: 0, amount: 0 };
      bySku[key].qty += item.qty;
      bySku[key].amount += item.price * item.qty;
    });
  });
  const pending = db.orderIds.filter((id) => db.orders[id] && db.orders[id].status === "pending").length;
  json(res, 200, {
    days,
    orders: paid.length,
    pending,
    gross,
    gst,
    shipping,
    net: Math.round((gross - gst) * 100) / 100,
    bySku: Object.values(bySku).sort((a, b) => b.amount - a.amount)
  });
};

const { json, readBody } = require("../../lib/http");
const { readDb } = require("../../lib/store");

function publicOrder(order) {
  if (!order) return null;
  return {
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
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Use POST" });
    return;
  }
  const body = await readBody(req);
  const txnid = String(body.txnid || "").trim().toUpperCase();
  const email = String(body.email || "").trim().toLowerCase();
  if (!txnid || !email) {
    json(res, 400, { error: "Order number and email are needed." });
    return;
  }
  const db = await readDb();
  const order = db.orders[txnid];
  if (!order || order.customer.email !== email) {
    json(res, 404, { error: "No order matches that email." });
    return;
  }
  json(res, 200, { order: publicOrder(order), invoiceToken: order.status === "paid" ? order.invoiceToken : "" });
};

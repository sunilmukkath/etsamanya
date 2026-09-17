const { json } = require("../../lib/http");
const { readSession } = require("../../lib/auth");
const { readDb } = require("../../lib/store");

module.exports = async function handler(req, res) {
  const session = readSession(req, "user");
  if (!session) {
    json(res, 401, { error: "Sign in to see orders." });
    return;
  }
  const db = await readDb();
  const orders = db.orderIds
    .map((id) => db.orders[id])
    .filter((order) => order && order.customer.email === session.email)
    .map((order) => ({
      txnid: order.txnid,
      status: order.status,
      payable: order.payable,
      createdAt: order.createdAt,
      paidAt: order.paidAt || null,
      invoiceNo: order.invoiceNo || "",
      invoiceToken: order.status === "paid" || order.status === "packed" || order.status === "shipped" ? order.invoiceToken : "",
      tracking: order.tracking || "",
      items: (order.items || []).map((item) => item.qty + " × " + item.label)
    }));
  json(res, 200, { orders });
};

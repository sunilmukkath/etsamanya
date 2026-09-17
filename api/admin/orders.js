const { json, readBody } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");
const { readDb, withDb, restock } = require("../../lib/store");
const { notifyPaid } = require("../../lib/notify");
const { originOf } = require("../../lib/http");

function fullOrder(order) {
  return order;
}

module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method === "GET") {
    const url = new URL(req.url, "https://samanyastore.com");
    const id = String(url.searchParams.get("id") || "").trim().toUpperCase();
    const db = await readDb();
    if (id) {
      const order = db.orders[id];
      if (!order) {
        json(res, 404, { error: "Order not found." });
        return;
      }
      json(res, 200, { order: fullOrder(order) });
      return;
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
        tracking: order.tracking || "",
        stockWarning: order.stockWarning || "",
        items: (order.items || []).map((item) => item.qty + " × " + item.label)
      };
    }).filter(Boolean);
    json(res, 200, { orders });
    return;
  }
  if (req.method !== "PATCH") {
    json(res, 405, { error: "Use GET or PATCH" });
    return;
  }
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
      }
      if (body.tracking != null) current.tracking = String(body.tracking).slice(0, 200);
      if (body.awb != null) current.awb = String(body.awb).slice(0, 80);
      if (body.note != null) current.adminNote = String(body.note).slice(0, 500);
      if (body.resend) current.notifiedAt = 0;
      return current;
    });
    if (body.resend && order.status === "paid") {
      const db = await readDb();
      const results = await notifyPaid(order, db.settings, originOf(req));
      await withDb(async (inner) => {
        if (inner.orders[id]) {
          inner.orders[id].notifiedAt = Date.now();
          inner.orders[id].notify = results;
        }
      });
    }
    json(res, 200, { ok: true, order });
  } catch (err) {
    json(res, err.status || 500, { error: err.message || "Could not update the order." });
  }
};

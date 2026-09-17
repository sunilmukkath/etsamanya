const { json, readBody } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");
const { withDb } = require("../../lib/store");
const { pushOrder } = require("../../lib/shiprocket");

module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "POST") {
    json(res, 405, { error: "Use POST" });
    return;
  }
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
    json(res, 200, { ok: true, shiprocket: result.data, order: result.order });
  } catch (err) {
    json(res, err.status || 500, { error: err.message || "Shiprocket failed." });
  }
};

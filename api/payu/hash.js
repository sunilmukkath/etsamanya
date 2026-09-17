const crypto = require("crypto");
const { json, readBody } = require("../../lib/http");
const { readDb } = require("../../lib/store");

function sha512(text) {
  return crypto.createHash("sha512").update(text).digest("hex");
}

function cors(req) {
  const allowed = (process.env.ALLOWED_ORIGINS || "https://samanyastore.com,https://www.samanyastore.com,https://etsamanya.vercel.app,https://sunilmukkath.github.io").split(",").map((value) => value.trim());
  const origin = req.headers.origin || "";
  const use = allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": use,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

module.exports = async function handler(req, res) {
  const headers = cors(req);
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { error: "Use POST" });
    return;
  }
  const key = process.env.PAYU_KEY;
  const salt = process.env.PAYU_SALT;
  if (!key || !salt) {
    json(res, 500, { error: "PayU is not configured on the server." });
    return;
  }
  const payload = await readBody(req);
  const txnid = String(payload.txnid || "").trim().toUpperCase();
  const db = await readDb();
  const order = db.orders[txnid];
  if (!order || order.status !== "pending") {
    json(res, 400, { error: "Create the order before paying." });
    return;
  }
  const fields = {
    key,
    txnid: order.txnid,
    amount: Number(order.payable).toFixed(2),
    productinfo: (order.items.map((item) => item.qty + "x " + item.label).join(", ") || "samanya gift").slice(0, 100),
    firstname: order.customer.name,
    email: order.customer.email,
    udf1: order.txnid,
    udf2: payload.udf2 || "",
    udf3: payload.udf3 || "",
    udf4: payload.udf4 || "",
    udf5: payload.udf5 || ""
  };
  const hash = sha512(
    [fields.key, fields.txnid, fields.amount, fields.productinfo, fields.firstname, fields.email, fields.udf1, fields.udf2, fields.udf3, fields.udf4, fields.udf5, "", "", "", "", "", salt].join("|")
  );
  json(res, 200, {
    hash,
    key: fields.key,
    amount: fields.amount,
    productinfo: fields.productinfo,
    firstname: fields.firstname,
    email: fields.email,
    phone: order.customer.phone,
    udf1: fields.udf1
  });
};

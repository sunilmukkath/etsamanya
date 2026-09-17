const crypto = require("crypto");

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
    res.status(405).json({ error: "Use POST" });
    return;
  }
  const key = process.env.PAYU_KEY;
  const salt = process.env.PAYU_SALT;
  if (!key || !salt) {
    res.status(500).json({ error: "PayU is not configured on the server." });
    return;
  }
  const payload = req.body || {};
  const fields = {
    key,
    txnid: payload.txnid,
    amount: Number(payload.amount).toFixed(2),
    productinfo: payload.productinfo || "samanya gift",
    firstname: payload.firstname || "",
    email: payload.email || "",
    udf1: payload.udf1 || "",
    udf2: payload.udf2 || "",
    udf3: payload.udf3 || "",
    udf4: payload.udf4 || "",
    udf5: payload.udf5 || ""
  };
  const hash = sha512(
    [fields.key, fields.txnid, fields.amount, fields.productinfo, fields.firstname, fields.email, fields.udf1, fields.udf2, fields.udf3, fields.udf4, fields.udf5, "", "", "", "", "", salt].join("|")
  );
  res.status(200).json({ hash, key: fields.key, amount: fields.amount });
};

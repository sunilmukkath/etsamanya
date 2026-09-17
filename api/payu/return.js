const crypto = require("crypto");

function sha512(text) {
  return crypto.createHash("sha512").update(text).digest("hex");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Use POST");
    return;
  }
  const posted = req.body || {};
  const salt = process.env.PAYU_SALT || "";
  const reverse = sha512(
    [salt, posted.status || "", "", "", "", "", "", posted.udf5 || "", posted.udf4 || "", posted.udf3 || "", posted.udf2 || "", posted.udf1 || "", posted.email || "", posted.firstname || "", posted.productinfo || "", posted.amount || "", posted.txnid || "", posted.key || ""].join("|")
  );
  const ok = reverse === String(posted.hash || "").toLowerCase() && String(posted.status).toLowerCase() === "success";
  const next = new URL(ok ? (process.env.SUCCESS_URL || "https://samanyastore.com/order-success.html") : (process.env.FAIL_URL || "https://samanyastore.com/order-failed.html"));
  next.searchParams.set("txnid", posted.txnid || "");
  next.searchParams.set("status", posted.status || "");
  next.searchParams.set("mihpayid", posted.mihpayid || "");
  res.redirect(303, next.toString());
};

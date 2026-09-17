const { readBody, originOf } = require("../../lib/http");
const { finalizePayu } = require("../../lib/payu");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Use POST");
    return;
  }
  const posted = await readBody(req);
  const result = await finalizePayu(posted, req);
  const next = new URL(result.ok ? (process.env.SUCCESS_URL || originOf(req) + "/order-success.html") : (process.env.FAIL_URL || originOf(req) + "/order-failed.html"));
  next.searchParams.set("txnid", result.txnid || posted.txnid || "");
  next.searchParams.set("status", posted.status || "");
  next.searchParams.set("mihpayid", posted.mihpayid || "");
  res.redirect(303, next.toString());
};

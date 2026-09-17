const { json, readBody } = require("../../lib/http");
const { finalizePayu } = require("../../lib/payu");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Use POST" });
    return;
  }
  const posted = await readBody(req);
  const result = await finalizePayu(posted, req);
  json(res, 200, { ok: result.ok, txnid: result.txnid });
};

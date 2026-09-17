const { json } = require("../../lib/http");
const { clearCookie } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  json(res, 200, { ok: true }, { "Set-Cookie": clearCookie("samanya_user") });
};

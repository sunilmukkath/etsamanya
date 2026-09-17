const { json, readBody } = require("../../lib/http");
const { adminConfigured, checkAdminPassword, sessionCookie } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Use POST" });
    return;
  }
  if (!adminConfigured()) {
    json(res, 503, { error: "Set ADMIN_PASSWORD on Vercel, then return here." });
    return;
  }
  const body = await readBody(req);
  if (!checkAdminPassword(body.password || "")) {
    json(res, 401, { error: "That password is not right." });
    return;
  }
  json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("admin", { role: "admin" }, 14) });
};

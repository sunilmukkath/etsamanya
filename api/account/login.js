const { json, readBody } = require("../../lib/http");
const { readDb } = require("../../lib/store");
const { verifyPassword, sessionCookie } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Use POST" });
    return;
  }
  const body = await readBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const db = await readDb();
  const user = db.users[email];
  if (!user || !verifyPassword(password, user.password)) {
    json(res, 401, { error: "Email or password is not right." });
    return;
  }
  json(res, 200, { ok: true, email, name: user.name }, { "Set-Cookie": sessionCookie("user", { email }, 30) });
};

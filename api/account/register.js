const { json, readBody } = require("../../lib/http");
const { withDb } = require("../../lib/store");
const { hashPassword, sessionCookie } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Use POST" });
    return;
  }
  const body = await readBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim().slice(0, 80);
  const password = String(body.password || "");
  if (!email || !email.includes("@") || password.length < 8) {
    json(res, 400, { error: "Use a real email and a password of at least 8 characters." });
    return;
  }
  try {
    await withDb(async (db) => {
      if (db.users[email]) {
        const err = new Error("An account already exists for this email. Sign in.");
        err.status = 409;
        throw err;
      }
      db.users[email] = {
        email,
        name: name || email.split("@")[0],
        phone: String(body.phone || "").trim(),
        password: hashPassword(password),
        createdAt: Date.now()
      };
    });
    json(res, 200, { ok: true, email }, { "Set-Cookie": sessionCookie("user", { email }, 30) });
  } catch (err) {
    json(res, err.status || 500, { error: err.message || "Could not create the account." });
  }
};

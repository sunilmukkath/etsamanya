const crypto = require("crypto");

function cookieSecret() {
  return process.env.COOKIE_SECRET || process.env.ADMIN_SECRET || process.env.PAYU_SALT || "dev-samanya-cookie";
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx < 1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  });
  return out;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", cookieSecret()).update(body).digest("base64url");
  return body + "." + sig;
}

function unsign(token) {
  if (!token || !token.includes(".")) return null;
  const i = token.lastIndexOf(".");
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expect = crypto.createHmac("sha256", cookieSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || payload.exp < Date.now()) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

function cookieHeader(name, token, maxAge) {
  const parts = [
    name + "=" + encodeURIComponent(token),
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=" + String(maxAge)
  ];
  if (process.env.VERCEL) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(name) {
  return name + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");
  return salt + ":" + hash;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(String(password), salt, 32).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
  } catch (err) {
    return false;
  }
}

function sessionCookie(kind, payload, days) {
  const token = sign(Object.assign({ kind }, payload, { exp: Date.now() + days * 86400000 }));
  return cookieHeader(kind === "admin" ? "samanya_admin" : "samanya_user", token, days * 86400);
}

function readSession(req, kind) {
  const cookies = parseCookies(req);
  const name = kind === "admin" ? "samanya_admin" : "samanya_user";
  const payload = unsign(cookies[name]);
  if (!payload || payload.kind !== kind) return null;
  return payload;
}

function requireAdmin(req, res) {
  const session = readSession(req, "admin");
  if (!session) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Sign in as admin." }));
    return null;
  }
  return session;
}

function adminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

function checkAdminPassword(password) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected || !password) return false;
  const a = Buffer.from(String(password));
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(crypto.createHash("sha256").update(a).digest(), crypto.createHash("sha256").update(b).digest());
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  parseCookies,
  hashPassword,
  verifyPassword,
  sessionCookie,
  readSession,
  requireAdmin,
  adminConfigured,
  checkAdminPassword,
  clearCookie
};

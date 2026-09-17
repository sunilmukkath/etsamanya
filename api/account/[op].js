const { json, readBody } = require("../../lib/http");
const { withDb, readDb } = require("../../lib/store");
const { hashPassword, verifyPassword, sessionCookie, readSession, clearCookie } = require("../../lib/auth");

function opOf(req) {
  return String((req.query && req.query.op) || "").replace(/\/$/, "");
}

module.exports = async function handler(req, res) {
  const op = opOf(req);
  if (op === "login") {
    if (req.method !== "POST") return json(res, 405, { error: "Use POST" });
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const db = await readDb();
    const user = db.users[email];
    if (!user || !verifyPassword(password, user.password)) {
      return json(res, 401, { error: "Email or password is not right." });
    }
    return json(res, 200, { ok: true, email, name: user.name }, { "Set-Cookie": sessionCookie("user", { email }, 30) });
  }
  if (op === "register") {
    if (req.method !== "POST") return json(res, 405, { error: "Use POST" });
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim().slice(0, 80);
    const password = String(body.password || "");
    if (!email || !email.includes("@") || password.length < 8) {
      return json(res, 400, { error: "Use a real email and a password of at least 8 characters." });
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
      return json(res, 200, { ok: true, email }, { "Set-Cookie": sessionCookie("user", { email }, 30) });
    } catch (err) {
      return json(res, err.status || 500, { error: err.message || "Could not create the account." });
    }
  }
  if (op === "logout") {
    return json(res, 200, { ok: true }, { "Set-Cookie": clearCookie("samanya_user") });
  }
  if (op === "me") {
    const session = readSession(req, "user");
    if (!session) return json(res, 200, { signedIn: false });
    const db = await readDb();
    const user = db.users[session.email] || { email: session.email, name: "" };
    return json(res, 200, { signedIn: true, email: user.email, name: user.name || "" });
  }
  if (op === "orders") {
    const session = readSession(req, "user");
    if (!session) return json(res, 401, { error: "Sign in to see orders." });
    const db = await readDb();
    const orders = db.orderIds
      .map((id) => db.orders[id])
      .filter((order) => order && order.customer.email === session.email)
      .map((order) => ({
        txnid: order.txnid,
        status: order.status,
        payable: order.payable,
        createdAt: order.createdAt,
        paidAt: order.paidAt || null,
        invoiceNo: order.invoiceNo || "",
        estimateNo: order.estimateNo || "",
        invoiceToken: ["paid", "packed", "shipped", "pending", "estimate"].includes(order.status) ? order.invoiceToken : "",
        tracking: order.tracking || "",
        items: (order.items || []).map((item) => item.qty + " × " + item.label)
      }));
    return json(res, 200, { orders });
  }
  json(res, 404, { error: "Unknown account route." });
};

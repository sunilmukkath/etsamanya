const { json } = require("../../lib/http");
const { readSession } = require("../../lib/auth");
const { readDb } = require("../../lib/store");

module.exports = async function handler(req, res) {
  const session = readSession(req, "user");
  if (!session) {
    json(res, 200, { signedIn: false });
    return;
  }
  const db = await readDb();
  const user = db.users[session.email] || { email: session.email, name: "" };
  json(res, 200, { signedIn: true, email: user.email, name: user.name || "" });
};

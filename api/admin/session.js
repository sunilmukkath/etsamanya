const { json } = require("../../lib/http");
const { readSession, adminConfigured } = require("../../lib/auth");
const { storeReady } = require("../../lib/store");

module.exports = async function handler(req, res) {
  const session = readSession(req, "admin");
  json(res, 200, {
    signedIn: Boolean(session),
    adminConfigured: adminConfigured(),
    storeReady: storeReady()
  });
};

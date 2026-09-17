const { json } = require("../lib/http");
const { readDb, publicSettings, storeReady } = require("../lib/store");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "Use GET" });
    return;
  }
  try {
    const db = await readDb();
    json(res, 200, Object.assign({ storeReady: storeReady() }, publicSettings(db)));
  } catch (err) {
    json(res, 500, { error: err.message || "Config failed." });
  }
};

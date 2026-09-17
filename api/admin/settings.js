const { json, readBody } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");
const { readDb, withDb, publicSettings } = require("../../lib/store");

const KEYS = [
  "legalName", "tradeName", "address", "sellerState", "sellerStateCode",
  "email", "phone", "whatsapp", "gstin", "gstRate", "hsn",
  "shippingFlat", "shippingFreeAbove", "notifyEmail", "packedNote"
];

module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method === "GET") {
    const db = await readDb();
    json(res, 200, { settings: db.settings, public: publicSettings(db) });
    return;
  }
  if (req.method !== "PUT") {
    json(res, 405, { error: "Use GET or PUT" });
    return;
  }
  const body = await readBody(req);
  const settings = await withDb(async (db) => {
    KEYS.forEach((key) => {
      if (body[key] == null) return;
      if (["gstRate", "shippingFlat", "shippingFreeAbove"].includes(key)) {
        db.settings[key] = Number(body[key]) || 0;
      } else if (key === "whatsapp" || key === "phone") {
        db.settings[key] = String(body[key]).replace(/\D/g, "");
      } else {
        db.settings[key] = String(body[key]).trim();
      }
    });
    return db.settings;
  });
  json(res, 200, { ok: true, settings });
};

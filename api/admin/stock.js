const { json, readBody } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");
const { readDb, withDb, available } = require("../../lib/store");

module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method === "GET") {
    const db = await readDb();
    const stock = Object.keys(db.stock).map((id) => ({
      id,
      label: db.stock[id].label,
      qty: db.stock[id].qty,
      reserved: db.stock[id].reserved || 0,
      available: available(db, id)
    }));
    json(res, 200, { stock });
    return;
  }
  if (req.method !== "PUT") {
    json(res, 405, { error: "Use GET or PUT" });
    return;
  }
  const body = await readBody(req);
  const rows = Array.isArray(body.stock) ? body.stock : [];
  const stock = await withDb(async (db) => {
    rows.forEach((row) => {
      if (!db.stock[row.id]) return;
      if (row.qty != null) db.stock[row.id].qty = Math.max(0, parseInt(row.qty, 10) || 0);
      if (row.label) db.stock[row.id].label = String(row.label).slice(0, 80);
    });
    return db.stock;
  });
  json(res, 200, { ok: true, stock });
};

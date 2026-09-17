const fs = require("fs");
const path = require("path");
const { DEFAULT_STOCK } = require("./catalog");

const BLOB_PATH = "samanya-db.json";
const LOCAL_FILE = path.join(process.cwd(), "data", "db.json");
const TMP_FILE = path.join("/tmp", "samanya-db.json");

function emptyDb() {
  const stock = {};
  DEFAULT_STOCK.forEach((row) => {
    stock[row.id] = { label: row.label, qty: 40, reserved: 0 };
  });
  return {
    settings: {
      legalName: process.env.LEGAL_NAME || "samanya",
      tradeName: "samanya",
      address: "Thenkulapakkam, Tamil Nadu, India",
      sellerState: "Tamil Nadu",
      sellerStateCode: "33",
      email: process.env.NOTIFY_EMAIL || "hello@etsamanya.com",
      phone: process.env.NOTIFY_PHONE || "",
      whatsapp: String(process.env.WHATSAPP_NUMBER || "").replace(/\D/g, ""),
      gstin: process.env.SELLER_GSTIN || "",
      gstRate: Number(process.env.GST_RATE || 5),
      hsn: "2106",
      shippingFlat: Number(process.env.SHIPPING_FLAT || 99),
      shippingFreeAbove: Number(process.env.SHIPPING_FREE_ABOVE || 1999),
      notifyEmail: process.env.NOTIFY_EMAIL || "hello@etsamanya.com",
      packedNote: "Packed to order. Usually 4–7 working days across India.",
      nextInvoice: 1
    },
    stock,
    users: {},
    orders: {},
    orderIds: []
  };
}

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.blob_read_write_token || "";
}

function blobReady() {
  return Boolean(blobToken() || process.env.BLOB_STORE_ID || (process.env.VERCEL && blobSdk()));
}

function redisUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
}

function redisToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
}

async function redis(command) {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) return null;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  if (!res.ok) throw new Error("Store (Redis) failed: " + res.status);
  return res.json();
}

function blobSdk() {
  try {
    return require("@vercel/blob");
  } catch (err) {
    return null;
  }
}

function blobOpts(extra) {
  const opts = extra || {};
  if (blobToken()) opts.token = blobToken();
  return opts;
}

async function readBlob() {
  const sdk = blobSdk();
  if (!sdk || !blobReady()) return null;
  try {
    const got = await sdk.get(BLOB_PATH, blobOpts({ access: "private", useCache: false }));
    if (!got) return null;
    const text = got.blob && typeof got.blob.text === "function"
      ? await got.blob.text()
      : await new Response(got.stream).text();
    if (!text) return null;
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

async function writeBlob(db) {
  const sdk = blobSdk();
  if (!sdk || !blobReady()) return false;
  await sdk.put(BLOB_PATH, JSON.stringify(db), blobOpts({
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json"
  }));
  return true;
}

function localPath() {
  return process.env.VERCEL ? TMP_FILE : LOCAL_FILE;
}

function readFileDb() {
  try {
    const file = localPath();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return null;
  }
}

function writeFileDb(db) {
  const file = localPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(db));
}

function mergeDb(raw) {
  const base = emptyDb();
  if (!raw || typeof raw !== "object") return base;
  return {
    settings: Object.assign({}, base.settings, raw.settings || {}),
    stock: Object.assign({}, base.stock, raw.stock || {}),
    users: raw.users || {},
    orders: raw.orders || {},
    orderIds: Array.isArray(raw.orderIds) ? raw.orderIds : Object.keys(raw.orders || {})
  };
}

function expireReservations(db) {
  const maxAge = 45 * 60 * 1000;
  const now = Date.now();
  let changed = false;
  (db.orderIds || []).forEach((id) => {
    const order = db.orders[id];
    if (!order || order.status !== "pending") return;
    if (now - Number(order.createdAt || 0) < maxAge) return;
    releaseStock(db, order);
    order.status = "expired";
    changed = true;
  });
  return changed;
}

function available(db, sku) {
  const row = db.stock[sku];
  if (!row) return 0;
  return Math.max(0, Number(row.qty || 0) - Number(row.reserved || 0));
}

function releaseStock(db, order) {
  if (!order || !order.stockHeld) return;
  (order.stockLines || []).forEach((line) => {
    const row = db.stock[line.id];
    if (!row) return;
    row.reserved = Math.max(0, Number(row.reserved || 0) - Number(line.qty || 0));
  });
  order.stockHeld = false;
}

function holdStock(db, lines) {
  lines.forEach((line) => {
    if (available(db, line.id) < line.qty) {
      const err = new Error("Not enough stock for " + (db.stock[line.id] && db.stock[line.id].label || line.id) + ".");
      err.status = 409;
      throw err;
    }
  });
  lines.forEach((line) => {
    db.stock[line.id].reserved = Number(db.stock[line.id].reserved || 0) + line.qty;
  });
}

function consumeStock(db, order) {
  if (!order || order.stockConsumed) return;
  (order.stockLines || []).forEach((line) => {
    const row = db.stock[line.id];
    if (!row) return;
    row.qty = Math.max(0, Number(row.qty || 0) - Number(line.qty || 0));
    row.reserved = Math.max(0, Number(row.reserved || 0) - Number(line.qty || 0));
  });
  order.stockHeld = false;
  order.stockConsumed = true;
}

function restock(db, order) {
  if (!order) return;
  if (order.stockHeld) {
    releaseStock(db, order);
    return;
  }
  if (!order.stockConsumed) return;
  (order.stockLines || []).forEach((line) => {
    const row = db.stock[line.id];
    if (!row) return;
    row.qty = Number(row.qty || 0) + Number(line.qty || 0);
  });
  order.stockConsumed = false;
}

async function readDb() {
  let raw = null;
  if (redisUrl()) {
    const got = await redis(["GET", "samanya:db"]);
    if (got && got.result) raw = typeof got.result === "string" ? JSON.parse(got.result) : got.result;
  }
  if (!raw && blobReady()) raw = await readBlob();
  if (!raw) raw = readFileDb();
  const db = mergeDb(raw);
  if (expireReservations(db)) await writeDb(db);
  return db;
}

async function writeDb(db) {
  const payload = JSON.stringify(db);
  let ok = false;
  if (redisUrl()) {
    await redis(["SET", "samanya:db", payload]);
    ok = true;
  }
  if (blobReady()) {
    ok = (await writeBlob(db)) || ok;
  }
  if (!process.env.VERCEL || !ok) writeFileDb(db);
  if (process.env.VERCEL && !ok && !blobReady() && !redisUrl()) {
    throw new Error("Order store is not connected. Add Vercel Blob or KV.");
  }
}

async function withDb(mutator) {
  const db = await readDb();
  const result = await mutator(db);
  await writeDb(db);
  return result;
}

function publicSettings(db) {
  const s = db.settings;
  const stock = {};
  Object.keys(db.stock).forEach((id) => {
    stock[id] = available(db, id);
  });
  return {
    legalName: s.legalName,
    tradeName: s.tradeName,
    address: s.address,
    email: s.email,
    phone: s.phone,
    whatsapp: s.whatsapp,
    gstin: s.gstin,
    gstRate: s.gstRate,
    shippingFlat: s.shippingFlat,
    shippingFreeAbove: s.shippingFreeAbove,
    packedNote: s.packedNote,
    stock
  };
}

function storeReady() {
  return Boolean(blobReady() || redisUrl() || !process.env.VERCEL);
}

module.exports = {
  emptyDb,
  readDb,
  writeDb,
  withDb,
  available,
  holdStock,
  releaseStock,
  consumeStock,
  restock,
  publicSettings,
  storeReady
};

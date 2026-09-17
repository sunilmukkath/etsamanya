const crypto = require("crypto");
const { withDb, consumeStock, holdStock, releaseStock, readDb } = require("./store");
const { notifyPaid } = require("./notify");
const { originOf } = require("./http");

function sha512(text) {
  return crypto.createHash("sha512").update(text).digest("hex");
}

function reverseHash(posted, salt) {
  return sha512([
    salt,
    posted.status || "",
    "",
    "",
    "",
    "",
    "",
    posted.udf5 || "",
    posted.udf4 || "",
    posted.udf3 || "",
    posted.udf2 || "",
    posted.udf1 || "",
    posted.email || "",
    posted.firstname || "",
    posted.productinfo || "",
    posted.amount || "",
    posted.txnid || "",
    posted.key || ""
  ].join("|"));
}

function payuOk(posted) {
  const salt = process.env.PAYU_SALT || "";
  const hash = reverseHash(posted, salt);
  return hash === String(posted.hash || "").toLowerCase() && String(posted.status).toLowerCase() === "success";
}

async function finalizePayu(posted, req) {
  const ok = payuOk(posted);
  const txnid = posted.txnid || posted.udf1 || "";
  const order = await withDb(async (db) => {
    const current = db.orders[txnid];
    if (!current) return null;
    current.payu = {
      status: posted.status || "",
      mihpayid: posted.mihpayid || "",
      error: posted.error || posted.error_Message || ""
    };
    current.mihpayid = posted.mihpayid || current.mihpayid || "";
    if (ok && current.status === "pending") {
      current.status = "paid";
      current.paidAt = Date.now();
      if (!current.invoiceNo) {
        current.invoiceNo = "SAM-" + new Date().getFullYear() + "-" + String(db.settings.nextInvoice || 1).padStart(4, "0");
        db.settings.nextInvoice = Number(db.settings.nextInvoice || 1) + 1;
      }
      consumeStock(db, current);
    } else if (ok && current.status === "expired") {
      current.paidAt = Date.now();
      if (!current.invoiceNo) {
        current.invoiceNo = "SAM-" + new Date().getFullYear() + "-" + String(db.settings.nextInvoice || 1).padStart(4, "0");
        db.settings.nextInvoice = Number(db.settings.nextInvoice || 1) + 1;
      }
      try {
        holdStock(db, current.stockLines || []);
        current.stockHeld = true;
        consumeStock(db, current);
        current.status = "paid";
      } catch (err) {
        current.status = "paid";
        current.stockWarning = "Paid after the reserve lapsed. Check stock before packing.";
      }
    } else if (!ok && current.status === "pending") {
      releaseStock(db, current);
      current.status = "failed";
      current.failedAt = Date.now();
    }
    return current;
  });
  if (order && order.status === "paid" && !order.notifiedAt) {
    try {
      const db = await readDb();
      const results = await notifyPaid(order, db.settings, originOf(req));
      await withDb(async (inner) => {
        if (inner.orders[txnid]) {
          inner.orders[txnid].notifiedAt = Date.now();
          inner.orders[txnid].notify = results;
        }
      });
    } catch (err) {
      await withDb(async (inner) => {
        if (inner.orders[txnid]) inner.orders[txnid].notifyError = String(err.message || err);
      });
    }
  }
  return { ok: ok && order && order.status === "paid", order, txnid };
}

module.exports = { sha512, reverseHash, payuOk, finalizePayu };

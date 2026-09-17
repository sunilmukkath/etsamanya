const { rupees, taxBreakup } = require("./catalog");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function invoiceHtml(order, settings, origin) {
  const tax = taxBreakup(order.payable, settings.gstRate, order.customer.state, settings.sellerState);
  const invoiceNo = order.invoiceNo || order.txnid;
  const when = new Date(order.paidAt || order.createdAt || Date.now()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const lines = (order.items || []).map((item) => {
    const line = Math.round(item.price * item.qty * (item.qty >= 10 && item.qty < 25 ? 0.95 : 1));
    return `<tr><td>${escapeHtml(item.label)}${item.bowl ? " + bowl" : ""}</td><td>${item.qty}</td><td>${rupees(item.price)}</td><td>${rupees(line)}</td></tr>`;
  }).join("");
  const gstRows = tax.igst
    ? `<tr><td colspan="3">IGST @ ${settings.gstRate}%</td><td>${rupees(tax.igst)}</td></tr>`
    : `<tr><td colspan="3">CGST @ ${(settings.gstRate / 2) || 0}%</td><td>${rupees(tax.cgst)}</td></tr>
       <tr><td colspan="3">SGST @ ${(settings.gstRate / 2) || 0}%</td><td>${rupees(tax.sgst)}</td></tr>`;
  const gstin = settings.gstin
    ? `<p>GSTIN ${escapeHtml(settings.gstin)}</p>`
    : `<p>Bill of supply — GSTIN not registered on this copy.</p>`;
  const buyerGst = order.customer.gstin ? `<p>GSTIN ${escapeHtml(order.customer.gstin)}</p>` : "";
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8" />
<title>Invoice ${escapeHtml(invoiceNo)} — samanya</title>
<style>
  body { font-family: Georgia, serif; color: #4b2e1c; background: #fcfaf6; margin: 0; padding: 32px; }
  .sheet { max-width: 720px; margin: 0 auto; background: #fff; padding: 36px 40px; border: 1px solid #e6dccf; }
  h1 { font-weight: 500; font-size: 2rem; margin: 0 0 4px; color: #42573a; }
  .muted { color: #6b7350; font-size: 0.92rem; }
  table { width: 100%; border-collapse: collapse; margin: 24px 0; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #eadfd3; font-size: 0.95rem; }
  th { font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7350; }
  td:last-child, th:last-child { text-align: right; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 18px; }
  @media print { body { background: #fff; padding: 0; } .no-print { display: none; } }
</style>
</head><body>
<div class="sheet">
  <p class="muted">samanya · wellness gifts</p>
  <h1>${settings.gstin ? "Tax invoice" : "Invoice"} ${escapeHtml(invoiceNo)}</h1>
  <p class="muted">${escapeHtml(when)} · PayU ${escapeHtml(order.mihpayid || order.txnid)}</p>
  <div class="grid">
    <div>
      <p><strong>From</strong></p>
      <p>${escapeHtml(settings.legalName)}<br />${escapeHtml(settings.address)}</p>
      ${gstin}
      <p>${escapeHtml(settings.email)}</p>
    </div>
    <div>
      <p><strong>Bill to</strong></p>
      <p>${escapeHtml(order.customer.name)}<br />${escapeHtml(order.customer.address)}<br />${escapeHtml(order.customer.city)} ${escapeHtml(order.customer.pincode)}<br />${escapeHtml(order.customer.state)}</p>
      ${buyerGst}
      <p>${escapeHtml(order.customer.email)} · ${escapeHtml(order.customer.phone)}</p>
    </div>
  </div>
  <table>
    <thead><tr><th>Gift</th><th>Qty</th><th>Each</th><th>Amount</th></tr></thead>
    <tbody>
      ${lines}
      <tr><td colspan="3">Shipping</td><td>${order.shipping ? rupees(order.shipping) : "Complimentary"}</td></tr>
      <tr><td colspan="3">Taxable value (HSN ${escapeHtml(settings.hsn || "2106")})</td><td>${rupees(tax.taxable)}</td></tr>
      ${settings.gstRate ? gstRows : ""}
      <tr><td colspan="3"><strong>Total</strong></td><td><strong>${rupees(order.payable)}</strong></td></tr>
    </tbody>
  </table>
  <p class="muted">Prices inclusive of GST where applicable. Packed to order from current lots. ${escapeHtml(settings.packedNote || "")}</p>
  <p class="no-print muted"><a href="${origin}/account">Your orders</a></p>
</div>
</body></html>`;
}

function packSheet(order) {
  const lines = (order.items || []).map((item) => {
    const bits = [
      item.qty + " × " + item.label,
      item.recipient ? "For " + item.recipient : "",
      item.items && item.items.length ? "Pantry: " + item.items.join(", ") : "",
      item.extras && item.extras.length ? "Also: " + item.extras.join(", ") : "",
      item.message ? "Card: " + item.message : ""
    ].filter(Boolean);
    return bits.join("\n");
  });
  const c = order.customer || {};
  return [
    "New samanya order " + order.txnid,
    "PayU: " + (order.mihpayid || "pending"),
    "Amount: ₹" + order.payable,
    "",
    c.name,
    c.phone,
    c.email,
    c.address,
    [c.city, c.pincode, c.state].filter(Boolean).join(", "),
    c.gstin ? "GSTIN " + c.gstin : "",
    "",
    lines.join("\n\n")
  ].filter(Boolean).join("\n");
}

module.exports = { invoiceHtml, packSheet, escapeHtml };

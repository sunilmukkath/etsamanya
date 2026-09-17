const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { rupees, lineTotal } = require("./catalog");
const { COMPANY } = require("./store");

const COLORS = {
  cream: "#fcfaf6",
  paper: "#f3eee5",
  ivory: "#f8f3ed",
  leaf: "#42573a",
  moss: "#6b7350",
  sun: "#d4933a",
  gold: "#c9a356",
  ink: "#5a3a24",
  clove: "#4b2e1c",
  line: "#eadfd3"
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isPaid(order) {
  return ["paid", "packed", "shipped"].includes(order && order.status);
}

function documentKind(order) {
  if (isPaid(order)) return "invoice";
  if (order && order.status === "pending") return "proforma";
  return "estimate";
}

function documentTitle(kind) {
  if (kind === "invoice") return "Invoice";
  if (kind === "proforma") return "Proforma";
  return "Estimate";
}

function documentNo(order) {
  if (documentKind(order) === "invoice") return order.invoiceNo || order.txnid;
  return order.estimateNo || order.txnid;
}

function documentLabel(order) {
  return documentTitle(documentKind(order)) + " # " + documentNo(order);
}

function filenameFor(order) {
  const kind = documentKind(order);
  const no = String(documentNo(order) || order.txnid).replace(/[^\w.-]+/g, "-");
  return "Samanya-" + kind + "-" + no + ".pdf";
}

function kolkataYear() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date());
}

function formatWhen(ts) {
  return new Date(ts || Date.now()).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function takeNext(db, key, prefix) {
  const n = Math.max(101, Number(db.settings[key] || 101));
  db.settings[key] = n + 1;
  return prefix + "-" + kolkataYear() + "-" + String(n).padStart(3, "0");
}

function ensureDocNumbers(db, order) {
  if (!db || !order) return order;
  if (order.status === "estimate" && !order.estimateNo) {
    order.estimateNo = takeNext(db, "nextEstimate", "EST");
  }
  if (isPaid(order) && !order.invoiceNo) {
    order.invoiceNo = takeNext(db, "nextInvoice", "SAM");
  }
  return order;
}

function giftLines(item) {
  const amount = lineTotal(item.price, item.qty);
  const title = item.label + (item.bowl ? " + bowl" : "");
  const notes = [
    item.recipient ? "For " + item.recipient : "",
    item.items && item.items.length ? item.items.join(", ") : "",
    item.message ? "Card: " + item.message : ""
  ].filter(Boolean).join(" · ");
  return { title, notes, qty: item.qty, price: item.price, amount };
}

function kindCopy(kind, order) {
  if (kind === "invoice") {
    const pay = order.mihpayid ? "PayU " + order.mihpayid : "Payment received";
    return pay;
  }
  if (kind === "proforma") return "Awaiting payment on PayU";
  return "A quotation for packing. Not an invoice.";
}

function addressBlock(customer) {
  const c = customer || {};
  return [
    c.name,
    c.address,
    [c.city, c.pincode].filter(Boolean).join(" "),
    c.state
  ].filter(Boolean);
}

function fontFile(name) {
  const candidates = [
    path.join(__dirname, "fonts", name),
    path.join(__dirname, "../catalogue/fonts", name)
  ];
  return candidates.find((file) => fs.existsSync(file)) || "";
}

function registerFonts(doc) {
  const fonts = {
    display: "Times-Roman",
    displaySemi: "Times-Bold",
    italic: "Times-Italic",
    body: "Helvetica",
    bodyBold: "Helvetica-Bold"
  };
  const map = [
    ["display", "CormorantGaramond-Medium.ttf", "SamanyaDisplay"],
    ["displaySemi", "CormorantGaramond-SemiBold.ttf", "SamanyaSemi"],
    ["italic", "CormorantGaramond-Italic.ttf", "SamanyaItalic"]
  ];
  map.forEach(([key, file, alias]) => {
    const found = fontFile(file);
    if (!found) return;
    try {
      doc.registerFont(alias, found);
      fonts[key] = alias;
    } catch (err) {}
  });
  return fonts;
}

function wrapText(doc, text, font, size, maxWidth) {
  doc.font(font).fontSize(size);
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let cur = "";
  words.forEach((word) => {
    const trial = cur ? cur + " " + word : word;
    if (doc.widthOfString(trial) <= maxWidth) cur = trial;
    else {
      if (cur) lines.push(cur);
      cur = word;
    }
  });
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function money(n) {
  return rupees(n);
}

function drawLeafMark(doc, x, y, size) {
  const s = size / 64;
  doc.save();
  doc.translate(x, y);
  doc.scale(s);
  doc.lineWidth(1.2).strokeColor(COLORS.leaf).circle(32, 32, 30).stroke();
  doc.fillColor(COLORS.leaf)
    .path("M32 14c6.2 8.4 8.8 14.6 8.8 20.2A8.8 8.8 0 1 1 23.2 34.2C23.2 28.6 25.8 22.4 32 14Z")
    .fill();
  doc.fillColor("#F6EFE4").circle(32, 35.2, 3.2).fill();
  doc.restore();
}

function drawPageChrome(doc, fonts, settings, pageH) {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.cream);
  doc.restore();
  drawLeafMark(doc, 42, 32, 36);
  const mark = path.join(__dirname, "../assets/samanya-wordmark.png");
  if (fs.existsSync(mark)) {
    try {
      doc.image(mark, 86, 38, { height: 24 });
    } catch (err) {
      doc.fillColor(COLORS.leaf).font(fonts.displaySemi).fontSize(20).text("Sāmānya", 86, 40);
    }
  } else {
    doc.fillColor(COLORS.leaf).font(fonts.displaySemi).fontSize(20).text("Sāmānya", 86, 40);
  }
  doc.fillColor(COLORS.moss).font(fonts.body).fontSize(8)
    .text("WELLNESS GIFTS", 86, 66, { characterSpacing: 1.6 });

  const footH = 108;
  const footY = pageH - footH;
  const rightX = 300;
  const rightW = 252;
  doc.save();
  doc.rect(0, footY, doc.page.width, footH).fill(COLORS.leaf);
  doc.fillColor(COLORS.ivory).font(fonts.display).fontSize(18).text("Sāmānya", 42, footY + 18);
  doc.font(fonts.italic).fontSize(10).fillColor("#d9cbb8")
    .text("Packed so someone feels tended.", 42, footY + 42, { width: 240 });
  let fy = footY + 16;
  doc.font(fonts.body).fontSize(7.5).fillColor("#d9cbb8");
  wrapText(doc, settings.legalName || COMPANY.legalName, fonts.body, 7.5, rightW).forEach((line) => {
    doc.text(line, rightX, fy, { width: rightW, align: "right" });
    fy += 11;
  });
  wrapText(doc, settings.address || COMPANY.address, fonts.body, 7.5, rightW).forEach((line) => {
    doc.text(line, rightX, fy, { width: rightW, align: "right" });
    fy += 11;
  });
  doc.text("samanyastore.com", rightX, fy, { width: rightW, align: "right" });
  if (settings.email) {
    doc.text(String(settings.email), rightX, fy + 11, { width: rightW, align: "right" });
  }
  doc.restore();
}

function invoicePdf(order, settings) {
  const kind = documentKind(order);
  const title = documentTitle(kind);
  const number = documentNo(order);
  const customer = order.customer || {};
  const rows = (order.items || []).map(giftLines);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, info: {
      Title: title + " " + number,
      Author: "samanya",
      Creator: "samanya"
    } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fonts = registerFonts(doc);
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const left = 42;
    const right = pageW - 42;
    const width = right - left;
    const bottom = pageH - 124;

    function chrome() {
      drawPageChrome(doc, fonts, settings, pageH);
    }

    const label = documentLabel(order);
    chrome();

    doc.fillColor(COLORS.leaf).font(fonts.displaySemi).fontSize(22)
      .text(title, left, 34, { width: width, align: "right" });
    doc.font(fonts.body).fontSize(9).fillColor(COLORS.moss)
      .text(label, left, 60, { width: width, align: "right" });
    doc.font(fonts.body).fontSize(9)
      .text(formatWhen(isPaid(order) ? order.paidAt || order.createdAt : order.createdAt), left, 74, {
        width: width,
        align: "right"
      });

    doc.save();
    doc.moveTo(left, 96).lineTo(right, 96).lineWidth(1.25).strokeColor(COLORS.sun).stroke();
    doc.restore();

    let y = 114;
    doc.fillColor(COLORS.moss).font(fonts.body).fontSize(8)
      .text("FROM", left, y, { characterSpacing: 1.4 });
    doc.text("FOR", left + width / 2 + 12, y, { characterSpacing: 1.4 });
    y += 16;
    const colW = width / 2 - 16;
    const fromName = wrapText(doc, settings.legalName || COMPANY.legalName, fonts.displaySemi, 12, colW);
    const toName = wrapText(doc, customer.name || "", fonts.displaySemi, 12, colW);
    doc.fillColor(COLORS.clove).font(fonts.displaySemi).fontSize(12);
    fromName.forEach((line, i) => doc.text(line, left, y + i * 15, { width: colW }));
    toName.forEach((line, i) => doc.text(line, left + width / 2 + 12, y + i * 15, { width: colW }));
    y += Math.max(fromName.length, toName.length, 1) * 15 + 4;
    doc.font(fonts.body).fontSize(9).fillColor(COLORS.ink);
    const fromLines = [];
    [settings.address || COMPANY.address, settings.phone, settings.email].filter(Boolean).forEach((line) => {
      wrapText(doc, String(line), fonts.body, 9, colW).forEach((part) => fromLines.push(part));
    });
    const toBits = addressBlock(customer).slice(1);
    if (customer.email) toBits.push(customer.email);
    if (customer.phone) toBits.push(customer.phone);
    const toLines = [];
    toBits.forEach((line) => {
      wrapText(doc, String(line), fonts.body, 9, colW).forEach((part) => toLines.push(part));
    });
    const blockStart = y;
    fromLines.forEach((line, i) => {
      doc.font(fonts.body).fontSize(9).fillColor(COLORS.ink).text(line, left, blockStart + i * 13, { width: colW });
    });
    toLines.forEach((line, i) => {
      doc.font(fonts.body).fontSize(9).fillColor(COLORS.ink).text(line, left + width / 2 + 12, blockStart + i * 13, { width: colW });
    });
    y = blockStart + Math.max(fromLines.length, toLines.length, 1) * 13 + 22;

    doc.font(fonts.body).fontSize(9).fillColor(COLORS.moss)
      .text("Order " + order.txnid, left, y);
    doc.text(kindCopy(kind, order), left, y, { width: width, align: "right" });
    y += 20;

    const cols = { gift: left, qty: left + 318, each: left + 372, amt: right };
    function headerRow(at) {
      doc.save();
      doc.rect(left, at, width, 22).fill(COLORS.leaf);
      doc.fillColor(COLORS.ivory).font(fonts.body).fontSize(8);
      doc.text("GIFT", cols.gift + 10, at + 7, { characterSpacing: 1.3 });
      doc.text("QTY", cols.qty, at + 7, { width: 44, align: "right", characterSpacing: 1.3 });
      doc.text("EACH", cols.each, at + 7, { width: 70, align: "right", characterSpacing: 1.3 });
      doc.text("AMOUNT", cols.amt - 80, at + 7, { width: 70, align: "right", characterSpacing: 1.3 });
      doc.restore();
      return at + 22;
    }

    y = headerRow(y);

    function ensureSpace(need) {
      if (y + need < bottom) return;
      doc.addPage();
      chrome();
      y = 114;
      y = headerRow(y);
    }

    rows.forEach((row, index) => {
      const titleLines = wrapText(doc, row.title, fonts.bodyBold, 10, 300);
      const noteLines = row.notes ? wrapText(doc, row.notes, fonts.italic, 9, 300) : [];
      const h = 16 + titleLines.length * 13 + noteLines.length * 12;
      ensureSpace(h);
      if (index % 2 === 1) {
        doc.save();
        doc.rect(left, y, width, h).fill(COLORS.paper);
        doc.restore();
      }
      let ty = y + 8;
      doc.fillColor(COLORS.clove).font(fonts.bodyBold).fontSize(10);
      titleLines.forEach((line) => {
        doc.text(line, cols.gift + 10, ty, { width: 300 });
        ty += 13;
      });
      if (noteLines.length) {
        doc.fillColor(COLORS.moss).font(fonts.italic).fontSize(9);
        noteLines.forEach((line) => {
          doc.text(line, cols.gift + 10, ty, { width: 300 });
          ty += 12;
        });
      }
      const mid = y + 6;
      doc.fillColor(COLORS.clove).font(fonts.body).fontSize(10);
      doc.text(String(row.qty), cols.qty, mid + 2, { width: 44, align: "right" });
      doc.font(fonts.display).fontSize(12);
      doc.text(money(row.price), cols.each, mid, { width: 70, align: "right" });
      doc.font(fonts.displaySemi).fontSize(12).text(money(row.amount), cols.amt - 80, mid, { width: 70, align: "right" });
      y += h;
    });

    ensureSpace(90);
    doc.save();
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.6).strokeColor(COLORS.line).stroke();
    doc.restore();
    y += 10;
    doc.font(fonts.body).fontSize(10).fillColor(COLORS.ink)
      .text("Shipping", cols.gift + 10, y);
    doc.font(order.shipping ? fonts.display : fonts.body).fontSize(order.shipping ? 12 : 10)
      .text(order.shipping ? money(order.shipping) : "Complimentary", cols.amt - 110, y, {
        width: 100,
        align: "right"
      });
    y += 22;
    doc.save();
    doc.rect(left, y, width, 36).fill(COLORS.paper);
    doc.restore();
    doc.fillColor(COLORS.leaf).font(fonts.body).fontSize(8)
      .text("TOTAL", cols.gift + 10, y + 13, { characterSpacing: 1.6 });
    doc.font(fonts.displaySemi).fontSize(20)
      .text(money(order.payable), left, y + 6, { width: width - 12, align: "right" });
    y += 50;

    const note = kind === "estimate"
      ? "This estimate is a quotation for packing from current lots. It is not an invoice."
      : kind === "proforma"
        ? "This proforma shows the amount due on PayU. An invoice is issued after payment."
        : "Thank you. We pack from this week’s lots and write when the gift leaves.";
    const packed = settings.packedNote || "Packed to order. Usually 4–7 working days across India.";
    doc.fillColor(COLORS.moss).font(fonts.italic).fontSize(9);
    wrapText(doc, note + " " + packed, fonts.italic, 9, width).forEach((line) => {
      if (y > bottom - 8) return;
      doc.text(line, left, y, { width: width });
      y += 13;
    });

    doc.end();
  });
}

function invoiceHtml(order, settings, origin) {
  const kind = documentKind(order);
  const title = documentTitle(kind);
  const number = documentNo(order);
  const label = documentLabel(order);
  const when = formatWhen(isPaid(order) ? order.paidAt || order.createdAt : order.createdAt);
  const customer = order.customer || {};
  const pdfHref = origin + "/api/invoice?id=" + encodeURIComponent(order.txnid) + "&t=" + encodeURIComponent(order.invoiceToken || "") + "&download=1";
  const lines = (order.items || []).map(giftLines).map((row) => `
    <tr>
      <td>
        <strong>${escapeHtml(row.title)}</strong>
        ${row.notes ? `<span class="note">${escapeHtml(row.notes)}</span>` : ""}
      </td>
      <td>${row.qty}</td>
      <td>${rupees(row.price)}</td>
      <td>${rupees(row.amount)}</td>
    </tr>`).join("");
  const fromBits = [
    settings.legalName || COMPANY.legalName,
    settings.address || COMPANY.address,
    settings.phone,
    settings.email
  ].filter(Boolean).map((line) => escapeHtml(line)).join("<br />");
  const toBits = addressBlock(customer).map((line) => escapeHtml(line)).join("<br />");
  const contact = [customer.email, customer.phone].filter(Boolean).map(escapeHtml).join(" · ");

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} ${escapeHtml(number)} — samanya</title>
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  :root { --cream:#fcfaf6; --paper:#f3eee5; --leaf:#42573a; --moss:#6b7350; --sun:#d4933a; --ink:#5a3a24; --clove:#4b2e1c; --ivory:#f8f3ed; --line:#eadfd3; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #e8e0d4; color: var(--ink); font-family: Manrope, "Segoe UI", sans-serif; }
  .bar { position: sticky; top: 0; z-index: 2; display: flex; gap: 12px; justify-content: center; padding: 14px; background: rgba(252,250,246,.92); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
  .bar a, .bar button { font: 600 0.82rem Manrope, sans-serif; letter-spacing: .06em; text-transform: uppercase; color: var(--leaf); background: transparent; border: 1px solid var(--leaf); border-radius: 999px; padding: 8px 16px; text-decoration: none; cursor: pointer; }
  .bar a.primary { background: var(--leaf); color: var(--ivory); }
  .sheet { width: min(210mm, 100%); min-height: 297mm; margin: 28px auto 48px; background: var(--cream); box-shadow: 0 24px 70px rgba(75,46,28,.12); display: flex; flex-direction: column; }
  .pad { padding: 36px 42px 28px; flex: 1; }
  .top { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
  .brand-lockup { display: flex; align-items: center; gap: 12px; }
  .mark { width: 44px; height: 44px; color: var(--leaf); flex: 0 0 auto; }
  .wordmark { height: 32px; width: auto; }
  .kicker { margin: 0; font-size: .72rem; letter-spacing: .2em; text-transform: uppercase; color: var(--moss); }
  h1 { font-family: "Cormorant Garamond", Georgia, serif; font-weight: 600; font-size: 2.1rem; color: var(--leaf); margin: 0; line-height: 1.1; }
  .meta { text-align: right; }
  .doc-no { margin: 6px 0 0; font-size: .84rem; font-weight: 600; color: var(--moss); letter-spacing: .02em; }
  .meta .when { margin: 4px 0 0; color: var(--moss); font-size: .9rem; }
  .rule { height: 2px; margin: 22px 0 26px; background: linear-gradient(90deg, var(--sun), var(--gold, #c9a356), transparent); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  .grid p { margin: 6px 0 0; line-height: 1.55; }
  table { width: 100%; border-collapse: collapse; margin: 28px 0 8px; }
  th { text-align: left; font-size: .72rem; letter-spacing: .14em; text-transform: uppercase; color: var(--ivory); background: var(--leaf); padding: 10px 12px; font-weight: 500; }
  td { padding: 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:nth-child(even) td { background: var(--paper); }
  td:nth-child(2), td:nth-child(3), td:nth-child(4), th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: right; white-space: nowrap; }
  .note { display: block; margin-top: 4px; color: var(--moss); font-family: "Cormorant Garamond", Georgia, serif; font-style: italic; }
  .total { display: flex; justify-content: space-between; align-items: baseline; background: var(--paper); padding: 14px 12px; margin-top: 8px; }
  .total span { letter-spacing: .16em; text-transform: uppercase; font-size: .75rem; color: var(--leaf); }
  .total strong { font-family: "Cormorant Garamond", Georgia, serif; font-size: 1.8rem; font-weight: 600; color: var(--leaf); }
  .aside { color: var(--moss); font-size: .92rem; margin-top: 22px; font-family: "Cormorant Garamond", Georgia, serif; font-style: italic; }
  .foot { background: var(--leaf); color: #d9cbb8; padding: 22px 42px; display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; }
  .foot strong { display: block; font-family: "Cormorant Garamond", Georgia, serif; font-size: 1.4rem; font-weight: 500; color: var(--ivory); }
  .foot em { font-style: italic; font-family: "Cormorant Garamond", Georgia, serif; }
  .foot p { margin: 0; font-size: .78rem; text-align: right; line-height: 1.5; }
  @media (max-width: 720px) {
    .pad, .foot { padding: 24px 20px; }
    .grid, .foot { grid-template-columns: 1fr; display: grid; }
    .meta, .foot p { text-align: left; }
  }
  @media print {
    body { background: #fff; }
    .bar { display: none; }
    .sheet { margin: 0; box-shadow: none; width: auto; min-height: auto; }
  }
</style>
</head><body>
  <div class="bar">
    <a class="primary" href="${pdfHref}">Download PDF</a>
    <button type="button" onclick="window.print()">Print</button>
  </div>
  <article class="sheet">
    <div class="pad">
      <div class="top">
        <div>
          <div class="brand-lockup">
            <svg class="mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <circle cx="32" cy="32" r="30" stroke="currentColor" stroke-width="1.2"/>
              <path d="M32 14c6.2 8.4 8.8 14.6 8.8 20.2A8.8 8.8 0 1 1 23.2 34.2C23.2 28.6 25.8 22.4 32 14Z" fill="currentColor"/>
              <circle cx="32" cy="35.2" r="3.2" fill="#F6EFE4"/>
            </svg>
            <img class="wordmark" src="/assets/samanya-wordmark.png" alt="Sāmānya" />
          </div>
          <p class="kicker" style="margin-top:8px">Wellness gifts</p>
        </div>
        <div class="meta">
          <h1>${escapeHtml(title)}</h1>
          <p class="doc-no">${escapeHtml(label)}</p>
          <p class="when">${escapeHtml(when)}</p>
        </div>
      </div>
      <div class="rule"></div>
      <div class="grid">
        <div>
          <p class="kicker">From</p>
          <p>${fromBits}</p>
        </div>
        <div>
          <p class="kicker">For</p>
          <p>${toBits || escapeHtml(customer.name || "")}</p>
          ${contact ? `<p>${contact}</p>` : ""}
        </div>
      </div>
      <p class="kicker" style="margin-top:22px">${number === order.txnid ? escapeHtml(kindCopy(kind, order)) : "Order " + escapeHtml(order.txnid) + " · " + escapeHtml(kindCopy(kind, order))}</p>
      <table>
        <thead><tr><th>Gift</th><th>Qty</th><th>Each</th><th>Amount</th></tr></thead>
        <tbody>
          ${lines}
          <tr><td colspan="3">Shipping</td><td>${order.shipping ? rupees(order.shipping) : "Complimentary"}</td></tr>
        </tbody>
      </table>
      <div class="total"><span>Total</span><strong>${rupees(order.payable)}</strong></div>
      <p class="aside">${kind === "estimate"
        ? "This estimate is a quotation for packing from current lots. It is not an invoice."
        : kind === "proforma"
          ? "This proforma shows the amount due on PayU. An invoice is issued after payment."
          : "Thank you. We pack from this week’s lots and write when the gift leaves."}
        ${escapeHtml(settings.packedNote || "Packed to order. Usually 4–7 working days across India.")}</p>
    </div>
    <footer class="foot">
      <div>
        <strong>Sāmānya</strong>
        <em>Packed so someone feels tended.</em>
      </div>
      <p>${escapeHtml(settings.legalName || COMPANY.legalName)}<br />${escapeHtml(settings.address || COMPANY.address)}<br />samanyastore.com</p>
    </footer>
  </article>
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
  const kind = documentKind(order);
  return [
    "samanya " + documentTitle(kind).toLowerCase() + " " + documentNo(order),
    "Order " + order.txnid,
    isPaid(order) ? "PayU: " + (order.mihpayid || "received") : "",
    "Amount: ₹" + order.payable,
    "",
    c.name,
    c.phone,
    c.email,
    c.address,
    [c.city, c.pincode, c.state].filter(Boolean).join(", "),
    "",
    lines.join("\n\n")
  ].filter((line) => line !== "").join("\n");
}

module.exports = {
  invoiceHtml,
  invoicePdf,
  packSheet,
  escapeHtml,
  documentKind,
  documentTitle,
  documentNo,
  documentLabel,
  filenameFor,
  ensureDocNumbers,
  isPaid
};

const fs = require("fs");
const path = require("path");
const { sendEmail } = require("./mail");
const { packSheet, invoicePdf, filenameFor, escapeHtml, documentNo } = require("./invoice");
const { rupees } = require("./catalog");
const { payUrl, invoiceUrl } = require("./compose");
const { pingAtelier, messageCustomer } = require("./whatsapp");

function firstName(order) {
  const name = String((order.customer && order.customer.name) || "").trim();
  return name || "there";
}

function giftLines(order) {
  return (order.items || []).map((item) => {
    if (typeof item === "string") return { title: item, amount: "" };
    const title = (item.qty || 1) + " × " + (item.label || "Gift") + (item.bowl ? " + bowl" : "");
    return { title, amount: rupees((Number(item.price) || 0) * (Number(item.qty) || 1)) };
  });
}

function giftTable(order) {
  const rows = giftLines(order).map((row) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eadfd3;font-family:Georgia,Times,serif;font-size:16px;color:#4b2e1c">${escapeHtml(row.title)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #eadfd3;text-align:right;font-family:Georgia,Times,serif;font-size:16px;color:#4b2e1c">${escapeHtml(row.amount)}</td>
    </tr>`).join("");
  const delivery = order.shipping ? rupees(order.shipping) : "Complimentary";
  const discount = Number(order.discount) > 0
    ? `<tr><td style="padding:10px 0;font-family:Georgia,Times,serif;font-size:16px;color:#4b2e1c">Discount</td><td style="padding:10px 0;text-align:right;font-family:Georgia,Times,serif;font-size:16px;color:#4b2e1c">−${rupees(order.discount)}</td></tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;border-collapse:collapse">
    ${rows}
    <tr>
      <td style="padding:10px 0;font-family:Georgia,Times,serif;font-size:16px;color:#4b2e1c">Delivery</td>
      <td style="padding:10px 0;text-align:right;font-family:Georgia,Times,serif;font-size:16px;color:#4b2e1c">${delivery}</td>
    </tr>
    ${discount}
    <tr>
      <td style="padding:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#42573a">Total</td>
      <td style="padding:14px 0 0;text-align:right;font-family:Georgia,Times,serif;font-size:24px;color:#42573a">${rupees(order.payable)}</td>
    </tr>
  </table>`;
}

function btn(href, label) {
  if (!href) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 8px 8px 0;display:inline-block">
    <tr>
      <td bgcolor="#42573a" style="background:#42573a;border-radius:8px">
        <a href="${href}" style="display:inline-block;padding:12px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#fcfaf6;text-decoration:none">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

function mailShell(title, inner) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3eee5">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3eee5">
    <tr>
      <td align="center" style="padding:24px 12px">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#fcfaf6;border:1px solid #eadfd3">
          <tr>
            <td style="padding:28px 32px 10px">
              <img src="cid:samanya-mark" alt="Sāmānya" height="32" style="display:block;height:32px;width:auto;border:0" />
              <p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b7350">Wellness gifts</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px">
              <hr style="border:none;border-top:2px solid #d4933a;margin:8px 0 0" />
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 8px">
              <h1 style="margin:0;font-family:Georgia,Times,serif;font-size:26px;font-weight:normal;line-height:1.2;color:#42573a">${escapeHtml(title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;font-family:Georgia,Times,serif;font-size:16px;line-height:1.55;color:#5a3a24">
              ${inner}
            </td>
          </tr>
          <tr>
            <td bgcolor="#42573a" style="background:#42573a;padding:18px 32px;font-family:Georgia,Times,serif;font-size:13px;line-height:1.5;color:#d9cbb8">
              Packed so someone feels tended.<br />samanyastore.com
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function logoFile() {
  const file = path.join(__dirname, "../assets/samanya-wordmark.png");
  if (!fs.existsSync(file)) return null;
  return {
    filename: "samanya-wordmark.png",
    content: fs.readFileSync(file),
    contentId: "samanya-mark"
  };
}

async function pdfFiles(order, settings) {
  const files = [];
  const logo = logoFile();
  if (logo) files.push(logo);
  try {
    files.push({ filename: filenameFor(order), content: await invoicePdf(order, settings) });
  } catch (err) {
    files.pdfError = String(err && err.message || err);
  }
  return files;
}

function attachmentsOf(files) {
  return Array.isArray(files) ? files : [];
}

async function notifyPaid(order, settings, origin) {
  const sheet = packSheet(order);
  const invoiceLink = invoiceUrl(origin, order);
  const pdfLink = invoiceUrl(origin, order, true);
  const files = await pdfFiles(order, settings);
  const invoiceNo = order.invoiceNo || documentNo(order);
  const inner = `
    <p style="margin:0 0 12px">Hello ${escapeHtml(firstName(order))},</p>
    <p style="margin:0 0 12px">We have received your payment of <strong>${rupees(order.payable)}</strong>. Invoice <strong>${escapeHtml(invoiceNo)}</strong> is attached.</p>
    ${giftTable(order)}
    <p style="margin:16px 0 8px">We will pack from this week’s lots and write when the gift leaves.</p>
    ${btn(invoiceLink, "View invoice")}${btn(pdfLink, "Download PDF")}`;
  const adminInner = `
    <p style="margin:0 0 12px">Paid ${escapeHtml(order.txnid)} · ${rupees(order.payable)}</p>
    ${giftTable(order)}
    ${btn(origin + "/admin#orders", "Open atelier")}
    <pre style="white-space:pre-wrap;font-size:13px;font-family:Georgia,Times,serif">${escapeHtml(sheet)}</pre>`;
  const results = {};
  results.customer = await sendEmail({
    to: order.customer && order.customer.email,
    subject: "Payment received · " + invoiceNo,
    html: mailShell("Payment received", inner),
    text: [
      "Hello " + firstName(order) + ",",
      "",
      "We have received your payment of " + rupees(order.payable) + ".",
      "Invoice " + invoiceNo + " is attached.",
      "View: " + invoiceLink,
      "",
      "We will pack from this week’s lots and write when the gift leaves.",
      "",
      "— samanya"
    ].join("\n"),
    attachments: attachmentsOf(files)
  });
  results.admin = await sendEmail({
    to: settings.notifyEmail || settings.email,
    subject: "Paid: " + order.txnid + " · " + rupees(order.payable),
    html: mailShell("Payment received", adminInner),
    text: sheet,
    attachments: attachmentsOf(files)
  });
  results.whatsapp = await pingAtelier(order, settings, origin);
  results.pdfAttached = attachmentsOf(files).some((file) => file.filename && /\.pdf$/i.test(file.filename));
  results.pdfError = files.pdfError || "";
  return results;
}

async function notifyCompose(order, settings, origin, opts) {
  opts = opts || {};
  const doc = invoiceUrl(origin, order);
  const pdf = invoiceUrl(origin, order, true);
  const pay = order.status === "pending" ? payUrl(origin, order) : "";
  const isPay = Boolean(pay);
  const docNo = order.estimateNo || order.txnid;
  const files = await pdfFiles(order, settings);
  const title = isPay ? "Your payment link" : "Your estimate";
  const inner = isPay
    ? `
    <p style="margin:0 0 12px">Hello ${escapeHtml(firstName(order))},</p>
    <p style="margin:0 0 12px">A PayU link is ready for <strong>${rupees(order.payable)}</strong>. The proforma is attached.</p>
    ${giftTable(order)}
    ${btn(pay, "Pay now")}${btn(doc, "View proforma")}`
    : `
    <p style="margin:0 0 12px">Hello ${escapeHtml(firstName(order))},</p>
    <p style="margin:0 0 12px">Estimate <strong>${escapeHtml(docNo)}</strong> is ready for <strong>${rupees(order.payable)}</strong>. The PDF is attached.</p>
    ${giftTable(order)}
    <p style="margin:16px 0 8px">Reply to this mail if anything should change.</p>
    ${btn(doc, "View estimate")}${btn(pdf, "Download PDF")}`;
  const subject = isPay
    ? "Pay for your samanya gift · " + rupees(order.payable)
    : "Your samanya estimate " + docNo;
  const adminInner = `
    <p style="margin:0 0 12px">${isPay ? "Payment link" : "Estimate"} ${escapeHtml(order.txnid)} · ${rupees(order.payable)}</p>
    ${giftTable(order)}
    ${btn(pay || doc, isPay ? "Open PayU link" : "Open estimate")}`;
  const results = {};
  if (opts.email !== false) {
    results.customer = await sendEmail({
      to: order.customer && order.customer.email,
      subject,
      html: mailShell(title, inner),
      text: [
        "Hello " + firstName(order) + ",",
        "",
        isPay
          ? "A PayU link is ready for " + rupees(order.payable) + "."
          : "Estimate " + docNo + " is ready for " + rupees(order.payable) + ".",
        isPay ? "Pay: " + pay : "View: " + doc,
        "The PDF is attached.",
        "",
        "— samanya"
      ].join("\n"),
      attachments: attachmentsOf(files)
    });
  }
  results.admin = await sendEmail({
    to: settings.notifyEmail || settings.email,
    subject: (isPay ? "Link: " : "Estimate: ") + order.txnid,
    html: mailShell(title, adminInner),
    text: pay || doc,
    attachments: attachmentsOf(files)
  });
  results.whatsapp = await pingAtelier(order, settings, origin);
  if (opts.whatsapp) {
    results.customerWhatsapp = await messageCustomer(order, settings, origin);
  }
  results.pdfAttached = attachmentsOf(files).some((file) => file.filename && /\.pdf$/i.test(file.filename));
  results.pdfError = files.pdfError || "";
  return results;
}

async function notifyCheckout(order, settings, origin) {
  return { whatsapp: await pingAtelier(order, settings, origin) };
}

module.exports = { notifyPaid, notifyCompose, notifyCheckout };

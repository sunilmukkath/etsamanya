const { sendEmail } = require("./mail");
const { packSheet, invoicePdf, filenameFor, escapeHtml, documentNo } = require("./invoice");
const { rupees } = require("./catalog");
const { payUrl, invoiceUrl } = require("./compose");
const { pingAtelier, messageCustomer } = require("./whatsapp");

function mailShell(origin, title, inner) {
  const mark = origin + "/assets/samanya-wordmark.png";
  return `<!DOCTYPE html>
<html><body style="margin:0;background:#f3eee5;padding:24px;color:#5a3a24">
  <div style="max-width:560px;margin:0 auto;background:#fcfaf6;border:1px solid #eadfd3">
    <div style="padding:28px 32px 20px">
      <img src="${mark}" alt="Sāmānya" height="32" style="height:32px;width:auto;border:0" />
      <p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;letter-spacing:0.16em;font-size:11px;color:#6b7350;text-transform:uppercase">Wellness gifts</p>
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:500;color:#42573a;font-size:26px;line-height:1.2;margin:18px 0 12px">${escapeHtml(title)}</h1>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:#5a3a24">${inner}</div>
    </div>
    <div style="background:#42573a;color:#d9cbb8;padding:18px 32px;font-family:Georgia,'Times New Roman',serif;font-size:13px">
      Packed so someone feels tended.<br />samanyastore.com
    </div>
  </div>
</body></html>`;
}

function giftTable(order) {
  const rows = (order.items || []).map((item) => {
    const title = escapeHtml(item.label + (item.bowl ? " + bowl" : ""));
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #eadfd3">${item.qty} × ${title}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eadfd3;text-align:right">${rupees((item.price || 0) * (item.qty || 1))}</td>
    </tr>`;
  }).join("");
  const extra = [];
  extra.push(`<tr><td style="padding:8px 0">Delivery</td><td style="padding:8px 0;text-align:right">${order.shipping ? rupees(order.shipping) : "Complimentary"}</td></tr>`);
  if (Number(order.discount) > 0) {
    extra.push(`<tr><td style="padding:8px 0">Discount</td><td style="padding:8px 0;text-align:right">−${rupees(order.discount)}</td></tr>`);
  }
  extra.push(`<tr><td style="padding:12px 0 0;font-family:Arial,Helvetica,sans-serif;letter-spacing:0.12em;text-transform:uppercase;font-size:12px;color:#42573a">Total</td><td style="padding:12px 0 0;text-align:right;font-size:22px;color:#42573a">${rupees(order.payable)}</td></tr>`);
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0 8px">${rows}${extra.join("")}</table>`;
}

async function pdfFiles(order, settings) {
  try {
    const content = await invoicePdf(order, settings);
    return [{ filename: filenameFor(order), content }];
  } catch (err) {
    return [];
  }
}

async function notifyPaid(order, settings, origin) {
  const sheet = packSheet(order);
  const invoiceLink = invoiceUrl(origin, order);
  const pdfLink = invoiceUrl(origin, order, true);
  const files = await pdfFiles(order, settings);
  const name = (order.customer && order.customer.name) || "there";
  const invoiceNo = order.invoiceNo || documentNo(order);
  const inner = `
    <p>Thank you, ${escapeHtml(name)}.</p>
    <p>We have received <strong>${rupees(order.payable)}</strong> for order <strong>${escapeHtml(order.txnid)}</strong>${order.invoiceNo ? " · invoice <strong>" + escapeHtml(order.invoiceNo) + "</strong>" : ""}.</p>
    ${giftTable(order)}
    <p>The branded invoice is attached as a PDF. You can also <a href="${invoiceLink}" style="color:#42573a">view it online</a> or <a href="${pdfLink}" style="color:#42573a">download it</a>.</p>
    <p>We will pack from this week’s lots and write when the gift leaves.</p>`;
  const adminInner = `<p>Paid order ${escapeHtml(order.txnid)} · ${rupees(order.payable)}</p>${giftTable(order)}<p><a href="${origin}/admin#orders" style="color:#42573a">Open atelier</a></p><pre style="white-space:pre-wrap;font-size:13px">${escapeHtml(sheet)}</pre>`;
  const results = {};
  results.customer = await sendEmail({
    to: order.customer && order.customer.email,
    subject: "Payment received · samanya invoice " + invoiceNo,
    html: mailShell(origin, "Payment received", inner),
    text: "Payment received for order " + order.txnid + (order.invoiceNo ? " · " + order.invoiceNo : "") + ".\nAmount: " + rupees(order.payable) + "\nInvoice: " + invoiceLink + "\nPDF: " + pdfLink + "\n\n" + sheet,
    attachments: files
  });
  results.admin = await sendEmail({
    to: settings.notifyEmail || settings.email,
    subject: "Paid: " + order.txnid + " · " + rupees(order.payable),
    html: mailShell(origin, "Payment received", adminInner),
    text: sheet,
    attachments: files
  });
  results.whatsapp = await pingAtelier(order, settings, origin);
  results.pdfAttached = files.length > 0;
  return results;
}

async function notifyCompose(order, settings, origin, opts) {
  opts = opts || {};
  const doc = invoiceUrl(origin, order);
  const pdf = invoiceUrl(origin, order, true);
  const pay = order.status === "pending" ? payUrl(origin, order) : "";
  const link = pay || doc;
  const isPay = Boolean(pay);
  const docNo = order.estimateNo || order.txnid;
  const files = await pdfFiles(order, settings);
  const name = (order.customer && order.customer.name) || "there";
  const title = isPay ? "Pay for your samanya gift" : "Your samanya estimate";
  const inner = `
    <p>Hello ${escapeHtml(name)},</p>
    <p>${isPay
      ? "A payment link is ready for <strong>" + rupees(order.payable) + "</strong>."
      : "Estimate <strong>" + escapeHtml(docNo) + "</strong> for <strong>" + rupees(order.payable) + "</strong> is ready."}</p>
    ${giftTable(order)}
    ${pay ? "<p><a href=\"" + pay + "\" style=\"color:#42573a\">Pay with PayU</a></p>" : ""}
    <p>The ${isPay ? "proforma" : "estimate"} is attached as a PDF. You can also <a href="${doc}" style="color:#42573a">view it online</a>.</p>`;
  const subject = isPay
    ? "Pay for samanya order " + order.txnid
    : "samanya estimate " + docNo;
  const adminHtml = mailShell(origin, title, `<p>${isPay ? "Payment link" : "Estimate"} ${escapeHtml(order.txnid)} · ${rupees(order.payable)}</p><p><a href="${link}" style="color:#42573a">Open</a></p>`);
  const results = {};
  if (opts.email !== false) {
    results.customer = await sendEmail({
      to: order.customer && order.customer.email,
      subject,
      html: mailShell(origin, title, inner),
      text: (isPay ? "Pay: " + pay + "\n" : "") + "Document: " + doc + "\nPDF: " + pdf,
      attachments: files
    });
  }
  results.admin = await sendEmail({
    to: settings.notifyEmail || settings.email,
    subject: (isPay ? "Link: " : "Estimate: ") + order.txnid,
    html: adminHtml,
    text: link,
    attachments: files
  });
  results.whatsapp = await pingAtelier(order, settings, origin);
  if (opts.whatsapp) {
    results.customerWhatsapp = await messageCustomer(order, settings, origin);
  }
  results.pdfAttached = files.length > 0;
  return results;
}

async function notifyCheckout(order, settings, origin) {
  return { whatsapp: await pingAtelier(order, settings, origin) };
}

module.exports = { notifyPaid, notifyCompose, notifyCheckout };

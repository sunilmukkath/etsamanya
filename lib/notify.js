const { sendEmail } = require("./mail");
const { packSheet } = require("./invoice");
const { rupees } = require("./catalog");
const { payUrl, invoiceUrl } = require("./compose");
const { pingAtelier, messageCustomer } = require("./whatsapp");

async function notifyPaid(order, settings, origin) {
  const sheet = packSheet(order);
  const invoiceLink = invoiceUrl(origin, order);
  const invoicePdf = invoiceUrl(origin, order, true);
  const customerHtml = `
    <p>Thank you, ${order.customer.name}.</p>
    <p>We have ${rupees(order.payable)} from PayU for order <strong>${order.txnid}</strong>${order.invoiceNo ? " · invoice <strong>" + order.invoiceNo + "</strong>" : ""}.</p>
    <p>We will pack from this week’s lots and write when it leaves.</p>
    <p><a href="${invoiceLink}">View invoice</a> · <a href="${invoicePdf}">Download PDF</a></p>
    <pre style="font-family:Georgia,serif;white-space:pre-wrap">${sheet}</pre>`;
  const adminHtml = `<p>Paid order ${order.txnid} · ${rupees(order.payable)}</p><pre style="white-space:pre-wrap">${sheet}</pre><p><a href="${origin}/admin">Open admin</a></p>`;
  const results = {};
  results.customer = await sendEmail({
    to: order.customer.email,
    subject: "samanya order " + order.txnid,
    html: customerHtml,
    text: "Order " + order.txnid + " received. Invoice: " + invoiceLink + "\nPDF: " + invoicePdf + "\n\n" + sheet
  });
  results.admin = await sendEmail({
    to: settings.notifyEmail || settings.email,
    subject: "Paid: " + order.txnid + " · " + rupees(order.payable),
    html: adminHtml,
    text: sheet
  });
  results.whatsapp = await pingAtelier(order, settings, origin);
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
  const subject = isPay
    ? "Pay for samanya order " + order.txnid
    : "samanya estimate " + docNo;
  const customerHtml = `
    <p>Hello ${order.customer.name},</p>
    <p>${isPay
      ? "A payment link is ready for <strong>" + rupees(order.payable) + "</strong>."
      : "Estimate <strong>" + docNo + "</strong> for <strong>" + rupees(order.payable) + "</strong> is ready."}</p>
    <p>Order <strong>${order.txnid}</strong>.</p>
    ${pay ? "<p><a href=\"" + pay + "\">Pay with PayU</a></p>" : ""}
    <p><a href="${doc}">${isPay ? "View proforma" : "View estimate"}</a> · <a href="${pdf}">Download PDF</a></p>`;
  const adminHtml = `<p>${isPay ? "Payment link" : "Estimate"} ${order.txnid} · ${rupees(order.payable)}</p><p><a href="${link}">Open</a></p>`;
  const results = {};
  if (opts.email !== false) {
    results.customer = await sendEmail({
      to: order.customer.email,
      subject,
      html: customerHtml,
      text: (isPay ? "Pay: " + pay + "\n" : "") + "Document: " + doc + "\nPDF: " + pdf
    });
  }
  results.admin = await sendEmail({
    to: settings.notifyEmail || settings.email,
    subject: (isPay ? "Link: " : "Estimate: ") + order.txnid,
    html: adminHtml,
    text: link
  });
  results.whatsapp = await pingAtelier(order, settings, origin);
  if (opts.whatsapp) {
    results.customerWhatsapp = await messageCustomer(order, settings, origin);
  }
  return results;
}

async function notifyCheckout(order, settings, origin) {
  return { whatsapp: await pingAtelier(order, settings, origin) };
}

module.exports = { notifyPaid, notifyCompose, notifyCheckout };

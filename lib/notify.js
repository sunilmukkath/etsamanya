const { sendEmail } = require("./mail");
const { invoiceHtml, packSheet } = require("./invoice");
const { rupees } = require("./catalog");

async function sendWhatsApp(text, settings) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const to = process.env.WHATSAPP_TO || (settings && settings.whatsapp) || "";
  if (!token || !phoneId || !to) return { skipped: true, reason: "no-whatsapp" };
  const res = await fetch("https://graph.facebook.com/v21.0/" + phoneId + "/messages", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: String(to).replace(/\D/g, ""),
      type: "text",
      text: { body: String(text).slice(0, 3900) }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error && data.error.message || "WhatsApp failed" };
  return { ok: true };
}

async function notifyPaid(order, settings, origin) {
  const sheet = packSheet(order);
  const invoiceLink = origin + "/api/invoice?id=" + encodeURIComponent(order.txnid) + "&t=" + encodeURIComponent(order.invoiceToken || "");
  const customerHtml = `
    <p>Thank you, ${order.customer.name}.</p>
    <p>We have ${rupees(order.payable)} from PayU for order <strong>${order.txnid}</strong>.</p>
    <p>We will pack from this week’s lots and write when it leaves.</p>
    <p><a href="${invoiceLink}">Invoice</a></p>
    <pre style="font-family:Georgia,serif;white-space:pre-wrap">${sheet}</pre>`;
  const adminHtml = `<p>Paid order ${order.txnid} · ${rupees(order.payable)}</p><pre style="white-space:pre-wrap">${sheet}</pre><p><a href="${origin}/admin">Open admin</a></p>`;
  const results = {};
  results.customer = await sendEmail({
    to: order.customer.email,
    subject: "samanya order " + order.txnid,
    html: customerHtml,
    text: "Order " + order.txnid + " received. Invoice: " + invoiceLink + "\n\n" + sheet
  });
  results.admin = await sendEmail({
    to: settings.notifyEmail || settings.email,
    subject: "Paid: " + order.txnid + " · " + rupees(order.payable),
    html: adminHtml,
    text: sheet
  });
  results.whatsapp = await sendWhatsApp(sheet, settings);
  return results;
}

module.exports = { notifyPaid, sendWhatsApp };

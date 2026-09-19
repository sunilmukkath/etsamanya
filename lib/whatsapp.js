const { rupees } = require("./catalog");
const { payUrl, invoiceUrl } = require("./compose");

function digits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function waNumber(raw) {
  let n = digits(raw);
  if (!n) return "";
  if (n.length === 10) return "91" + n;
  if (n.length === 11 && n.charAt(0) === "0") return "91" + n.slice(1);
  return n;
}

function apiReady() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

function publicNumber(settings) {
  return waNumber(
    (settings && settings.whatsapp) ||
    process.env.WHATSAPP_NUMBER ||
    (settings && settings.phone) ||
    ""
  );
}

function atelierNumber(settings) {
  return waNumber(
    process.env.WHATSAPP_TO ||
    (settings && settings.whatsappAlert) ||
    publicNumber(settings)
  );
}

function customerNumber(order) {
  return waNumber(order && order.customer && order.customer.phone);
}

function waLink(phone, text) {
  const n = waNumber(phone);
  if (!n) return "";
  return "https://wa.me/" + n + (text ? "?text=" + encodeURIComponent(text) : "");
}

function prettyNumber(raw) {
  const n = waNumber(raw);
  if (n.indexOf("91") === 0 && n.length === 12) {
    return n.slice(2, 7) + " " + n.slice(7);
  }
  return n;
}

function docUrls(order, origin) {
  return {
    view: invoiceUrl(origin, order),
    pdf: invoiceUrl(origin, order, true),
    pay: order && order.status === "pending" ? payUrl(origin, order) : ""
  };
}

function customerCopy(order, origin) {
  const c = (order && order.customer) || {};
  const urls = docUrls(order, origin);
  const paid = order.status === "paid" || order.status === "packed" || order.status === "shipped";
  const lines = [
    "Hello" + (c.name ? " " + c.name : "") + ",",
    ""
  ];
  if (paid) {
    lines.push("Thank you. We have " + rupees(order.payable) + " for order " + order.txnid + ".");
    if (order.invoiceNo) lines.push("Invoice " + order.invoiceNo + ".");
    lines.push("We will pack from this week’s lots and write when it leaves.");
  } else if (urls.pay) {
    lines.push("A payment link is ready for " + rupees(order.payable) + ".");
    lines.push("Order " + order.txnid + ".");
    lines.push("Pay: " + urls.pay);
  } else {
    lines.push("Estimate" + (order.estimateNo ? " " + order.estimateNo : "") + " for " + rupees(order.payable) + " is ready.");
    lines.push("Order " + order.txnid + ".");
  }
  if (urls.view) lines.push("Document: " + urls.view);
  if (urls.pdf) lines.push("PDF: " + urls.pdf);
  lines.push("", "— samanya");
  return lines.join("\n");
}

function atelierCopy(order, origin) {
  const c = (order && order.customer) || {};
  const gifts = (order.items || []).map((item) => item.qty + " × " + item.label).join(", ");
  const status = order.status === "paid" || order.status === "packed" || order.status === "shipped"
    ? "Paid"
    : order.status === "pending"
      ? "PayU link / pending"
      : "Estimate";
  return [
    status + " " + order.txnid + " · " + rupees(order.payable),
    [c.name, c.phone, c.city].filter(Boolean).join(" · "),
    gifts,
    origin ? origin + "/admin#orders/" + encodeURIComponent(order.txnid) : ""
  ].filter(Boolean).join("\n");
}

function publicUrl(url) {
  return /^https:\/\//i.test(url || "") && !/localhost|127\.0\.0\.1/i.test(url);
}

async function graphSend(payload) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { skipped: true, reason: "no-whatsapp-api" };
  const to = waNumber(payload.to);
  if (!to) return { skipped: true, reason: "no-to" };
  const body = Object.assign({ messaging_product: "whatsapp", to }, payload);
  delete body.to;
  body.to = to;
  const res = await fetch("https://graph.facebook.com/v21.0/" + phoneId + "/messages", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: (data.error && data.error.message) || "WhatsApp failed" };
  }
  return { ok: true, id: data.messages && data.messages[0] && data.messages[0].id };
}

async function sendText(to, text) {
  return graphSend({
    to,
    type: "text",
    text: { body: String(text || "").slice(0, 3900), preview_url: true }
  });
}

async function sendDocument(to, link, filename, caption) {
  if (!publicUrl(link)) return { skipped: true, reason: "private-url" };
  return graphSend({
    to,
    type: "document",
    document: {
      link,
      filename: filename || "samanya.pdf",
      caption: String(caption || "").slice(0, 1024)
    }
  });
}

async function sendTemplate(to, order, origin) {
  const name = process.env.WHATSAPP_TEMPLATE;
  if (!name) return null;
  const urls = docUrls(order, origin);
  const link = urls.pay || urls.view;
  return graphSend({
    to,
    type: "template",
    template: {
      name,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: String((order.customer && order.customer.name) || "there").slice(0, 60) },
          { type: "text", text: rupees(order.payable) },
          { type: "text", text: String(order.txnid || "").slice(0, 60) },
          { type: "text", text: String(link || "https://samanyastore.com").slice(0, 200) }
        ]
      }]
    }
  });
}

function filenameOf(order) {
  const paid = order.status === "paid" || order.status === "packed" || order.status === "shipped";
  const stem = paid ? "invoice" : order.status === "pending" ? "proforma" : "estimate";
  return "samanya-" + stem + "-" + (order.invoiceNo || order.estimateNo || order.txnid) + ".pdf";
}

async function pingAtelier(order, settings, origin) {
  const to = atelierNumber(settings);
  const text = order ? atelierCopy(order, origin) : "samanya atelier is connected. Alerts will land here.";
  const link = waLink(to, text);
  if (!apiReady()) return { skipped: true, reason: "no-whatsapp-api", to, link };
  const sent = await sendText(to, text);
  return Object.assign({ to, link }, sent);
}

async function messageCustomer(order, settings, origin) {
  const to = customerNumber(order);
  const text = customerCopy(order, origin);
  const urls = docUrls(order, origin);
  const link = waLink(to, text);
  if (!to) return { skipped: true, reason: "no-phone", link: "" };
  if (!apiReady()) return { skipped: true, reason: "no-whatsapp-api", to, link };
  const templated = await sendTemplate(to, order, origin);
  if (templated && templated.ok) return Object.assign({ to, link, via: "template" }, templated);
  const doc = await sendDocument(to, urls.pdf, filenameOf(order), text);
  if (doc && doc.ok) return Object.assign({ to, link, via: "document" }, doc);
  const sent = await sendText(to, text);
  return Object.assign({ to, link, via: "text", document: doc, template: templated }, sent);
}

module.exports = {
  digits,
  waNumber,
  prettyNumber,
  apiReady,
  publicNumber,
  atelierNumber,
  customerNumber,
  waLink,
  customerCopy,
  atelierCopy,
  sendText,
  sendDocument,
  pingAtelier,
  messageCustomer
};

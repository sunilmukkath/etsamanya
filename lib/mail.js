function fromAddress() {
  return process.env.MAIL_FROM || "samanya <hello@samanyastore.com>";
}

function replyToAddress() {
  return process.env.NOTIFY_EMAIL || "etsamanyafoods@gmail.com";
}

function asAttachments(list) {
  if (!Array.isArray(list) || !list.length) return undefined;
  return list.map((file) => ({
    filename: file.filename,
    content: Buffer.isBuffer(file.content) ? file.content.toString("base64") : file.content
  }));
}

async function sendEmail({ to, subject, html, text, attachments }) {
  if (!to) return { skipped: true, reason: "no-to" };
  const resend = process.env.RESEND_API_KEY;
  if (resend) {
    const payload = {
      from: fromAddress(),
      to: [to],
      reply_to: replyToAddress(),
      subject,
      html,
      text
    };
    const files = asAttachments(attachments);
    if (files) payload.attachments = files;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + resend,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.message || "Resend failed" };
    return { ok: true, id: data.id };
  }
  const webhook = process.env.NOTIFY_WEBHOOK;
  if (webhook) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, html, text })
    });
    return { ok: res.ok, status: res.status };
  }
  return { skipped: true, reason: "no-mailer" };
}

module.exports = { sendEmail, fromAddress, replyToAddress };

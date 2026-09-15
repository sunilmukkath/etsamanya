const encoder = new TextEncoder();

async function sha512(text) {
  const digest = await crypto.subtle.digest("SHA-512", encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "https://sunilmukkath.github.io,https://etsamanya.com,http://localhost:5500,http://127.0.0.1:5500")
    .split(",")
    .map((value) => value.trim());
  const use = allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": use,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400"
  };
}

function form(data) {
  const body = new URLSearchParams();
  Object.keys(data).forEach((key) => body.set(key, data[key] == null ? "" : String(data[key])));
  return body;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (url.pathname === "/hash" && request.method === "POST") {
      const payload = await request.json();
      const key = env.PAYU_KEY;
      const salt = env.PAYU_SALT;
      if (!key || !salt) {
        return Response.json({ error: "PayU is not configured on the server." }, { status: 500, headers });
      }
      const fields = {
        key,
        txnid: payload.txnid,
        amount: Number(payload.amount).toFixed(2),
        productinfo: payload.productinfo || "samanya gift",
        firstname: payload.firstname || "",
        email: payload.email || "",
        udf1: payload.udf1 || "",
        udf2: payload.udf2 || "",
        udf3: payload.udf3 || "",
        udf4: payload.udf4 || "",
        udf5: payload.udf5 || ""
      };
      const hash = await sha512(
        [fields.key, fields.txnid, fields.amount, fields.productinfo, fields.firstname, fields.email, fields.udf1, fields.udf2, fields.udf3, fields.udf4, fields.udf5, "", "", "", "", "", salt].join("|")
      );
      return Response.json({ hash, key: fields.key, amount: fields.amount }, { headers });
    }

    if (url.pathname === "/return" && request.method === "POST") {
      const posted = Object.fromEntries((await request.formData()).entries());
      const salt = env.PAYU_SALT || "";
      const reverse = await sha512(
        [salt, posted.status || "", "", "", "", "", "", posted.udf5 || "", posted.udf4 || "", posted.udf3 || "", posted.udf2 || "", posted.udf1 || "", posted.email || "", posted.firstname || "", posted.productinfo || "", posted.amount || "", posted.txnid || "", posted.key || ""].join("|")
      );
      const ok = reverse === (posted.hash || "").toLowerCase() && String(posted.status).toLowerCase() === "success";
      const next = new URL(ok ? env.SUCCESS_URL : env.FAIL_URL);
      next.searchParams.set("txnid", posted.txnid || "");
      next.searchParams.set("status", posted.status || "");
      next.searchParams.set("mihpayid", posted.mihpayid || "");
      return Response.redirect(next.toString(), 303);
    }

    return new Response("samanya payu", { status: 404, headers });
  }
};

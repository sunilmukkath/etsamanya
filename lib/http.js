function json(res, status, data, headers) {
  if (typeof res.status === "function") res.status(status);
  else res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      if (value != null) res.setHeader(key, value);
    });
  }
  res.end(JSON.stringify(data));
}

function text(res, status, body, type) {
  res.statusCode = status;
  res.setHeader("Content-Type", type || "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

function html(res, status, body) {
  text(res, status, body, "text/html; charset=utf-8");
}

async function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string") {
    return parseMaybe(req.body, req.headers["content-type"] || "");
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return parseMaybe(raw, req.headers["content-type"] || "");
}

function parseMaybe(raw, type) {
  if (type.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      return {};
    }
  }
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

function originOf(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "samanyastore.com";
  return proto + "://" + host;
}

module.exports = { json, text, html, readBody, originOf };

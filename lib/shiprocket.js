async function shiprocketToken() {
  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || !password) return null;
  const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) return null;
  return data.token;
}

async function pushOrder(order, settings) {
  const token = await shiprocketToken();
  if (!token) {
    const err = new Error("Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD on Vercel.");
    err.status = 501;
    throw err;
  }
  const c = order.customer || {};
  const nameParts = String(c.name || "Guest").trim().split(/\s+/);
  const payload = {
    order_id: order.txnid,
    order_date: new Date(order.paidAt || order.createdAt).toISOString().slice(0, 19).replace("T", " "),
    pickup_location: process.env.SHIPROCKET_PICKUP || "Primary",
    billing_customer_name: nameParts[0] || "Guest",
    billing_last_name: nameParts.slice(1).join(" ") || ".",
    billing_address: c.address || "Address on file",
    billing_city: c.city || "",
    billing_pincode: c.pincode || "",
    billing_state: c.state || "",
    billing_country: "India",
    billing_email: c.email || settings.email,
    billing_phone: String(c.phone || "").replace(/\D/g, "").slice(-10),
    shipping_is_billing: true,
    order_items: (order.items || []).map((item) => ({
      name: item.label,
      sku: item.size,
      units: item.qty,
      selling_price: item.price
    })),
    payment_method: "Prepaid",
    sub_total: order.goods,
    length: 20,
    breadth: 20,
    height: 10,
    weight: 0.8
  };
  const res = await fetch("https://apiv2.shiprocket.in/v1/external/orders/create/adhoc", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || "Shiprocket did not accept the order.");
    err.status = 502;
    throw err;
  }
  return data;
}

module.exports = { pushOrder, shiprocketToken };

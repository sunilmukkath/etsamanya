const { json } = require("../../lib/http");
const { requireAdmin } = require("../../lib/auth");
const { readDb } = require("../../lib/store");

module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const db = await readDb();
  const map = {};
  Object.values(db.users).forEach((user) => {
    map[user.email] = {
      email: user.email,
      name: user.name,
      phone: user.phone || "",
      registered: true,
      orders: 0,
      spent: 0
    };
  });
  db.orderIds.forEach((id) => {
    const order = db.orders[id];
    if (!order || !order.customer) return;
    const email = order.customer.email;
    if (!map[email]) {
      map[email] = {
        email,
        name: order.customer.name,
        phone: order.customer.phone,
        registered: false,
        orders: 0,
        spent: 0
      };
    }
    map[email].orders += 1;
    if (["paid", "packed", "shipped"].includes(order.status)) map[email].spent += Number(order.payable || 0);
  });
  json(res, 200, { customers: Object.values(map).sort((a, b) => b.spent - a.spent) });
};

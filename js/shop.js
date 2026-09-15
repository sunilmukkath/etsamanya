(function (root) {
  var CART_KEY = "samanya-cart";
  var PENDING_KEY = "samanya-pending-order";
  var ENQUIRE_AT = 25;
  var WHATSAPP = "910000000000";
  var EMAIL = "hello@etsamanya.com";

  var SIZES = {
    luxe: { id: "luxe", label: "LUXE", price: 1899, slots: 10 },
    celebrations: { id: "celebrations", label: "Celebrations", price: 1299, slots: 7 },
    rituals: { id: "rituals", label: "Rituals", price: 799, slots: 4 }
  };

  function rupees(n) {
    return "₹" + Math.round(n).toLocaleString("en-IN");
  }

  function bulkRate(qty) {
    if (qty >= ENQUIRE_AT) return 1;
    if (qty >= 10) return 0.95;
    return 1;
  }

  function bulkLabel(qty) {
    if (qty >= ENQUIRE_AT) return "Packed with us directly";
    if (qty >= 10) return "5% bulk courtesy";
    return "";
  }

  function needsEnquire(qty) {
    return Number(qty) >= ENQUIRE_AT;
  }

  function lineTotal(price, qty) {
    return Math.round(price * qty * bulkRate(qty));
  }

  function readCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      var items = raw ? JSON.parse(raw) : [];
      return Array.isArray(items) ? items : [];
    } catch (err) {
      return [];
    }
  }

  function writeCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    root.dispatchEvent(new CustomEvent("samanya:cart"));
  }

  function uid() {
    return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function addItem(item) {
    var items = readCart();
    items.push(Object.assign({ id: uid() }, item));
    writeCart(items);
    return items;
  }

  function removeItem(id) {
    writeCart(readCart().filter(function (item) { return item.id !== id; }));
  }

  function setQty(id, qty) {
    qty = Math.max(1, Math.min(500, parseInt(qty, 10) || 1));
    writeCart(readCart().map(function (item) {
      if (item.id !== id) return item;
      return Object.assign({}, item, { qty: qty });
    }));
  }

  function count() {
    return readCart().reduce(function (sum, item) { return sum + (item.qty || 1); }, 0);
  }

  function totals(items) {
    items = items || readCart();
    var enquire = items.some(function (item) { return needsEnquire(item.qty); });
    var subtotal = 0;
    var payable = 0;
    items.forEach(function (item) {
      var line = lineTotal(item.price, item.qty);
      subtotal += item.price * item.qty;
      if (!needsEnquire(item.qty)) payable += line;
    });
    return {
      enquire: enquire,
      count: items.reduce(function (sum, item) { return sum + (item.qty || 1); }, 0),
      subtotal: subtotal,
      payable: payable,
      savings: Math.max(0, subtotal - items.reduce(function (sum, item) {
        return sum + lineTotal(item.price, item.qty);
      }, 0))
    };
  }

  function checkoutItems() {
    return readCart().filter(function (item) { return !needsEnquire(item.qty); });
  }

  function enquireItems() {
    return readCart().filter(function (item) { return needsEnquire(item.qty); });
  }

  function formatGift(item) {
    var parts = [
      (item.qty || 1) + " × " + item.label + " (" + rupees(item.price) + ")",
      item.occasion ? "Occasion: " + item.occasion : "",
      item.items && item.items.length ? "Pantry: " + item.items.join(", ") : "",
      item.message ? "Card: " + item.message : "",
      item.recipient ? "For: " + item.recipient : ""
    ];
    return parts.filter(Boolean).join("\n");
  }

  function enquireText(extra) {
    var blocks = (extra ? [extra] : []).concat(enquireItems().map(formatGift));
    if (!blocks.length && extra) blocks = [extra];
    return "Hello samanya,\n\nI would like help packing a bulk gift.\n\n" + blocks.join("\n\n") + "\n";
  }

  function whatsappUrl(text) {
    return "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(text);
  }

  function mailUrl(text) {
    return "mailto:" + EMAIL + "?subject=" + encodeURIComponent("Bulk gift enquiry") + "&body=" + encodeURIComponent(text);
  }

  function txnId() {
    return ("SM" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();
  }

  function paintCounts() {
    var n = count();
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      el.textContent = String(n);
      el.hidden = n < 1;
    });
  }

  root.SamanyaShop = {
    ENQUIRE_AT: ENQUIRE_AT,
    SIZES: SIZES,
    EMAIL: EMAIL,
    rupees: rupees,
    bulkRate: bulkRate,
    bulkLabel: bulkLabel,
    needsEnquire: needsEnquire,
    lineTotal: lineTotal,
    readCart: readCart,
    addItem: addItem,
    removeItem: removeItem,
    setQty: setQty,
    count: count,
    totals: totals,
    checkoutItems: checkoutItems,
    enquireItems: enquireItems,
    formatGift: formatGift,
    enquireText: enquireText,
    whatsappUrl: whatsappUrl,
    mailUrl: mailUrl,
    txnId: txnId,
    paintCounts: paintCounts,
    PENDING_KEY: PENDING_KEY
  };

  document.addEventListener("DOMContentLoaded", paintCounts);
  root.addEventListener("samanya:cart", paintCounts);
})(window);

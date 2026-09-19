(function (root) {
  var CART_KEY = "samanya-cart";
  var PENDING_KEY = "samanya-pending-order";
  var ENQUIRE_AT = 25;
  var WHATSAPP = "919940184841";
  var EMAIL = "etsamanyafoods@gmail.com";
  var SITE = {
    shippingFlat: 99,
    shippingFreeAbove: 1999,
    stock: {},
    whatsapp: "919940184841",
    email: EMAIL,
    gstin: "",
    packedNote: ""
  };

  var SIZES = {
    luxe: { id: "luxe", label: "LUXE", price: 1899, slots: 10 },
    celebrations: { id: "celebrations", label: "Celebrations", price: 1299, slots: 7 },
    rituals: { id: "rituals", label: "Rituals", price: 799, slots: 4 }
  };

  var BOWL = 125;
  var RANGE = [
    {
      id: "sweet-rituals",
      label: "Sweet Rituals",
      price: 799,
      form: "Potli",
      weight: "185g",
      photo: "assets/range/sweet-rituals.jpg",
      blurb: "A warm curation of festive nuts, dry fruits and spices.",
      groups: [
        { title: "What's inside", lines: ["Cashew 50g", "Almond 50g", "Cardamom 10g", "Raisin 50g", "Turmeric 25g", "Saffron 0.25g"] }
      ],
      extras: ["Bookmark", "Note to the receiver", "Wooden spice spoon"],
      bowl: false
    },
    {
      id: "celebration",
      label: "Celebration",
      price: 1299,
      form: "Box",
      weight: "340g",
      photo: "assets/range/celebration.jpg",
      blurb: "A richer selection for special moments.",
      groups: [
        { title: "What's inside", lines: ["Cashew 75g", "Almond 75g", "Raisins 50g", "Green cardamom 20g", "Turmeric 50g", "Saffron 0.5g", "Pepper 40g", "Clove 20g", "Cinnamon 40g", "Nutmeg 10g"] }
      ],
      extras: ["Food-grade terracotta cup", "Bookmark", "Note to the receiver", "Wooden spice spoon"],
      bowl: true
    },
    {
      id: "wellness",
      label: "Wellness Box",
      price: 1499,
      form: "Box",
      weight: "405g",
      photo: "assets/range/wellness.jpg",
      blurb: "A focused blend for everyday wellbeing.",
      groups: [
        { title: "Heal", lines: ["Cardamom 20g", "Pepper 40g", "Cinnamon 40g", "Clove 20g", "Turmeric 50g"] },
        { title: "Nourish", lines: ["Cashew 75g", "Almond 75g", "Walnut 50g", "Black raisins 50g", "Saffron 0.5g"] }
      ],
      extras: ["Food-grade terracotta cup", "Bookmark", "Note to the receiver", "Wooden spice spoon"],
      bowl: true
    },
    {
      id: "luxe-nourish",
      label: "Luxe Nourish",
      price: 1899,
      form: "Box",
      weight: "660g",
      photo: "assets/range/luxe-nourish.jpg",
      blurb: "A generous celebration of nourishment and wellbeing.",
      groups: [
        { title: "Heal", lines: ["Cardamom 25g", "Pepper 50g", "Cinnamon 50g", "Clove 25g", "Turmeric 75g", "Saffron 0.5g", "Nutmeg 10g"] },
        { title: "Nourish", lines: ["Cashew 100g", "Almond 100g", "Walnuts 75g", "Salted pistachios 75g", "Green raisins 75g", "Black raisins 75g"] }
      ],
      extras: ["Food-grade terracotta cup", "Bookmark", "Note to the receiver", "Wooden spice spoon"],
      bowl: true
    }
  ];

  function findRange(id) {
    for (var i = 0; i < RANGE.length; i++) {
      if (RANGE[i].id === id) return RANGE[i];
    }
    return null;
  }

  function shippingOf(goods) {
    if (goods <= 0) return 0;
    if (goods >= Number(SITE.shippingFreeAbove || 1999)) return 0;
    return Number(SITE.shippingFlat || 99);
  }

  function stockLeft(id) {
    if (!SITE.stock || SITE.stock[id] == null) return 99;
    return Number(SITE.stock[id]);
  }

  function addRange(id, withBowl) {
    var sku = findRange(id);
    if (!sku) return null;
    if (stockLeft(sku.id) < 1) return null;
    if (withBowl && sku.bowl && stockLeft("bowl") < 1) withBowl = false;
    var bowlOn = !!(withBowl && sku.bowl);
    var contents = [];
    sku.groups.forEach(function (group) {
      contents = contents.concat(group.lines);
    });
    var extras = sku.extras.slice();
    if (bowlOn) extras.push("Painted ceramic bowl");
    return addItem({
      size: sku.id,
      label: sku.label,
      price: sku.price + (bowlOn ? BOWL : 0),
      items: contents,
      extras: extras,
      weight: sku.weight,
      range: true,
      bowl: bowlOn,
      qty: 1,
      message: "Packed as the Saukhyam " + sku.label
    });
  }

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
    var shipping = shippingOf(payable);
    return {
      enquire: enquire,
      count: items.reduce(function (sum, item) { return sum + (item.qty || 1); }, 0),
      subtotal: subtotal,
      goods: payable,
      shipping: shipping,
      payable: payable + shipping,
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
      item.extras && item.extras.length ? "Also: " + item.extras.join(", ") : "",
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

  function waDigits(raw) {
    var n = String(raw || "").replace(/\D/g, "");
    if (!n) return "";
    if (n.length === 10) return "91" + n;
    if (n.length === 11 && n.charAt(0) === "0") return "91" + n.slice(1);
    return n;
  }

  function whatsappUrl(text) {
    var n = waDigits(WHATSAPP);
    if (!n) return "";
    return "https://wa.me/" + n + "?text=" + encodeURIComponent(text);
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

  function applyConfig(cfg) {
    if (!cfg) return;
    SITE = Object.assign(SITE, cfg);
    WHATSAPP = waDigits(cfg.whatsapp || cfg.phone || WHATSAPP);
    if (cfg.email) EMAIL = cfg.email;
    root.dispatchEvent(new CustomEvent("samanya:config", { detail: SITE }));
  }

  fetch("/api/shop-config").then(function (res) { return res.ok ? res.json() : null; }).then(applyConfig).catch(function () {});

  root.SamanyaShop = {
    ENQUIRE_AT: ENQUIRE_AT,
    SIZES: SIZES,
    RANGE: RANGE,
    BOWL: BOWL,
    EMAIL: EMAIL,
    SITE: SITE,
    rupees: rupees,
    bulkRate: bulkRate,
    bulkLabel: bulkLabel,
    needsEnquire: needsEnquire,
    lineTotal: lineTotal,
    shippingOf: shippingOf,
    stockLeft: stockLeft,
    readCart: readCart,
    addItem: addItem,
    addRange: addRange,
    findRange: findRange,
    removeItem: removeItem,
    setQty: setQty,
    count: count,
    totals: totals,
    checkoutItems: checkoutItems,
    enquireItems: enquireItems,
    formatGift: formatGift,
    enquireText: enquireText,
    waDigits: waDigits,
    whatsappUrl: whatsappUrl,
    mailUrl: mailUrl,
    txnId: txnId,
    paintCounts: paintCounts,
    PENDING_KEY: PENDING_KEY
  };

  document.addEventListener("DOMContentLoaded", paintCounts);
  root.addEventListener("samanya:cart", paintCounts);
})(window);

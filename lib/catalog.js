const ENQUIRE_AT = 25;
const BOWL = 125;

const SIZES = {
  luxe: { id: "luxe", label: "LUXE", price: 1899, slots: 10, stock: "custom-luxe" },
  celebrations: { id: "celebrations", label: "Celebrations", price: 1299, slots: 7, stock: "custom-celebrations" },
  rituals: { id: "rituals", label: "Rituals", price: 799, slots: 4, stock: "custom-rituals" }
};

const RANGE = [
  {
    id: "sweet-rituals",
    label: "Sweet Rituals",
    price: 799,
    form: "Potli",
    weight: "185g",
    bowl: false
  },
  {
    id: "celebration",
    label: "Celebration",
    price: 1299,
    form: "Box",
    weight: "340g",
    bowl: true
  },
  {
    id: "wellness",
    label: "Wellness Box",
    price: 1499,
    form: "Box",
    weight: "405g",
    bowl: true
  },
  {
    id: "luxe-nourish",
    label: "Luxe Nourish",
    price: 1899,
    form: "Box",
    weight: "660g",
    bowl: true
  }
];

const DEFAULT_STOCK = [
  { id: "sweet-rituals", label: "Sweet Rituals" },
  { id: "celebration", label: "Celebration" },
  { id: "wellness", label: "Wellness Box" },
  { id: "luxe-nourish", label: "Luxe Nourish" },
  { id: "bowl", label: "Painted ceramic bowl" },
  { id: "custom-luxe", label: "Custom LUXE" },
  { id: "custom-celebrations", label: "Custom Celebrations" },
  { id: "custom-rituals", label: "Custom Rituals" }
];

function findRange(id) {
  return RANGE.find((row) => row.id === id) || null;
}

function bulkRate(qty) {
  if (qty >= ENQUIRE_AT) return 1;
  if (qty >= 10) return 0.95;
  return 1;
}

function lineTotal(price, qty) {
  return Math.round(price * qty * bulkRate(qty));
}

function needsEnquire(qty) {
  return Number(qty) >= ENQUIRE_AT;
}

function stockNeeds(item) {
  const needs = [];
  if (item.range) needs.push({ id: item.size, qty: item.qty });
  else needs.push({ id: SIZES[item.size] ? SIZES[item.size].stock : "", qty: item.qty });
  if (item.bowl) needs.push({ id: "bowl", qty: item.qty });
  return needs.filter((row) => row.id);
}

function priceItem(raw) {
  const qty = Math.max(1, Math.min(500, parseInt(raw.qty, 10) || 1));
  if (raw.range || findRange(raw.size)) {
    const sku = findRange(raw.size);
    if (!sku) {
      const err = new Error("Unknown gift.");
      err.status = 400;
      throw err;
    }
    const bowl = !!(raw.bowl && sku.bowl);
    return {
      id: String(raw.id || ""),
      range: true,
      size: sku.id,
      label: sku.label,
      price: sku.price + (bowl ? BOWL : 0),
      weight: sku.weight,
      form: sku.form,
      bowl,
      qty,
      items: Array.isArray(raw.items) ? raw.items.slice(0, 40) : [],
      extras: Array.isArray(raw.extras) ? raw.extras.slice(0, 20) : [],
      message: String(raw.message || "").slice(0, 800),
      recipient: String(raw.recipient || "").slice(0, 120)
    };
  }
  const size = SIZES[raw.size];
  if (!size) {
    const err = new Error("Unknown box size.");
    err.status = 400;
    throw err;
  }
  return {
    id: String(raw.id || ""),
    range: false,
    size: size.id,
    label: size.label,
    price: size.price,
    slots: size.slots,
    qty,
    occasion: String(raw.occasion || "").slice(0, 80),
    items: Array.isArray(raw.items) ? raw.items.slice(0, 40) : [],
    extras: Array.isArray(raw.extras) ? raw.extras.slice(0, 20) : [],
    message: String(raw.message || "").slice(0, 800),
    recipient: String(raw.recipient || "").slice(0, 120)
  };
}

function goodsTotal(items) {
  return items.reduce((sum, item) => {
    if (needsEnquire(item.qty)) return sum;
    return sum + lineTotal(item.price, item.qty);
  }, 0);
}

function shippingOf(goods, settings) {
  if (goods <= 0) return 0;
  if (goods >= Number(settings.shippingFreeAbove || 1999)) return 0;
  return Number(settings.shippingFlat || 99);
}

function splitGst(gross, ratePct) {
  const rate = Number(ratePct || 0) / 100;
  if (!rate) return { taxable: gross, gst: 0, cgst: 0, sgst: 0, igst: 0, gross };
  const taxable = Math.round((gross / (1 + rate)) * 100) / 100;
  const gst = Math.round((gross - taxable) * 100) / 100;
  return { taxable, gst, cgst: 0, sgst: 0, igst: 0, gross };
}

function taxBreakup(gross, ratePct, buyerState, sellerState) {
  const split = splitGst(gross, ratePct);
  const intra = String(buyerState || "").trim().toLowerCase() === String(sellerState || "Tamil Nadu").trim().toLowerCase();
  if (!split.gst) return split;
  if (intra) {
    split.cgst = Math.round((split.gst / 2) * 100) / 100;
    split.sgst = Math.round((split.gst - split.cgst) * 100) / 100;
  } else {
    split.igst = split.gst;
  }
  return split;
}

function pinOk(pin) {
  return /^[1-9][0-9]{5}$/.test(String(pin || "").trim());
}

function rupees(n) {
  return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
}

module.exports = {
  ENQUIRE_AT,
  BOWL,
  SIZES,
  RANGE,
  DEFAULT_STOCK,
  findRange,
  bulkRate,
  lineTotal,
  needsEnquire,
  stockNeeds,
  priceItem,
  goodsTotal,
  shippingOf,
  splitGst,
  taxBreakup,
  pinOk,
  rupees
};

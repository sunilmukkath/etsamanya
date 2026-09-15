const SIZES = {
  luxe: { id: "luxe", label: "LUXE", vessel: "Box", price: 1899, slots: 10 },
  celebrations: { id: "celebrations", label: "Celebrations", vessel: "Box", price: 1299, slots: 7 },
  rituals: { id: "rituals", label: "Rituals", vessel: "Potli", price: 799, slots: 4 },
};

const ALIASES = { large: "luxe", medium: "celebrations", small: "rituals" };

const rupees = (n) => `₹${n.toLocaleString("en-IN")}`;

const form = document.getElementById("customiseForm");
const pantry = document.getElementById("pantry");
const fillTitle = document.getElementById("fillTitle");
const fillHint = document.getElementById("fillHint");
const slotNote = document.getElementById("slotNote");
const basketTitle = document.getElementById("basketTitle");
const basketPrice = document.getElementById("basketPrice");
const basketList = document.getElementById("basketList");
const basketEmpty = document.getElementById("basketEmpty");
const success = document.getElementById("success");
const cards = [...document.querySelectorAll(".size-card")];
const picks = [...document.querySelectorAll(".pick")];
const stepLabels = [...document.querySelectorAll(".steps-row li")];

let size = null;
const chosen = new Set();

const paint = () => {
  const items = [...chosen];
  cards.forEach((card) => card.classList.toggle("is-picked", card.dataset.size === size?.id));
  picks.forEach((btn) => {
    const on = chosen.has(btn.dataset.item);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.disabled = Boolean(size) && !on && items.length >= size.slots;
  });
  stepLabels.forEach((el, i) => el.classList.toggle("is-on", size ? i >= 0 && i <= (items.length ? 1 : 0) : i === 0));
  if (size && items.length) stepLabels[1]?.classList.add("is-on");
  if (size) stepLabels[0]?.classList.add("is-on");

  if (!size) {
    fillTitle.textContent = "Choose a gift above to begin.";
    fillHint.textContent = "The price stays fixed. You only choose what we pack.";
    pantry.hidden = true;
    basketTitle.textContent = "Nothing chosen yet";
    basketPrice.textContent = "";
    basketList.innerHTML = "";
    basketEmpty.hidden = false;
    return;
  }

  pantry.hidden = false;
  fillTitle.textContent = `Fill ${size.label}.`;
  fillHint.textContent = `${rupees(size.price)} · tap up to ${size.slots} pieces.`;
  slotNote.textContent = `${items.length} of ${size.slots} chosen`;
  basketTitle.textContent = size.label;
  basketPrice.textContent = rupees(size.price);
  basketEmpty.hidden = items.length > 0;
  basketList.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
};

const setSize = (id) => {
  const key = ALIASES[id] || id;
  size = SIZES[key] || null;
  if (size && chosen.size > size.slots) {
    [...chosen].slice(size.slots).forEach((item) => chosen.delete(item));
  }
  paint();
  if (size) document.getElementById("fill")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

cards.forEach((card) => {
  card.addEventListener("click", () => setSize(card.dataset.size));
});

picks.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!size) return setSize(cards[0]?.dataset.size);
    const item = btn.dataset.item;
    if (chosen.has(item)) chosen.delete(item);
    else if (chosen.size < size.slots) chosen.add(item);
    paint();
  });
});

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!size) return;
  if (!chosen.size) {
    slotNote.textContent = "Tap at least one item to pack.";
    return;
  }
  localStorage.setItem(
    "etsamanya-customise",
    JSON.stringify({
      size: size.id,
      label: size.label,
      price: size.price,
      items: [...chosen],
      recipient: form.recipient.value,
      note: form.note.value,
      name: form.name.value,
      email: form.email.value,
      phone: form.phone.value,
      city: form.city.value,
    })
  );
  document.getElementById("sizes").hidden = true;
  document.getElementById("fill").hidden = true;
  success.classList.add("is-on");
  success.scrollIntoView({ behavior: "smooth", block: "center" });
});

const preset = new URLSearchParams(location.search).get("size");
if (preset) setSize(preset);
else paint();

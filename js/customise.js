const SIZES = {
  luxe: { id: "luxe", label: "LUXE", vessel: "Box", price: 1899, slots: 10 },
  celebrations: { id: "celebrations", label: "Celebrations", vessel: "Box", price: 1299, slots: 7 },
  rituals: { id: "rituals", label: "Rituals", vessel: "Potli", price: 799, slots: 4 },
};

const ALIASES = { large: "luxe", medium: "celebrations", small: "rituals" };
const rupees = (n) => `₹${n.toLocaleString("en-IN")}`;

let size = null;
const chosen = new Set();

const byId = (id) => document.getElementById(id);
const form = byId("customiseForm");
const tray = byId("giftTray");
const trayTitle = byId("trayTitle");
const fillHint = byId("fillHint");
const slotNote = byId("slotNote");
const review = byId("review");
const success = byId("success");
const wizardBar = byId("wizardBar");
const nextBtn = byId("nextBtn");
const alertEl = byId("wizardAlert");
const cards = [...document.querySelectorAll("[data-size]")];
const picks = [...document.querySelectorAll(".pick[data-item]")];
const messageBtns = [...document.querySelectorAll(".message-btn")];

const showAlert = (msg) => {
  if (!alertEl) return;
  alertEl.textContent = msg;
  alertEl.classList.add("is-on");
  alertEl.scrollIntoView({ behavior: "smooth", block: "center" });
};

const hideAlert = () => alertEl?.classList.remove("is-on");

const paint = () => {
  const items = [...chosen];
  cards.forEach((card) => card.classList.toggle("is-picked", card.dataset.size === size?.id));
  picks.forEach((btn) => {
    const on = chosen.has(btn.dataset.item);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.disabled = Boolean(size) && !on && items.length >= size.slots;
  });
  if (size && trayTitle) trayTitle.textContent = size.label;
  if (size && fillHint) {
    fillHint.textContent = `${size.label} · ${rupees(size.price)}. Tap up to ${size.slots} pictures. A tick means it is in your gift.`;
  }
  if (slotNote) slotNote.textContent = size ? `${items.length} of ${size.slots} chosen` : "0 chosen";
  if (review && size) {
    review.innerHTML = `<p><strong>${size.label}</strong> · ${rupees(size.price)}</p><p>${items.length ? items.join(", ") : "No ingredients yet."}</p>`;
  }
  if (nextBtn) nextBtn.textContent = tray?.classList.contains("is-open") ? "Send this gift" : "Continue";
};

const openTray = () => {
  if (!tray) return;
  tray.hidden = false;
  tray.classList.add("is-open");
  paint();
  tray.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.samanyaChoose = function samanyaChoose(id) {
  hideAlert();
  const key = ALIASES[id] || id;
  size = SIZES[key] || null;
  if (!size) {
    showAlert("Please tap LUXE, Celebrations, or Rituals.");
    return false;
  }
  if (chosen.size > size.slots) {
    [...chosen].slice(size.slots).forEach((item) => chosen.delete(item));
  }
  const url = new URL(location.href);
  url.searchParams.set("size", size.id);
  history.replaceState({}, "", url);
  openTray();
  return false;
};

window.samanyaContinue = function samanyaContinue() {
  hideAlert();
  if (!size) {
    showAlert("Tap LUXE, Celebrations, or Rituals first. The list will open below.");
    return false;
  }
  if (!tray?.classList.contains("is-open")) {
    openTray();
    return false;
  }
  if (!chosen.size) {
    showAlert("Please tap at least one ingredient.");
    return false;
  }
  if (!form) return false;
  if (!form.note.value.trim() || !form.recipient.value.trim() || !form.name.value.trim() || !form.phone.value.trim()) {
    form.reportValidity();
    showAlert("Add a message, who it is for, your name, and your phone.");
    byId("note")?.focus();
    return false;
  }
  localStorage.setItem(
    "etsamanya-customise",
    JSON.stringify({
      size: size.id,
      label: size.label,
      price: size.price,
      items: [...chosen],
      message: form.note.value,
      recipient: form.recipient.value,
      name: form.name.value,
      phone: form.phone.value,
      city: form.city.value,
    })
  );
  tray.classList.remove("is-open");
  tray.hidden = true;
  if (wizardBar) wizardBar.hidden = true;
  success?.classList.add("is-on");
  success?.scrollIntoView({ behavior: "smooth", block: "center" });
  return false;
};

picks.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!size) {
      showAlert("Tap a gift above first.");
      return;
    }
    const item = btn.dataset.item;
    if (chosen.has(item)) chosen.delete(item);
    else if (chosen.size < size.slots) chosen.add(item);
    paint();
  });
});

messageBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    messageBtns.forEach((el) => el.classList.remove("is-on"));
    btn.classList.add("is-on");
    if (form) form.note.value = btn.dataset.message;
  });
});

const preset = new URLSearchParams(location.search).get("size");
if (preset) window.samanyaChoose(preset);
else paint();

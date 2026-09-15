const SIZES = {
  luxe: { id: "luxe", label: "LUXE", vessel: "Box", price: 1899, slots: 10 },
  celebrations: { id: "celebrations", label: "Celebrations", vessel: "Box", price: 1299, slots: 7 },
  rituals: { id: "rituals", label: "Rituals", vessel: "Potli", price: 799, slots: 4 },
};

const ALIASES = { large: "luxe", medium: "celebrations", small: "rituals" };
const LABELS = { 1: "Choose your size", 2: "Choose your ingredients", 3: "Choose your message" };

const rupees = (n) => `₹${n.toLocaleString("en-IN")}`;

const form = document.getElementById("customiseForm");
const statusEl = document.getElementById("status");
const slotNote = document.getElementById("slotNote");
const fillHint = document.getElementById("fillHint");
const review = document.getElementById("review");
const success = document.getElementById("success");
const wizardBar = document.getElementById("wizardBar");
const nextBtn = document.getElementById("nextBtn");
const backBtn = document.getElementById("backBtn");
const cards = [...document.querySelectorAll(".size-card")];
const picks = [...document.querySelectorAll(".pick")];
const stepButtons = [...document.querySelectorAll(".wizard-steps button")];
const panels = [...document.querySelectorAll(".wizard-panel")];
const messageBtns = [...document.querySelectorAll(".message-btn")];

let step = 1;
let size = null;
const chosen = new Set();

const nudge = (el) => {
  el?.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "translateX(0)" }],
    { duration: 320 }
  );
};

const go = (n) => {
  step = n;
  panels.forEach((panel) => panel.classList.toggle("is-on", Number(panel.dataset.step) === step));
  stepButtons.forEach((btn, i) => {
    btn.classList.toggle("is-on", i + 1 === step);
    btn.classList.toggle("is-done", i + 1 < step);
  });
  statusEl.textContent = `Step ${step} of 3 — ${LABELS[step]}`;
  backBtn.hidden = step === 1;
  nextBtn.textContent = step === 3 ? "Send this gift" : "Next";
  wizardBar.hidden = false;
  if (step === 3) renderReview();
  document.getElementById("wizard")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const paint = () => {
  const items = [...chosen];
  cards.forEach((card) => card.classList.toggle("is-picked", card.dataset.size === size?.id));
  picks.forEach((btn) => {
    const on = chosen.has(btn.dataset.item);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.disabled = Boolean(size) && !on && items.length >= size.slots;
  });
  if (size) {
    fillHint.textContent = `${size.label} · ${rupees(size.price)}. Tap up to ${size.slots} pictures. A tick means it is in your gift.`;
    slotNote.textContent = `${items.length} of ${size.slots} chosen`;
  } else {
    slotNote.textContent = "0 chosen";
  }
};

const setSize = (id) => {
  const key = ALIASES[id] || id;
  size = SIZES[key] || null;
  if (size && chosen.size > size.slots) {
    [...chosen].slice(size.slots).forEach((item) => chosen.delete(item));
  }
  paint();
};

const renderReview = () => {
  if (!size) {
    review.innerHTML = "";
    return;
  }
  const items = [...chosen];
  review.innerHTML = `
    <p class="kicker">Please check</p>
    <p><strong>${size.label}</strong> · ${rupees(size.price)}</p>
    <p>${items.length ? items.join(", ") : "No ingredients yet."}</p>
  `;
};

cards.forEach((card) => {
  card.addEventListener("click", () => {
    setSize(card.dataset.size);
    go(2);
  });
});

picks.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!size) {
      go(1);
      nudge(nextBtn);
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
    form.note.value = btn.dataset.message;
    form.note.focus();
  });
});

stepButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = Number(btn.dataset.goto);
    if (target < step || (target === 2 && size) || (target === 3 && size && chosen.size)) go(target);
    else nudge(nextBtn);
  });
});

backBtn.addEventListener("click", () => {
  if (step > 1) go(step - 1);
});

nextBtn.addEventListener("click", () => {
  if (step === 1) {
    if (!size) return nudge(cards[0]);
    return go(2);
  }
  if (step === 2) {
    if (!chosen.size) {
      slotNote.textContent = "Please tap at least one ingredient.";
      return nudge(slotNote);
    }
    return go(3);
  }
  if (!form.note.value.trim() || !form.recipient.value.trim() || !form.name.value.trim() || !form.phone.value.trim()) {
    form.reportValidity();
    nudge(nextBtn);
    return;
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
  panels.forEach((panel) => panel.classList.remove("is-on"));
  wizardBar.hidden = true;
  success.classList.add("is-on");
  success.scrollIntoView({ behavior: "smooth", block: "center" });
});

const preset = new URLSearchParams(location.search).get("size");
if (preset) setSize(preset);
paint();
go(preset ? 2 : 1);

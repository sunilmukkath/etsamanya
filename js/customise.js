const SIZES = {
  luxe: { id: "luxe", label: "LUXE", vessel: "Box", price: 1899, slots: 10 },
  celebrations: { id: "celebrations", label: "Celebrations", vessel: "Box", price: 1299, slots: 7 },
  rituals: { id: "rituals", label: "Rituals", vessel: "Potli", price: 799, slots: 4 },
};

const ALIASES = { large: "luxe", medium: "celebrations", small: "rituals" };
const LABELS = { 1: "Choose your size", 2: "Choose your ingredients", 3: "Choose your message" };

const rupees = (n) => `₹${n.toLocaleString("en-IN")}`;

const $ = (id) => document.getElementById(id);

const form = $("customiseForm");
const statusEl = $("status");
const slotNote = $("slotNote");
const fillHint = $("fillHint");
const review = $("review");
const success = $("success");
const wizardBar = $("wizardBar");
const nextBtn = $("nextBtn");
const backBtn = $("backBtn");
const alertEl = $("wizardAlert");
const wizard = $("wizard");
const cards = [...document.querySelectorAll("#wizard .size-card[data-size]")];
const picks = [...document.querySelectorAll("#wizard .pick[data-item]")];
const stepButtons = [...document.querySelectorAll(".wizard-steps button")];
const panels = [...document.querySelectorAll(".wizard-panel")];
const messageBtns = [...document.querySelectorAll(".message-btn")];

let step = 1;
let size = null;
const chosen = new Set();

const showAlert = (msg) => {
  if (!alertEl) return;
  alertEl.textContent = msg;
  alertEl.classList.add("is-on");
};

const hideAlert = () => alertEl?.classList.remove("is-on");

const nudge = (el) => {
  el?.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "translateX(0)" }],
    { duration: 320 }
  );
};

const go = (n) => {
  step = n;
  hideAlert();
  panels.forEach((panel) => panel.classList.toggle("is-on", Number(panel.dataset.step) === step));
  stepButtons.forEach((btn, i) => {
    btn.classList.toggle("is-on", i + 1 === step);
    btn.classList.toggle("is-done", i + 1 < step);
  });
  if (statusEl) statusEl.textContent = `Step ${step} of 3 — ${LABELS[step]}`;
  backBtn?.classList.toggle("is-idle", step === 1);
  if (backBtn) backBtn.hidden = false;
  if (nextBtn) {
    nextBtn.disabled = false;
    nextBtn.textContent = step === 1 ? "Continue" : step === 3 ? "Send this gift" : "Continue";
  }
  if (wizardBar) wizardBar.hidden = false;
  if (step === 3) renderReview();
  const panel = panels.find((p) => Number(p.dataset.step) === step);
  panel?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  if (size && fillHint) {
    fillHint.textContent = `${size.label} · ${rupees(size.price)}. Tap up to ${size.slots} pictures. A tick means it is in your gift.`;
  }
  if (slotNote) slotNote.textContent = size ? `${items.length} of ${size.slots} chosen` : "0 chosen";
};

const setSize = (id) => {
  const key = ALIASES[id] || id;
  size = SIZES[key] || null;
  if (size && chosen.size > size.slots) {
    [...chosen].slice(size.slots).forEach((item) => chosen.delete(item));
  }
  paint();
  return Boolean(size);
};

const renderReview = () => {
  if (!review) return;
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

const chooseSize = (id) => {
  if (!setSize(id)) return;
  go(2);
};

wizard?.addEventListener("click", (event) => {
  const card = event.target.closest(".size-card[data-size]");
  if (card) {
    event.preventDefault();
    chooseSize(card.dataset.size);
    return;
  }

  const pick = event.target.closest(".pick[data-item]");
  if (pick) {
    event.preventDefault();
    if (!size) {
      go(1);
      showAlert("Please tap a gift first — LUXE, Celebrations, or Rituals.");
      nudge(cards[0]);
      return;
    }
    const item = pick.dataset.item;
    if (chosen.has(item)) chosen.delete(item);
    else if (chosen.size < size.slots) chosen.add(item);
    paint();
    return;
  }

  const message = event.target.closest(".message-btn[data-message]");
  if (message && form) {
    messageBtns.forEach((el) => el.classList.remove("is-on"));
    message.classList.add("is-on");
    form.note.value = message.dataset.message;
  }
});

stepButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = Number(btn.dataset.goto);
    if (target < step || (target === 2 && size) || (target === 3 && size && chosen.size)) go(target);
    else {
      showAlert(target === 2 ? "Please tap a gift first." : "Please choose at least one ingredient.");
      nudge(nextBtn);
    }
  });
});

backBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  if (step > 1) go(step - 1);
});

nextBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  if (step === 1) {
    if (!size) {
      showAlert("Tap LUXE, Celebrations, or Rituals to continue.");
      nudge(cards[0]);
      return;
    }
    go(2);
    return;
  }
  if (step === 2) {
    if (!chosen.size) {
      showAlert("Please tap at least one ingredient.");
      if (slotNote) slotNote.textContent = "Please tap at least one ingredient.";
      nudge(slotNote);
      return;
    }
    go(3);
    return;
  }
  if (!form) return;
  if (!form.note.value.trim() || !form.recipient.value.trim() || !form.name.value.trim() || !form.phone.value.trim()) {
    form.reportValidity();
    showAlert("Please fill the card message, who it is for, your name, and your phone.");
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
  if (wizardBar) wizardBar.hidden = true;
  hideAlert();
  success?.classList.add("is-on");
  success?.scrollIntoView({ behavior: "smooth", block: "center" });
});

const preset = new URLSearchParams(location.search).get("size");
if (preset) setSize(preset);
paint();
go(preset && size ? 2 : 1);

const SIZES = {
  large: { id: "large", label: "Large box", vessel: "Box", price: 1899, slots: 10 },
  medium: { id: "medium", label: "Medium box", vessel: "Box", price: 1299, slots: 7 },
  small: { id: "small", label: "Small potli", vessel: "Potli", price: 799, slots: 4 },
};

const rupees = (n) => `₹${n.toLocaleString("en-IN")}`;

const form = document.getElementById("customiseForm");
const fillTitle = document.getElementById("fillTitle");
const fillHint = document.getElementById("fillHint");
const slotNote = document.getElementById("slotNote");
const basketTitle = document.getElementById("basketTitle");
const basketPrice = document.getElementById("basketPrice");
const basketList = document.getElementById("basketList");
const basketEmpty = document.getElementById("basketEmpty");
const success = document.getElementById("success");
const cards = [...document.querySelectorAll(".size-card")];
const checks = [...document.querySelectorAll('input[name="item"]')];

let size = null;

const selected = () => checks.filter((el) => el.checked).map((el) => el.value);

const paint = () => {
  const items = selected();
  cards.forEach((card) => card.classList.toggle("is-picked", card.dataset.size === size?.id));

  if (!size) {
    fillTitle.textContent = "Select a size to begin.";
    fillHint.textContent = "Tap a box or potli above. The price stays fixed; only what we pack changes.";
    form.hidden = true;
    basketTitle.textContent = "Nothing chosen yet";
    basketPrice.textContent = "";
    basketList.innerHTML = "";
    basketEmpty.hidden = false;
    return;
  }

  form.hidden = false;
  fillTitle.textContent = `Fill the ${size.label.toLowerCase()}.`;
  fillHint.textContent = `${rupees(size.price)} · up to ${size.slots} pieces. The size is the price.`;
  slotNote.textContent = `${items.length} of ${size.slots} pieces chosen.`;
  basketTitle.textContent = size.label;
  basketPrice.textContent = rupees(size.price);
  basketEmpty.hidden = items.length > 0;
  basketList.innerHTML = items.map((item) => `<li><span>${item}</span><strong>in</strong></li>`).join("");

  checks.forEach((el) => {
    el.disabled = !el.checked && items.length >= size.slots;
  });
};

const setSize = (id) => {
  size = SIZES[id] || null;
  if (size) {
    const extras = selected().slice(size.slots);
    checks.forEach((el) => {
      if (extras.includes(el.value)) el.checked = false;
    });
    document.getElementById("fill")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  paint();
};

cards.forEach((card) => {
  card.addEventListener("click", () => setSize(card.dataset.size));
});

checks.forEach((el) => el.addEventListener("change", paint));

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!size) return;
  const items = selected();
  if (!items.length) {
    slotNote.textContent = "Choose at least one piece from the pantry.";
    return;
  }
  const payload = {
    size: size.id,
    label: size.label,
    price: size.price,
    items,
    recipient: form.recipient.value,
    note: form.note.value,
    name: form.name.value,
    email: form.email.value,
    phone: form.phone.value,
    city: form.city.value,
  };
  localStorage.setItem("etsamanya-customise", JSON.stringify(payload));
  form.hidden = true;
  document.getElementById("sizes").hidden = true;
  document.getElementById("fill").hidden = true;
  success.classList.add("is-on");
  success.scrollIntoView({ behavior: "smooth", block: "center" });
});

const preset = new URLSearchParams(location.search).get("size");
if (preset && SIZES[preset]) setSize(preset);
else paint();

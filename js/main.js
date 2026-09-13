const header = document.getElementById("header");
const nav = document.getElementById("nav");
const menuToggle = document.getElementById("menuToggle");

window.addEventListener("scroll", () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 8);
});

menuToggle?.addEventListener("click", () => {
  const open = nav.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(open));
});

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("is-open");
    menuToggle?.setAttribute("aria-expanded", "false");
  });
});

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((el) => el.classList.remove("is-active"));
    button.classList.add("is-active");
    const filter = button.dataset.filter;
    document.querySelectorAll(".card").forEach((card) => {
      const show = filter === "all" || card.dataset.cat.includes(filter);
      card.classList.toggle("hidden", !show);
    });
  });
});

const form = document.getElementById("atelierForm");
if (form) {
  const state = { occasion: "", palette: "" };
  let step = 1;
  const panels = [...form.querySelectorAll(".panel")];
  const pips = [...form.querySelectorAll(".progress span")];
  const nextBtn = document.getElementById("nextBtn");
  const backBtn = document.getElementById("backBtn");
  const success = document.getElementById("success");
  const navRow = document.getElementById("atelierNav");

  const showStep = () => {
    panels.forEach((panel) => panel.classList.toggle("is-on", Number(panel.dataset.step) === step));
    pips.forEach((pip, index) => pip.classList.toggle("is-on", index < step));
    backBtn.style.visibility = step === 1 ? "hidden" : "visible";
    nextBtn.textContent = step === 4 ? "Send to the curator" : "Continue";
    if (step === 4) renderSummary();
  };

  const renderSummary = () => {
    const data = {
      Occasion: state.occasion || "—",
      Palette: state.palette || "—",
      For: form.recipient.value || "—",
      Scale: form.scale.value,
    };
    document.getElementById("summary").innerHTML = Object.entries(data)
      .map(([key, value]) => `<li><span>${key}</span><strong>${value}</strong></li>`)
      .join("");
  };

  form.querySelectorAll(".choice").forEach((choice) => {
    choice.addEventListener("click", () => {
      const { field, value } = choice.dataset;
      state[field] = value;
      form.querySelectorAll(`.choice[data-field="${field}"]`).forEach((el) => el.classList.remove("is-picked"));
      choice.classList.add("is-picked");
    });
  });

  const needsChoice = () => {
    nextBtn.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
      { duration: 280 }
    );
  };

  nextBtn.addEventListener("click", () => {
    if (step === 1 && !state.occasion) return needsChoice();
    if (step === 2 && !state.palette) return needsChoice();
    if (step === 3 && !form.recipient.value.trim()) {
      form.recipient.focus();
      return;
    }
    if (step === 4) {
      if (!form.name.value.trim() || !form.email.value.trim() || !form.phone.value.trim()) {
        form.reportValidity();
        return;
      }
      const payload = {
        ...state,
        recipient: form.recipient.value,
        palate: form.palate.value,
        scale: form.scale.value,
        note: form.note.value,
        name: form.name.value,
        email: form.email.value,
        phone: form.phone.value,
        city: form.city.value,
      };
      localStorage.setItem("etsamanya-request", JSON.stringify(payload));
      panels.forEach((panel) => panel.classList.remove("is-on"));
      navRow.style.display = "none";
      success.classList.add("is-on");
      return;
    }
    step += 1;
    showStep();
  });

  backBtn.addEventListener("click", () => {
    step = Math.max(1, step - 1);
    showStep();
  });

  showStep();
}

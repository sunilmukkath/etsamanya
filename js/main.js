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

window.addEventListener("samanya:config", function (event) {
  var cfg = event.detail || {};
  document.querySelectorAll("[data-whatsapp]").forEach(function (el) {
    if (cfg.whatsapp) {
      el.hidden = false;
      if (el.tagName === "A") el.href = "https://wa.me/" + String(cfg.whatsapp).replace(/\D/g, "");
    } else {
      el.hidden = true;
    }
  });
  document.querySelectorAll("[data-gstin]").forEach(function (el) {
    if (cfg.gstin) {
      el.hidden = false;
      el.textContent = "GSTIN " + cfg.gstin;
    } else {
      el.hidden = true;
    }
  });
});

fetch("/api/account/me", { credentials: "include" }).then(function (res) {
  return res.ok ? res.json() : null;
}).then(function (data) {
  if (!data || !data.signedIn) return;
  document.querySelectorAll("[data-account-link]").forEach(function (el) {
    el.textContent = "Orders";
  });
}).catch(function () {});

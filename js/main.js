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

(function quoteSlider() {
  var root = document.querySelector("[data-quote-slider]");
  if (!root) return;
  var slides = Array.prototype.slice.call(root.querySelectorAll(".quote-slide"));
  var dotsBox = root.querySelector("[data-quote-dots]");
  var i = 0;
  var timer = null;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  slides.forEach(function (_, n) {
    var dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", "Letter " + (n + 1));
    dot.addEventListener("click", function () { show(n, true); });
    dotsBox.appendChild(dot);
  });

  function show(n, user) {
    i = (n + slides.length) % slides.length;
    slides.forEach(function (slide, idx) {
      var on = idx === i;
      slide.classList.toggle("is-on", on);
      slide.hidden = !on;
    });
    Array.prototype.forEach.call(dotsBox.children, function (dot, idx) {
      dot.classList.toggle("is-on", idx === i);
    });
    if (user) restart();
  }

  function restart() {
    if (reduce) return;
    clearInterval(timer);
    timer = setInterval(function () { show(i + 1); }, 7000);
  }

  root.querySelector("[data-quote-prev]").addEventListener("click", function () { show(i - 1, true); });
  root.querySelector("[data-quote-next]").addEventListener("click", function () { show(i + 1, true); });
  root.addEventListener("mouseenter", function () { clearInterval(timer); });
  root.addEventListener("mouseleave", restart);
  show(0);
  restart();
})();

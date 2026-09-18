(function () {
  var BOWL = 125;
  var TITLES = {
    today: "Today",
    orders: "Orders",
    compose: "Compose",
    stock: "Stock",
    sales: "Sales",
    people: "People",
    settings: "Settings"
  };
  var CLOSED = { cancelled: 1, refunded: 1, expired: 1 };
  var state = {
    tab: "today",
    orders: [],
    stock: [],
    customers: [],
    settings: {},
    catalog: { range: [], custom: [] },
    salesDays: 30,
    orderFilter: "all",
    orderQuery: "",
    peopleQuery: "",
    selected: "",
    order: null,
    personEmail: ""
  };

  function $(id) { return document.getElementById(id); }
  function rupees(n) { return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN"); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function skuList() { return state.catalog.range.concat(state.catalog.custom); }
  function skuOf(id) { return skuList().find(function (row) { return row.id === id; }) || null; }
  function bulkRate(qty) {
    if (qty >= 25) return 1;
    if (qty >= 10) return 0.95;
    return 1;
  }
  function lineTotal(price, qty) { return Math.round(price * qty * bulkRate(qty)); }
  function payUrl(order) {
    if (!order || !order.invoiceToken) return "";
    return location.origin + "/pay.html?id=" + encodeURIComponent(order.txnid) + "&t=" + encodeURIComponent(order.invoiceToken);
  }
  function invoiceUrl(order, download) {
    if (!order || !order.invoiceToken) return "";
    return "/api/invoice?id=" + encodeURIComponent(order.txnid) + "&t=" + encodeURIComponent(order.invoiceToken) + (download ? "&download=1" : "");
  }
  function customerFieldsHtml(c, lockedEmail) {
    c = c || {};
    return "<div class='ops-field'><label for='ordName'>Name</label><input id='ordName' value='" + esc(c.name || "") + "' required autocomplete='name' /></div>" +
      "<div class='ops-field'><label for='ordEmail'>Email</label><input id='ordEmail' type='email' value='" + esc(c.email || "") + "'" + (lockedEmail ? " readonly" : "") + " required autocomplete='email' /></div>" +
      "<div class='ops-field'><label for='ordPhone'>Phone</label><input id='ordPhone' value='" + esc(c.phone || "") + "' inputmode='tel' autocomplete='tel' /></div>" +
      "<div class='ops-field'><label for='ordAddress'>Address</label><textarea id='ordAddress' rows='2'>" + esc(c.address || "") + "</textarea></div>" +
      "<div class='ops-pair'><div class='ops-field'><label for='ordCity'>City</label><input id='ordCity' value='" + esc(c.city || "") + "' /></div>" +
      "<div class='ops-field'><label for='ordPin'>PIN</label><input id='ordPin' value='" + esc(c.pincode || "") + "' inputmode='numeric' /></div></div>" +
      "<div class='ops-field'><label for='ordState'>State</label><input id='ordState' value='" + esc(c.state || "") + "' /></div>";
  }
  function readCustomerFields() {
    return {
      name: $("ordName").value,
      email: $("ordEmail").value,
      phone: $("ordPhone").value,
      address: $("ordAddress").value,
      city: $("ordCity").value,
      pincode: $("ordPin").value,
      state: $("ordState").value
    };
  }
  function badgeClass(status) {
    if (CLOSED[status]) return "badge-closed";
    return "badge-" + (status || "estimate");
  }
  function relTime(ms) {
    if (!ms) return "";
    var d = Date.now() - Number(ms);
    var m = Math.round(d / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    var h = Math.round(m / 60);
    if (h < 36) return h + "h ago";
    var days = Math.round(h / 24);
    if (days < 14) return days + "d ago";
    return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  function toast(msg, err) {
    var box = $("opsToasts");
    var el = document.createElement("div");
    el.className = "ops-toast" + (err ? " is-err" : "");
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  function copyText(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Copied."); }).catch(function () { toast(text); });
      return;
    }
    toast("Copy: " + text);
  }

  function api(url, opts) {
    opts = opts || {};
    opts.credentials = "include";
    opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    return fetch(url, opts).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || "Request failed");
        return data;
      });
    });
  }

  function setTab(tab, id, push) {
    if (!TITLES[tab]) tab = "today";
    state.tab = tab;
    $("opsTitle").textContent = TITLES[tab];
    document.querySelectorAll("[data-tab]").forEach(function (el) {
      el.classList.toggle("is-on", el.getAttribute("data-tab") === tab);
    });
    document.querySelectorAll("[data-panel]").forEach(function (el) {
      el.hidden = el.getAttribute("data-panel") !== tab;
    });
    $("opsApp").classList.remove("is-nav");
    if (push !== false) {
      var hash = "#" + tab + (tab === "orders" && id ? "/" + id : "");
      if (location.hash !== hash) history.pushState(null, "", hash);
    }
    if (tab !== "orders" || !id) closeDrawer(false);
    if (tab === "orders" && id) openOrder(id);
    if (tab === "orders") renderOrders();
    if (tab === "people") renderPeople();
    if (tab === "today") renderToday();
    if (tab === "compose") paintComposeTill();
  }

  function parseHash() {
    var raw = (location.hash || "#today").replace(/^#/, "");
    var parts = raw.split("/");
    var tab = parts[0] || "today";
    var id = parts[1] || "";
    setTab(tab, id, false);
  }

  function closeDrawer(clearHash) {
    $("orderDrawer").hidden = true;
    $("opsMask").hidden = true;
    state.selected = "";
    state.order = null;
    state.personEmail = "";
    if (clearHash && state.tab === "orders" && /#orders\//.test(location.hash)) {
      history.replaceState(null, "", "#orders");
    }
  }

  function matchesOrder(order, q) {
    if (!q) return true;
    var blob = [order.txnid, order.name, order.email, order.phone, order.city, order.invoiceNo, order.estimateNo, (order.items || []).join(" ")].join(" ").toLowerCase();
    return blob.indexOf(q) !== -1;
  }

  function filteredOrders() {
    var q = (state.orderQuery || "").trim().toLowerCase();
    return state.orders.filter(function (order) {
      if (state.orderFilter === "closed") {
        if (!CLOSED[order.status]) return false;
      } else if (state.orderFilter !== "all" && order.status !== state.orderFilter) {
        return false;
      }
      return matchesOrder(order, q);
    });
  }

  function renderToday() {
    var paid = state.orders.filter(function (o) { return o.status === "paid"; });
    var pending = state.orders.filter(function (o) { return o.status === "pending"; });
    var packed = state.orders.filter(function (o) { return o.status === "packed"; });
    var low = state.stock.filter(function (row) { return row.available <= 3; });
    $("todayKpis").innerHTML =
      kpi("To pack", paid.length, "paid") +
      kpi("Pending PayU", pending.length, "pending") +
      kpi("Awaiting courier", packed.length, "packed") +
      kpi("Low stock", low.length, "stock", low.length > 0);
    $("todayPack").innerHTML = miniList(paid.slice(0, 8), "Nothing paid and waiting to pack.");
    $("todayPending").innerHTML = miniList(pending.slice(0, 6), "No open PayU links.");
    $("todayStock").innerHTML = low.length
      ? "<table class='ops-table'><tbody>" + low.map(function (row) {
        return "<tr data-go='stock'><td><b>" + esc(row.label) + "</b><small>Reserved " + row.reserved + "</small></td><td>" + row.available + " left</td></tr>";
      }).join("") + "</tbody></table>"
      : "<p class='ops-empty'>Shelf is fine.</p>";
  }

  function kpi(label, value, filter, warn) {
    return "<button type='button' class='ops-kpi" + (warn ? " is-warn" : "") + "' data-kpi='" + filter + "'><small>" + label + "</small><strong>" + value + "</strong></button>";
  }

  function miniList(rows, empty) {
    if (!rows.length) return "<p class='ops-empty'>" + empty + "</p>";
    return "<table class='ops-table'><tbody>" + rows.map(function (order) {
      return "<tr data-open='" + esc(order.txnid) + "'><td><b>" + esc(order.name) + "</b><small>" + esc(order.city || "") + " · " + relTime(order.paidAt || order.createdAt) + "</small></td><td class='ops-amount'>" + rupees(order.payable) + "</td></tr>";
    }).join("") + "</tbody></table>";
  }

  function renderOrders() {
    var rows = filteredOrders();
    var wrap = $("orderList");
    if (!state.orders.length) {
      wrap.innerHTML = "<p class='ops-empty'>No orders yet. Compose an estimate or a PayU link, or wait for a checkout.</p>";
      return;
    }
    if (!rows.length) {
      wrap.innerHTML = "<p class='ops-empty'>Nothing matches this filter.</p>";
      return;
    }
    wrap.innerHTML = "<table class='ops-table'><thead><tr><th>Status</th><th>Who</th><th>Gift</th><th>Amount</th><th>When</th></tr></thead><tbody>" +
      rows.map(function (order) {
        var doc = order.invoiceNo || order.estimateNo || order.txnid;
        return "<tr data-open='" + esc(order.txnid) + "'" + (state.selected === order.txnid ? " class='is-on'" : "") + ">" +
          "<td><span class='badge " + badgeClass(order.status) + "'>" + esc(order.status) + "</span></td>" +
          "<td><b>" + esc(order.name) + "</b><small>" + esc(order.city || order.email) + "</small></td>" +
          "<td>" + esc((order.items || []).join(", ")) + "<small>" + esc(doc) + "</small></td>" +
          "<td class='ops-amount'>" + rupees(order.payable) + "</td>" +
          "<td><small>" + relTime(order.paidAt || order.createdAt) + "</small></td></tr>";
      }).join("") + "</tbody></table>";
  }

  function openOrder(id) {
    state.selected = id;
    state.personEmail = "";
    $("opsMask").hidden = false;
    $("orderDrawer").hidden = false;
    $("drawTitle").textContent = id;
    $("orderDetail").innerHTML = "<p class='ops-empty'>Loading…</p>";
    api("/api/admin/orders?id=" + encodeURIComponent(id)).then(function (data) {
      state.order = data.order;
      paintDrawer();
      renderOrders();
    }).catch(function (err) {
      $("orderDetail").innerHTML = "<p class='ops-warn'>" + esc(err.message) + "</p>";
    });
  }

  function paintDrawer() {
    var order = state.order;
    if (!order) return;
    var c = order.customer || {};
    var token = order.invoiceToken || "";
    var view = invoiceUrl(order);
    var pdf = invoiceUrl(order, true);
    var pay = order.status === "pending" ? payUrl(order) : "";
    var docLabel = order.status === "estimate" ? "Estimate" : (order.status === "pending" ? "Proforma" : "Invoice");
    var numbers = [order.estimateNo, order.invoiceNo].filter(Boolean).join(" · ") || "No document number yet";
    $("drawStatus").className = "badge " + badgeClass(order.status);
    $("drawStatus").textContent = order.status;
    $("drawTitle").textContent = order.txnid;
    var gifts = (order.items || []).map(function (item) {
      var bits = [];
      if (item.recipient) bits.push("For " + item.recipient);
      if (item.items && item.items.length) bits.push(item.items.join(", "));
      if (item.message) bits.push("Card: " + item.message);
      return "<div class='ops-gift'><b>" + esc(item.qty) + " × " + esc(item.label) + "</b>" +
        (bits.length ? "<small>" + esc(bits.join(" · ")) + "</small>" : "") + "</div>";
    }).join("");
    var actions = [];
    if (order.status === "estimate") actions.push("<button class='btn btn-primary' type='button' data-act='link'>Create PayU link</button>");
    if (order.status === "pending" && pay) actions.push("<button class='btn btn-primary' type='button' data-act='copy-pay'>Copy PayU link</button>");
    if (order.status === "pending" || order.status === "estimate" || order.status === "paid") {
      actions.push("<button class='btn btn-ghost' type='button' data-act='mail'>Email customer</button>");
    }
    if (order.status === "paid") actions.push("<button class='btn btn-primary' type='button' data-act='pack'>Mark packed</button>");
    if (order.status === "paid" || order.status === "packed") actions.push("<button class='btn btn-ghost' type='button' data-act='ship'>Send to Shiprocket</button>");
    if (view) {
      actions.push("<a class='btn btn-ghost' href='" + view + "' target='_blank'>" + docLabel + "</a>");
      actions.push("<a class='btn btn-ghost' href='" + pdf + "'>PDF</a>");
    }
    $("orderDetail").innerHTML =
      "<div class='ops-block'><p class='ops-amount' style='margin:0'>" + rupees(order.payable) + "</p><small>" + esc(numbers) + "</small></div>" +
      "<div class='ops-block'><h3>Gifts</h3>" + (gifts || "<p class='ops-empty'>No lines.</p>") + "</div>" +
      (order.stockWarning ? "<p class='ops-warn'>" + esc(order.stockWarning) + "</p>" : "") +
      (order.adminNote ? "<div class='ops-block'><h3>Atelier note</h3><p>" + esc(order.adminNote) + "</p></div>" : "") +
      "<div class='ops-block'><div class='btn-row'>" + actions.join("") + "</div></div>" +
      "<form id='drawForm' class='ops-fields'>" +
      "<h3>Customer</h3>" +
      "<p class='ops-lede-tight'>Saved onto this document. A PayU link needs phone, address, and a 6-digit PIN.</p>" +
      customerFieldsHtml(c, false) +
      "<div class='ops-field'><label>Status</label><select id='ordStatus'>" +
      ["estimate", "pending", "paid", "packed", "shipped", "cancelled", "refunded", "expired"].map(function (s) {
        return "<option" + (s === order.status ? " selected" : "") + ">" + s + "</option>";
      }).join("") + "</select></div>" +
      "<div class='ops-field'><label>Tracking</label><input id='ordTrack' value='" + esc(order.tracking || "") + "' /></div>" +
      "<div class='ops-field'><label>AWB</label><input id='ordAwb' value='" + esc(order.awb || "") + "' /></div>" +
      "<div class='ops-field'><label>Atelier note</label><textarea id='ordNote' rows='2'>" + esc(order.adminNote || "") + "</textarea></div>" +
      "<button class='btn btn-primary' type='submit'>Save</button></form>";
    $("drawForm").addEventListener("submit", saveDrawer);
    if (pay) $("orderDetail").dataset.pay = pay;
    else delete $("orderDetail").dataset.pay;
  }

  function saveDrawer(event) {
    event.preventDefault();
    if (!state.selected) return;
    api("/api/admin/orders", {
      method: "PATCH",
      body: JSON.stringify({
        txnid: state.selected,
        status: $("ordStatus").value,
        tracking: $("ordTrack").value,
        awb: $("ordAwb").value,
        note: $("ordNote").value,
        customer: readCustomerFields()
      })
    }).then(function () {
      toast("Saved.");
      return Promise.all([
        refreshOrders(state.selected),
        api("/api/admin/customers").then(function (data) {
          state.customers = data.customers || [];
          renderPeople();
        })
      ]);
    }).catch(function (err) { toast(err.message, true); });
  }

  function refreshOrders(keepId) {
    return api("/api/admin/orders").then(function (data) {
      state.orders = data.orders || [];
      renderToday();
      renderOrders();
      if (keepId) return openOrder(keepId);
    });
  }

  function renderStock() {
    var rows = state.stock;
    if (!rows.length) {
      $("stockForm").innerHTML = "<p class='ops-empty'>No stock rows.</p>";
      return;
    }
    var max = Math.max.apply(null, rows.map(function (row) { return Number(row.qty) || 0; })) || 1;
    $("stockForm").innerHTML = "<div class='ops-table-wrap'><table class='ops-table'><thead><tr><th>Gift</th><th>On hand</th><th>Reserved</th><th>Available</th></tr></thead><tbody>" +
      rows.map(function (row) {
        var cls = row.available <= 0 ? "ops-stock-zero" : (row.available <= 3 ? "ops-stock-low" : "");
        var pct = Math.min(100, Math.round((row.available / max) * 100));
        return "<tr class='" + cls + "'><td><b>" + esc(row.label) + "</b><span class='ops-bar'><span style='width:" + pct + "%'></span></span></td>" +
          "<td><input class='ops-stock-qty' type='number' min='0' data-sku='" + esc(row.id) + "' value='" + row.qty + "' /></td>" +
          "<td>" + row.reserved + "</td><td><b>" + row.available + "</b></td></tr>";
      }).join("") + "</tbody></table></div><div class='ops-compose-foot'><button class='btn btn-primary' type='submit'>Save stock</button></div>";
  }

  function renderSales(data) {
    $("salesKpis").innerHTML =
      "<div class='ops-kpi'><small>Paid orders</small><strong>" + data.orders + "</strong></div>" +
      "<div class='ops-kpi'><small>Gross</small><strong>" + rupees(data.gross) + "</strong></div>" +
      "<div class='ops-kpi'><small>Shipping</small><strong>" + rupees(data.shipping) + "</strong></div>" +
      "<div class='ops-kpi'><small>Pending PayU</small><strong>" + data.pending + "</strong></div>";
    $("salesSku").innerHTML = "<table class='ops-table'><thead><tr><th>Gift</th><th>Qty</th><th>Amount</th></tr></thead><tbody>" +
      ((data.bySku || []).map(function (row) {
        return "<tr><td>" + esc(row.label) + "</td><td>" + row.qty + "</td><td class='ops-amount'>" + rupees(row.amount) + "</td></tr>";
      }).join("") || "<tr><td colspan='3'>No paid gifts in this window.</td></tr>") + "</tbody></table>";
  }

  function renderPeople() {
    var q = (state.peopleQuery || "").trim().toLowerCase();
    var rows = state.customers.filter(function (row) {
      if (!q) return true;
      return [row.name, row.email, row.phone].join(" ").toLowerCase().indexOf(q) !== -1;
    });
    $("customerList").innerHTML = "<table class='ops-table'><thead><tr><th>Name</th><th>Email</th><th>Orders</th><th>Paid</th><th></th></tr></thead><tbody>" +
      (rows.map(function (row) {
        return "<tr data-person='" + esc(row.email) + "'><td><b>" + esc(row.name) + "</b>" + (row.registered ? "<small>account</small>" : "") + "</td><td>" + esc(row.email) + "<small>" + esc(row.phone || "") + "</small></td><td>" + row.orders + "</td><td class='ops-amount'>" + rupees(row.spent) + "</td><td><button class='ops-copy' type='button' data-edit-person='" + esc(row.email) + "'>Edit</button></td></tr>";
      }).join("") || "<tr><td colspan='5'>No buyers yet.</td></tr>") + "</tbody></table>";
  }

  function openPerson(email) {
    var row = state.customers.find(function (item) { return item.email === email; });
    if (!row) {
      toast("No customer matches.", true);
      return;
    }
    state.personEmail = email;
    state.selected = "";
    state.order = null;
    $("opsMask").hidden = false;
    $("orderDrawer").hidden = false;
    paintPerson(row);
  }

  function paintPerson(row) {
    $("drawStatus").className = "badge " + (row.registered ? "badge-paid" : "badge-estimate");
    $("drawStatus").textContent = row.registered ? "account" : "guest";
    $("drawTitle").textContent = row.name || row.email;
    $("orderDetail").innerHTML =
      "<p class='ops-lede-tight'>Saves onto their account and any open estimate or PayU link. Paid invoices stay as they were unless you open that order.</p>" +
      "<form id='drawForm' class='ops-fields'>" +
      customerFieldsHtml(row, true) +
      "<div class='btn-row'><button class='btn btn-primary' type='submit'>Save customer</button>" +
      "<button class='btn btn-ghost' type='button' data-person='" + esc(row.email) + "'>Their orders</button></div></form>";
    $("drawForm").addEventListener("submit", savePerson);
  }

  function savePerson(event) {
    event.preventDefault();
    var body = readCustomerFields();
    api("/api/admin/customers", { method: "PATCH", body: JSON.stringify(body) })
      .then(function (data) {
        state.customers = data.customers || state.customers;
        var n = (data.updated || []).length;
        toast(n ? "Saved on " + n + " open order" + (n === 1 ? "" : "s") + "." : "Customer saved.");
        renderPeople();
        var next = state.customers.find(function (row) { return row.email === body.email; });
        if (next) paintPerson(next);
        return refreshOrders();
      })
      .catch(function (err) { toast(err.message, true); });
  }

  function fillSettings() {
    var form = $("settingsForm");
    var s = state.settings || {};
    [].forEach.call(form.elements, function (el) {
      if (el.name && s[el.name] != null) el.value = s[el.name];
    });
  }

  function optionsHtml() {
    return skuList().map(function (row) {
      return "<option value='" + esc(row.id) + "' data-kind='" + esc(row.kind) + "' data-bowl='" + (row.bowl ? "1" : "0") + "' data-price='" + row.price + "'>" + esc(row.label) + " · " + rupees(row.price) + "</option>";
    }).join("");
  }

  function addComposeLine() {
    var wrap = $("composeLines");
    var row = document.createElement("div");
    row.className = "ops-gift-card";
    row.innerHTML = "<div class='ops-gift-card-row'><select class='co-sku'>" + optionsHtml() + "</select>" +
      "<input class='co-qty' type='number' min='1' max='500' value='1' aria-label='Quantity' /></div>" +
      "<div class='ops-gift-card-row'><label class='check'><input class='co-bowl' type='checkbox' /> Bowl + " + rupees(BOWL) + "</label>" +
      "<button class='ops-copy' type='button' data-remove>Remove</button></div>" +
      "<input class='co-msg' placeholder='Card line (optional)' />";
    wrap.appendChild(row);
    paintComposeTill();
  }

  function readComposeLines() {
    return [].map.call(document.querySelectorAll("#composeLines .ops-gift-card"), function (row) {
      var sel = row.querySelector(".co-sku");
      var opt = sel.options[sel.selectedIndex];
      return {
        size: sel.value,
        qty: parseInt(row.querySelector(".co-qty").value, 10) || 1,
        bowl: row.querySelector(".co-bowl").checked && opt && opt.getAttribute("data-bowl") === "1",
        message: row.querySelector(".co-msg").value,
        price: opt ? Number(opt.getAttribute("data-price")) || 0 : 0
      };
    });
  }

  function paintComposeTill() {
    document.querySelectorAll("#composeLines .ops-gift-card").forEach(function (row) {
      var sel = row.querySelector(".co-sku");
      var opt = sel && sel.options[sel.selectedIndex];
      var bowl = row.querySelector(".co-bowl");
      var allow = !!(opt && opt.getAttribute("data-bowl") === "1");
      if (bowl) {
        bowl.disabled = !allow;
        if (!allow) bowl.checked = false;
        var lab = bowl.closest("label");
        if (lab) lab.style.opacity = allow ? "1" : "0.45";
      }
    });
    var items = readComposeLines();
    var goods = 0;
    items.forEach(function (item) {
      goods += lineTotal(item.price + (item.bowl ? BOWL : 0), item.qty);
    });
    var shipRaw = $("coShip").value;
    var ship = shipRaw === "" ? shippingOf(goods) : Math.max(0, Number(shipRaw) || 0);
    $("composeTotal").textContent = rupees(goods + ship);
    $("composeTillHint").textContent = items.length
      ? (goods ? rupees(goods) + " gifts" : "No priced lines") + (ship ? " · shipping " + rupees(ship) : " · shipping complimentary")
      : "Till updates as you add lines.";
  }

  function shippingOf(goods) {
    var s = state.settings || {};
    if (goods <= 0) return 0;
    if (goods >= Number(s.shippingFreeAbove || 1999)) return 0;
    return Number(s.shippingFlat || 99);
  }

  function setKind(kind) {
    $("coKindValue").value = kind;
    $("coDaysField").hidden = kind !== "link";
    document.querySelectorAll("#coKind [data-kind]").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-kind") === kind);
    });
  }

  function showApp() {
    $("loginGate").hidden = true;
    $("opsApp").hidden = false;
    Promise.all([
      api("/api/admin/orders"),
      api("/api/admin/stock"),
      api("/api/admin/customers"),
      api("/api/admin/settings"),
      api("/api/admin/catalog"),
      api("/api/admin/sales?days=" + state.salesDays)
    ]).then(function (pack) {
      state.orders = pack[0].orders || [];
      state.stock = pack[1].stock || [];
      state.customers = pack[2].customers || [];
      state.settings = pack[3].settings || {};
      state.catalog = pack[4];
      renderToday();
      renderOrders();
      renderStock();
      renderPeople();
      fillSettings();
      renderSales(pack[5]);
      if (!$("composeLines").children.length) addComposeLine();
      parseHash();
    }).catch(function (err) {
      toast(err.message, true);
      parseHash();
    });
  }

  api("/api/admin/session").then(function (data) {
    if (!data.adminConfigured) $("loginCopy").textContent = "Set ADMIN_PASSWORD on Vercel, then return here.";
    if (data.signedIn) showApp();
  }).catch(function () {});

  $("loginForm").addEventListener("submit", function (event) {
    event.preventDefault();
    api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: $("adminPass").value }) })
      .then(showApp)
      .catch(function (err) { $("loginAlert").textContent = err.message; });
  });

  $("adminOut").addEventListener("click", function () {
    api("/api/admin/logout", { method: "POST" }).then(function () { location.reload(); });
  });

  $("opsMenu").addEventListener("click", function (event) {
    event.stopPropagation();
    $("opsApp").classList.toggle("is-nav");
  });
  document.querySelector(".ops-shell").addEventListener("click", function () {
    $("opsApp").classList.remove("is-nav");
  });

  $("opsTabs").addEventListener("click", function (event) {
    var btn = event.target.closest("[data-tab]");
    if (!btn) return;
    setTab(btn.getAttribute("data-tab"));
  });

  document.body.addEventListener("click", function (event) {
    var go = event.target.closest("[data-go]");
    if (go) {
      setTab(go.getAttribute("data-go"));
      return;
    }
    var kpi = event.target.closest("[data-kpi]");
    if (kpi) {
      var kind = kpi.getAttribute("data-kpi");
      if (kind === "stock") setTab("stock");
      else {
        state.orderFilter = kind;
        document.querySelectorAll("#orderChips [data-status]").forEach(function (el) {
          el.classList.toggle("is-on", el.getAttribute("data-status") === kind);
        });
        setTab("orders");
      }
      return;
    }
    var open = event.target.closest("[data-open]");
    if (open) {
      setTab("orders", open.getAttribute("data-open"));
      return;
    }
    var editPerson = event.target.closest("[data-edit-person]");
    if (editPerson) {
      openPerson(editPerson.getAttribute("data-edit-person"));
      return;
    }
    var person = event.target.closest("[data-person]");
    if (person) {
      state.orderQuery = person.getAttribute("data-person");
      state.orderFilter = "all";
      $("opsSearch").value = state.orderQuery;
      document.querySelectorAll("#orderChips [data-status]").forEach(function (el) {
        el.classList.toggle("is-on", el.getAttribute("data-status") === "all");
      });
      setTab("orders");
    }
  });

  $("orderChips").addEventListener("click", function (event) {
    var chip = event.target.closest("[data-status]");
    if (!chip) return;
    state.orderFilter = chip.getAttribute("data-status");
    document.querySelectorAll("#orderChips [data-status]").forEach(function (el) {
      el.classList.toggle("is-on", el === chip);
    });
    renderOrders();
  });

  var searchTimer = 0;
  $("opsSearch").addEventListener("input", function () {
    var q = this.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.orderQuery = q;
      if (state.tab !== "orders") setTab("orders");
      else renderOrders();
      var exact = state.orders.find(function (order) {
        return String(order.txnid).toUpperCase() === q.trim().toUpperCase();
      });
      if (exact) setTab("orders", exact.txnid, false);
    }, 180);
  });

  $("peopleSearch").addEventListener("input", function () {
    state.peopleQuery = this.value;
    renderPeople();
  });

  $("drawClose").addEventListener("click", function () { closeDrawer(true); });
  $("opsMask").addEventListener("click", function () { closeDrawer(true); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeDrawer(true);
  });

  $("orderDetail").addEventListener("click", function (event) {
    var copy = event.target.closest("[data-copy]");
    if (copy) {
      copyText(copy.getAttribute("data-copy"));
      return;
    }
    var act = event.target.closest("[data-act]");
    if (!act || !state.selected) return;
    var kind = act.getAttribute("data-act");
    if (kind === "copy-pay") {
      copyText($("orderDetail").dataset.pay || payUrl(state.order));
      return;
    }
    if (kind === "mail") {
      api("/api/admin/orders", { method: "PATCH", body: JSON.stringify({ txnid: state.selected, resend: true }) })
        .then(function () { toast("Email sent if Resend is configured."); })
        .catch(function (err) { toast(err.message, true); });
      return;
    }
    if (kind === "link") {
      api("/api/admin/convert", { method: "POST", body: JSON.stringify({ txnid: state.selected, days: 14, send: true }) })
        .then(function (data) {
          toast("PayU link ready.");
          if (data.payUrl) copyText(data.payUrl);
          return refreshOrders(state.selected);
        })
        .catch(function (err) { toast(err.message, true); });
      return;
    }
    if (kind === "pack") {
      api("/api/admin/orders", { method: "PATCH", body: JSON.stringify({ txnid: state.selected, status: "packed" }) })
        .then(function () { toast("Marked packed."); return refreshOrders(state.selected); })
        .catch(function (err) { toast(err.message, true); });
      return;
    }
    if (kind === "ship") {
      api("/api/admin/shiprocket", { method: "POST", body: JSON.stringify({ txnid: state.selected }) })
        .then(function () { toast("Sent to Shiprocket."); return refreshOrders(state.selected); })
        .catch(function (err) { toast(err.message, true); });
    }
  });

  $("stockForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var stock = [].map.call(document.querySelectorAll("#stockForm [data-sku]"), function (input) {
      return { id: input.getAttribute("data-sku"), qty: input.value };
    });
    api("/api/admin/stock", { method: "PUT", body: JSON.stringify({ stock: stock }) })
      .then(function (data) {
        state.stock = Object.keys(data.stock || {}).map(function (id) {
          var row = data.stock[id];
          return { id: id, label: row.label, qty: row.qty, reserved: row.reserved || 0, available: Math.max(0, (row.qty || 0) - (row.reserved || 0)) };
        });
        if (!state.stock.length) {
          return api("/api/admin/stock").then(function (fresh) {
            state.stock = fresh.stock || [];
            renderStock();
            renderToday();
            toast("Stock saved.");
          });
        }
        renderStock();
        renderToday();
        toast("Stock saved.");
      })
      .catch(function (err) { toast(err.message, true); });
  });

  $("salesChips").addEventListener("click", function (event) {
    var chip = event.target.closest("[data-days]");
    if (!chip) return;
    state.salesDays = chip.getAttribute("data-days");
    document.querySelectorAll("#salesChips [data-days]").forEach(function (el) {
      el.classList.toggle("is-on", el === chip);
    });
    api("/api/admin/sales?days=" + state.salesDays).then(renderSales).catch(function (err) { toast(err.message, true); });
  });

  $("settingsForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var body = {};
    [].forEach.call(event.target.elements, function (el) {
      if (el.name) body[el.name] = el.value;
    });
    api("/api/admin/settings", { method: "PUT", body: JSON.stringify(body) })
      .then(function (data) {
        state.settings = data.settings || body;
        toast("Settings saved.");
      })
      .catch(function (err) { toast(err.message, true); });
  });

  $("coKind").addEventListener("click", function (event) {
    var btn = event.target.closest("[data-kind]");
    if (!btn) return;
    event.preventDefault();
    setKind(btn.getAttribute("data-kind"));
  });
  $("addLine").addEventListener("click", addComposeLine);
  $("composeLines").addEventListener("click", function (event) {
    if (event.target.getAttribute("data-remove") == null) return;
    var card = event.target.closest(".ops-gift-card");
    if (card) card.remove();
    paintComposeTill();
  });
  $("composeForm").addEventListener("input", paintComposeTill);
  $("composeForm").addEventListener("submit", function (event) {
    event.preventDefault();
    $("composeAlert").textContent = "";
    var items = readComposeLines();
    if (!items.length) {
      $("composeAlert").textContent = "Add at least one gift.";
      return;
    }
    var body = {
      kind: $("coKindValue").value,
      days: $("coDays").value,
      name: $("coName").value,
      email: $("coEmail").value,
      phone: $("coPhone").value,
      address: $("coAddress").value,
      city: $("coCity").value,
      pincode: $("coPin").value,
      state: $("coState").value,
      shipping: $("coShip").value,
      note: $("coNote").value,
      send: $("coSend").checked,
      items: items
    };
    api("/api/admin/compose", { method: "POST", body: JSON.stringify(body) })
      .then(function (data) {
        var box = $("composeResult");
        box.hidden = false;
        var pay = data.payUrl || "";
        box.innerHTML = "<p class='badge " + badgeClass(data.order.status) + "'>" + esc(data.order.status) + "</p>" +
          "<h2 style='margin:8px 0 4px'>" + esc(data.order.txnid) + "</h2>" +
          "<p class='ops-amount' style='margin:0'>" + rupees(data.order.payable) + "</p>" +
          "<p>" + esc([data.order.estimateNo, data.order.invoiceNo].filter(Boolean).join(" · ")) + "</p>" +
          (pay ? "<input value='" + esc(pay) + "' readonly /><div class='btn-row'><button class='btn btn-primary' type='button' data-copy-pay>Copy PayU link</button></div>" : "") +
          "<div class='btn-row' style='margin-top:10px'>" +
          (data.invoiceUrl ? "<a class='btn btn-ghost' href='" + esc(data.invoiceUrl) + "' target='_blank'>View document</a><a class='btn btn-ghost' href='" + esc(data.invoiceUrl) + "&download=1'>PDF</a>" : "") +
          "<button class='btn btn-ghost' type='button' data-open='" + esc(data.order.txnid) + "'>Open this order</button></div>" +
          "<p class='ops-lede' style='margin:10px 0 0'>" + (data.mail && data.mail.customer && data.mail.customer.skipped ? "Email skipped — add RESEND_API_KEY on Vercel." : "If send was ticked, the customer email was attempted.") + "</p>";
        if (pay) {
          box.querySelector("[data-copy-pay]").addEventListener("click", function () { copyText(pay); });
        }
        toast("Created " + data.order.txnid + ".");
        refreshOrders();
      })
      .catch(function (err) { $("composeAlert").textContent = err.message; });
  });

  window.addEventListener("hashchange", parseHash);
})();

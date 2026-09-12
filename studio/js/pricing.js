(function () {
  "use strict";

  var panel = null;
  var dragging = false;
  var offsetX = 0;
  var offsetY = 0;
  var db = null;
  var items = [];
  var depositPercent = 50;
  var validDays = 14;
  var saving = false;
  var loaded = false;
  var loadPromise = null;

  function money(n) {
    return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function ensurePanel() {
    panel = document.getElementById("pricing-float");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "pricing-float";
    panel.className = "pricing-float hidden";
    panel.innerHTML =
      '<div class="pricing-float-head" data-drag>' +
        "<strong>Pricing</strong>" +
        '<span class="meta" data-meta></span>' +
        '<button type="button" class="close" data-close aria-label="Close">×</button>' +
      "</div>" +
      '<div class="pricing-float-body" data-body>Loading…</div>' +
      '<div class="pricing-float-actions">' +
        '<button type="button" class="btn btn-ghost" data-add>+ Add price</button>' +
        '<button type="button" class="btn btn-primary" data-save>Save</button>' +
      "</div>";
    document.body.appendChild(panel);

    panel.querySelector("[data-close]").onclick = hide;
    panel.querySelector("[data-add]").onclick = function () {
      harvest();
      items.push({ id: null, name: "New item", detail: "", rate: 0, sort_order: items.length });
      render();
    };
    panel.querySelector("[data-save]").onclick = save;
    var head = panel.querySelector("[data-drag]");
    head.addEventListener("mousedown", function (event) {
      if (event.target.closest("[data-close]")) return;
      dragging = true;
      var rect = panel.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      event.preventDefault();
    });
    window.addEventListener("mousemove", function (event) {
      if (!dragging) return;
      var x = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, event.clientX - offsetX));
      var y = Math.max(8, Math.min(window.innerHeight - 48, event.clientY - offsetY));
      panel.style.left = x + "px";
      panel.style.top = y + "px";
      panel.style.right = "auto";
    });
    window.addEventListener("mouseup", function () { dragging = false; });
    return panel;
  }

  function harvest() {
    if (!panel) return;
    var dep = panel.querySelector("[data-deposit]");
    var days = panel.querySelector("[data-days]");
    if (dep) depositPercent = Number(dep.value || 0);
    if (days) validDays = Number(days.value || 14);
    var rows = panel.querySelectorAll(".pricing-edit");
    rows.forEach(function (row, i) {
      if (!items[i]) return;
      items[i].name = row.querySelector("[data-name]").value;
      items[i].rate = Number(row.querySelector("[data-rate]").value || 0);
      items[i].sort_order = i;
    });
  }

  function render() {
    ensurePanel();
    var body = panel.querySelector("[data-body]");
    if (!loaded) {
      body.innerHTML = "<p>Loading pricing…</p>";
      return;
    }
    panel.querySelector("[data-meta]").textContent = items.length + " items";
    var html =
      '<div class="pricing-settings">' +
        '<label>Deposit <input data-deposit type="number" min="0" max="100" step="1" value="' + esc(depositPercent) + '" />%</label>' +
        '<label>Quote <input data-days type="number" min="1" step="1" value="' + esc(validDays) + '" /> days</label>' +
      "</div>";
    if (!items.length) {
      html += "<p class=\"pricing-foot\">No prices yet. Add one.</p>";
    } else {
      html += '<div class="pricing-cols"><span>Item</span><span>Rate</span></div>';
    }
    items.forEach(function (item, i) {
      html +=
        '<div class="pricing-edit' + (i % 2 ? " is-alt" : "") + '" data-index="' + i + '">' +
          '<input data-name type="text" value="' + esc(item.name || "") + '" placeholder="Item" />' +
          '<span class="pricing-dollar">$</span>' +
          '<input data-rate type="number" min="0" step="0.01" value="' + esc(item.rate == null ? "" : item.rate) + '" />' +
          '<button type="button" class="pricing-x" data-remove="' + i + '" aria-label="Remove">×</button>' +
        "</div>";
    });
    body.innerHTML = html;
    body.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.onclick = function () {
        harvest();
        var i = Number(btn.getAttribute("data-remove"));
        var row = items[i];
        if (!row) return;
        if (!window.confirm('Remove "' + (row.name || "this price") + '"?')) return;
        if (row.id && db) {
          db.from("studio_pricing_items").delete().eq("id", row.id).then(function (res) {
            if (res.error) {
              body.insertAdjacentHTML("afterbegin", "<p class=\"pricing-err\">" + esc(res.error.message) + "</p>");
              return;
            }
            items.splice(i, 1);
            render();
          });
        } else {
          items.splice(i, 1);
          render();
        }
      };
    });
  }

  function missingTable(err) {
    var msg = (err && err.message) || "";
    return /studio_pricing/i.test(msg) && /does not exist|schema cache|not find/i.test(msg);
  }

  function applyFile(data) {
    depositPercent = Number(data.depositPercent) || 50;
    validDays = Number(data.validDays) || 14;
    items = (data.items || []).map(function (item, i) {
      return {
        id: null,
        name: item.name || "",
        detail: item.detail || "",
        rate: Number(item.rate) || 0,
        sort_order: i
      };
    });
  }

  function loadFromFile() {
    return fetch("data/pricing.json?v=2").then(function (r) { return r.json(); }).then(applyFile);
  }

  function seedToDatabase() {
    if (!db || !items.length) return Promise.resolve();
    var rows = items.map(function (item, i) {
      return {
        name: item.name || "",
        detail: item.detail || "",
        rate: Number(item.rate) || 0,
        sort_order: i
      };
    });
    return db.auth.getUser().then(function (auth) {
      var uid = auth.data && auth.data.user && auth.data.user.id;
      var row = { deposit_percent: depositPercent, valid_days: validDays };
      if (uid) row.user_id = uid;
      return db.from("studio_pricing_settings").upsert(row, { onConflict: "user_id" });
    }).then(function (res) {
      if (res && res.error) return;
      return db.from("studio_pricing_items").insert(rows).select("*");
    }).then(function (res) {
      if (res && res.data && res.data.length) items = res.data;
    });
  }

  function load() {
    return loadFromFile().then(function () {
      if (!db) {
        loaded = true;
        return;
      }
      return db.from("studio_pricing_items").select("*").order("sort_order").then(function (res) {
        if (res.error) {
          loaded = true;
          return;
        }
        if (res.data && res.data.length) {
          items = res.data;
          return db.from("studio_pricing_settings").select("*").limit(1).maybeSingle().then(function (set) {
            if (set && set.data) {
              depositPercent = Number(set.data.deposit_percent) || depositPercent;
              validDays = Number(set.data.valid_days) || validDays;
            }
          });
        }
        return seedToDatabase();
      }).then(function () {
        loaded = true;
      });
    }).catch(function () {
      loaded = true;
    });
  }

  function ensureLoaded() {
    if (loaded) return Promise.resolve(listItems());
    if (!loadPromise) loadPromise = load();
    return loadPromise.then(function () { return listItems(); });
  }

  function save() {
    harvest();
    if (!db) return;
    if (saving) return;
    saving = true;
    var saveBtn = panel.querySelector("[data-save]");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
    }
    var settingsJob = db.auth.getUser().then(function (auth) {
      var uid = auth.data && auth.data.user && auth.data.user.id;
      var row = { deposit_percent: depositPercent, valid_days: validDays };
      if (uid) row.user_id = uid;
      return db.from("studio_pricing_settings").upsert(row, { onConflict: "user_id" });
    });
    var jobs = items.map(function (item, i) {
      var body = {
        name: item.name || "",
        detail: item.detail || "",
        rate: Number(item.rate) || 0,
        sort_order: i
      };
      if (item.id) return db.from("studio_pricing_items").update(body).eq("id", item.id).select("*").single();
      return db.from("studio_pricing_items").insert(body).select("*").single();
    });
    Promise.all([settingsJob].concat(jobs)).then(function (results) {
      saving = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
      }
      var err = results.map(function (r) { return r && r.error; }).filter(Boolean)[0];
      if (err) {
        panel.querySelector("[data-body]").insertAdjacentHTML("afterbegin",
          "<p class=\"pricing-err\">" + esc(missingTable(err) ? "Run sql/016_pricing.sql in Supabase." : err.message) + "</p>");
        return;
      }
      results.slice(1).forEach(function (res, i) {
        if (res && res.data) items[i] = res.data;
      });
      render();
    }).catch(function (err) {
      saving = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
      }
      panel.querySelector("[data-body]").insertAdjacentHTML("afterbegin",
        "<p class=\"pricing-err\">" + esc((err && err.message) || "Could not save.") + "</p>");
    });
  }

  function show() {
    ensurePanel();
    if (!panel.style.left) {
      panel.style.left = Math.max(24, window.innerWidth - 480) + "px";
      panel.style.top = "88px";
    }
    panel.classList.remove("hidden");
    ensureLoaded().then(function () {
      render();
    });
  }

  function hide() {
    if (panel) panel.classList.add("hidden");
  }

  function toggle() {
    ensurePanel();
    if (panel.classList.contains("hidden")) show();
    else hide();
  }

  function listItems() {
    return items.slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
  }

  window.STLPricing = {
    init: function (client) {
      db = client || null;
      loaded = false;
      loadPromise = load();
    },
    show: show,
    hide: hide,
    toggle: toggle,
    items: listItems,
    ensureLoaded: ensureLoaded,
    ready: function () { return loaded; },
    isOpen: function () {
      return !!(panel && !panel.classList.contains("hidden"));
    }
  };
})();

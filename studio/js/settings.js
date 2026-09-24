(function () {
  "use strict";

  var DEFAULT_MILEAGE_RATE = 0.70;
  var DEFAULT_TAX_RESERVE = 30;
  var DEFAULT_DEPOSIT = 50;
  var DEFAULT_QUOTE_DAYS = 14;
  var STORAGE_DEFAULT_SECTION = "stl_studio_default_section";

  var root = null;
  var db = null;
  var dirty = false;
  var saving = false;
  var userEmail = "";

  var mileageRate = DEFAULT_MILEAGE_RATE;
  var taxReserve = DEFAULT_TAX_RESERVE;
  var defaultSection = "overview";
  var depositPercent = DEFAULT_DEPOSIT;
  var validDays = DEFAULT_QUOTE_DAYS;
  var vendorDraft = "";
  var bucketDraft = "";
  var connections = null;
  var backingUp = false;

  var SECTION_CHOICES = [
    { id: "overview", title: "Overview" },
    { id: "bank", title: "Bank" },
    { id: "business", title: "Business Info" },
    { id: "loginVault", title: "Login Vault" },
    { id: "renewals", title: "Renewals" },
    { id: "calendar", title: "Calendar" },
    { id: "taxes", title: "Taxes" },
    { id: "expenses", title: "Expenses" },
    { id: "income", title: "Income" },
    { id: "ownerDraws", title: "Owner Draw" },
    { id: "inventory", title: "Inventory" },
    { id: "mileage", title: "Mileage" },
    { id: "apps", title: "Apps" },
    { id: "promos", title: "Promos" },
    { id: "sop", title: "SOP" },
    { id: "appleAnalytics", title: "Analytics" },
    { id: "subscribed", title: "Subscribed" },
    { id: "support", title: "Support" },
    { id: "inbox", title: "WebForm Submits" },
    { id: "emails", title: "Email Lists" },
    { id: "notifications", title: "Notifications" },
    { id: "clients", title: "Clients" },
    { id: "leads", title: "Leads" },
    { id: "projects", title: "Projects" },
    { id: "billing", title: "Billing" },
    { id: "notes", title: "Notes" }
  ];

  function el(name) {
    return root ? root.querySelector('[data-el="' + name + '"]') : null;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!msg && !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }

  function syncSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.disabled = !dirty || saving;
    btn.textContent = saving ? "Saving…" : "Save";
  }

  function markDirty() {
    dirty = true;
    syncSave();
  }

  function readStoredDefault() {
    try {
      var v = localStorage.getItem(STORAGE_DEFAULT_SECTION) || "overview";
      if (SECTION_CHOICES.some(function (c) { return c.id === v; })) return v;
    } catch (err) {}
    return "overview";
  }

  function writeStoredDefault(id) {
    try {
      localStorage.setItem(STORAGE_DEFAULT_SECTION, id || "overview");
    } catch (err) {}
  }

  function applySettingsRows(rows) {
    (rows || []).forEach(function (row) {
      if (row.key === "mileage_rate") {
        var n = Number(row.value);
        if (Number.isFinite(n) && n >= 0) mileageRate = n;
      }
      if (row.key === "tax_reserve_percent") {
        var r = Number(row.value);
        if (Number.isFinite(r)) taxReserve = Math.max(0, Math.min(100, r));
      }
      if (row.key === "default_section") {
        if (SECTION_CHOICES.some(function (c) { return c.id === row.value; })) {
          defaultSection = row.value;
          writeStoredDefault(defaultSection);
        }
      }
    });
  }

  function harvest() {
    var rateEl = el("mileage-rate");
    var reserveEl = el("tax-reserve");
    var startEl = el("default-section");
    var depositEl = el("deposit");
    var daysEl = el("quote-days");
    var vendorEl = el("vendor");
    var bucketEl = el("bucket");
    if (rateEl) {
      var n = Number(rateEl.value);
      mileageRate = Number.isFinite(n) && n >= 0 ? n : mileageRate;
    }
    if (reserveEl) {
      var r = Number(reserveEl.value);
      taxReserve = Number.isFinite(r) ? Math.max(0, Math.min(100, r)) : taxReserve;
    }
    if (startEl) defaultSection = startEl.value || "overview";
    if (depositEl) {
      var d = Number(depositEl.value);
      depositPercent = Number.isFinite(d) ? Math.max(0, Math.min(100, d)) : depositPercent;
    }
    if (daysEl) {
      var days = Number(daysEl.value);
      validDays = Number.isFinite(days) && days >= 1 ? days : validDays;
    }
    if (vendorEl) vendorDraft = vendorEl.value || "";
    if (bucketEl) bucketDraft = bucketEl.value || "";
  }

  function statusDot(ok) {
    return '<span class="settings-dot' + (ok ? " is-ok" : "") + '"></span>';
  }

  function connectionRows() {
    if (!connections) {
      return '<p class="sub" style="margin:0">Checking connections…</p>';
    }
    var rows = [
      ["Mercury bank", !!connections.mercury],
      ["App Store Connect", !!connections.asc],
      ["Apple vendor number", !!connections.vendor],
      ["Google Play service account", !!connections.play],
      ["Play report bucket", !!connections.bucket],
      ["Permit Path announcements", !!connections.permitpath],
      ["Pilot Car 4 Hire announcements", !!connections.pc4h]
    ];
    return (
      '<ul class="settings-status">' +
      rows.map(function (row) {
        return (
          "<li>" +
            statusDot(row[1]) +
            "<span>" + esc(row[0]) + "</span>" +
            '<em>' + (row[1] ? "Ready" : "Missing") + "</em>" +
          "</li>"
        );
      }).join("") +
      "</ul>"
    );
  }

  function shell() {
    return (
      '<div class="ops-workspace">' +
        '<div class="ops-header">' +
          "<h1>Settings</h1>" +
          "<p>Studio defaults follow your account on every device you sign in on.</p>" +
        "</div>" +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="ops-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function render() {
    var body = el("body");
    if (!body) return;

    var options = SECTION_CHOICES.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === defaultSection ? " selected" : "") + ">" + esc(c.title) + "</option>";
    }).join("");

    body.innerHTML =
      '<div class="ops-card">' +
        "<h3>Account</h3>" +
        '<p class="sub">Signed in as <strong>' + esc(userEmail || "—") + "</strong>.</p>" +
        '<div class="ops-actions">' +
          '<button class="btn btn-ghost" type="button" data-el="sign-out">Sign out</button>' +
        "</div>" +
      "</div>" +

      '<div class="ops-card">' +
        "<h3>Startup</h3>" +
        '<p class="sub">Which page opens after you sign in, on this Mac and on the web.</p>' +
        '<div class="ops-field"><label>Default page</label>' +
          '<select data-el="default-section">' + options + "</select></div>" +
      "</div>" +

      '<div class="ops-card">' +
        "<h3>Finance defaults</h3>" +
        '<p class="sub">Used by Mileage PDFs and the Taxes reserve estimate. Same values as on those pages.</p>' +
        '<div class="ops-grid">' +
          '<div class="ops-field"><label>Mileage rate ($/mi)</label>' +
            '<input data-el="mileage-rate" type="number" min="0" step="0.01" value="' + esc(mileageRate) + '" /></div>' +
          '<div class="ops-field"><label>Tax reserve (%)</label>' +
            '<input data-el="tax-reserve" type="number" min="0" max="100" step="1" value="' + esc(taxReserve) + '" /></div>' +
        "</div>" +
      "</div>" +

      '<div class="ops-card">' +
        "<h3>Billing defaults</h3>" +
        '<p class="sub">Deposit percent and quote validity used when you make a quote. Same values as in Pricing.</p>' +
        '<div class="ops-grid">' +
          '<div class="ops-field"><label>Deposit (%)</label>' +
            '<input data-el="deposit" type="number" min="0" max="100" step="1" value="' + esc(depositPercent) + '" /></div>' +
          '<div class="ops-field"><label>Quote valid (days)</label>' +
            '<input data-el="quote-days" type="number" min="1" step="1" value="' + esc(validDays) + '" /></div>' +
        "</div>" +
      "</div>" +

      '<div class="ops-card">' +
        "<h3>Store report IDs</h3>" +
        '<p class="sub">Needed for Subscribed totals. Apple vendor number is from App Store Connect → Payments and Financial Reports. Play bucket is the pubsite Cloud Storage URI from Play Console → Download reports.</p>' +
        '<div class="ops-field"><label>Apple vendor number</label>' +
          '<input data-el="vendor" type="text" inputmode="numeric" autocomplete="off" value="' + esc(vendorDraft) + '" placeholder="8-digit vendor number" /></div>' +
        '<div class="ops-field"><label>Google Play report bucket</label>' +
          '<input data-el="bucket" type="text" autocomplete="off" value="' + esc(bucketDraft) + '" placeholder="gs://pubsite_prod_rev_…" /></div>' +
      "</div>" +

      '<div class="ops-card">' +
        "<h3>Connections</h3>" +
        '<p class="sub">Keys live in this Mac’s <code>secrets/</code> folder and sync to your Studio account when you open Studio signed in locally.</p>' +
        connectionRows() +
      "</div>" +

      '<div class="ops-card">' +
        "<h3>Backup Log</h3>" +
        '<p class="sub">Download a zip: a restore guide PDF (one menu per page), receipts, company documents, app icons, notification photos, and the Secrets folder. Keep it private — it has passwords and API keys.</p>' +
        '<div class="ops-actions">' +
          '<button class="btn btn-primary" type="button" data-el="backup-log"' + (backingUp ? " disabled" : "") + ">" +
            (backingUp ? "Building backup…" : "Backup Log") +
          "</button>" +
        "</div>" +
      "</div>" +

      '<div class="ops-card">' +
        "<h3>About</h3>" +
        '<p class="sub" style="margin:0">STL Studio · private ops for STL Apps LLC. Live UI at seantylerlee.com/studio. Local Mac app serves this folder via <code>server.py</code>.</p>' +
      "</div>";

    bind();
    syncSave();
  }

  function bind() {
    ["mileage-rate", "tax-reserve", "default-section", "deposit", "quote-days", "vendor", "bucket"].forEach(function (name) {
      var node = el(name);
      if (!node) return;
      node.oninput = markDirty;
      node.onchange = markDirty;
    });
    var out = el("sign-out");
    if (out) {
      out.onclick = function () {
        if (db && db.auth) db.auth.signOut();
      };
    }
    var backup = el("backup-log");
    if (backup) backup.onclick = runBackup;
  }

  function runBackup() {
    if (backingUp) return;
    if (!window.STLBackupLog || typeof window.STLBackupLog.download !== "function") {
      showMsg("Backup Log is missing. Refresh the page.", false);
      return;
    }
    backingUp = true;
    var btn = el("backup-log");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Building backup…";
    }
    showMsg("Building Backup Log…", true);
    window.STLBackupLog.download(db, {
      onStatus: function (msg) { showMsg(msg || "Building Backup Log…", true); }
    }).then(function () {
      backingUp = false;
      if (root) render();
      showMsg("Backup Log downloaded.", true);
      setTimeout(function () { if (!backingUp) showMsg(""); }, 1600);
    }).catch(function (err) {
      backingUp = false;
      if (root) render();
      showMsg((err && err.message) || "Could not build Backup Log.", false);
    });
  }

  function upsertSetting(uid, key, value) {
    var row = { key: key, value: String(value) };
    if (uid) row.user_id = uid;
    return db.from("studio_settings").upsert(row, { onConflict: "user_id,key" });
  }

  function saveStoreIds() {
    var api = window.STLLocalApi;
    if (!api || !api.available()) return Promise.resolve();
    var jobs = [];
    var vendor = vendorDraft.trim();
    var bucket = bucketDraft.trim();
    if (vendor) {
      jobs.push(api.post("/api/subscriptions/vendor", { vendorNumber: vendor }).then(function (res) {
        if (!res.ok) throw new Error((res.data && res.data.error) || "Could not save vendor number.");
        var digits = vendor.replace(/\D/g, "");
        if (db && digits && api.isLocal && api.isLocal()) {
          return db.auth.getUser().then(function (auth) {
            var user = auth.data && auth.data.user;
            if (!user) return;
            return db.from("studio_secrets").update({ asc_vendor_number: digits }).eq("user_id", user.id);
          }).catch(function () {});
        }
      }));
    }
    if (bucket) {
      jobs.push(api.post("/api/subscriptions/play-bucket", { bucket: bucket }).then(function (res) {
        if (!res.ok) throw new Error((res.data && res.data.error) || "Could not save Play bucket.");
        if (db && api.isLocal && api.isLocal()) {
          return db.auth.getUser().then(function (auth) {
            var user = auth.data && auth.data.user;
            if (!user) return;
            return db.from("studio_secrets").update({ play_gcs_bucket: bucket }).eq("user_id", user.id);
          }).catch(function () {});
        }
      }));
    }
    if (!jobs.length) return Promise.resolve();
    return Promise.all(jobs);
  }

  function applyLive() {
    if (window.STLMileage && typeof window.STLMileage.applyRate === "function") {
      window.STLMileage.applyRate(mileageRate);
    }
    if (window.STLTaxes && typeof window.STLTaxes.applyReserve === "function") {
      window.STLTaxes.applyReserve(taxReserve);
    }
    if (window.STLPricing && typeof window.STLPricing.applyDefaults === "function") {
      window.STLPricing.applyDefaults(depositPercent, validDays);
    }
  }

  function saveAll() {
    if (saving || !dirty || !db) return;
    harvest();
    saving = true;
    syncSave();
    showMsg("Saving…", true);
    writeStoredDefault(defaultSection);
    db.auth.getUser().then(function (auth) {
      var uid = auth.data && auth.data.user && auth.data.user.id;
      var bill = { deposit_percent: depositPercent, valid_days: validDays };
      if (uid) bill.user_id = uid;
      return Promise.all([
        upsertSetting(uid, "mileage_rate", mileageRate),
        upsertSetting(uid, "tax_reserve_percent", taxReserve),
        upsertSetting(uid, "default_section", defaultSection),
        db.from("studio_pricing_settings").upsert(bill, { onConflict: "user_id" }),
        saveStoreIds()
      ]);
    }).then(function (results) {
      saving = false;
      var err = results.map(function (r) { return r && r.error; }).filter(Boolean)[0];
      if (err) {
        showMsg(err.message || "Save failed.", false);
        syncSave();
        return;
      }
      dirty = false;
      applyLive();
      syncSave();
      showMsg("Saved on your account", true);
      setTimeout(function () { showMsg(""); }, 900);
      return loadConnections().then(function () {
        if (root) render();
      });
    }).catch(function (err) {
      saving = false;
      showMsg((err && err.message) || "Save failed.", false);
      syncSave();
    });
  }

  function loadSettings() {
    return Promise.all([
      db.from("studio_settings").select("key,value").in("key", ["mileage_rate", "tax_reserve_percent", "default_section"]),
      db.from("studio_pricing_settings").select("deposit_percent,valid_days").limit(1).maybeSingle()
    ]).then(function (pair) {
      applySettingsRows((pair[0] && pair[0].data) || []);
      var bill = pair[1] && pair[1].data;
      if (bill) {
        var d = Number(bill.deposit_percent);
        var v = Number(bill.valid_days);
        if (Number.isFinite(d)) depositPercent = Math.max(0, Math.min(100, d));
        if (Number.isFinite(v) && v >= 1) validDays = v;
      }
    }).catch(function () {});
  }

  function loadConnections() {
    var api = window.STLLocalApi;
    if (api && api.isLocal && api.isLocal()) {
      return api.get("/api/export-secrets").then(function (res) {
        var d = (res && res.data) || {};
        vendorDraft = vendorDraft || d.asc_vendor_number || "";
        bucketDraft = bucketDraft || d.play_gcs_bucket || "";
        connections = {
          mercury: !!d.mercury_token,
          asc: !!(d.asc_private_key && d.asc_key_id && d.asc_issuer_id),
          vendor: !!d.asc_vendor_number,
          play: !!d.play_service_account_json,
          bucket: !!d.play_gcs_bucket,
          permitpath: !!(d.permitpath_service_role_key && d.permitpath_supabase_url),
          pc4h: !!(d.pilotcar4hire_service_role_key && d.pilotcar4hire_supabase_url)
        };
      }).catch(function () {
        connections = {
          mercury: false, asc: false, vendor: false, play: false,
          bucket: false, permitpath: false, pc4h: false
        };
      });
    }
    if (!db) {
      connections = {
        mercury: false, asc: false, vendor: false, play: false,
        bucket: false, permitpath: false, pc4h: false
      };
      return Promise.resolve();
    }
    return db.from("studio_secrets").select(
      "mercury_token,asc_issuer_id,asc_key_id,asc_private_key,asc_vendor_number,play_service_account_json,play_gcs_bucket,permitpath_service_role_key,permitpath_supabase_url,pilotcar4hire_service_role_key,pilotcar4hire_supabase_url"
    ).limit(1).maybeSingle().then(function (res) {
      var d = (res && res.data) || {};
      vendorDraft = vendorDraft || d.asc_vendor_number || "";
      bucketDraft = bucketDraft || d.play_gcs_bucket || "";
      connections = {
        mercury: !!d.mercury_token,
        asc: !!(d.asc_private_key && d.asc_key_id && d.asc_issuer_id),
        vendor: !!d.asc_vendor_number,
        play: !!d.play_service_account_json,
        bucket: !!d.play_gcs_bucket,
        permitpath: !!(d.permitpath_service_role_key && d.permitpath_supabase_url),
        pc4h: !!(d.pilotcar4hire_service_role_key && d.pilotcar4hire_supabase_url)
      };
    }).catch(function () {
      connections = {
        mercury: false, asc: false, vendor: false, play: false,
        bucket: false, permitpath: false, pc4h: false
      };
    });
  }

  function load() {
    showMsg("Loading settings…", true);
    defaultSection = readStoredDefault();
    Promise.all([
      db.auth.getUser().then(function (auth) {
        var user = auth.data && auth.data.user;
        userEmail = (user && user.email) || "";
      }).catch(function () { userEmail = ""; }),
      loadSettings(),
      loadConnections()
    ]).then(function () {
      dirty = false;
      showMsg("");
      render();
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not load settings.", false);
      render();
    });
  }

  function hydrate(client) {
    if (client) db = client;
    defaultSection = readStoredDefault();
    if (!db) return Promise.resolve(defaultSection);
    return db.from("studio_settings").select("key,value").in("key", ["mileage_rate", "tax_reserve_percent", "default_section"])
      .then(function (res) {
        var rows = (res && res.data) || [];
        var hadDefault = rows.some(function (row) { return row.key === "default_section"; });
        applySettingsRows(rows);
        if (hadDefault) return defaultSection;
        return db.auth.getUser().then(function (auth) {
          var uid = auth.data && auth.data.user && auth.data.user.id;
          return upsertSetting(uid, "default_section", defaultSection);
        }).then(function () { return defaultSection; });
      })
      .catch(function () { return defaultSection; });
  }

  window.STLSettings = {
    mount: function (panel, client) {
      root = panel;
      db = client;
      dirty = false;
      saving = false;
      connections = null;
      panel.classList.add("ops-wide");
      panel.innerHTML = shell();
      load();
    },
    unmount: function () {
      root = null;
      db = null;
    },
    shown: function () {
      if (!root || !db || dirty || saving) return;
      load();
    },
    isDirty: function () { return dirty; },
    saveAll: saveAll,
    defaultSection: function () {
      return defaultSection || readStoredDefault();
    },
    hydrate: hydrate
  };
})();

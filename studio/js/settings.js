(function () {
  "use strict";

  var DEFAULT_MILEAGE_RATE = 0.70;
  var DEFAULT_TAX_RESERVE = 30;
  var STORAGE_DEFAULT_SECTION = "stl_studio_default_section";

  var root = null;
  var db = null;
  var dirty = false;
  var saving = false;
  var userEmail = "";

  var mileageRate = DEFAULT_MILEAGE_RATE;
  var taxReserve = DEFAULT_TAX_RESERVE;
  var defaultSection = "overview";
  var vendorDraft = "";
  var bucketDraft = "";
  var connections = null;

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
    { id: "emails", title: "Emails" },
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

  function harvest() {
    var rateEl = el("mileage-rate");
    var reserveEl = el("tax-reserve");
    var startEl = el("default-section");
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
          "<p>Studio defaults, store report IDs, and connection status for this Mac and your account.</p>" +
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
        '<p class="sub">Which page opens when you sign in on this browser.</p>' +
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
        "<h3>Store report IDs</h3>" +
        '<p class="sub">Needed for Subscribed totals. Apple vendor number is from App Store Connect → Payments and Financial Reports. Play bucket is the pubsite Cloud Storage URI from Play Console → Download reports.</p>' +
        '<div class="ops-field"><label>Apple vendor number</label>' +
          '<input data-el="vendor" type="text" inputmode="numeric" autocomplete="off" value="' + esc(vendorDraft) + '" placeholder="8-digit vendor number" /></div>' +
        '<div class="ops-field"><label>Google Play report bucket</label>' +
          '<input data-el="bucket" type="text" autocomplete="off" value="' + esc(bucketDraft) + '" placeholder="gs://pubsite_prod_rev_…" /></div>' +
        '<div class="ops-actions">' +
          '<button class="btn btn-ghost" type="button" data-el="save-store">Save store IDs</button>' +
        "</div>" +
      "</div>" +

      '<div class="ops-card">' +
        "<h3>Connections</h3>" +
        '<p class="sub">Keys live in this Mac’s <code>secrets/</code> folder and sync to your Studio account when you open Studio signed in locally.</p>' +
        connectionRows() +
      "</div>" +

      '<div class="ops-card">' +
        "<h3>About</h3>" +
        '<p class="sub" style="margin:0">STL Studio · private ops for STL Apps LLC. Live UI at seantylerlee.com/studio. Local Mac app serves this folder via <code>server.py</code>.</p>' +
      "</div>";

    bind();
    syncSave();
  }

  function bind() {
    ["mileage-rate", "tax-reserve", "default-section"].forEach(function (name) {
      var node = el(name);
      if (!node) return;
      node.oninput = markDirty;
      node.onchange = markDirty;
    });
    ["vendor", "bucket"].forEach(function (name) {
      var node = el(name);
      if (!node) return;
      node.oninput = function () {
        if (name === "vendor") vendorDraft = node.value || "";
        else bucketDraft = node.value || "";
      };
    });
    var out = el("sign-out");
    if (out) {
      out.onclick = function () {
        if (db && db.auth) db.auth.signOut();
      };
    }
    var storeBtn = el("save-store");
    if (storeBtn) storeBtn.onclick = saveStoreIds;
  }

  function upsertSetting(key, value) {
    return db.from("studio_settings").upsert({
      key: key,
      value: String(value)
    }, { onConflict: "user_id,key" });
  }

  function saveAll() {
    if (saving || !dirty || !db) return;
    harvest();
    saving = true;
    syncSave();
    showMsg("Saving…", true);
    writeStoredDefault(defaultSection);
    Promise.all([
      upsertSetting("mileage_rate", mileageRate),
      upsertSetting("tax_reserve_percent", taxReserve)
    ]).then(function (results) {
      saving = false;
      var err = results.map(function (r) { return r && r.error; }).filter(Boolean)[0];
      if (err) {
        showMsg(err.message || "Save failed.", false);
        syncSave();
        return;
      }
      dirty = false;
      syncSave();
      showMsg("Saved", true);
      setTimeout(function () { showMsg(""); }, 900);
    }).catch(function (err) {
      saving = false;
      showMsg((err && err.message) || "Save failed.", false);
      syncSave();
    });
  }

  function saveStoreIds() {
    harvest();
    var api = window.STLLocalApi;
    if (!api || !api.available()) {
      showMsg("Studio API is not available. Open Studio on this Mac or check your connection.", false);
      return;
    }
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
    if (!jobs.length) {
      showMsg("Enter a vendor number or Play bucket first.", false);
      return;
    }
    showMsg("Saving store IDs…", true);
    Promise.all(jobs).then(function () {
      showMsg("Store IDs saved.", true);
      return loadConnections().then(render);
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not save store IDs.", false);
    });
  }

  function loadSettings() {
    return db.from("studio_settings").select("key,value").in("key", ["mileage_rate", "tax_reserve_percent"])
      .then(function (res) {
        var rows = (res && res.data) || [];
        rows.forEach(function (row) {
          if (row.key === "mileage_rate") {
            var n = Number(row.value);
            if (Number.isFinite(n) && n >= 0) mileageRate = n;
          }
          if (row.key === "tax_reserve_percent") {
            var r = Number(row.value);
            if (Number.isFinite(r)) taxReserve = r;
          }
        });
      })
      .catch(function () {});
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
    isDirty: function () { return dirty; },
    saveAll: saveAll,
    defaultSection: readStoredDefault
  };
})();

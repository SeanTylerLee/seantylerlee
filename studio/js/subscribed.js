(function () {
  "use strict";

  var root = null;
  var db = null;
  var apps = [];
  var selectedAppId = "";
  var snapshot = null;
  var loading = false;
  var savingVendor = false;
  var savingBucket = false;
  var vendorDraft = "";
  var bucketDraft = "";
  var iconUrls = {};

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
  function formatted(n) {
    if (n == null || n === "") return "—";
    return (Number(n) || 0).toLocaleString("en-US");
  }
  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!msg && !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }
  function needsVendor(msg) {
    return /vendor number/i.test(msg || "");
  }
  function needsBucket(msg) {
    return /cloud storage|pubsite_prod|play bucket/i.test(msg || "");
  }
  function selected() {
    return apps.filter(function (a) { return a.id === selectedAppId; })[0] || null;
  }
  function pickDefaultApp() {
    var permit = apps.filter(function (a) { return /permit\s*path/i.test(a.name || ""); })[0];
    if (permit) return permit.id;
    return apps[0] ? apps[0].id : "";
  }
  function iconMarkup(app) {
    var url = app && app.icon_path ? iconUrls[app.icon_path] : "";
    if (url) return '<img class="app-icon" src="' + esc(url) + '" alt="" />';
    var initial = ((app && app.name) || "?").charAt(0).toUpperCase();
    return '<span class="app-icon">' + esc(initial) + "</span>";
  }

  function shell() {
    return (
      '<div class="ops-workspace">' +
        '<div class="ops-header">' +
          "<h1>Subscribed</h1>" +
          "<p>Pick an app to see current Apple and Google Play subscribers.</p>" +
        "</div>" +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="ops-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function vendorForm(message) {
    return (
      '<div class="ops-card">' +
        "<h3>Apple vendor number</h3>" +
        '<p class="sub">' + esc(message || "Apple needs your vendor number from Payments and Financial Reports.") + "</p>" +
        '<div class="ops-field"><label>Vendor number</label>' +
          '<input data-el="vendor" type="text" inputmode="numeric" autocomplete="off" value="' + esc(vendorDraft) + '" placeholder="8-digit vendor number" /></div>' +
        '<button class="btn btn-primary" type="button" data-el="save-vendor"' + (savingVendor ? " disabled" : "") + ">" +
          (savingVendor ? "Saving…" : "Save vendor number") +
        "</button>" +
      "</div>"
    );
  }
  function bucketForm(message) {
    return (
      '<div class="ops-card">' +
        "<h3>Google Play report bucket</h3>" +
        '<p class="sub">' + esc(message || "Play Console → Download reports → Statistics → Copy Cloud Storage URI. Paste the pubsite_prod_rev_… name.") + "</p>" +
        '<div class="ops-field"><label>Cloud Storage URI or bucket</label>' +
          '<input data-el="bucket" type="text" autocomplete="off" value="' + esc(bucketDraft) + '" placeholder="gs://pubsite_prod_rev_…" /></div>' +
        '<button class="btn btn-primary" type="button" data-el="save-bucket"' + (savingBucket ? " disabled" : "") + ">" +
          (savingBucket ? "Saving…" : "Save Play bucket") +
        "</button>" +
      "</div>"
    );
  }

  function render() {
    var body = el("body");
    if (!body) return;
    var app = selected();
    var html = "";

    if (!apps.length) {
      html += '<div class="ops-empty">Add an app in Apps first, then come back and tap it here.</div>';
      body.innerHTML = html;
      return;
    }

    html += '<div class="ops-filters">';
    apps.forEach(function (item) {
      html +=
        '<button type="button" class="ops-pill' + (item.id === selectedAppId ? " is-on" : "") + '" data-app="' + esc(item.id) + '">' +
          esc(item.name || "App") +
        "</button>";
    });
    html +=
      '<button type="button" class="ops-pill" data-el="refresh" style="margin-left:auto">' +
        (loading ? "Loading…" : "Refresh") +
      "</button></div>";

    if (app) {
      html +=
        '<div class="ops-card" style="display:flex;gap:12px;align-items:center">' +
          iconMarkup(app) +
          "<div><strong>" + esc(app.name || "App") + "</strong>" +
          '<span class="sub" style="display:block;margin:2px 0 0">' +
            esc(app.bundle_identifier || app.apple_app_id || "Studio app") +
          "</span></div></div>";
    }

    var err = snapshot && snapshot.error;
    var apple = (snapshot && snapshot.apple) || {};
    var google = (snapshot && snapshot.google) || {};
    var appleErr = apple.error || "";
    var googleErr = google.error || "";
    if (err && needsVendor(err)) {
      html += vendorForm(err);
    } else if (loading && !snapshot) {
      html += '<div class="ops-empty">Loading subscriber counts…</div>';
    } else if (err) {
      html += '<div class="ops-card"><p class="sub" style="margin:0">' + esc(err) + "</p></div>";
      if (needsVendor(err)) html += vendorForm(err);
      if (needsBucket(err)) html += bucketForm(err);
    } else if (snapshot) {
      var appleReady = !!apple.ready && apple.total != null;
      var googleReady = !!google.ready && google.total != null;
      html +=
        '<div class="ops-chips">' +
          '<div class="ops-chip ok"><span class="k">Apple total subscribed</span><span class="v">' +
            (appleReady ? formatted(apple.total) : "—") + "</span></div>" +
          '<div class="ops-chip"><span class="k">Google total subscribed</span><span class="v">' +
            (googleReady ? formatted(google.total) : "—") + "</span></div>" +
          '<div class="ops-chip warn"><span class="k">Total subscriptions</span><span class="v">' +
            formatted(snapshot.total) + "</span></div>" +
        "</div>";
      var dates = [];
      if (apple.reportDate) dates.push("Apple " + apple.reportDate);
      if (google.reportDate) dates.push("Google " + google.reportDate);
      if (dates.length) html += '<p class="sub" style="margin:0 0 12px">' + esc(dates.join(" · ")) + "</p>";
      if (needsVendor(appleErr)) html += vendorForm(appleErr);
      else if (appleErr) html += '<div class="ops-card"><p class="sub" style="margin:0">' + esc(appleErr) + "</p></div>";
      else if (apple.note) html += '<div class="ops-card"><p class="sub" style="margin:0">' + esc(apple.note) + "</p></div>";
      if (needsBucket(googleErr)) html += bucketForm(googleErr);
      else if (googleErr) html += '<div class="ops-card"><p class="sub" style="margin:0">' + esc(googleErr) + "</p></div>";
      else if (google.note) html += '<div class="ops-card"><p class="sub" style="margin:0">' + esc(google.note) + "</p></div>";
      var products = apple.products || [];
      if (products.length) {
        html += '<div class="ops-card"><h3>Apple products</h3>';
        products.forEach(function (product) {
          html +=
            '<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line)">' +
              "<span>" + esc(product.name || "Subscription") + "</span>" +
              "<strong>" + formatted(product.total) + "</strong></div>";
        });
        html += "</div>";
      }
      var gProducts = google.products || [];
      if (gProducts.length) {
        html += '<div class="ops-card"><h3>Google products</h3>';
        gProducts.forEach(function (product) {
          html +=
            '<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line)">' +
              "<span>" + esc(product.name || "Subscription") + "</span>" +
              "<strong>" + formatted(product.total) + "</strong></div>";
        });
        html += "</div>";
      }
      var b = apple.breakdown || {};
      if (appleReady) {
        html +=
          '<div class="ops-card"><h3>Apple mix</h3>' +
          '<p class="sub">Paid, trials, offers, and grace period. Billing retry is shown and is not added to the total.</p>' +
          '<div class="app-metrics">' +
            "<span>Paid <b>" + formatted(b.standard) + "</b></span>" +
            "<span>Intro <b>" + formatted(b.introductory) + "</b></span>" +
            "<span>Promo <b>" + formatted(b.promotional) + "</b></span>" +
            "<span>Offer code <b>" + formatted(b.offerCode) + "</b></span>" +
            "<span>Win-back <b>" + formatted(b.winBack) + "</b></span>" +
            "<span>Grace <b>" + formatted(b.gracePeriod) + "</b></span>" +
            "<span>Billing retry <b>" + formatted(b.billingRetry) + "</b></span>" +
          "</div></div>";
      }
    } else {
      html += '<div class="ops-empty">Pick an app to load subscriber counts.</div>';
    }

    body.innerHTML = html;
    bind();
  }

  function bind() {
    root.querySelectorAll("[data-app]").forEach(function (btn) {
      btn.onclick = function () {
        selectedAppId = btn.getAttribute("data-app") || "";
        snapshot = null;
        render();
        loadCounts();
      };
    });
    var refresh = el("refresh");
    if (refresh) refresh.onclick = function () { loadCounts(); };
    var vendorInput = el("vendor");
    if (vendorInput) {
      vendorInput.oninput = function () { vendorDraft = vendorInput.value || ""; };
    }
    var saveBtn = el("save-vendor");
    if (saveBtn) saveBtn.onclick = function () { saveVendor(); };
    var bucketInput = el("bucket");
    if (bucketInput) {
      bucketInput.oninput = function () { bucketDraft = bucketInput.value || ""; };
    }
    var saveBucketBtn = el("save-bucket");
    if (saveBucketBtn) saveBucketBtn.onclick = function () { saveBucket(); };
  }

  function queryFor(app) {
    var params = new URLSearchParams();
    if (app && app.name) params.set("name", app.name);
    if (app && app.apple_app_id) params.set("appleAppId", app.apple_app_id);
    if (app && app.bundle_identifier) params.set("bundleId", app.bundle_identifier);
    if (app && app.google_package_name) params.set("googlePackage", app.google_package_name);
    return params.toString();
  }

  function loadApps() {
    if (!db) return Promise.resolve();
    return db.from("managed_apps").select("id,name,icon_path,bundle_identifier,apple_app_id,google_package_name")
      .order("name")
      .then(function (res) {
        if (res.error) throw res.error;
        apps = res.data || [];
        if (!selectedAppId || !apps.some(function (a) { return a.id === selectedAppId; })) {
          selectedAppId = pickDefaultApp();
        }
        var paths = [];
        apps.forEach(function (app) {
          if (app.icon_path && paths.indexOf(app.icon_path) < 0) paths.push(app.icon_path);
        });
        if (!paths.length || !db.storage) return;
        return db.storage.from("app-icons").createSignedUrls(paths, 3600).then(function (signed) {
          (signed.data || []).forEach(function (row) {
            if (row && row.path && row.signedUrl) iconUrls[row.path] = row.signedUrl;
          });
        });
      })
      .catch(function (err) {
        apps = [];
        showMsg((err && err.message) || "Could not load apps.", false);
      });
  }

  function loadCounts() {
    var app = selected();
    if (!app) {
      snapshot = null;
      render();
      return;
    }
    if (!window.STLLocalApi || !window.STLLocalApi.available()) {
      snapshot = { error: window.STLLocalApi ? window.STLLocalApi.message : "Studio API is not available." };
      render();
      return;
    }
    loading = true;
    showMsg("Loading subscriber counts…", true);
    render();
    window.STLLocalApi.get("/api/subscriptions?" + queryFor(app))
      .then(function (res) {
        loading = false;
        if (!res.ok) {
          snapshot = { error: (res.data && res.data.error) || "Could not load subscriber counts." };
          showMsg(snapshot.error, false);
          render();
          return;
        }
        snapshot = res.data;
        showMsg("");
        render();
      })
      .catch(function (err) {
        loading = false;
        snapshot = { error: (err && err.message) || "Could not reach the studio server." };
        showMsg(snapshot.error, false);
        render();
      });
  }

  function saveVendor() {
    var value = vendorDraft.trim();
    if (!value) {
      showMsg("Paste the Apple vendor number first.", false);
      return;
    }
    savingVendor = true;
    showMsg("Saving vendor number…", true);
    render();
    var body = { vendorNumber: value };
    var req = window.STLLocalApi && window.STLLocalApi.available()
      ? window.STLLocalApi.post("/api/subscriptions/vendor", body)
      : Promise.reject(new Error("Studio API is not available."));
    req.then(function (res) {
      savingVendor = false;
      if (!res.ok) {
        showMsg((res.data && res.data.error) || "Could not save vendor number.", false);
        render();
        return;
      }
      vendorDraft = "";
      var digits = value.replace(/\D/g, "");
      var sync = Promise.resolve();
      if (db && digits && window.STLLocalApi && window.STLLocalApi.isLocal && window.STLLocalApi.isLocal()) {
        sync = db.auth.getUser().then(function (auth) {
          var user = auth.data && auth.data.user;
          if (!user) return;
          return db.from("studio_secrets").update({ asc_vendor_number: digits }).eq("user_id", user.id);
        }).catch(function () {});
      }
      showMsg("Vendor number saved. Loading Apple subscribers…", true);
      return sync.then(function () { loadCounts(); });
    }).catch(function (err) {
      savingVendor = false;
      showMsg((err && err.message) || "Could not save vendor number.", false);
      render();
    });
  }

  function saveBucket() {
    var value = bucketDraft.trim();
    if (!value) {
      showMsg("Paste the Play Cloud Storage URI first.", false);
      return;
    }
    savingBucket = true;
    showMsg("Saving Play bucket…", true);
    render();
    var body = { bucket: value };
    var req = window.STLLocalApi && window.STLLocalApi.available()
      ? window.STLLocalApi.post("/api/subscriptions/play-bucket", body)
      : Promise.reject(new Error("Studio API is not available."));
    req.then(function (res) {
      savingBucket = false;
      if (!res.ok) {
        showMsg((res.data && res.data.error) || "Could not save Play bucket.", false);
        render();
        return;
      }
      bucketDraft = "";
      var sync = Promise.resolve();
      if (db && window.STLLocalApi && window.STLLocalApi.isLocal && window.STLLocalApi.isLocal()) {
        sync = db.auth.getUser().then(function (auth) {
          var user = auth.data && auth.data.user;
          if (!user) return;
          return db.from("studio_secrets").update({ play_gcs_bucket: value }).eq("user_id", user.id);
        }).catch(function () {});
      }
      showMsg("Play bucket saved. Loading subscriber counts…", true);
      return sync.then(function () { loadCounts(); });
    }).catch(function (err) {
      savingBucket = false;
      showMsg((err && err.message) || "Could not save Play bucket.", false);
      render();
    });
  }

  window.STLSubscribed = {
    mount: function (panel, client) {
      root = panel;
      db = client || null;
      snapshot = null;
      loading = false;
      panel.classList.add("ops-wide");
      var saveBtn = document.getElementById("global-save");
      if (saveBtn) {
        saveBtn.classList.add("hidden");
        saveBtn.disabled = true;
      }
      panel.innerHTML = shell();
      loadApps().then(function () {
        render();
        if (selectedAppId) loadCounts();
      });
    },
    unmount: function (panel) {
      if (panel) panel.classList.remove("ops-wide");
      root = null;
    }
  };
})();

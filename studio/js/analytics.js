(function () {
  "use strict";

  var root = null;
  var db = null;
  var tab = "apple";
  var snapshot = null;
  var playSnapshot = null;
  var loading = false;
  var playLoading = false;
  var keyID = "";
  var statusHint = "";
  var playHint = "";
  var playEmail = "";
  var studioApps = [];
  var openReviews = {};

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

  function money(n) {
    return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function formatted(n) {
    return (Number(n) || 0).toLocaleString("en-US");
  }

  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }

  function norm(s) {
    return String(s || "").trim().toLowerCase();
  }

  function studioMatchApple(app) {
    var appleId = norm(app && app.id);
    var bundle = norm(app && app.bundleID);
    var i;
    for (i = 0; i < studioApps.length; i += 1) {
      var row = studioApps[i];
      if (appleId && norm(row.apple_app_id) === appleId) return row;
      if (bundle && norm(row.bundle_identifier) === bundle) return row;
    }
    return null;
  }

  function studioMatchPlay(packageName) {
    var pkg = norm(packageName);
    var i;
    for (i = 0; i < studioApps.length; i += 1) {
      if (pkg && norm(studioApps[i].google_package_name) === pkg) return studioApps[i];
    }
    return null;
  }

  function iconTag(studio, fallback) {
    if (studio && studio._iconUrl) {
      return '<img class="app-icon" src="' + esc(studio._iconUrl) + '" alt="" />';
    }
    return '<span class="app-icon">' + esc(fallback || "?") + "</span>";
  }

  function prettyState(state) {
    return String(state || "")
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function pct(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    return (Number(n) * 100).toFixed(2) + "%";
  }

  function shell() {
    return (
      '<div class="analytics-workspace">' +
        '<div class="analytics-header">' +
          "<div><h1>Analytics</h1>" +
          "<p>Apple App Store Connect plus Google Play vitals and install statistics.</p></div>" +
          '<div class="actions">' +
            '<button class="btn btn-ghost" type="button" data-el="refresh">Refresh</button>' +
          "</div>" +
        "</div>" +
        '<div class="analytics-tabs">' +
          '<button type="button" class="analytics-tab is-on" data-tab="apple">Apple</button>' +
          '<button type="button" class="analytics-tab" data-tab="play">Google Play</button>' +
        "</div>" +
        '<p class="analytics-meta" data-el="meta"></p>' +
        '<p class="status analytics-banner" data-el="banner"></p>' +
        '<div class="analytics-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function renderMeta() {
    var meta = el("meta");
    if (!meta) return;
    var parts = [];
    if (tab === "play") {
      if (playEmail) parts.push(playEmail);
      if (playHint) parts.push('<span class="ok">' + esc(playHint) + "</span>");
      if (playSnapshot && playSnapshot.fetchedAt) {
        parts.push("Updated " + new Date(playSnapshot.fetchedAt).toLocaleString());
      }
    } else {
      if (keyID) parts.push("Key " + keyID);
      if (statusHint) parts.push('<span class="ok">' + esc(statusHint) + "</span>");
      if (snapshot && snapshot.fetchedAt) {
        parts.push("Updated " + new Date(snapshot.fetchedAt).toLocaleString());
      }
    }
    meta.innerHTML = parts.join(" · ");
  }

  function render() {
    renderMeta();
    root.querySelectorAll("[data-tab]").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-tab") === tab);
    });
    var body = el("body");
    if (!body) return;
    if (tab === "play") {
      renderPlay(body);
      bind();
      return;
    }

    if (!snapshot) {
      body.innerHTML =
        '<div class="analytics-card"><h3>App Store Connect</h3>' +
        '<p class="sub">' + (loading ? "Loading…" : "Refresh to load your App Store apps.") + "</p>" +
        (loading ? "" : '<button class="btn btn-primary" type="button" data-el="refresh-empty" style="min-height:32px;font-size:12px">Refresh</button>') +
        "</div>";
      bind();
      return;
    }

    var apps = snapshot.apps || [];
    var live = apps.filter(function (a) { return a.versionState === "READY_FOR_SALE"; }).length;
    var reviews = apps.reduce(function (s, a) { return s + (a.reviewCount || 0); }, 0);
    var rated = apps.map(function (a) { return a.ratingAverage; }).filter(function (v) { return v != null; });
    var rating = rated.length ? (rated.reduce(function (s, v) { return s + v; }, 0) / rated.length) : null;
    var downloads = apps.reduce(function (s, a) {
      var m = a.metrics || {};
      return s + (m.firstDownloads || 0) + (m.redownloads || 0);
    }, 0);
    var impressions = apps.reduce(function (s, a) { return s + ((a.metrics && a.metrics.impressions) || 0); }, 0);
    var proceeds = apps.reduce(function (s, a) { return s + ((a.metrics && a.metrics.proceedsUSD) || 0); }, 0);
    var hasMetrics = apps.some(function (a) { return a.analyticsReady; });

    var html =
      '<div class="analytics-chips">' +
        '<div class="analytics-chip"><span class="k">Apps on Connect</span><span class="v">' + apps.length + "</span></div>" +
        '<div class="analytics-chip ok"><span class="k">Ready for sale</span><span class="v">' + live + "</span></div>" +
        '<div class="analytics-chip warn"><span class="k">Reviews</span><span class="v">' + reviews + "</span></div>" +
        '<div class="analytics-chip warn"><span class="k">Avg rating</span><span class="v">' + (rating == null ? "—" : rating.toFixed(1)) + "</span></div>" +
      "</div>";

    if (hasMetrics) {
      html +=
        '<div class="analytics-chips">' +
          '<div class="analytics-chip ok"><span class="k">Downloads</span><span class="v">' + formatted(downloads) + "</span></div>" +
          '<div class="analytics-chip"><span class="k">Impressions</span><span class="v">' + formatted(impressions) + "</span></div>" +
          (proceeds ? '<div class="analytics-chip ok"><span class="k">Proceeds (USD)</span><span class="v">' + money(proceeds) + "</span></div>" : "") +
        "</div>";
    }

    if (snapshot.analyticsNote) {
      html += '<div class="analytics-card"><p class="sub" style="margin:0">' + esc(snapshot.analyticsNote) + "</p></div>";
    }

    html +=
      '<div class="analytics-card"><h3>Apps</h3>' +
      '<p class="sub">' + (apps.length ? (apps.length + " apps on this account.") : "No apps on this App Store Connect key.") + "</p>";

    if (!apps.length) {
      html += '<p class="sub">This key didn’t return any apps.</p>';
    } else {
      apps.forEach(function (app) {
        var m = app.metrics || {};
        var studio = studioMatchApple(app);
        var initial = ((studio && studio.name) || app.name || "?").charAt(0).toUpperCase();
        html +=
          '<div class="app-card">' +
            '<div class="app-card-top">' +
              iconTag(studio, initial) +
              "<div style=\"flex:1;min-width:0\">" +
                "<strong>" + esc((studio && studio.name) || app.name || "Untitled") + "</strong>" +
                '<span class="bundle">' + esc(app.bundleID || "") + "</span>" +
                '<div class="state">' +
                  (app.version ? "<span>v" + esc(app.version) + "</span>" : "") +
                  (app.platform ? "<span>" + esc(app.platform) + "</span>" : "") +
                  '<span class="' + (app.versionState === "READY_FOR_SALE" ? "live" : "") + '">' +
                    esc(prettyState(app.versionState) || "Unknown") +
                  "</span>" +
                "</div>" +
              "</div>" +
              (app.id
                ? '<a class="store-link" href="https://apps.apple.com/app/id' + esc(app.id) + '" target="_blank" rel="noopener">App Store</a>'
                : "") +
            "</div>" +
            '<div class="app-metrics">' +
              "<span>Apple ID <b>" + esc(app.id) + "</b></span>" +
              (app.sku ? "<span>SKU <b>" + esc(app.sku) + "</b></span>" : "") +
              "<span>Reviews <b>" + (app.reviewCount || 0) + "</b></span>" +
              (app.ratingAverage != null ? "<span>Rating <b>" + Number(app.ratingAverage).toFixed(1) + "</b></span>" : "") +
            "</div>";

        if (app.analyticsReady) {
          html +=
            '<div class="app-metrics">' +
              "<span>First downloads <b>" + formatted(m.firstDownloads) + "</b></span>" +
              "<span>Redownloads <b>" + formatted(m.redownloads) + "</b></span>" +
              "<span>Impressions <b>" + formatted(m.impressions) + "</b></span>" +
              "<span>Page views <b>" + formatted(m.pageViews) + "</b></span>" +
              (m.proceedsUSD ? "<span>Proceeds <b>" + money(m.proceedsUSD) + "</b></span>" : "") +
            "</div>";
        }

        if (app.reviews && app.reviews.length) {
          var open = !!openReviews[app.id];
          html +=
            '<button type="button" class="reviews-toggle" data-reviews="' + esc(app.id) + '">' +
              (open ? "Hide reviews" : "Show reviews") +
              " · " + app.reviews.length +
            "</button>";
          if (open) {
            app.reviews.forEach(function (review) {
              html +=
                '<div class="review">' +
                  '<div class="stars">' + "★".repeat(review.rating || 0) + "☆".repeat(Math.max(0, 5 - (review.rating || 0))) + "</div>" +
                  (review.title ? '<div class="title">' + esc(review.title) + "</div>" : "") +
                  (review.body ? '<div class="body">' + esc(review.body) + "</div>" : "") +
                  '<div class="who">' + esc([review.nickname, review.territory].filter(Boolean).join(" · ")) + "</div>" +
                "</div>";
            });
          }
        }

        html += "</div>";
      });
    }

    html += "</div>";
    body.innerHTML = html;
    bind();
  }

  function renderPlay(body) {
    if (!playSnapshot) {
      body.innerHTML =
        '<div class="analytics-card"><h3>Google Play</h3>' +
        '<p class="sub">' + (playLoading ? "Loading Play vitals and installs…" : "Refresh to load crash, ANR, and install statistics from Play Console.") + "</p>" +
        (playLoading ? "" : '<button class="btn btn-primary" type="button" data-el="refresh-empty" style="min-height:32px;font-size:12px">Refresh</button>') +
        "</div>";
      return;
    }

    var apps = playSnapshot.apps || [];
    var crashRates = apps.map(function (a) { return a.crash && a.crash.latest && a.crash.latest.rate; }).filter(function (v) { return v != null; });
    var anrRates = apps.map(function (a) { return a.anr && a.anr.latest && a.anr.latest.rate; }).filter(function (v) { return v != null; });
    var avgCrash = crashRates.length ? crashRates.reduce(function (s, v) { return s + v; }, 0) / crashRates.length : null;
    var avgAnr = anrRates.length ? anrRates.reduce(function (s, v) { return s + v; }, 0) / anrRates.length : null;
    var activeDevices = apps.reduce(function (s, a) {
      var installs = a.installs || {};
      return s + (installs.ready ? (Number(installs.activeDeviceInstalls) || 0) : 0);
    }, 0);
    var installs7d = apps.reduce(function (s, a) {
      var installs = a.installs || {};
      return s + (installs.ready ? (Number(installs.userInstalls7d) || 0) : 0);
    }, 0);
    var uninstalls7d = apps.reduce(function (s, a) {
      var installs = a.installs || {};
      return s + (installs.ready ? (Number(installs.userUninstalls7d) || 0) : 0);
    }, 0);
    var hasInstalls = apps.some(function (a) { return a.installs && a.installs.ready; });

    var html =
      '<div class="analytics-chips">' +
        '<div class="analytics-chip"><span class="k">Android apps</span><span class="v">' + apps.length + "</span></div>" +
        '<div class="analytics-chip warn"><span class="k">Avg crash rate</span><span class="v">' + pct(avgCrash) + "</span></div>" +
        '<div class="analytics-chip warn"><span class="k">Avg ANR rate</span><span class="v">' + pct(avgAnr) + "</span></div>" +
      "</div>";

    if (hasInstalls) {
      html +=
        '<div class="analytics-chips">' +
          '<div class="analytics-chip ok"><span class="k">Active devices</span><span class="v">' + formatted(activeDevices) + "</span></div>" +
          '<div class="analytics-chip ok"><span class="k">User installs (7d)</span><span class="v">' + formatted(installs7d) + "</span></div>" +
          '<div class="analytics-chip"><span class="k">User uninstalls (7d)</span><span class="v">' + formatted(uninstalls7d) + "</span></div>" +
        "</div>";
    }

    if (playSnapshot.note) {
      html += '<div class="analytics-card"><p class="sub" style="margin:0">' + esc(playSnapshot.note) + "</p></div>";
    }

    html +=
      '<div class="analytics-card"><h3>Play vitals and installs</h3>' +
      '<p class="sub">Crash/ANR from the last 14 days. Install counts from Play Download reports overview. Package names come from Apps (Google package) plus secrets/play_packages.txt.</p>';

    if (!apps.length) {
      html +=
        '<p class="sub">No Android package names yet. Add a Google package name on the Apps page (e.g. com.stlapps.yourapp), or put one package per line in secrets/play_packages.txt.</p>';
    } else {
      apps.forEach(function (app) {
        var crash = app.crash || {};
        var anr = app.anr || {};
        var installs = app.installs || {};
        var studio = studioMatchPlay(app.packageName);
        html +=
          '<div class="app-card">' +
            '<div class="app-card-top">' +
              iconTag(studio, "▶") +
              "<div style=\"flex:1;min-width:0\">" +
                "<strong>" + esc((studio && studio.name) || app.packageName) + "</strong>" +
                '<span class="bundle">' + esc(app.packageName) + "</span>" +
              "</div>" +
              '<a class="store-link" href="https://play.google.com/store/apps/details?id=' + encodeURIComponent(app.packageName) + '" target="_blank" rel="noopener">Play Store</a>' +
            "</div>" +
            (app.error ? '<p class="sub" style="margin:8px 0 0">' + esc(app.error) + "</p>" : "") +
            '<div class="app-metrics">' +
              "<span>Crash <b>" + pct(crash.latest && crash.latest.rate) + "</b></span>" +
              "<span>Crash 14-day avg <b>" + pct(crash.average) + "</b></span>" +
              "<span>ANR <b>" + pct(anr.latest && anr.latest.rate) + "</b></span>" +
              "<span>ANR 14-day avg <b>" + pct(anr.average) + "</b></span>" +
            "</div>";

        if (installs.ready) {
          html +=
            '<div class="app-metrics">' +
              "<span>Active devices <b>" + formatted(installs.activeDeviceInstalls) + "</b></span>" +
              "<span>User installs (latest day) <b>" + formatted(installs.dailyUserInstalls) + "</b></span>" +
              "<span>Device installs (latest day) <b>" + formatted(installs.dailyDeviceInstalls) + "</b></span>" +
              "<span>User installs (7d) <b>" + formatted(installs.userInstalls7d) + "</b></span>" +
              "<span>User uninstalls (7d) <b>" + formatted(installs.userUninstalls7d) + "</b></span>" +
              (installs.reportDate ? "<span>Report date <b>" + esc(installs.reportDate) + "</b></span>" : "") +
            "</div>";
          if (installs.countries && installs.countries.length) {
            html += '<div class="app-metrics">';
            installs.countries.forEach(function (country) {
              html +=
                "<span>" + esc(country.code) +
                " <b>" + formatted(country.activeDeviceInstalls) + "</b> active" +
                (country.dailyUserInstalls
                  ? " · " + formatted(country.dailyUserInstalls) + " installs"
                  : "") +
                "</span>";
            });
            html += "</div>";
          }
        } else if (installs.error) {
          html += '<p class="sub" style="margin:8px 0 0">' + esc(installs.error) + "</p>";
        }

        html += "</div>";
      });
    }
    html += "</div>";
    body.innerHTML = html;
  }

  function bind() {
    root.querySelectorAll("[data-tab]").forEach(function (btn) {
      btn.onclick = function () {
        tab = btn.getAttribute("data-tab") || "apple";
        render();
        if (tab === "play" && !playSnapshot && !playLoading) loadPlay();
        if (tab === "apple" && !snapshot && !loading) load(false);
      };
    });
    var refresh = el("refresh");
    if (refresh) refresh.onclick = function () {
      if (tab === "play") loadPlay();
      else load(true);
    };
    var empty = el("refresh-empty");
    if (empty) empty.onclick = function () {
      if (tab === "play") loadPlay();
      else load(true);
    };
    root.querySelectorAll("[data-reviews]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-reviews");
        if (!id) return;
        openReviews[id] = !openReviews[id];
        render();
      };
    });
  }

  function loadStatus() {
    if (!window.STLLocalApi || !window.STLLocalApi.available()) {
      statusHint = "Mac only";
      playHint = "Mac only";
      return Promise.resolve();
    }
    return Promise.all([
      window.STLLocalApi.get("/api/asc/status").then(function (res) { return res.data || {}; }).catch(function () { return {}; }),
      window.STLLocalApi.get("/api/play/status").then(function (res) { return res.data || {}; }).catch(function () { return {}; })
    ]).then(function (pair) {
      var apple = pair[0] || {};
      var play = pair[1] || {};
      keyID = apple.keyID || "";
      statusHint = apple.configured ? "Connected" : "Not configured";
      playEmail = play.serviceAccount || "";
      playHint = play.configured ? "Connected" : "Not configured";
    }).catch(function () {
      statusHint = "Proxy offline — restart with python3 server.py";
      playHint = "Proxy offline";
    });
  }

  function loadStudioApps() {
    if (!db) return Promise.resolve();
    return db.from("managed_apps").select("name,icon_path,bundle_identifier,apple_app_id,google_package_name")
      .then(function (res) {
        studioApps = res.data || [];
        var paths = [];
        studioApps.forEach(function (app) {
          if (app.icon_path && paths.indexOf(app.icon_path) < 0) paths.push(app.icon_path);
        });
        if (!paths.length) return;
        return db.storage.from("app-icons").createSignedUrls(paths, 3600).then(function (signed) {
          var map = {};
          (signed.data || []).forEach(function (row) {
            if (row && row.path && row.signedUrl) map[row.path] = row.signedUrl;
          });
          studioApps.forEach(function (app) {
            app._iconUrl = map[app.icon_path] || "";
          });
        });
      })
      .catch(function () {
        studioApps = studioApps || [];
      });
  }

  function playPackages() {
    if (!db) return Promise.resolve([]);
    return db.from("managed_apps").select("google_package_name").then(function (res) {
      var names = [];
      (res.data || []).forEach(function (app) {
        var pkg = String(app.google_package_name || "").trim();
        if (pkg && names.indexOf(pkg) < 0) names.push(pkg);
      });
      return names;
    }).catch(function () { return []; });
  }

  function loadPlay() {
    if (playLoading) return;
    if (!window.STLLocalApi || !window.STLLocalApi.available()) {
      playSnapshot = null;
      showMsg(window.STLLocalApi.message, false);
      render();
      return;
    }
    playLoading = true;
    showMsg("Loading Google Play vitals and installs…", true);
    render();
    playPackages().then(function (names) {
      var q = names.length ? ("?packages=" + encodeURIComponent(names.join(","))) : "";
      return window.STLLocalApi.get("/api/play/snapshot" + q);
    }).then(function (res) {
      playLoading = false;
      if (!res.ok) {
        playSnapshot = null;
        showMsg((res.data && res.data.error) || "Could not load Google Play.", false);
        render();
        return;
      }
      playSnapshot = res.data;
      if (playSnapshot.serviceAccount) playEmail = playSnapshot.serviceAccount;
      playHint = playSnapshot.configured ? "Connected" : "Not configured";
      showMsg("");
      render();
    }).catch(function (err) {
      playLoading = false;
      showMsg((err && err.message) || "Could not reach the studio server. Run python3 server.py", false);
      render();
    });
  }

  function load(full) {
    if (loading) return;
    loading = true;
    showMsg(full ? "Loading apps + analytics…" : "Loading apps…", true);
    render();

    if (!window.STLLocalApi || !window.STLLocalApi.available()) {
      loading = false;
      snapshot = null;
      showMsg(window.STLLocalApi.message, false);
      render();
      return;
    }

    // Fast pass first (apps/versions/reviews), then enrich metrics.
    window.STLLocalApi.get("/api/asc/snapshot?metrics=0")
      .then(function (res) {
        if (!res.ok) {
          loading = false;
          snapshot = null;
          showMsg((res.data && res.data.error) || "Could not load App Store Connect.", false);
          render();
          return null;
        }
        snapshot = res.data;
        if (snapshot.keyID) keyID = snapshot.keyID;
        showMsg("Apps loaded. Pulling analytics reports…", true);
        render();
        return window.STLLocalApi.get("/api/asc/snapshot?metrics=1");
      })
      .then(function (res) {
        loading = false;
        if (!res) return;
        if (!res.ok) {
          showMsg((res.data && res.data.error) || "Could not load analytics reports.", false);
          render();
          return;
        }
        snapshot = res.data;
        if (snapshot.keyID) keyID = snapshot.keyID;
        showMsg("");
        render();
      })
      .catch(function (err) {
        loading = false;
        showMsg((err && err.message) || "Could not reach the studio server. Run python3 server.py", false);
        render();
      });
  }

  window.STLAnalytics = {
    mount: function (panel, client) {
      root = panel;
      db = client || null;
      tab = "apple";
      snapshot = null;
      playSnapshot = null;
      studioApps = [];
      loading = false;
      playLoading = false;
      panel.classList.add("analytics-wide");
      var saveBtn = document.getElementById("global-save");
      if (saveBtn) {
        saveBtn.classList.add("hidden");
        saveBtn.disabled = true;
      }
      panel.innerHTML = shell();
      loadStatus().then(function () {
        return loadStudioApps();
      }).then(function () {
        render();
        load(false);
      });
    },
    unmount: function (panel) {
      if (panel) panel.classList.remove("analytics-wide");
      root = null;
    }
  };
})();

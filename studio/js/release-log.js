(function () {
  "use strict";

  var APPS = [
    { key: "permitpath", name: "Permit Path" },
    { key: "haulpath", name: "HaulPath" },
    { key: "pc4h", name: "Pilot Car 4 Hire" }
  ];

  var root = null;
  var db = null;
  var rows = [];

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

  function trim(s) {
    return String(s == null ? "" : s).trim();
  }

  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }

  function missingTable(err) {
    return /does not exist|schema cache/i.test((err && err.message) || "");
  }

  function hint(err) {
    if (missingTable(err)) return "Run sql/058_app_releases.sql in Supabase, then refresh.";
    return (err && err.message) || "Could not load Release log.";
  }

  function liveOf(appKey, platform) {
    return rows.filter(function (r) {
      return r.kind === "live" && r.app_key === appKey && r.platform === platform;
    })[0] || null;
  }

  function pushedOf(appKey, platform) {
    return rows.filter(function (r) {
      return r.kind === "pushed" && r.app_key === appKey && r.platform === platform;
    }).sort(function (a, b) {
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  }

  function historyRows() {
    return rows.filter(function (r) { return r.kind === "history"; }).sort(function (a, b) {
      return String(b.replaced_at || b.created_at || "").localeCompare(String(a.replaced_at || a.created_at || ""));
    });
  }

  function appName(key) {
    var hit = APPS.filter(function (a) { return a.key === key; })[0];
    return hit ? hit.name : key;
  }

  function platformLabel(platform) {
    return platform === "ios" ? "iOS" : "Android";
  }

  function formatWhen(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function liveFields(appKey, platform) {
    var live = liveOf(appKey, platform) || { version: "", build: "" };
    if (platform === "ios") {
      return (
        '<label><span>Build</span><input data-live-build="' + appKey + '" data-platform="' + platform + '" type="text" value="' + esc(live.build) + '" /></label>' +
        '<label><span>Version</span><input data-live-version="' + appKey + '" data-platform="' + platform + '" type="text" value="' + esc(live.version) + '" /></label>'
      );
    }
    return (
      '<label><span>Version</span><input data-live-version="' + appKey + '" data-platform="' + platform + '" type="text" value="' + esc(live.version) + '" /></label>' +
      '<label><span>Version number</span><input data-live-build="' + appKey + '" data-platform="' + platform + '" type="text" value="' + esc(live.build) + '" /></label>'
    );
  }

  function pushedBlock(appKey, platform) {
    var list = pushedOf(appKey, platform);
    var buildPh = platform === "ios" ? "Build" : "Version number";
    return (
      '<div class="rl-wait">' +
        '<div class="rl-tags">' +
          (list.length
            ? list.map(function (item) {
              var label = [item.version, item.build].filter(Boolean).join(" · ") || "Untitled";
              return '<button class="rl-tag" type="button" data-del="' + esc(item.id) + '">' + esc(label) + '<span aria-hidden="true">x</span></button>';
            }).join("")
            : '<span class="rl-empty">None waiting</span>') +
        '</div>' +
        '<div class="rl-add-pushed">' +
          '<input data-push-version="' + appKey + '" data-platform="' + platform + '" type="text" placeholder="Version" />' +
          '<input data-push-build="' + appKey + '" data-platform="' + platform + '" type="text" placeholder="' + buildPh + '" />' +
          '<button class="btn btn-ghost" type="button" data-push="' + appKey + '" data-platform="' + platform + '">Add</button>' +
        '</div>' +
      '</div>'
    );
  }

  function appRow(app, platform) {
    return (
      '<div class="rl-app">' +
        '<div class="rl-app-name">' + esc(app.name) + '</div>' +
        '<div class="rl-live">' + liveFields(app.key, platform) + '</div>' +
        pushedBlock(app.key, platform) +
      '</div>'
    );
  }

  function platformBlock(title, platform) {
    return (
      '<section class="rl-block">' +
        '<div class="rl-head">' +
          '<h2>' + esc(title) + '</h2>' +
          '<div class="rl-legend"><span>Live</span><span>Waiting</span></div>' +
        '</div>' +
        APPS.map(function (app) { return appRow(app, platform); }).join("") +
      '</section>'
    );
  }

  function historyTable(title, heads, list, cellsFn) {
    if (!list.length) return "";
    return (
      '<h3 class="rl-sub">' + esc(title) + '</h3>' +
      '<table class="rl-table"><thead><tr>' +
        heads.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      list.map(function (row) {
        return "<tr>" + cellsFn(row).map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>";
      }).join("") +
      "</tbody></table>"
    );
  }

  function historyTables(hist) {
    var ios = hist.filter(function (row) { return row.platform === "ios"; });
    var android = hist.filter(function (row) { return row.platform === "android"; });
    if (!ios.length && !android.length) {
      return '<p class="rl-empty">When you change a live version, the old one lands here.</p>';
    }
    return (
      historyTable("iOS", ["When", "App", "Build", "Version"], ios, function (row) {
        return [formatWhen(row.replaced_at || row.created_at), appName(row.app_key), row.build || "—", row.version || "—"];
      }) +
      historyTable("Android", ["When", "App", "Version", "Version number"], android, function (row) {
        return [formatWhen(row.replaced_at || row.created_at), appName(row.app_key), row.version || "—", row.build || "—"];
      })
    );
  }

  function render() {
    var box = el("body");
    if (!box) return;
    var hist = historyRows();
    box.innerHTML =
      '<p class="rl-lede">Current live store versions, builds waiting in review, and versions you replaced.</p>' +
      platformBlock("iOS", "ios") +
      platformBlock("Android", "android") +
      '<section class="rl-block">' +
        '<div class="rl-head"><h2>Replaced</h2></div>' +
        historyTables(hist) +
      '</section>';
    bind();
  }

  function bind() {
    root.querySelectorAll("[data-live-version], [data-live-build]").forEach(function (input) {
      input.onchange = function () {
        saveLive(input.getAttribute("data-live-version") || input.getAttribute("data-live-build"), input.getAttribute("data-platform"));
      };
    });
    root.querySelectorAll("[data-push]").forEach(function (btn) {
      btn.onclick = function () {
        addPushed(btn.getAttribute("data-push"), btn.getAttribute("data-platform"));
      };
    });
    root.querySelectorAll("[data-del]").forEach(function (btn) {
      btn.onclick = function () { removeRow(btn.getAttribute("data-del")); };
    });
  }

  function rowInputs(appKey, platform) {
    var v = root.querySelector('[data-live-version="' + appKey + '"][data-platform="' + platform + '"]');
    var b = root.querySelector('[data-live-build="' + appKey + '"][data-platform="' + platform + '"]');
    return { version: trim(v && v.value), build: trim(b && b.value) };
  }

  function saveLive(appKey, platform) {
    var next = rowInputs(appKey, platform);
    var cur = liveOf(appKey, platform);
    if (cur && cur.version === next.version && cur.build === next.build) return;
    var jobs = [];
    if (cur && (trim(cur.version) || trim(cur.build))) {
      jobs.push(db.from("app_releases").insert({
        app_key: appKey,
        platform: platform,
        kind: "history",
        version: cur.version || "",
        build: cur.build || "",
        replaced_at: new Date().toISOString()
      }));
      jobs.push(db.from("app_releases").update({
        version: next.version,
        build: next.build
      }).eq("id", cur.id));
    } else if (cur) {
      jobs.push(db.from("app_releases").update({
        version: next.version,
        build: next.build
      }).eq("id", cur.id));
    } else {
      jobs.push(db.from("app_releases").insert({
        app_key: appKey,
        platform: platform,
        kind: "live",
        version: next.version,
        build: next.build
      }));
    }
    Promise.all(jobs).then(function (parts) {
      var err = parts.filter(function (p) { return p && p.error; })[0];
      if (err) return showMsg(hint(err.error), false);
      showMsg("Saved.", true);
      load();
    }).catch(function (err) {
      showMsg(hint(err), false);
    });
  }

  function addPushed(appKey, platform) {
    var v = root.querySelector('[data-push-version="' + appKey + '"][data-platform="' + platform + '"]');
    var b = root.querySelector('[data-push-build="' + appKey + '"][data-platform="' + platform + '"]');
    var version = trim(v && v.value);
    var build = trim(b && b.value);
    if (!version && !build) return showMsg("Enter a version or build.", false);
    db.from("app_releases").insert({
      app_key: appKey,
      platform: platform,
      kind: "pushed",
      version: version,
      build: build
    }).then(function (res) {
      if (res.error) return showMsg(hint(res.error), false);
      showMsg("Pushed version added.", true);
      load();
    });
  }

  function removeRow(id) {
    db.from("app_releases").delete().eq("id", id).then(function (res) {
      if (res.error) return showMsg(hint(res.error), false);
      showMsg("Removed.", true);
      load();
    });
  }

  function load() {
    return db.from("app_releases").select("*").order("created_at", { ascending: false }).then(function (res) {
      if (res.error) {
        showMsg(hint(res.error), false);
        rows = [];
        render();
        return;
      }
      rows = res.data || [];
      render();
    }).catch(function (err) {
      showMsg(hint(err), false);
      rows = [];
      render();
    });
  }

  window.STLReleaseLog = {
    mount: function (panel, client) {
      root = panel;
      db = client;
      root.innerHTML =
        '<div class="rl-workspace">' +
          '<p class="status ops-banner" data-el="banner"></p>' +
          '<div data-el="body"></div>' +
        '</div>';
      return load();
    },
    shown: function () {
      if (db) load();
    },
    unmount: function () {
      root = null;
      db = null;
    }
  };
})();

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
  var saveTimers = {};
  var onlyKey = "";

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

  function visibleApps() {
    if (!onlyKey) return APPS;
    return APPS.filter(function (app) { return app.key === onlyKey; });
  }

  function historyRows() {
    return rows.filter(function (r) {
      if (r.kind !== "history") return false;
      if (onlyKey && r.app_key !== onlyKey) return false;
      return true;
    }).sort(function (a, b) {
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

  function waitingOf(appKey, platform) {
    return pushedOf(appKey, platform)[0] || null;
  }

  function pushedBlock(appKey, platform) {
    var list = pushedOf(appKey, platform);
    var draft = list[0] || { version: "", build: "" };
    var extras = list.slice(1);
    var buildPh = platform === "ios" ? "Build" : "Version number";
    return (
      '<div class="rl-wait">' +
        (extras.length
          ? '<div class="rl-tags">' + extras.map(function (item) {
            var label = [item.version, item.build].filter(Boolean).join(" · ") || "Untitled";
            return '<button class="rl-tag" type="button" data-del="' + esc(item.id) + '">' + esc(label) + '<span aria-hidden="true">x</span></button>';
          }).join("") + '</div>'
          : '') +
        '<div class="rl-add-pushed">' +
          '<input data-push-version="' + appKey + '" data-platform="' + platform + '" type="text" placeholder="Version" value="' + esc(draft.version) + '" />' +
          '<input data-push-build="' + appKey + '" data-platform="' + platform + '" type="text" placeholder="' + buildPh + '" value="' + esc(draft.build) + '" />' +
          '<button class="btn btn-ghost" type="button" data-push="' + appKey + '" data-platform="' + platform + '">Push</button>' +
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
        visibleApps().map(function (app) { return appRow(app, platform); }).join("") +
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
    var iosHeads = onlyKey ? ["When", "Build", "Version"] : ["When", "App", "Build", "Version"];
    var androidHeads = onlyKey ? ["When", "Version", "Version number"] : ["When", "App", "Version", "Version number"];
    return (
      historyTable("iOS", iosHeads, ios, function (row) {
        var cells = [formatWhen(row.replaced_at || row.created_at), trim(row.build) || "—", trim(row.version) || "—"];
        if (!onlyKey) cells.splice(1, 0, appName(row.app_key));
        return cells;
      }) +
      historyTable("Android", androidHeads, android, function (row) {
        var cells = [formatWhen(row.replaced_at || row.created_at), trim(row.version) || "—", trim(row.build) || "—"];
        if (!onlyKey) cells.splice(1, 0, appName(row.app_key));
        return cells;
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
        queueSaveLive(input.getAttribute("data-live-version") || input.getAttribute("data-live-build"), input.getAttribute("data-platform"));
      };
    });
    root.querySelectorAll("[data-push-version], [data-push-build]").forEach(function (input) {
      input.onchange = function () {
        queueSaveWaiting(input.getAttribute("data-platform") ? appKeyFromWaiting(input) : "", input.getAttribute("data-platform"));
      };
    });
    root.querySelectorAll("[data-push]").forEach(function (btn) {
      btn.onclick = function () {
        pushToLive(btn.getAttribute("data-push"), btn.getAttribute("data-platform"));
      };
    });
    root.querySelectorAll("[data-del]").forEach(function (btn) {
      btn.onclick = function () { removeRow(btn.getAttribute("data-del")); };
    });
  }

  function appKeyFromWaiting(input) {
    return input.getAttribute("data-push-version") || input.getAttribute("data-push-build") || "";
  }

  function rowInputs(appKey, platform) {
    var v = root.querySelector('[data-live-version="' + appKey + '"][data-platform="' + platform + '"]');
    var b = root.querySelector('[data-live-build="' + appKey + '"][data-platform="' + platform + '"]');
    return { version: trim(v && v.value), build: trim(b && b.value) };
  }

  function waitingInputs(appKey, platform) {
    var v = root.querySelector('[data-push-version="' + appKey + '"][data-platform="' + platform + '"]');
    var b = root.querySelector('[data-push-build="' + appKey + '"][data-platform="' + platform + '"]');
    return { version: trim(v && v.value), build: trim(b && b.value) };
  }

  function fillingIn(cur, next) {
    if (!cur) return true;
    var oldV = trim(cur.version);
    var oldB = trim(cur.build);
    var newV = trim(next.version);
    var newB = trim(next.build);
    if (!oldV && !oldB) return true;
    if (oldV === newV && oldB === newB) return true;
    if (!oldV && newV && oldB === newB) return true;
    if (!oldB && newB && oldV === newV) return true;
    return false;
  }

  function queueSaveLive(appKey, platform) {
    var key = "live:" + appKey + ":" + platform;
    if (saveTimers[key]) clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(function () {
      saveTimers[key] = null;
      saveLive(appKey, platform);
    }, 400);
  }

  function queueSaveWaiting(appKey, platform) {
    var key = "wait:" + appKey + ":" + platform;
    if (saveTimers[key]) clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(function () {
      saveTimers[key] = null;
      saveWaiting(appKey, platform);
    }, 400);
  }

  function saveWaiting(appKey, platform) {
    var next = waitingInputs(appKey, platform);
    var cur = waitingOf(appKey, platform);
    if (cur && trim(cur.version) === next.version && trim(cur.build) === next.build) return;
    var job;
    if (!next.version && !next.build) {
      if (!cur) return;
      job = db.from("app_releases").delete().eq("id", cur.id);
    } else if (cur) {
      job = db.from("app_releases").update({
        version: next.version,
        build: next.build
      }).eq("id", cur.id);
    } else {
      job = db.from("app_releases").insert({
        app_key: appKey,
        platform: platform,
        kind: "pushed",
        version: next.version,
        build: next.build
      });
    }
    job.then(function (res) {
      if (res.error) return showMsg(hint(res.error), false);
      showMsg("Saved in waiting.", true);
      load();
    }).catch(function (err) {
      showMsg(hint(err), false);
    });
  }

  function saveLive(appKey, platform, explicitNext) {
    var next = explicitNext || rowInputs(appKey, platform);
    var cur = liveOf(appKey, platform);
    if (cur && trim(cur.version) === next.version && trim(cur.build) === next.build) return Promise.resolve(true);
    var jobs = [];
    if (cur && (trim(cur.version) || trim(cur.build)) && !fillingIn(cur, next)) {
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
    return Promise.all(jobs).then(function (parts) {
      var err = parts.filter(function (p) { return p && p.error; })[0];
      if (err) {
        showMsg(hint(err.error), false);
        return false;
      }
      showMsg(explicitNext ? "Pushed live." : "Saved.", true);
      if (!explicitNext) load();
      return true;
    }).catch(function (err) {
      showMsg(hint(err), false);
      return false;
    });
  }

  function pushToLive(appKey, platform) {
    var next = waitingInputs(appKey, platform);
    var waiting = waitingOf(appKey, platform);
    if (!next.version && !next.build) return showMsg("Enter a version or build.", false);
    saveLive(appKey, platform, next).then(function (ok) {
      if (!ok || !waiting) return;
      db.from("app_releases").delete().eq("id", waiting.id).then(function () { load(); });
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
    mount: function (panel, client, opts) {
      root = panel;
      db = client;
      onlyKey = (opts && opts.appKey) || "";
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
      onlyKey = "";
    }
  };
})();

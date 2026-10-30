(function () {
  "use strict";

  var APPS = {
    permitpath: { name: "Permit Path", section: "permitPathAdmin" },
    haulpath: { name: "HaulPath", section: "haulPathAdmin" },
    pc4h: { name: "Pilot Car 4 Hire", section: "pc4hAdmin" }
  };

  var PANES = [
    { id: "app", title: "App" },
    { id: "promos", title: "Promos" },
    { id: "analytics", title: "Analytics" },
    { id: "release", title: "Release log" },
    { id: "tos", title: "TOS Accepted", only: "permitpath" }
  ];

  var generation = 0;
  var currentHost = null;
  var currentKey = "";
  var currentPane = "";
  var active = null;

  function compact(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function appKeyOf(app) {
    if (!app) return "";
    var name = compact(app.name);
    var bundle = String(app.bundle_identifier || "").toLowerCase();
    var pkg = String(app.google_package_name || "").toLowerCase();
    if (name.indexOf("permitpath") !== -1 || bundle.indexOf("permitpath") !== -1 || pkg.indexOf("permitpath") !== -1) {
      return "permitpath";
    }
    if (
      name.indexOf("pilotcar") !== -1 || name.indexOf("pc4h") !== -1 ||
      bundle.indexOf("pilotcar") !== -1 || pkg.indexOf("pilotcar") !== -1 ||
      bundle.indexOf("pc4h") !== -1 || pkg.indexOf("pc4h") !== -1
    ) {
      return "pc4h";
    }
    if (name.indexOf("haulpath") !== -1 || bundle.indexOf("haulpath") !== -1 || pkg.indexOf("haulpath") !== -1) {
      return "haulpath";
    }
    return "";
  }

  function nameFor(key) {
    return (APPS[key] && APPS[key].name) || "";
  }

  function sectionFor(app) {
    var row = APPS[appKeyOf(app)];
    return row ? row.section : "";
  }

  function panesFor(key) {
    return PANES.filter(function (pane) { return !pane.only || pane.only === key; });
  }

  function hasPane(key, id) {
    return panesFor(key).some(function (pane) { return pane.id === id; });
  }

  function isPane(id) {
    return PANES.some(function (pane) { return pane.id === id; });
  }

  function pick(rows, key) {
    var matches = (rows || []).filter(function (app) { return appKeyOf(app) === key; });
    if (!matches.length) return null;
    var want = compact(nameFor(key));
    var exact = matches.filter(function (app) { return compact(app.name) === want; })[0];
    return exact || matches[0];
  }

  function pills(key, attr) {
    var name = attr || "data-tab";
    return panesFor(key).map(function (pane) {
      return '<button type="button" class="ops-pill" ' + name + '="' + pane.id + '">' + pane.title + "</button>";
    }).join("");
  }

  function resolveId(client, key) {
    if (!client || !client.from) return Promise.resolve("");
    return client.from("managed_apps").select("id,name,bundle_identifier,google_package_name").then(function (res) {
      var hit = pick(res.data || [], key);
      return hit ? hit.id : "";
    }).catch(function () { return ""; });
  }

  function usesGlobalSave() {
    return currentPane === "app" || currentPane === "promos";
  }

  function isDirty() {
    return !!(active && active.isDirty && active.isDirty());
  }

  function syncSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    if (!usesGlobalSave()) {
      btn.classList.add("hidden");
      btn.disabled = true;
      return;
    }
    btn.classList.remove("hidden");
    btn.disabled = !isDirty();
    if (btn.textContent !== "Saving…") btn.textContent = "Save";
  }

  function confirmLeave() {
    if (!isDirty()) return true;
    return window.confirm("You have unsaved changes. Leave without saving?");
  }

  function unmountModules(host) {
    if (host && currentHost && currentHost !== host) return;
    generation += 1;
    var host = currentHost;
    var mod = active;
    active = null;
    currentHost = null;
    currentKey = "";
    currentPane = "";
    if (host) host.classList.remove("is-studio");
    if (mod && mod.unmount) {
      try { mod.unmount(host); } catch (err) {}
    }
  }

  function mount(host, client, key, pane) {
    if (!host || !APPS[key] || !hasPane(key, pane)) return;
    if (currentHost === host && currentKey === key && currentPane === pane && active) {
      if (active.shown) active.shown();
      syncSave();
      return;
    }
    unmountModules();
    var my = generation;
    currentHost = host;
    currentKey = key;
    currentPane = pane;
    host.classList.add("is-studio");

    if (pane === "app" && window.STLApps) {
      window.STLApps.mount(host, client, { embed: true, appKey: key });
      active = window.STLApps;
      syncSave();
      return;
    }
    if (pane === "release" && window.STLReleaseLog) {
      window.STLReleaseLog.mount(host, client, { appKey: key });
      active = window.STLReleaseLog;
      syncSave();
      return;
    }
    if (pane === "tos" && window.STLTos) {
      window.STLTos.mount(host);
      if (window.STLTos.setApp) window.STLTos.setApp();
      active = window.STLTos;
      syncSave();
      return;
    }

    host.innerHTML = '<div class="ops-empty">Loading…</div>';
    resolveId(client, key).then(function (id) {
      if (my !== generation || currentHost !== host) return;
      if (pane === "promos" && window.STLPromos) {
        window.STLPromos.mount(host, client, { embed: true, appId: id });
        active = window.STLPromos;
      } else if (pane === "analytics" && window.STLAnalytics) {
        window.STLAnalytics.mount(host, client, { embed: true, appId: id });
        active = window.STLAnalytics;
      }
      syncSave();
    });
  }

  function shown() {
    if (currentPane === "app" && active && active.reload && !isDirty()) active.reload();
    else if (active && active.shown) active.shown();
    syncSave();
  }

  function saveAll() {
    if (active && active.saveAll) return active.saveAll();
  }

  window.STLAppPanels = {
    appKeyOf: appKeyOf,
    nameFor: nameFor,
    sectionFor: sectionFor,
    pick: pick,
    pills: pills,
    hasPane: hasPane,
    isPane: isPane,
    mount: mount,
    unmount: unmountModules,
    shown: shown,
    saveAll: saveAll,
    isDirty: isDirty,
    usesGlobalSave: usesGlobalSave,
    syncSave: syncSave,
    confirmLeave: confirmLeave
  };
})();

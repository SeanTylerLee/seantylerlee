(function () {
  "use strict";

  var PLATFORMS = [
    { id: "iOS", title: "iOS" },
    { id: "Android", title: "Android" },
    { id: "Both", title: "iOS + Android" }
  ];
  var KINDS = [
    { id: "free_trial", title: "Free trial" },
    { id: "intro_price", title: "Intro price" },
    { id: "promo_code", title: "Promo code" },
    { id: "other", title: "Other" }
  ];
  var DURATIONS = ["1 week", "1 month", "2 months", "3 months", "Custom"];
  var ELIGIBILITY = [
    { id: "new", title: "New subscribers" },
    { id: "lapsed", title: "Lapsed subscribers" },
    { id: "all", title: "Everyone" },
    { id: "other", title: "Other" }
  ];
  var STATUSES = [
    { id: "draft", title: "Draft" },
    { id: "scheduled", title: "Scheduled" },
    { id: "live", title: "Live" },
    { id: "ended", title: "Ended" }
  ];
  var SQL_HINT = "Run sql/025_app_promos.sql in Studio Supabase, then refresh.";

  var root = null;
  var db = null;
  var apps = [];
  var promos = [];
  var selectedAppId = "all";
  var expandedId = null;
  var dirty = false;
  var saving = false;

  function el(name) { return root ? root.querySelector('[data-el="' + name + '"]') : null; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function trim(s) { return String(s == null ? "" : s).trim(); }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }
  function schemaMissing(err) {
    return /does not exist|schema cache|Could not find the table/i.test((err && err.message) || "");
  }
  function syncSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.disabled = !dirty || saving;
    btn.textContent = saving ? "Saving…" : "Save";
  }
  function hideSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }
  function markDirty() { dirty = true; syncSave(); showMsg("Unsaved changes", true); }
  function clearDirty() { dirty = false; syncSave(); }

  function options(list, selected, titleKey, idKey) {
    titleKey = titleKey || "title";
    idKey = idKey || "id";
    return list.map(function (item) {
      var id = typeof item === "string" ? item : item[idKey];
      var title = typeof item === "string" ? item : item[titleKey];
      return '<option value="' + esc(id) + '"' + (id === selected ? " selected" : "") + ">" + esc(title) + "</option>";
    }).join("");
  }

  function kindTitle(id) {
    var row = KINDS.filter(function (k) { return k.id === id; })[0];
    return row ? row.title : (id || "Promo");
  }
  function eligibilityTitle(id) {
    var row = ELIGIBILITY.filter(function (k) { return k.id === id; })[0];
    return row ? row.title : (id || "");
  }

  function displayStatus(promo) {
    var stored = promo.status || "draft";
    if (stored === "draft") return "draft";
    if (stored === "ended") return "ended";
    var today = todayISO();
    if (promo.start_date && promo.start_date > today) return "scheduled";
    if (promo.end_date && promo.end_date < today) return "ended";
    if (stored === "live" || stored === "scheduled") {
      if (promo.start_date && promo.start_date <= today && (!promo.end_date || promo.end_date >= today)) return "live";
    }
    return stored;
  }

  function statusTitle(id) {
    var row = STATUSES.filter(function (s) { return s.id === id; })[0];
    return row ? row.title : id;
  }

  function selectedApp() {
    return apps.filter(function (a) { return a.id === selectedAppId; })[0] || null;
  }

  function visible() {
    if (selectedAppId === "all") return promos.slice();
    return promos.filter(function (p) { return p.app_id === selectedAppId; });
  }

  function shell() {
    return (
      '<div class="ops-workspace">' +
        '<div class="ops-header">' +
          "<h1>Promos</h1>" +
          "<p>Free trials, intro prices, and promo codes per app. This is your log of what is live in App Store Connect and Play Console — SOP still has the how-to.</p>" +
        "</div>" +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="ops-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function field(label, key, value, type, extra) {
    if (type === "textarea") {
      return '<div class="ops-field"><label>' + label + '</label><textarea data-key="' + key + '">' + esc(value || "") + "</textarea></div>";
    }
    if (type === "select") {
      return '<div class="ops-field"><label>' + label + '</label><select data-key="' + key + '">' + extra + "</select></div>";
    }
    return '<div class="ops-field"><label>' + label + '</label><input data-key="' + key + '" type="' + (type || "text") + '" value="' + esc(value || "") + '" /></div>';
  }

  function chipClass(status) {
    if (status === "live") return "ok";
    if (status === "ended") return "";
    if (status === "scheduled") return "warn";
    return "";
  }

  function render() {
    var body = el("body");
    if (!body) return;
    var rows = visible();
    var live = promos.filter(function (p) { return displayStatus(p) === "live"; }).length;
    var scheduled = promos.filter(function (p) { return displayStatus(p) === "scheduled"; }).length;
    var appOptions = '<option value="all"' + (selectedAppId === "all" ? " selected" : "") + ">All apps</option>" +
      apps.map(function (a) {
        return '<option value="' + esc(a.id) + '"' + (a.id === selectedAppId ? " selected" : "") + ">" + esc(a.name || "App") + "</option>";
      }).join("");

    var html =
      '<div class="ops-chips">' +
        '<div class="ops-chip ok"><span class="k">Live now</span><span class="v">' + live + "</span></div>" +
        '<div class="ops-chip warn"><span class="k">Scheduled</span><span class="v">' + scheduled + "</span></div>" +
        '<div class="ops-chip"><span class="k">All</span><span class="v">' + promos.length + "</span></div>" +
      "</div>" +
      '<div class="ops-filters">' +
        '<select data-el="app" style="min-height:32px;border-radius:8px;border:1px solid #d5e3fb;padding:4px 8px">' + appOptions + "</select>" +
        '<button type="button" class="ops-pill" data-el="add" style="margin-left:auto">+ Add promo</button>' +
      "</div>";

    if (!apps.length) {
      html += '<div class="ops-empty">Add an app in Apps first, then come back and log a promo.</div>';
    } else if (!rows.length) {
      html += '<div class="ops-empty">No promos for this app yet. Add the free month or intro offer you turned on in the store.</div>';
    } else {
      rows.forEach(function (promo) {
        var open = promo.id === expandedId;
        var shown = displayStatus(promo);
        var when = (promo.start_date || "No start") + (promo.end_date ? " → " + promo.end_date : " → ongoing");
        html +=
          '<div class="ops-card' + (open ? " is-open" : "") + '" data-id="' + promo.id + '">' +
            '<button type="button" class="ops-card-head" data-action="toggle"><span class="chev">▸</span>' +
            '<div style="flex:1"><strong>' + esc(promo.title || kindTitle(promo.kind)) + "</strong>" +
            '<span class="sub" style="display:block;margin:2px 0 0">' +
              esc(promo.app_name || "App") + " · " + esc(promo.platform || "iOS") + " · " +
              esc(kindTitle(promo.kind)) + " · " + esc(statusTitle(shown)) +
            "</span></div>" +
            '<span class="ops-chip ' + chipClass(shown) + '" style="padding:6px 10px;margin:0"><span class="v" style="font-size:11px">' +
              esc(statusTitle(shown)) + "</span></span></button>" +
            '<div class="ops-card-body">' +
              '<p class="sub" style="margin:0 0 10px">' + esc(when) +
              (promo.duration ? " · " + esc(promo.duration) : "") +
              (promo.eligibility ? " · " + esc(eligibilityTitle(promo.eligibility)) : "") +
              "</p>" +
              '<div class="ops-grid">' +
                field("Title", "title", promo.title) +
                field("App", "app_id", "", "select",
                  apps.map(function (a) {
                    return '<option value="' + esc(a.id) + '"' + (a.id === promo.app_id ? " selected" : "") + ">" + esc(a.name || "App") + "</option>";
                  }).join("")) +
                field("Platform", "platform", "", "select", options(PLATFORMS, promo.platform || "iOS")) +
                field("Type", "kind", "", "select", options(KINDS, promo.kind || "free_trial")) +
                field("Duration", "duration", "", "select", options(DURATIONS, promo.duration || "1 month")) +
                field("Who gets it", "eligibility", "", "select", options(ELIGIBILITY, promo.eligibility || "new")) +
                field("Status", "status", "", "select", options(STATUSES, promo.status || "draft")) +
                field("Starts", "start_date", promo.start_date || "", "date") +
                field("Ends", "end_date", promo.end_date || "", "date") +
                field("Store offer ID", "store_ref", promo.store_ref) +
              "</div>" +
              field("Notes", "notes", promo.notes, "textarea") +
              '<div class="ops-actions">' +
                '<button class="btn btn-ghost" type="button" data-action="remove">Remove</button>' +
              "</div>" +
            "</div></div>";
      });
    }

    body.innerHTML = html;
    bind();
    syncSave();
  }

  function harvest() {
    if (!root) return;
    root.querySelectorAll("[data-id]").forEach(function (card) {
      var id = card.getAttribute("data-id");
      var promo = promos.filter(function (p) { return p.id === id; })[0];
      if (!promo) return;
      card.querySelectorAll("[data-key]").forEach(function (input) {
        var key = input.getAttribute("data-key");
        var val = input.value;
        if (key === "app_id") {
          promo.app_id = val;
          var app = apps.filter(function (a) { return a.id === val; })[0];
          promo.app_name = app ? (app.name || "") : promo.app_name;
          return;
        }
        promo[key] = val;
      });
    });
  }

  function bind() {
    var appSel = el("app");
    if (appSel) appSel.onchange = function () {
      harvest();
      selectedAppId = appSel.value || "all";
      expandedId = null;
      render();
      if (dirty) showMsg("Unsaved changes", true);
    };
    var add = el("add");
    if (add) add.onclick = addPromo;
    root.querySelectorAll("[data-action='toggle']").forEach(function (btn) {
      btn.onclick = function () {
        harvest();
        var id = btn.closest("[data-id]").getAttribute("data-id");
        expandedId = expandedId === id ? null : id;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      };
    });
    root.querySelectorAll("[data-action='remove']").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.closest("[data-id]").getAttribute("data-id");
        if (!window.confirm("Remove this promo from the log?")) return;
        db.from("app_promos").delete().eq("id", id).then(function (res) {
          if (res.error) return showMsg(schemaMissing(res.error) ? SQL_HINT : res.error.message, false);
          promos = promos.filter(function (p) { return p.id !== id; });
          if (expandedId === id) expandedId = null;
          render();
        });
      };
    });
    root.querySelectorAll("input, textarea, select").forEach(function (input) {
      if (input.getAttribute("data-el") === "app") return;
      input.addEventListener("input", function () { harvest(); markDirty(); });
      input.addEventListener("change", function () { harvest(); markDirty(); });
    });
  }

  function addPromo() {
    if (!db || !db.from) return showMsg("Not signed in.", false);
    var app = selectedApp() || apps[0];
    if (!app) return showMsg("Add an app in Apps first.", false);
    db.from("app_promos").insert({
      app_id: app.id,
      app_name: app.name || "",
      platform: "iOS",
      kind: "free_trial",
      title: "Free 1 month",
      duration: "1 month",
      eligibility: "new",
      status: "draft",
      start_date: todayISO(),
      end_date: null,
      store_ref: "",
      notes: ""
    }).select("*").single().then(function (res) {
      if (res.error) return showMsg(schemaMissing(res.error) ? SQL_HINT : res.error.message, false);
      promos.unshift(res.data);
      expandedId = res.data.id;
      if (selectedAppId !== "all") selectedAppId = app.id;
      clearDirty();
      render();
      showMsg("Promo added. Fill in the store details and Save.", true);
    });
  }

  function saveAll() {
    if (saving || !dirty) return;
    harvest();
    saving = true;
    syncSave();
    showMsg("Saving…", true);
    var jobs = promos.map(function (p) {
      return db.from("app_promos").update({
        app_id: p.app_id || null,
        app_name: p.app_name || "",
        platform: p.platform || "iOS",
        kind: p.kind || "free_trial",
        title: p.title || "",
        duration: p.duration || "",
        eligibility: p.eligibility || "new",
        status: p.status || "draft",
        start_date: p.start_date || null,
        end_date: p.end_date || null,
        store_ref: p.store_ref || "",
        notes: p.notes || ""
      }).eq("id", p.id);
    });
    Promise.all(jobs).then(function (results) {
      saving = false;
      var err = results.map(function (r) { return r && r.error; }).filter(Boolean)[0];
      if (err) {
        showMsg(schemaMissing(err) ? SQL_HINT : (err.message || "Save failed."), false);
        syncSave();
        return;
      }
      clearDirty();
      showMsg("Saved", true);
      setTimeout(function () { if (!dirty) showMsg(""); }, 900);
      render();
    }).catch(function (err) {
      saving = false;
      showMsg((err && err.message) || "Save failed.", false);
      syncSave();
    });
  }

  function load() {
    showMsg("Loading promos…", true);
    Promise.all([
      db.from("managed_apps").select("id,name").order("name"),
      db.from("app_promos").select("*").order("start_date", { ascending: false })
    ]).then(function (pair) {
      apps = (pair[0].data || []).slice();
      if (pair[1].error) {
        promos = [];
        render();
        showMsg(schemaMissing(pair[1].error) ? SQL_HINT : pair[1].error.message, false);
        return;
      }
      promos = pair[1].data || [];
      if (selectedAppId !== "all" && !apps.some(function (a) { return a.id === selectedAppId; })) {
        selectedAppId = "all";
      }
      clearDirty();
      showMsg("");
      render();
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not load promos.", false);
      render();
    });
  }

  window.STLPromos = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      selectedAppId = "all";
      expandedId = null;
      dirty = false;
      saving = false;
      panel.classList.add("ops-wide");
      panel.innerHTML = shell();
      syncSave();
      load();
    },
    unmount: function (panel) {
      hideSave();
      if (panel) panel.classList.remove("ops-wide");
      root = null;
    },
    saveAll: saveAll,
    isDirty: function () { return dirty; }
  };
})();

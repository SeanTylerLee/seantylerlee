(function () {
  "use strict";

  var STATES = [
    { abbr: "AL", name: "Alabama" },
    { abbr: "AZ", name: "Arizona" },
    { abbr: "AR", name: "Arkansas" },
    { abbr: "CA", name: "California" },
    { abbr: "CO", name: "Colorado" },
    { abbr: "CT", name: "Connecticut" },
    { abbr: "DE", name: "Delaware" },
    { abbr: "FL", name: "Florida" },
    { abbr: "GA", name: "Georgia" },
    { abbr: "ID", name: "Idaho" },
    { abbr: "IL", name: "Illinois" },
    { abbr: "IN", name: "Indiana" },
    { abbr: "IA", name: "Iowa" },
    { abbr: "KS", name: "Kansas" },
    { abbr: "KY", name: "Kentucky" },
    { abbr: "LA", name: "Louisiana" },
    { abbr: "ME", name: "Maine" },
    { abbr: "MD", name: "Maryland" },
    { abbr: "MA", name: "Massachusetts" },
    { abbr: "MI", name: "Michigan" },
    { abbr: "MN", name: "Minnesota" },
    { abbr: "MS", name: "Mississippi" },
    { abbr: "MO", name: "Missouri" },
    { abbr: "MT", name: "Montana" },
    { abbr: "NE", name: "Nebraska" },
    { abbr: "NV", name: "Nevada" },
    { abbr: "NH", name: "New Hampshire" },
    { abbr: "NJ", name: "New Jersey" },
    { abbr: "NM", name: "New Mexico" },
    { abbr: "NY", name: "New York" },
    { abbr: "NC", name: "North Carolina" },
    { abbr: "ND", name: "North Dakota" },
    { abbr: "OH", name: "Ohio" },
    { abbr: "OK", name: "Oklahoma" },
    { abbr: "OR", name: "Oregon" },
    { abbr: "PA", name: "Pennsylvania" },
    { abbr: "RI", name: "Rhode Island" },
    { abbr: "SC", name: "South Carolina" },
    { abbr: "SD", name: "South Dakota" },
    { abbr: "TN", name: "Tennessee" },
    { abbr: "TX", name: "Texas" },
    { abbr: "UT", name: "Utah" },
    { abbr: "VT", name: "Vermont" },
    { abbr: "VA", name: "Virginia" },
    { abbr: "WA", name: "Washington" },
    { abbr: "WV", name: "West Virginia" },
    { abbr: "WI", name: "Wisconsin" },
    { abbr: "WY", name: "Wyoming" }
  ];

  var LIMIT_FIELDS = [
    { id: "width", label: "Width", placeholder: "8'6\"" },
    { id: "height", label: "Height", placeholder: "13'6\"" },
    { id: "length", label: "Length", placeholder: "80'0\"" },
    { id: "axleSingle", label: "Single axle weight", placeholder: "20000" },
    { id: "axleTandem", label: "Tandem axle weight", placeholder: "34000" },
    { id: "axleSpread", label: "Spread axle weight", placeholder: "40000" },
    { id: "grossWeight", label: "Gross vehicle weight", placeholder: "80000" }
  ];

  var PILOT_FIELDS = [
    { id: "widthOne", label: "Width — one escort", placeholder: "12'0\"" },
    { id: "widthTwo", label: "Width — two escorts", placeholder: "14'0\"" },
    { id: "lengthOne", label: "Length — one escort", placeholder: "90'0\"" },
    { id: "lengthTwo", label: "Length — two escorts", placeholder: "110'0\"" }
  ];

  var root = null;
  var db = null;
  var selectedAbbr = "KS";
  var search = "";
  var drafts = {};
  var dirtyAbbrs = {};
  var dirty = false;
  var saving = false;

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

  function stateByAbbr(abbr) {
    var i;
    for (i = 0; i < STATES.length; i += 1) {
      if (STATES[i].abbr === abbr) return STATES[i];
    }
    return STATES[0];
  }

  function blankLimits() {
    return {
      width: "",
      height: "",
      length: "",
      axleSingle: "",
      axleTandem: "",
      axleSpread: "",
      grossWeight: ""
    };
  }

  function blankPilot() {
    return { widthOne: "", widthTwo: "", lengthOne: "", lengthTwo: "" };
  }

  function blankDraft(st) {
    return {
      id: null,
      abbr: st.abbr,
      name: st.name,
      travelHours: "",
      travelRestrictions: "",
      interstate: blankLimits(),
      nonInterstate: blankLimits(),
      curfewRestrictions: "",
      curfewExceptions: "",
      note: "",
      pilot: blankPilot(),
      highPole: ""
    };
  }

  function textOf(value) {
    return String(value == null ? "" : value).trim();
  }

  function mergeObject(blank, raw) {
    var out = blank();
    var src = raw;
    if (typeof src === "string") {
      try { src = JSON.parse(src); } catch (err) { src = {}; }
    }
    if (!src || typeof src !== "object") return out;
    Object.keys(out).forEach(function (key) {
      if (src[key] != null) out[key] = String(src[key]);
    });
    return out;
  }

  function draftFor(abbr) {
    if (!drafts[abbr]) drafts[abbr] = blankDraft(stateByAbbr(abbr));
    return drafts[abbr];
  }

  function fromDb(row) {
    var st = stateByAbbr(row.state_abbr);
    return {
      id: row.id,
      abbr: st.abbr,
      name: row.state_name || st.name,
      travelHours: row.travel_hours || "",
      travelRestrictions: row.travel_restrictions || "",
      interstate: mergeObject(blankLimits, row.interstate),
      nonInterstate: mergeObject(blankLimits, row.non_interstate),
      curfewRestrictions: row.curfew_restrictions || "",
      curfewExceptions: row.curfew_exceptions || "",
      note: row.note || "",
      pilot: mergeObject(blankPilot, row.pilot),
      highPole: row.high_pole || ""
    };
  }

  function hasContent(draft) {
    if (!draft) return false;
    if (textOf(draft.travelHours) || textOf(draft.travelRestrictions)) return true;
    if (textOf(draft.curfewRestrictions) || textOf(draft.curfewExceptions)) return true;
    if (textOf(draft.note) || textOf(draft.highPole)) return true;
    return LIMIT_FIELDS.some(function (field) {
      return textOf(draft.interstate[field.id]) || textOf(draft.nonInterstate[field.id]);
    }) || PILOT_FIELDS.some(function (field) {
      return textOf(draft.pilot[field.id]);
    });
  }

  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!msg && !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }

  function missingTable(err) {
    return /does not exist|schema cache/i.test((err && err.message) || "");
  }

  function syncSaveButton() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.disabled = !dirty || saving;
    btn.textContent = saving ? "Saving…" : "Save";
  }

  function markDirty() {
    dirty = true;
    dirtyAbbrs[selectedAbbr] = true;
    syncSaveButton();
    showMsg("Unsaved changes", true);
  }

  function clearDirty() {
    dirty = false;
    dirtyAbbrs = {};
    syncSaveButton();
  }

  function shell() {
    return (
      '<div class="ops-workspace hp-admin">' +
        '<div class="ops-header">' +
          "<h1>HaulPath Admin</h1>" +
          "<p>Travel time, legal thresholds, and curfews for each state. Saved here only. The HaulPath app still uses its own tables.</p>" +
        "</div>" +
        '<p class="status" data-el="banner"></p>' +
        '<div class="hp-admin-layout">' +
          '<aside class="hp-admin-rail">' +
            '<input class="hp-admin-search" data-el="search" type="search" placeholder="Find a state" autocomplete="off" value="' + esc(search) + '" />' +
            '<div class="hp-admin-states" data-el="states"></div>' +
          "</aside>" +
          '<div class="hp-admin-body" data-el="body"></div>' +
        "</div>" +
      "</div>"
    );
  }

  function inputHtml(field, value) {
    return (
      '<label class="hp-admin-field">' +
        "<span>" + esc(field.label) + "</span>" +
        '<input type="text" data-field="' + esc(field.id) + '" value="' + esc(value || "") + '" placeholder="' + esc(field.placeholder || "") + '" />' +
      "</label>"
    );
  }

  function areaHtml(id, label, value, placeholder) {
    return (
      '<label class="hp-admin-field is-wide">' +
        "<span>" + esc(label) + "</span>" +
        '<textarea data-field="' + esc(id) + '" placeholder="' + esc(placeholder || "") + '">' + esc(value || "") + "</textarea>" +
      "</label>"
    );
  }

  function limitsHtml(prefix, title, limits) {
    return (
      '<section class="hp-admin-card" data-group="' + esc(prefix) + '">' +
        "<h3>" + esc(title) + "</h3>" +
        '<div class="hp-admin-fields">' +
          LIMIT_FIELDS.map(function (field) {
            return inputHtml(field, limits[field.id]);
          }).join("") +
        "</div>" +
      "</section>"
    );
  }

  function renderStates() {
    var box = el("states");
    if (!box) return;
    var q = String(search || "").trim().toLowerCase();
    var list = STATES.filter(function (st) {
      if (!q) return true;
      return st.name.toLowerCase().indexOf(q) !== -1 || st.abbr.toLowerCase().indexOf(q) !== -1;
    });
    if (!list.length) {
      box.innerHTML = '<p class="hp-admin-empty">No states match.</p>';
      return;
    }
    box.innerHTML = list.map(function (st) {
      var draft = drafts[st.abbr];
      var on = st.abbr === selectedAbbr ? " is-on" : "";
      var filled = hasContent(draft) ? " is-filled" : "";
      return (
        '<button type="button" class="hp-admin-state' + on + filled + '" data-state="' + esc(st.abbr) + '">' +
          "<strong>" + esc(st.abbr) + "</strong>" +
          "<span>" + esc(st.name) + "</span>" +
        "</button>"
      );
    }).join("");
  }

  function renderBody() {
    var box = el("body");
    if (!box) return;
    var st = stateByAbbr(selectedAbbr);
    var draft = draftFor(selectedAbbr);
    box.innerHTML =
      '<div class="hp-admin-detail-head">' +
        "<h2>" + esc(st.name) + " <span>" + esc(st.abbr) + "</span></h2>" +
        "<p>These values stay in Studio until the app is wired to them.</p>" +
      "</div>" +
      '<section class="hp-admin-card hp-admin-note">' +
        "<h3>Note</h3>" +
        '<label class="hp-admin-field is-wide">' +
          "<span>For this state</span>" +
          '<textarea data-field="note" placeholder="Anything you want to remember about this state.">' + esc(draft.note) + "</textarea>" +
        "</label>" +
      "</section>" +
      '<section class="hp-admin-card" data-group="travel">' +
        "<h3>Travel time</h3>" +
        '<div class="hp-admin-fields">' +
          inputHtml({ id: "travelHours", label: "Allowed hours", placeholder: "Sunrise to sunset" }, draft.travelHours) +
          areaHtml("travelRestrictions", "Restrictions", draft.travelRestrictions, "Extra travel limits, if any") +
        "</div>" +
      "</section>" +
      limitsHtml("interstate", "Interstate legal thresholds", draft.interstate) +
      limitsHtml("nonInterstate", "Non-interstate legal thresholds", draft.nonInterstate) +
      '<section class="hp-admin-card" data-group="pilot">' +
        "<h3>Pilot / escort</h3>" +
        '<div class="hp-admin-fields">' +
          PILOT_FIELDS.map(function (field) {
            return inputHtml(field, draft.pilot[field.id]);
          }).join("") +
        "</div>" +
      "</section>" +
      '<section class="hp-admin-card" data-group="pole">' +
        "<h3>High pole</h3>" +
        '<div class="hp-admin-fields">' +
          inputHtml({ id: "highPole", label: "High pole height", placeholder: "15'0\"" }, draft.highPole) +
        "</div>" +
      "</section>" +
      '<section class="hp-admin-card" data-group="curfew">' +
        "<h3>Curfews</h3>" +
        '<div class="hp-admin-fields">' +
          areaHtml("curfewRestrictions", "Restrictions", draft.curfewRestrictions, "Cities, hours, weekends, holidays") +
          areaHtml("curfewExceptions", "Exceptions", draft.curfewExceptions, "When the curfew does not apply") +
        "</div>" +
      "</section>";
  }

  function readGroup(groupName, blank) {
    var out = blank();
    var card = root.querySelector('[data-group="' + groupName + '"]');
    if (!card) return out;
    Object.keys(out).forEach(function (key) {
      var input = card.querySelector('[data-field="' + key + '"]');
      if (input) out[key] = input.value || "";
    });
    return out;
  }

  function fieldValue(id) {
    var node = root.querySelector('.hp-admin-body [data-field="' + id + '"]');
    return node ? (node.value || "") : "";
  }

  function harvest() {
    if (!root || !root.querySelector(".hp-admin-body [data-field]")) return;
    var draft = draftFor(selectedAbbr);
    draft.note = fieldValue("note");
    draft.travelHours = fieldValue("travelHours");
    draft.travelRestrictions = fieldValue("travelRestrictions");
    draft.interstate = readGroup("interstate", blankLimits);
    draft.nonInterstate = readGroup("nonInterstate", blankLimits);
    draft.pilot = readGroup("pilot", blankPilot);
    draft.highPole = fieldValue("highPole");
    draft.curfewRestrictions = fieldValue("curfewRestrictions");
    draft.curfewExceptions = fieldValue("curfewExceptions");
  }

  function payload(draft) {
    return {
      state_abbr: draft.abbr,
      state_name: draft.name,
      travel_hours: draft.travelHours || "",
      travel_restrictions: draft.travelRestrictions || "",
      interstate: draft.interstate || blankLimits(),
      non_interstate: draft.nonInterstate || blankLimits(),
      curfew_restrictions: draft.curfewRestrictions || "",
      curfew_exceptions: draft.curfewExceptions || "",
      note: draft.note || "",
      pilot: draft.pilot || blankPilot(),
      high_pole: draft.highPole || ""
    };
  }

  function saveAll() {
    if (saving || !dirty || !db) return;
    harvest();
    var list = Object.keys(dirtyAbbrs).map(function (abbr) {
      return draftFor(abbr);
    }).filter(function (draft) {
      return draft.id || hasContent(draft);
    });
    if (!list.length) {
      clearDirty();
      showMsg("Saved", true);
      setTimeout(function () { if (!dirty) showMsg(""); }, 1200);
      renderStates();
      return;
    }
    saving = true;
    syncSaveButton();
    showMsg("Saving…", true);
    Promise.all(list.map(function (draft) {
      var body = payload(draft);
      if (draft.id) {
        return db.from("haulpath_states").update(body).eq("id", draft.id).select("*").single();
      }
      return db.from("haulpath_states").insert(body).select("*").single();
    })).then(function (results) {
      saving = false;
      var failed = results.filter(function (res) { return res && res.error; })[0];
      if (failed) {
        showMsg(missingTable(failed.error)
          ? "Run sql/042_haulpath_states.sql in Supabase, then refresh."
          : failed.error.message, false);
        syncSaveButton();
        return;
      }
      results.forEach(function (res) {
        var next = fromDb(res.data);
        drafts[next.abbr] = next;
      });
      clearDirty();
      renderStates();
      showMsg("Saved", true);
      setTimeout(function () { if (!dirty) showMsg(""); }, 1200);
    }).catch(function (err) {
      saving = false;
      showMsg((err && err.message) || "Save failed.", false);
      syncSaveButton();
    });
  }

  function load() {
    if (!db) {
      showMsg("Studio is not signed in.", false);
      return;
    }
    db.from("haulpath_states").select("*").then(function (res) {
      if (res.error) {
        showMsg(missingTable(res.error)
          ? "Run sql/042_haulpath_states.sql in Supabase, then refresh."
          : res.error.message, false);
        renderStates();
        renderBody();
        return;
      }
      drafts = {};
      (res.data || []).forEach(function (row) {
        if (!row || !row.state_abbr) return;
        var next = fromDb(row);
        drafts[next.abbr] = next;
      });
      clearDirty();
      renderStates();
      renderBody();
      showMsg("");
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not load states.", false);
      renderStates();
      renderBody();
    });
  }

  function bindShell() {
    var searchEl = el("search");
    if (searchEl) {
      searchEl.addEventListener("input", function () {
        search = searchEl.value || "";
        renderStates();
      });
    }
    var statesEl = el("states");
    if (statesEl) {
      statesEl.addEventListener("click", function (ev) {
        var btn = ev.target.closest ? ev.target.closest("[data-state]") : null;
        if (!btn) return;
        var next = btn.getAttribute("data-state") || selectedAbbr;
        if (next === selectedAbbr) return;
        harvest();
        selectedAbbr = next;
        renderStates();
        renderBody();
      });
    }
    var body = el("body");
    if (body) {
      body.addEventListener("input", function () {
        harvest();
        var was = dirty;
        markDirty();
        if (!was) renderStates();
        else {
          var current = root.querySelector('.hp-admin-state.is-on');
          if (current) current.classList.toggle("is-filled", hasContent(draftFor(selectedAbbr)));
        }
      });
    }
  }

  window.STLHaulPathAdmin = {
    mount: function (host, client) {
      root = host;
      db = client;
      var panel = host && host.closest ? host.closest(".panel") : null;
      if (panel) panel.classList.add("ops-wide");
      root.innerHTML = shell();
      bindShell();
      renderStates();
      renderBody();
      syncSaveButton();
      load();
    },
    shown: function () {
      syncSaveButton();
    },
    saveAll: saveAll,
    isDirty: function () { return dirty; },
    usesGlobalSave: function () { return true; },
    unmount: function () {
      var panel = root && root.closest ? root.closest(".panel") : null;
      if (panel) panel.classList.remove("ops-wide");
      root = null;
    }
  };
})();

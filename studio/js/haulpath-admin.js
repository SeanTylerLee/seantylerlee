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
      developerNote: "",
      developerNoteId: null,
      interstatePilot: blankPilot(),
      nonInterstatePilot: blankPilot(),
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
      id: row.state_abbr || row.id,
      abbr: st.abbr,
      name: row.state_name || st.name,
      travelHours: row.travel_hours || "",
      travelRestrictions: row.travel_restrictions || "",
      interstate: mergeObject(blankLimits, row.interstate),
      nonInterstate: mergeObject(blankLimits, row.non_interstate),
      curfewRestrictions: row.curfew_restrictions || "",
      curfewExceptions: row.curfew_exceptions || "",
      note: row.note || "",
      developerNote: "",
      developerNoteId: null,
      interstatePilot: mergeObject(blankPilot, row.interstate_pilot),
      nonInterstatePilot: mergeObject(blankPilot, row.non_interstate_pilot),
      highPole: row.high_pole || ""
    };
  }

  function keepDeveloperNote(next, prev) {
    if (!prev) return next;
    next.developerNote = prev.developerNote || "";
    next.developerNoteId = prev.developerNoteId || null;
    return next;
  }

  function hasContent(draft) {
    if (!draft) return false;
    if (textOf(draft.travelHours) || textOf(draft.travelRestrictions)) return true;
    if (textOf(draft.curfewRestrictions) || textOf(draft.curfewExceptions)) return true;
    if (textOf(draft.note) || textOf(draft.developerNote) || textOf(draft.highPole)) return true;
    return LIMIT_FIELDS.some(function (field) {
      return textOf(draft.interstate[field.id]) || textOf(draft.nonInterstate[field.id]);
    }) || PILOT_FIELDS.some(function (field) {
      return textOf(draft.interstatePilot[field.id]) || textOf(draft.nonInterstatePilot[field.id]);
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
          "<p>Travel time, legal thresholds, curfews, and the note drivers will see for each state. Save writes to HaulPath. The phone apps will read it after the app update.</p>" +
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
        "<p>Drivers will see this note on the state after the app update.</p>" +
      "</div>" +
      '<section class="hp-admin-card hp-admin-note">' +
        "<h3>Note</h3>" +
        '<label class="hp-admin-field is-wide">' +
          "<span>Shown on this state in HaulPath</span>" +
          '<textarea data-field="note" placeholder="What drivers should know about this state.">' + esc(draft.note) + "</textarea>" +
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
      pilotHtml("interstatePilot", "Interstate pilot / escort", draft.interstatePilot) +
      pilotHtml("nonInterstatePilot", "Non-interstate pilot / escort", draft.nonInterstatePilot) +
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
      "</section>" +
      '<section class="hp-admin-card hp-admin-note">' +
        "<h3>Developer notes</h3>" +
        '<label class="hp-admin-field is-wide">' +
          "<span>Only you. This stays in Studio and is not sent to the app.</span>" +
          '<textarea data-field="developerNote" placeholder="Notes for yourself about this state.">' + esc(draft.developerNote) + "</textarea>" +
        "</label>" +
      "</section>";
  }

  function pilotHtml(prefix, title, pilot) {
    return (
      '<section class="hp-admin-card" data-group="' + esc(prefix) + '">' +
        "<h3>" + esc(title) + "</h3>" +
        '<p class="hp-admin-private">First measurement that requires that escort. Over 12 feet is stored as 12\'1". 90 feet or more is 90\'0".</p>' +
        '<div class="hp-admin-fields">' +
          PILOT_FIELDS.map(function (field) {
            return inputHtml(field, pilot[field.id]);
          }).join("") +
        "</div>" +
      "</section>"
    );
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
    draft.interstatePilot = readGroup("interstatePilot", blankPilot);
    draft.nonInterstatePilot = readGroup("nonInterstatePilot", blankPilot);
    draft.highPole = fieldValue("highPole");
    draft.curfewRestrictions = fieldValue("curfewRestrictions");
    draft.curfewExceptions = fieldValue("curfewExceptions");
    draft.developerNote = fieldValue("developerNote");
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
      interstate_pilot: draft.interstatePilot || blankPilot(),
      non_interstate_pilot: draft.nonInterstatePilot || blankPilot(),
      high_pole: draft.highPole || ""
    };
  }

  function missingDeveloperTable(err) {
    return /does not exist|schema cache/i.test((err && err.message) || "");
  }

  function loadDeveloperNotes() {
    if (!db) return Promise.resolve();
    return db.from("haulpath_developer_notes").select("id,state_abbr,body").then(function (res) {
      if (res.error) {
        throw new Error(missingDeveloperTable(res.error)
          ? "Run sql/045_haulpath_developer_notes.sql in the Studio project, then refresh."
          : res.error.message);
      }
      (res.data || []).forEach(function (row) {
        if (!row || !row.state_abbr) return;
        var draft = draftFor(row.state_abbr);
        draft.developerNote = row.body || "";
        draft.developerNoteId = row.id || null;
      });
    });
  }

  function saveDeveloperNotes(list) {
    if (!db) return Promise.resolve("Studio is not signed in.");
    var jobs = list.map(function (draft) {
      var body = draft.developerNote || "";
      if (draft.developerNoteId) {
        return db.from("haulpath_developer_notes").update({ body: body }).eq("id", draft.developerNoteId);
      }
      if (!textOf(body)) return Promise.resolve({ error: null });
      return db.from("haulpath_developer_notes").insert({
        state_abbr: draft.abbr,
        body: body
      }).select("id,state_abbr").single().then(function (res) {
        if (!res.error && res.data && res.data.id) draft.developerNoteId = res.data.id;
        return res;
      });
    });
    return Promise.all(jobs).then(function (results) {
      var failed = (results || []).filter(function (res) { return res && res.error; })[0];
      if (!failed) return "";
      if (missingDeveloperTable(failed.error)) {
        return "Run sql/045_haulpath_developer_notes.sql in the Studio project, then refresh.";
      }
      return failed.error.message || "Could not save developer notes.";
    });
  }

  function saveAll() {
    var remote = window.STLLocalApi;
    if (saving || !dirty || !remote) return;
    harvest();
    var list = Object.keys(dirtyAbbrs).map(function (abbr) {
      return draftFor(abbr);
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
    Promise.all([
      remote.post("/api/haulpath/states", { states: list.map(payload) }),
      saveDeveloperNotes(list)
    ]).then(function (results) {
      saving = false;
      var res = results[0];
      var noteError = results[1];
      if (!res || !res.ok) {
        var message = (res && res.data && res.data.error) || "Save failed.";
        showMsg(message, false);
        syncSaveButton();
        return;
      }
      if (noteError) {
        showMsg(noteError, false);
        syncSaveButton();
        return;
      }
      ((res.data && res.data.states) || []).forEach(function (row) {
        if (!row || !row.state_abbr) return;
        drafts[row.state_abbr] = keepDeveloperNote(fromDb(row), drafts[row.state_abbr]);
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
    var remote = window.STLLocalApi;
    if (!remote) {
      showMsg("Studio cannot reach Haul Path yet.", false);
      renderStates();
      renderBody();
      return;
    }
    remote.get("/api/haulpath/states").then(function (res) {
      if (!res || !res.ok) {
        showMsg((res && res.data && res.data.error) || "Could not load states.", false);
        renderStates();
        renderBody();
        return true;
      }
      drafts = {};
      ((res.data && res.data.states) || []).forEach(function (row) {
        if (!row || !row.state_abbr) return;
        var next = fromDb(row);
        drafts[next.abbr] = next;
      });
      return loadDeveloperNotes().then(function () { return false; });
    }).then(function (failed) {
      if (failed) return;
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

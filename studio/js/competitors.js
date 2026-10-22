(function () {
  "use strict";

  var METRICS = [
    { key: "domain_registered_on", label: "Domain registered" },
    { key: "llc_registered_on", label: "LLC registered" },
    { key: "apple_launched_on", label: "Launched on Apple" },
    { key: "android_launched_on", label: "Launched on Android" }
  ];

  var root = null;
  var db = null;
  var selfRow = blank(true);
  var competitors = [];
  var loadedIds = [];
  var dirty = false;
  var saving = false;
  var seq = 1;

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

  function blank(isSelf) {
    return {
      id: null,
      localKey: isSelf ? "self" : "new-" + (seq++),
      is_self: !!isSelf,
      company_name: "",
      app_name: "",
      domain_name: "",
      domain_registered_on: "",
      llc_registered_on: "",
      apple_launched_on: "",
      android_launched_on: "",
      notes: "",
      events: []
    };
  }

  function eventsOf(raw) {
    var list = raw;
    if (typeof list === "string") {
      try { list = JSON.parse(list); } catch (err) { list = []; }
    }
    if (!Array.isArray(list)) return [];
    return list.map(function (ev) {
      return {
        label: (ev && ev.label) || "",
        on: ev && ev.on ? String(ev.on).slice(0, 10) : ""
      };
    });
  }

  function fromDb(row) {
    return {
      id: row.id,
      localKey: row.id,
      is_self: !!row.is_self,
      company_name: row.company_name || "",
      app_name: row.app_name || "",
      domain_name: row.domain_name || "",
      domain_registered_on: row.domain_registered_on ? String(row.domain_registered_on).slice(0, 10) : "",
      llc_registered_on: row.llc_registered_on ? String(row.llc_registered_on).slice(0, 10) : "",
      apple_launched_on: row.apple_launched_on ? String(row.apple_launched_on).slice(0, 10) : "",
      android_launched_on: row.android_launched_on ? String(row.android_launched_on).slice(0, 10) : "",
      notes: row.notes || "",
      events: eventsOf(row.events)
    };
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

  function syncSaveButton() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.disabled = !dirty || saving;
    btn.textContent = saving ? "Saving…" : "Save";
  }

  function hideSaveButton() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }

  function markDirty() {
    dirty = true;
    syncSaveButton();
    showMsg("Unsaved changes", true);
  }

  function clearDirty() {
    dirty = false;
    syncSaveButton();
  }

  function parseDay(iso) {
    var parts = String(iso || "").slice(0, 10).split("-");
    if (parts.length !== 3) return null;
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var d = Number(parts[2]);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function formatDay(iso) {
    var day = parseDay(iso);
    if (!day) return "";
    return day.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function dateOrNull(iso) {
    return parseDay(iso) ? String(iso).slice(0, 10) : null;
  }

  function daysBetween(earlier, later) {
    var a = parseDay(earlier);
    var b = parseDay(later);
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  function field(label, key, value, type) {
    return (
      '<div class="field"><label>' + esc(label) + "</label>" +
      '<input data-key="' + key + '" type="' + (type || "text") + '" value="' + esc(value || "") + '" /></div>'
    );
  }

  function notesField(value) {
    return (
      '<details class="comp-notes-wrap">' +
        "<summary>Notes</summary>" +
        '<textarea class="comp-notes" data-key="notes">' + esc(value || "") + "</textarea>" +
      "</details>"
    );
  }

  function eventsHtml(row) {
    var lines = (row.events || []).map(function (ev, index) {
      return (
        '<div class="comp-event" data-event-index="' + index + '">' +
          '<input data-event-label type="text" placeholder="What happened" value="' + esc(ev.label || "") + '" />' +
          '<input data-event-on type="date" value="' + esc(ev.on || "") + '" />' +
          '<button class="comp-remove" type="button" data-event-remove>Remove</button>' +
        "</div>"
      );
    }).join("");
    return (
      '<div class="comp-wide">' +
        '<div class="comp-events-head"><h4>Other dates</h4></div>' +
        lines +
        '<button class="btn btn-ghost comp-add-date" type="button" data-add-event>Add date</button>' +
        notesField(row.notes) +
      "</div>"
    );
  }

  function personFields(row) {
    return (
      field("Company", "company_name", row.company_name) +
      field("App name", "app_name", row.app_name) +
      field("Domain", "domain_name", row.domain_name) +
      field("Domain registered", "domain_registered_on", row.domain_registered_on, "date") +
      field("LLC registered", "llc_registered_on", row.llc_registered_on, "date") +
      field("Launched on Apple", "apple_launched_on", row.apple_launched_on, "date") +
      field("Launched on Android", "android_launched_on", row.android_launched_on, "date") +
      eventsHtml(row)
    );
  }

  function competitorTitle(row, index) {
    return row.company_name || row.app_name || ("Competitor " + (index + 1));
  }

  function metricLabel(row, metric) {
    var label = metric.label;
    if (metric.key === "domain_registered_on" && row.domain_name) label += " · " + row.domain_name;
    if (metric.key === "llc_registered_on" && row.company_name) label += " · " + row.company_name;
    if ((metric.key === "apple_launched_on" || metric.key === "android_launched_on") && row.app_name) {
      label += " · " + row.app_name;
    }
    return label;
  }

  function factsOf(row, who) {
    var facts = [];
    METRICS.forEach(function (metric) {
      var on = dateOrNull(row[metric.key]);
      if (!on) return;
      facts.push({ on: on, who: who, label: metricLabel(row, metric) });
    });
    (row.events || []).forEach(function (ev) {
      var label = String(ev.label || "").trim();
      var on = dateOrNull(ev.on) || "";
      if (!label && !on) return;
      facts.push({ on: on, who: who, label: label || "Other date" });
    });
    return facts;
  }

  function sortFacts(facts) {
    return facts.slice().sort(function (a, b) {
      if (!a.on && !b.on) return a.label.localeCompare(b.label);
      if (!a.on) return 1;
      if (!b.on) return -1;
      if (a.on !== b.on) return a.on < b.on ? -1 : 1;
      if (a.who === "You" && b.who !== "You") return -1;
      if (b.who === "You" && a.who !== "You") return 1;
      return a.who.localeCompare(b.who) || a.label.localeCompare(b.label);
    });
  }

  function timeRow(fact) {
    var you = fact.who === "You";
    return (
      '<div class="comp-time">' +
        "<span>" + esc(formatDay(fact.on) || "No date") + "</span>" +
        '<span class="comp-time-who ' + (you ? "is-you" : "is-them") + '">' + esc(fact.who) + "</span>" +
        "<span>" + esc(fact.label) + "</span>" +
      "</div>"
    );
  }

  function timelineHtml(facts, emptyText) {
    var dated = sortFacts(facts);
    if (!dated.length) return '<p class="comp-empty">' + esc(emptyText) + "</p>";
    return dated.map(timeRow).join("");
  }

  function shell() {
    return (
      '<div class="comp-page">' +
        '<p class="status" data-el="banner"></p>' +
        '<div data-el="compare"></div>' +
        '<section class="comp-card" data-block="self">' +
          "<h2>Your dates</h2>" +
          '<p class="comp-sub">Change a date and the comparison above updates.</p>' +
          '<div class="comp-grid">' + personFields(selfRow) + "</div>" +
        "</section>" +
        '<div class="comp-head">' +
          '<h2 class="comp-section-title">Competitors</h2>' +
          '<button class="btn btn-primary" type="button" data-el="add">Add competitor</button>' +
        "</div>" +
        '<div data-el="list"></div>' +
      "</div>"
    );
  }

  function listHtml() {
    if (!competitors.length) {
      return '<p class="comp-empty">No competitors yet.</p>';
    }
    return competitors.map(function (row, index) {
      return (
        '<section class="comp-card" data-block="' + esc(row.localKey) + '">' +
          '<div class="comp-card-top">' +
            "<h3>" + esc(competitorTitle(row, index)) + "</h3>" +
            '<button class="comp-remove" type="button" data-remove="' + esc(row.localKey) + '">Remove</button>' +
          "</div>" +
          '<div class="comp-grid">' +
            personFields(row) +
          "</div>" +
        "</section>"
      );
    }).join("");
  }

  function peopleForMetric(metric) {
    var people = [{ who: "You", on: selfRow[metric.key] || "", you: true }];
    competitors.forEach(function (row, index) {
      people.push({
        who: competitorTitle(row, index),
        on: row[metric.key] || "",
        you: false
      });
    });
    return people.slice().sort(function (a, b) {
      if (!a.on && !b.on) return a.who.localeCompare(b.who);
      if (!a.on) return 1;
      if (!b.on) return -1;
      if (a.on !== b.on) return a.on < b.on ? -1 : 1;
      if (a.you && !b.you) return -1;
      if (b.you && !a.you) return 1;
      return a.who.localeCompare(b.who);
    });
  }

  function rankBlock(metric) {
    var people = peopleForMetric(metric);
    var firstOn = "";
    people.forEach(function (person) {
      if (!firstOn && person.on) firstOn = person.on;
    });
    var rows = people.map(function (person) {
      var first = !!(person.on && person.on === firstOn);
      var cls = "comp-rank-row";
      if (person.you) cls += " is-you";
      if (first) cls += " is-first";
      if (!person.on) cls += " is-open";
      var gap = "No date";
      if (person.on && first) gap = "First";
      else if (person.on && firstOn) {
        var n = daysBetween(firstOn, person.on);
        gap = n === 0 ? "Same day" : n + (n === 1 ? " day later" : " days later");
      }
      return (
        '<div class="' + cls + '">' +
          '<span class="comp-rank-who">' + esc(person.who) + "</span>" +
          '<span class="comp-rank-day">' + esc(formatDay(person.on) || "—") + "</span>" +
          '<span class="comp-rank-gap">' + esc(gap) + "</span>" +
        "</div>"
      );
    }).join("");
    return (
      '<div class="comp-metric">' +
        "<h4>" + esc(metric.label) + "</h4>" +
        rows +
      "</div>"
    );
  }

  function compareHtml() {
    var board = factsOf(selfRow, "You");
    competitors.forEach(function (row, index) {
      board = board.concat(factsOf(row, competitorTitle(row, index)));
    });
    var ranks = METRICS.map(rankBlock).join("");
    return (
      '<article class="comp-compare-block">' +
        "<h3>Who was first</h3>" +
        ranks +
      "</article>" +
      '<article class="comp-compare-block comp-board">' +
        "<h3>Every date</h3>" +
        timelineHtml(board, "Add dates to see the order.") +
      "</article>"
    );
  }

  function paintLists() {
    var list = el("list");
    var compare = el("compare");
    if (list) list.innerHTML = listHtml();
    if (compare) compare.innerHTML = compareHtml();
    bindList();
  }

  function paintCompare() {
    var compare = el("compare");
    if (compare) compare.innerHTML = compareHtml();
  }

  function readBlock(block, row) {
    block.querySelectorAll("[data-key]").forEach(function (input) {
      row[input.getAttribute("data-key")] = input.value;
    });
    var events = [];
    block.querySelectorAll("[data-event-index]").forEach(function (line) {
      var labelInput = line.querySelector("[data-event-label]");
      var onInput = line.querySelector("[data-event-on]");
      events.push({
        label: labelInput ? labelInput.value : "",
        on: onInput ? onInput.value : ""
      });
    });
    row.events = events;
  }

  function harvest() {
    if (!root) return;
    var selfBlock = root.querySelector('[data-block="self"]');
    if (selfBlock) readBlock(selfBlock, selfRow);
    competitors.forEach(function (row) {
      var block = root.querySelector('[data-block="' + row.localKey + '"]');
      if (block) readBlock(block, row);
    });
  }

  function bindEvents(block, row) {
    block.querySelectorAll("[data-event-index]").forEach(function (line) {
      var index = Number(line.getAttribute("data-event-index"));
      line.querySelectorAll("input").forEach(function (input) {
        input.addEventListener("input", function () {
          if (!row.events[index]) row.events[index] = { label: "", on: "" };
          if (input.hasAttribute("data-event-label")) row.events[index].label = input.value;
          if (input.hasAttribute("data-event-on")) row.events[index].on = input.value;
          markDirty();
          paintCompare();
        });
      });
      var remove = line.querySelector("[data-event-remove]");
      if (remove) {
        remove.addEventListener("click", function () {
          harvest();
          row.events.splice(index, 1);
          markDirty();
          render();
        });
      }
    });
    var add = block.querySelector("[data-add-event]");
    if (add) {
      add.addEventListener("click", function () {
        harvest();
        row.events.push({ label: "", on: "" });
        markDirty();
        render();
      });
    }
  }

  function bindFields(block, row, onTitle) {
    block.querySelectorAll("[data-key]").forEach(function (input) {
      input.addEventListener("input", function () {
        row[input.getAttribute("data-key")] = input.value;
        if (onTitle && (input.getAttribute("data-key") === "company_name" || input.getAttribute("data-key") === "app_name")) {
          onTitle();
        }
        markDirty();
        paintCompare();
      });
    });
    bindEvents(block, row);
  }

  function bindSelf() {
    var block = root.querySelector('[data-block="self"]');
    if (!block) return;
    bindFields(block, selfRow);
  }

  function bindList() {
    var list = el("list");
    if (!list) return;
    competitors.forEach(function (row) {
      var block = list.querySelector('[data-block="' + row.localKey + '"]');
      if (!block) return;
      bindFields(block, row, function () {
        var title = block.querySelector("h3");
        if (title) title.textContent = competitorTitle(row, competitors.indexOf(row));
      });
      var remove = block.querySelector("[data-remove]");
      if (remove) {
        remove.addEventListener("click", function () {
          var name = competitorTitle(row, competitors.indexOf(row));
          if (!window.confirm("Remove " + name + "?")) return;
          harvest();
          competitors = competitors.filter(function (item) { return item.localKey !== row.localKey; });
          markDirty();
          paintLists();
        });
      }
    });
  }

  function render() {
    if (!root) return;
    var banner = el("banner");
    var bannerText = banner ? banner.textContent : "";
    var bannerOk = banner ? banner.classList.contains("is-ok") : false;
    root.innerHTML = shell();
    paintLists();
    bindSelf();
    var add = el("add");
    if (add) {
      add.addEventListener("click", function () {
        harvest();
        competitors.push(blank(false));
        markDirty();
        paintLists();
      });
    }
    if (bannerText) showMsg(bannerText, bannerOk);
    syncSaveButton();
  }

  function cleanEvents(list) {
    return (list || []).map(function (ev) {
      return {
        label: String((ev && ev.label) || "").trim(),
        on: dateOrNull(ev && ev.on) || ""
      };
    }).filter(function (ev) {
      return ev.label || ev.on;
    });
  }

  function payload(row, isSelf) {
    return {
      is_self: !!isSelf,
      company_name: row.company_name || "",
      app_name: row.app_name || "",
      domain_name: row.domain_name || "",
      domain_registered_on: dateOrNull(row.domain_registered_on),
      llc_registered_on: dateOrNull(row.llc_registered_on),
      apple_launched_on: dateOrNull(row.apple_launched_on),
      android_launched_on: dateOrNull(row.android_launched_on),
      notes: row.notes || "",
      events: cleanEvents(row.events)
    };
  }

  function upsert(row, isSelf) {
    var body = payload(row, isSelf);
    if (row.id) {
      return db.from("studio_competitors").update(body).eq("id", row.id).select("*").single();
    }
    return db.from("studio_competitors").insert(body).select("*").single();
  }

  function saveAll() {
    if (saving || !dirty || !db) return;
    harvest();
    saving = true;
    syncSaveButton();
    showMsg("Saving…", true);
    var keep = competitors.map(function (row) { return row.id; }).filter(Boolean);
    var gone = loadedIds.filter(function (id) { return keep.indexOf(id) === -1 && id !== selfRow.id; });
    var jobs = [upsert(selfRow, true)].concat(competitors.map(function (row) {
      return upsert(row, false);
    })).concat(gone.map(function (id) {
      return db.from("studio_competitors").delete().eq("id", id);
    }));
    Promise.all(jobs).then(function (results) {
      saving = false;
      var failed = results.filter(function (res) { return res && res.error; })[0];
      if (failed) {
        showMsg(missingTable(failed.error)
          ? "Run sql/040_competitors.sql in Supabase, then refresh."
          : failed.error.message, false);
        syncSaveButton();
        return;
      }
      var selfRes = results[0];
      selfRow = fromDb(selfRes.data);
      competitors = results.slice(1, 1 + competitors.length).map(function (res) { return fromDb(res.data); });
      loadedIds = [selfRow.id].concat(competitors.map(function (row) { return row.id; })).filter(Boolean);
      clearDirty();
      render();
      showMsg("Saved", true);
      setTimeout(function () { if (!dirty) showMsg(""); }, 1200);
    }).catch(function (err) {
      saving = false;
      showMsg((err && err.message) || "Save failed.", false);
      syncSaveButton();
    });
  }

  function load() {
    showMsg("Loading…", true);
    return db.from("studio_competitors").select("*").order("created_at", { ascending: true }).then(function (res) {
      if (res.error) {
        showMsg(missingTable(res.error)
          ? "Run sql/040_competitors.sql in Supabase, then refresh."
          : res.error.message, false);
        render();
        return;
      }
      var rows = res.data || [];
      var mine = rows.filter(function (row) { return row.is_self; })[0];
      selfRow = mine ? fromDb(mine) : blank(true);
      competitors = rows.filter(function (row) { return !row.is_self; }).map(fromDb);
      loadedIds = rows.map(function (row) { return row.id; });
      clearDirty();
      render();
      showMsg("");
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not load competitors.", false);
      render();
    });
  }

  window.STLCompetitors = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      selfRow = blank(true);
      competitors = [];
      loadedIds = [];
      dirty = false;
      saving = false;
      panel.innerHTML = "";
      syncSaveButton();
      load();
    },
    unmount: function () {
      hideSaveButton();
      root = null;
    },
    saveAll: saveAll,
    isDirty: function () { return dirty; }
  };
})();

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

  function verdict(mine, theirs) {
    var a = parseDay(mine);
    var b = parseDay(theirs);
    if (!a || !b) return { text: "Add both dates", kind: "open" };
    var diff = Math.round((b.getTime() - a.getTime()) / 86400000);
    if (diff === 0) return { text: "Same day", kind: "same" };
    if (diff > 0) return { text: "You were first by " + diff + (diff === 1 ? " day" : " days"), kind: "you" };
    var n = Math.abs(diff);
    return { text: "They were first by " + n + (n === 1 ? " day" : " days"), kind: "them" };
  }

  function field(label, key, value, type) {
    return (
      '<div class="field"><label>' + esc(label) + "</label>" +
      '<input data-key="' + key + '" type="' + (type || "text") + '" value="' + esc(value || "") + '" /></div>'
    );
  }

  function notesField(value) {
    return (
      '<div class="field comp-notes-field"><label>Notes</label>' +
      '<textarea class="comp-notes" data-key="notes">' + esc(value || "") + "</textarea></div>"
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
        '<p class="comp-hint">A second product, a filing, a policy date, or anything else with a day.</p>' +
        lines +
        '<button class="btn btn-ghost comp-add-date" type="button" data-add-event>Add date</button>' +
        notesField(row.notes) +
      "</div>"
    );
  }

  function personFields(row) {
    return (
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
        '<section class="comp-card" data-block="self">' +
          "<h2>You</h2>" +
          '<p class="comp-sub">These dates are what each competitor is compared to.</p>' +
          '<div class="comp-grid">' + personFields(selfRow) + "</div>" +
        "</section>" +
        '<div class="comp-head">' +
          '<h2 class="comp-section-title">Competitors</h2>' +
          '<button class="btn btn-primary" type="button" data-el="add">Add competitor</button>' +
        "</div>" +
        '<div data-el="list"></div>' +
        '<h2 class="comp-section-title">Compare</h2>' +
        '<div data-el="compare"></div>' +
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
            field("Company", "company_name", row.company_name) +
            personFields(row) +
          "</div>" +
        "</section>"
      );
    }).join("");
  }

  function compareHtml() {
    var yours = factsOf(selfRow, "You");
    var board = yours.slice();
    competitors.forEach(function (row, index) {
      board = board.concat(factsOf(row, competitorTitle(row, index)));
    });
    var boardBlock =
      '<article class="comp-compare-block comp-board">' +
        "<h3>Every date</h3>" +
        '<p class="comp-compare-domains">Oldest first. Your dates and every competitor.</p>' +
        timelineHtml(board, "Add dates to see the order.") +
      "</article>";
    if (!competitors.length) {
      return boardBlock + '<p class="comp-empty">Add a competitor to see who was first.</p>';
    }
    var blocks = competitors.map(function (row, index) {
      var name = competitorTitle(row, index);
      var lines = METRICS.map(function (metric) {
        var result = verdict(selfRow[metric.key], row[metric.key]);
        var mine = formatDay(selfRow[metric.key]) || "No date";
        var theirs = formatDay(row[metric.key]) || "No date";
        return (
          '<div class="comp-line">' +
            "<strong>" + esc(metric.label) + "</strong>" +
            '<span class="comp-you">You · ' + esc(mine) + "</span>" +
            '<span class="comp-them">Them · ' + esc(theirs) + "</span>" +
            '<span class="comp-verdict is-' + result.kind + '">' + esc(result.text) + "</span>" +
          "</div>"
        );
      }).join("");
      var domainLine = (selfRow.domain_name || "Your domain") + "  ·  " + (row.domain_name || "Their domain");
      var pair = factsOf(selfRow, "You").concat(factsOf(row, name));
      return (
        '<article class="comp-compare-block">' +
          "<h3>" + esc(selfRow.app_name || "You") + " and " + esc(name) + "</h3>" +
          '<p class="comp-compare-domains">' + esc(domainLine) + "</p>" +
          lines +
          '<p class="comp-hint">Dates, oldest first</p>' +
          timelineHtml(pair, "Add dates to see this pair.") +
        "</article>"
      );
    }).join("");
    return boardBlock + blocks;
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
      company_name: isSelf ? "" : (row.company_name || ""),
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

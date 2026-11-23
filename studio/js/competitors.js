(function () {
  "use strict";

  // Side-by-side comparison. Each row of the table is one fact; each column is one app.
  // col: true  -> stored in its own database column. Otherwise it lives in row.details.
  // best: "low" | "high" | "early" -> which value gets the green "best" highlight.
  var GROUPS = [
    {
      title: "Basics",
      fields: [
        { key: "app_name", label: "App", type: "text", col: true },
        { key: "company_name", label: "Company", type: "text", col: true },
        { key: "domain_name", label: "Website", type: "site", col: true },
        { key: "based_in", label: "Based in", type: "text" },
        { key: "app_store_seller", label: "App Store seller", type: "text" },
        { key: "play_developer", label: "Google Play developer", type: "text" }
      ]
    },
    {
      title: "Who was first",
      fields: [
        { key: "domain_registered_on", label: "Domain registered", type: "date", col: true, best: "early" },
        { key: "llc_registered_on", label: "LLC registered", type: "date", col: true, best: "early" },
        { key: "apple_launched_on", label: "On the App Store", type: "date", col: true, best: "early" },
        { key: "android_launched_on", label: "On Google Play", type: "date", col: true, best: "early" }
      ]
    },
    {
      title: "Price",
      fields: [
        { key: "price_monthly", label: "Monthly", type: "money", best: "low" },
        { key: "price_yearly", label: "Yearly plan", type: "money", best: "low" },
        { key: "year_cost", label: "Cost for a year", type: "computed", best: "low" },
        { key: "free_tier", label: "Free tier", type: "text" },
        { key: "trial", label: "Free trial", type: "text" },
        { key: "fleet_plan", label: "Fleet plan", type: "text" },
        { key: "other_prices", label: "Other prices", type: "text" }
      ]
    },
    {
      title: "Ratings",
      fields: [
        { key: "ios_rating", countKey: "ios_rating_count", label: "App Store rating", type: "rating", best: "high" },
        { key: "android_rating", countKey: "android_rating_count", label: "Google Play rating", type: "rating", best: "high" },
        { key: "android_downloads", label: "Google Play downloads", type: "text" },
        { key: "ratings_checked_on", label: "Checked on", type: "day" }
      ]
    },
    {
      title: "Permits and coverage",
      fields: [
        { key: "import_state_count", label: "States it imports permits from", type: "num", best: "high" },
        { key: "import_states", label: "Which states", type: "long" },
        { key: "import_methods", label: "How a permit gets in", type: "text" },
        { key: "build_own_route", label: "Build a route yourself", type: "yesno" },
        { key: "other_coverage", label: "Other coverage claims", type: "long" }
      ]
    },
    {
      title: "Driving",
      fields: [
        { key: "turn_by_turn", label: "Turn-by-turn", type: "yesno" },
        { key: "voice", label: "Voice directions", type: "yesno" },
        { key: "off_route", label: "Off-route alerts", type: "yesno" },
        { key: "carplay", label: "CarPlay", type: "yesno" },
        { key: "android_auto", label: "Android Auto", type: "yesno" },
        { key: "ipad", label: "iPad", type: "yesno" },
        { key: "pilot_directory", label: "Pilot car directory", type: "yesno" },
        { key: "extras", label: "Other features", type: "long" }
      ]
    },
    {
      title: "Store listings",
      fields: [
        { key: "app_store_url", label: "App Store", type: "url" },
        { key: "play_url", label: "Google Play", type: "url" },
        { key: "ios_version", label: "iOS version", type: "text" },
        { key: "ios_updated", label: "Last iOS update", type: "day" },
        { key: "android_updated", label: "Last Android update", type: "day" }
      ]
    }
  ];

  var root = null;
  var db = null;
  var selfRow = blank(true);
  var competitors = [];
  var loadedIds = [];
  var dirty = false;
  var saving = false;
  var editing = false;
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
      events: [],
      details: {}
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

  function detailsOf(raw) {
    var obj = raw;
    if (typeof obj === "string") {
      try { obj = JSON.parse(obj); } catch (err) { obj = {}; }
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    var out = {};
    Object.keys(obj).forEach(function (k) {
      out[k] = typeof obj[k] === "boolean" ? obj[k] : (obj[k] == null ? "" : String(obj[k]));
    });
    return out;
  }

  function fromDb(row) {
    var day = function (v) { return v ? String(v).slice(0, 10) : ""; };
    return {
      id: row.id,
      localKey: row.id,
      is_self: !!row.is_self,
      company_name: row.company_name || "",
      app_name: row.app_name || "",
      domain_name: row.domain_name || "",
      domain_registered_on: day(row.domain_registered_on),
      llc_registered_on: day(row.llc_registered_on),
      apple_launched_on: day(row.apple_launched_on),
      android_launched_on: day(row.android_launched_on),
      notes: row.notes || "",
      events: eventsOf(row.events),
      details: detailsOf(row.details)
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

  function numberOf(v) {
    var s = String(v == null ? "" : v).replace(/[$,\s]/g, "");
    if (!s) return null;
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function money(n) {
    if (n == null) return "";
    return "$" + n.toFixed(2);
  }

  // ---------- reading and writing one value ----------

  function rawValue(row, field) {
    if (field.col) return row[field.key] || "";
    var v = row.details[field.key];
    return v == null ? "" : v;
  }

  function setValue(row, key, value, isCol) {
    if (isCol) row[key] = value;
    else row.details[key] = value;
  }

  function yearCost(row) {
    var yearly = numberOf(row.details.price_yearly);
    var monthly = numberOf(row.details.price_monthly);
    if (yearly != null && monthly != null) return Math.min(yearly, monthly * 12);
    if (yearly != null) return yearly;
    if (monthly != null) return Math.round(monthly * 12 * 100) / 100;
    return null;
  }

  // The number or date used to pick the best cell in a row.
  function sortValue(row, field) {
    if (field.type === "computed") return yearCost(row);
    if (field.type === "date") return dateOrNull(rawValue(row, field));
    return numberOf(rawValue(row, field));
  }

  function bestKeys(field, rows) {
    if (!field.best) return {};
    var best = null;
    rows.forEach(function (row) {
      var v = sortValue(row, field);
      if (v == null) return;
      if (best == null) best = v;
      else if (field.best === "low" || field.best === "early") { if (v < best) best = v; }
      else if (v > best) best = v;
    });
    var out = { value: best };
    if (best == null) return out;
    var count = 0;
    rows.forEach(function (row) {
      if (sortValue(row, field) === best) { out[row.localKey] = true; count++; }
    });
    // Only highlight when it actually separates the apps.
    var withValue = rows.filter(function (row) { return sortValue(row, field) != null; }).length;
    if (count === withValue && withValue > 1) return { value: best };
    return out;
  }

  // ---------- view mode cells ----------

  function siteLink(v) {
    var s = String(v || "").trim();
    if (!s) return "";
    var href = /^https?:\/\//i.test(s) ? s : "https://" + s;
    return '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(s.replace(/^https?:\/\//i, "").replace(/\/$/, "")) + "</a>";
  }

  function viewCell(row, field, best) {
    var v = rawValue(row, field);
    var blankCell = '<span class="comp-none">—</span>';
    switch (field.type) {
      case "site":
        return siteLink(v) || blankCell;
      case "url":
        return v ? '<a href="' + esc(v) + '" target="_blank" rel="noopener">Open listing</a>' : blankCell;
      case "date": {
        if (!dateOrNull(v)) return blankCell;
        var tag = "";
        if (best.value) {
          var n = daysBetween(best.value, v);
          tag = n === 0 ? '<span class="comp-tag is-first">First</span>' : '<span class="comp-tag">' + n + (n === 1 ? " day" : " days") + " later</span>";
        }
        return esc(formatDay(v)) + tag;
      }
      case "day":
        return dateOrNull(v) ? esc(formatDay(v)) : blankCell;
      case "money": {
        var m = numberOf(v);
        return m == null ? (v ? esc(v) : blankCell) : esc(money(m));
      }
      case "computed": {
        var c = yearCost(row);
        return c == null ? blankCell : esc(money(c));
      }
      case "num": {
        var nv = numberOf(v);
        return nv == null ? (v ? esc(v) : blankCell) : esc(String(nv));
      }
      case "rating": {
        var r = numberOf(v);
        var count = numberOf(row.details[field.countKey]);
        if (r == null) {
          return count === 0 ? '<span class="comp-none">No ratings yet</span>' : blankCell;
        }
        return '<span class="comp-star">★</span> ' + esc(r.toFixed(1)) +
          (count != null ? ' <span class="comp-count">(' + esc(count) + ")</span>" : "");
      }
      case "yesno":
        if (v === "yes") return '<span class="comp-yes">Yes</span>';
        if (v === "no") return '<span class="comp-no">No</span>';
        return blankCell;
      default:
        return v ? esc(v).replace(/\n/g, "<br>") : blankCell;
    }
  }

  // ---------- edit mode cells ----------

  function input(row, key, value, type, isCol, extra) {
    return '<input class="comp-in" data-row="' + esc(row.localKey) + '" data-key="' + esc(key) + '"' +
      (isCol ? ' data-col="1"' : "") + ' type="' + type + '" value="' + esc(value) + '"' + (extra || "") + " />";
  }

  function editCell(row, field) {
    var v = rawValue(row, field);
    switch (field.type) {
      case "date":
      case "day":
        return input(row, field.key, v, "date", field.col);
      case "money":
      case "num":
        return input(row, field.key, v, "text", field.col, ' inputmode="decimal"' + (field.type === "money" ? ' placeholder="$"' : ""));
      case "computed":
        return '<span class="comp-none">Figured from the prices</span>';
      case "rating":
        return '<div class="comp-pair">' +
          input(row, field.key, v, "text", false, ' inputmode="decimal" placeholder="4.6"') +
          input(row, field.countKey, row.details[field.countKey] || "", "text", false, ' inputmode="numeric" placeholder="# ratings"') +
          "</div>";
      case "yesno":
        return '<select class="comp-in" data-row="' + esc(row.localKey) + '" data-key="' + esc(field.key) + '">' +
          ["", "yes", "no"].map(function (opt) {
            var label = opt === "" ? "Not sure" : opt === "yes" ? "Yes" : "No";
            return '<option value="' + opt + '"' + (v === opt ? " selected" : "") + ">" + label + "</option>";
          }).join("") +
          "</select>";
      case "long":
        return '<textarea class="comp-in" rows="3" data-row="' + esc(row.localKey) + '" data-key="' + esc(field.key) + '">' + esc(v) + "</textarea>";
      default:
        return input(row, field.key, v, field.type === "url" ? "url" : "text", field.col);
    }
  }

  // ---------- table ----------

  function allRows() {
    return [selfRow].concat(competitors);
  }

  function shownRows() {
    return allRows().filter(function (row) { return row.is_self || !row.details.hidden; });
  }

  function titleOf(row, index) {
    if (row.is_self) return row.app_name || "You";
    return row.app_name || row.company_name || ("Competitor " + (index + 1));
  }

  function headCell(row) {
    var index = competitors.indexOf(row);
    var name = titleOf(row, index);
    var sub = row.is_self ? "You" : (row.company_name && row.company_name !== name ? row.company_name : "");
    return (
      '<th class="comp-col' + (row.is_self ? " is-you" : "") + '" scope="col">' +
        '<div class="comp-col-name">' + esc(name) + "</div>" +
        (sub ? '<div class="comp-col-sub">' + esc(sub) + "</div>" : "") +
        (editing && !row.is_self
          ? '<button class="comp-remove" type="button" data-remove="' + esc(row.localKey) + '">Remove</button>'
          : "") +
      "</th>"
    );
  }

  function tableHtml() {
    var rows = shownRows();
    var head = '<tr><th class="comp-rowhead comp-corner" scope="col"></th>' + rows.map(headCell).join("") + "</tr>";
    var body = GROUPS.map(function (group) {
      var lines = group.fields.map(function (field) {
        var best = bestKeys(field, rows);
        return (
          "<tr>" +
            '<th class="comp-rowhead" scope="row">' + esc(field.label) + "</th>" +
            rows.map(function (row) {
              var cls = "comp-cell";
              if (row.is_self) cls += " is-you";
              if (!editing && best[row.localKey]) cls += " is-best";
              return '<td class="' + cls + '">' + (editing ? editCell(row, field) : viewCell(row, field, best)) + "</td>";
            }).join("") +
          "</tr>"
        );
      }).join("");
      return (
        '<tbody><tr class="comp-group"><th colspan="' + (rows.length + 1) + '">' + esc(group.title) + "</th></tr>" +
        lines + "</tbody>"
      );
    }).join("");
    return '<div class="comp-table-wrap"><table class="comp-table"><thead>' + head + "</thead>" + body + "</table></div>";
  }

  function chipsHtml() {
    var others = competitors;
    if (!others.length) return "";
    return (
      '<div class="comp-chips"><span class="comp-chips-label">In the table</span>' +
        others.map(function (row, index) {
          var on = !row.details.hidden;
          return '<button type="button" class="ops-pill' + (on ? " is-on" : "") + '" data-toggle-show="' + esc(row.localKey) + '">' +
            esc(titleOf(row, index) + (row.company_name && row.company_name !== titleOf(row, index) ? " · " + row.company_name : "")) +
            "</button>";
        }).join("") +
      "</div>"
    );
  }

  // ---------- notes and other dates ----------

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
      '<div class="comp-events-head"><h4>Other dates</h4></div>' +
      lines +
      '<button class="btn btn-ghost comp-add-date" type="button" data-add-event>Add date</button>' +
      '<h4 class="comp-notes-title">Notes</h4>' +
      '<textarea class="comp-notes" data-notes>' + esc(row.notes || "") + "</textarea>"
    );
  }

  function notesListHtml() {
    return allRows().map(function (row) {
      var index = competitors.indexOf(row);
      var name = titleOf(row, index);
      var sub = row.company_name && row.company_name !== name ? " · " + row.company_name : "";
      var count = (row.events || []).length;
      return (
        '<details class="comp-card comp-notes-card" data-block="' + esc(row.localKey) + '">' +
          "<summary><strong>" + esc(name) + "</strong><span>" + esc(sub) + "</span>" +
            '<span class="comp-notes-meta">' + (row.notes ? "Notes" : "No notes") + (count ? " · " + count + (count === 1 ? " date" : " dates") : "") +
            (row.details.hidden ? " · not in table" : "") + "</span>" +
          "</summary>" +
          '<div class="comp-notes-body">' + eventsHtml(row) + "</div>" +
        "</details>"
      );
    }).join("");
  }

  // ---------- every date ----------

  function factsOf(row, who) {
    var facts = [];
    GROUPS[1].fields.forEach(function (field) {
      var on = dateOrNull(row[field.key]);
      if (on) facts.push({ on: on, who: who, you: row.is_self, label: field.label });
    });
    (row.events || []).forEach(function (ev) {
      var label = String(ev.label || "").trim();
      var on = dateOrNull(ev.on);
      if (on) facts.push({ on: on, who: who, you: row.is_self, label: label || "Other date" });
    });
    return facts;
  }

  function timelineHtml() {
    var facts = [];
    shownRows().forEach(function (row) {
      facts = facts.concat(factsOf(row, titleOf(row, competitors.indexOf(row))));
    });
    facts.sort(function (a, b) {
      if (a.on !== b.on) return a.on < b.on ? -1 : 1;
      if (a.you !== b.you) return a.you ? -1 : 1;
      return a.who.localeCompare(b.who);
    });
    if (!facts.length) return '<p class="comp-empty">Add dates to see the order.</p>';
    return facts.map(function (f) {
      return (
        '<div class="comp-time">' +
          "<span>" + esc(formatDay(f.on)) + "</span>" +
          '<span class="comp-time-who ' + (f.you ? "is-you" : "is-them") + '">' + esc(f.who) + "</span>" +
          "<span>" + esc(f.label) + "</span>" +
        "</div>"
      );
    }).join("");
  }

  // ---------- page ----------

  function shell() {
    return (
      '<div class="comp-page">' +
        '<div class="comp-top">' +
          "<div><h1>Competitors</h1>" +
          '<p class="comp-sub">Side by side. Green is the best in that row.</p></div>' +
          '<div class="comp-top-actions">' +
            '<button class="btn btn-ghost" type="button" data-el="add">Add competitor</button>' +
            '<button class="btn ' + (editing ? "btn-primary" : "btn-ghost") + '" type="button" data-el="edit">' + (editing ? "Done editing" : "Edit") + "</button>" +
          "</div>" +
        "</div>" +
        '<p class="status" data-el="banner"></p>' +
        '<div data-el="chips"></div>' +
        '<div data-el="table"></div>' +
        '<details class="comp-card comp-timeline">' +
          "<summary><strong>Every date in order</strong></summary>" +
          '<div data-el="timeline"></div>' +
        "</details>" +
        '<h2 class="comp-section-title">Notes and other dates</h2>' +
        '<div data-el="notes"></div>' +
      "</div>"
    );
  }

  function rowByKey(key) {
    return allRows().filter(function (row) { return row.localKey === key; })[0] || null;
  }

  function paint() {
    if (!root) return;
    var chips = el("chips");
    var table = el("table");
    var timeline = el("timeline");
    var notes = el("notes");
    if (chips) chips.innerHTML = chipsHtml();
    if (table) table.innerHTML = tableHtml();
    if (timeline) timeline.innerHTML = timelineHtml();
    if (notes) {
      var open = {};
      notes.querySelectorAll("details[open]").forEach(function (d) { open[d.getAttribute("data-block")] = true; });
      notes.innerHTML = notesListHtml();
      notes.querySelectorAll("details").forEach(function (d) {
        if (open[d.getAttribute("data-block")]) d.open = true;
      });
    }
    bindTable();
    bindChips();
    bindNotes();
  }

  function bindTable() {
    var table = el("table");
    if (!table) return;
    table.querySelectorAll(".comp-in").forEach(function (box) {
      var handler = function () {
        var row = rowByKey(box.getAttribute("data-row"));
        if (!row) return;
        setValue(row, box.getAttribute("data-key"), box.value, box.hasAttribute("data-col"));
        markDirty();
      };
      box.addEventListener("input", handler);
      box.addEventListener("change", handler);
    });
    table.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = rowByKey(btn.getAttribute("data-remove"));
        if (!row) return;
        var name = titleOf(row, competitors.indexOf(row));
        if (!window.confirm("Remove " + name + " and all of its notes? This happens when you press Save.")) return;
        competitors = competitors.filter(function (item) { return item !== row; });
        markDirty();
        paint();
      });
    });
  }

  function bindChips() {
    var chips = el("chips");
    if (!chips) return;
    chips.querySelectorAll("[data-toggle-show]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = rowByKey(btn.getAttribute("data-toggle-show"));
        if (!row) return;
        row.details.hidden = !row.details.hidden;
        markDirty();
        paint();
      });
    });
  }

  function bindNotes() {
    var notes = el("notes");
    if (!notes) return;
    allRows().forEach(function (row) {
      var block = notes.querySelector('[data-block="' + row.localKey + '"]');
      if (!block) return;
      var area = block.querySelector("[data-notes]");
      if (area) {
        area.addEventListener("input", function () {
          row.notes = area.value;
          markDirty();
        });
      }
      block.querySelectorAll("[data-event-index]").forEach(function (line) {
        var index = Number(line.getAttribute("data-event-index"));
        line.querySelectorAll("input").forEach(function (box) {
          box.addEventListener("input", function () {
            if (!row.events[index]) row.events[index] = { label: "", on: "" };
            if (box.hasAttribute("data-event-label")) row.events[index].label = box.value;
            if (box.hasAttribute("data-event-on")) row.events[index].on = box.value;
            markDirty();
          });
          box.addEventListener("change", function () {
            var timeline = el("timeline");
            if (timeline) timeline.innerHTML = timelineHtml();
          });
        });
        var remove = line.querySelector("[data-event-remove]");
        if (remove) {
          remove.addEventListener("click", function () {
            row.events.splice(index, 1);
            markDirty();
            paint();
          });
        }
      });
      var add = block.querySelector("[data-add-event]");
      if (add) {
        add.addEventListener("click", function () {
          row.events.push({ label: "", on: "" });
          markDirty();
          paint();
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
    paint();
    var add = el("add");
    if (add) {
      add.addEventListener("click", function () {
        var row = blank(false);
        row.app_name = "New app";
        competitors.push(row);
        editing = true;
        markDirty();
        render();
      });
    }
    var edit = el("edit");
    if (edit) {
      edit.addEventListener("click", function () {
        editing = !editing;
        render();
      });
    }
    if (bannerText) showMsg(bannerText, bannerOk);
    syncSaveButton();
  }

  // ---------- save and load ----------

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

  function cleanDetails(details) {
    var out = {};
    Object.keys(details || {}).forEach(function (k) {
      var v = details[k];
      if (typeof v === "boolean") { if (v) out[k] = true; return; }
      v = String(v == null ? "" : v).trim();
      if (v) out[k] = v;
    });
    return out;
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
      events: cleanEvents(row.events),
      details: cleanDetails(row.details)
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
        var msg = failed.error.message || "Save failed.";
        if (missingTable(failed.error)) msg = "Run sql/082_competitor_details.sql in Studio Supabase, then refresh.";
        showMsg(msg, false);
        syncSaveButton();
        return;
      }
      selfRow = fromDb(results[0].data);
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
          ? "Run sql/040_competitors.sql and sql/082_competitor_details.sql in Studio Supabase, then refresh."
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
      editing = false;
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

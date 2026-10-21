(function () {
  "use strict";

  var COLORS = {
    renewal: "#8C59D9",
    invoice: "#F29E2E",
    project: "#7361D9",
    lead: "#D96640",
    meeting: "#5973CC",
    note: "#12213D",
    danger: "#BF5261"
  };

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var root = null;
  var db = null;
  var month = startOfMonth(new Date());
  var selectedDay = startOfDay(new Date());
  var view = "month";
  var pickerOpen = false;
  var pickerYear = new Date().getFullYear();
  var notesByDay = {};
  var noteIds = {};
  var hiddenKeys = {};
  var events = [];
  var noteTimer = null;
  var loading = false;

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

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function addDays(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }

  function startOfWeek(d) {
    var x = startOfDay(d);
    return addDays(x, -x.getDay());
  }

  function sameMonth(d, m) {
    return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
  }

  function isoDay(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function parseISO(iso) {
    if (!iso) return null;
    var parts = String(iso).slice(0, 10).split("-");
    if (parts.length !== 3) return null;
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function sameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function money(n) {
    return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function monthTitle(d) {
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  function weekdayTitle(d) {
    return d.toLocaleDateString("en-US", { weekday: "long" });
  }

  function longDate(d) {
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  function isToday(d) {
    return sameDay(d, new Date());
  }

  function isShowingToday() {
    var now = new Date();
    return sameDay(selectedDay, now) && month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  }

  function weekdaySymbols() {
    // Sunday-first like en_US default (matches most Mac US calendars)
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  }

  function hexToRgba(hex, alpha) {
    var h = String(hex || "").replace("#", "");
    if (h.length !== 6) return "rgba(18, 33, 61, " + alpha + ")";
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
  }

  function daysInMonthGrid() {
    var first = startOfMonth(month);
    var leading = first.getDay(); // 0=Sun
    var start = new Date(first);
    start.setDate(first.getDate() - leading);
    var days = [];
    var cursor = new Date(start);
    for (var i = 0; i < 42; i += 1) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  function daysInView() {
    if (view === "week") {
      var start = startOfWeek(selectedDay);
      var days = [];
      for (var i = 0; i < 7; i += 1) days.push(addDays(start, i));
      return days;
    }
    var count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    var list = [];
    for (var d = 1; d <= count; d += 1) list.push(new Date(month.getFullYear(), month.getMonth(), d));
    return list;
  }

  function sortEvents(list) {
    return list.sort(function (a, b) {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
      return a.title.localeCompare(b.title);
    });
  }

  function eventsOn(day, includeHidden) {
    return sortEvents(events.filter(function (e) {
      if (!sameDay(e.date, day)) return false;
      var hidden = !!hiddenKeys[e.id];
      return includeHidden ? hidden : !hidden;
    }));
  }

  function noteBody(day) {
    return notesByDay[isoDay(day)] || "";
  }

  function notePreview(day) {
    var body = noteBody(day);
    var line = body.split(/\n/).map(function (x) { return x.trim(); }).find(function (x) { return x; });
    return line || "";
  }

  function rangeTitle() {
    if (view !== "week") return monthTitle(month);
    var start = startOfWeek(selectedDay);
    var end = addDays(start, 6);
    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
      return start.toLocaleDateString("en-US", { month: "long" }) + " " + start.getDate() + " – " + end.getDate() + ", " + end.getFullYear();
    }
    var a = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    var b = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return a + " – " + b;
  }

  function shell() {
    return (
      '<div class="calendar-workspace">' +
        '<section class="cal-month">' +
          '<div class="cal-month-header">' +
            '<button class="cal-nav-btn" type="button" data-el="prev" aria-label="Previous month">‹</button>' +
            '<button class="cal-month-title" type="button" data-el="month-title" aria-haspopup="true" aria-expanded="false"></button>' +
            '<button class="cal-nav-btn" type="button" data-el="next" aria-label="Next month">›</button>' +
            '<div class="cal-views" role="tablist" aria-label="Calendar view">' +
              '<button class="cal-view-btn is-on" type="button" data-view="month" role="tab" aria-selected="true">Month</button>' +
              '<button class="cal-view-btn" type="button" data-view="week" role="tab" aria-selected="false">Week</button>' +
              '<button class="cal-view-btn" type="button" data-view="agenda" role="tab" aria-selected="false">Agenda</button>' +
            "</div>" +
            '<span class="cal-counts" data-el="counts"></span>' +
            '<button class="cal-today-btn" type="button" data-el="today">Today</button>' +
          "</div>" +
          '<p class="status cal-banner" data-el="banner"></p>' +
          '<div class="cal-picker" data-el="picker" hidden></div>' +
          '<div class="cal-board" data-el="board"></div>' +
        "</section>" +
        '<aside class="cal-day" data-el="day-pane"></aside>' +
      "</div>"
    );
  }

  function legendItem(title, color) {
    return (
      '<span class="cal-legend-item">' +
        '<span class="cal-legend-swatch" style="background:' + color + '"></span>' +
        esc(title) +
      "</span>"
    );
  }

  function legendHtml() {
    return (
      '<div class="cal-legend">' +
        legendItem("Renewal", COLORS.renewal) +
        legendItem("Invoice", COLORS.invoice) +
        legendItem("Project", COLORS.project) +
        legendItem("Meeting", COLORS.meeting) +
        legendItem("Note", COLORS.note) +
      "</div>"
    );
  }

  function eventChip(event) {
    return (
      '<div class="cal-event" style="background:' + hexToRgba(event.tint, 0.16) + '" title="' + esc(event.title) + '">' +
        '<span class="cal-event-bar" style="background:' + event.tint + '"></span>' +
        "<span>" + esc(event.title) + "</span>" +
      "</div>"
    );
  }

  function cellClass(day, inMonth) {
    var items = eventsOn(day);
    var overdue = items.some(function (e) { return e.isOverdue; });
    var weekend = day.getDay() === 0 || day.getDay() === 6;
    return "cal-cell"
      + (inMonth ? "" : " is-out")
      + (sameDay(day, selectedDay) ? " is-selected" : "")
      + (isToday(day) ? " is-today" : "")
      + (weekend ? " is-weekend" : "")
      + (overdue && inMonth ? " is-overdue" : "");
  }

  function cellTip(day) {
    var items = eventsOn(day);
    var lines = items.map(function (event) { return event.title; });
    var note = notePreview(day);
    if (note) lines.push(note);
    return lines.join("\n");
  }

  function dayHead(day) {
    var items = eventsOn(day);
    var overdue = items.some(function (e) { return e.isOverdue; });
    return (
      '<div class="cal-cell-top">' +
        '<span class="cal-daynum">' + day.getDate() + "</span>" +
        (overdue ? '<span class="cal-overdue-dot" title="Overdue"></span>' : "") +
      "</div>"
    );
  }

  function eventsHtml(day, cap) {
    var items = eventsOn(day);
    var shown = cap == null ? items : items.slice(0, cap);
    var extra = cap == null ? 0 : Math.max(0, items.length - cap);
    var html = shown.map(eventChip).join("");
    if (extra > 0) html += '<div class="cal-more">+' + extra + " more</div>";
    return html;
  }

  function noteHtml(day) {
    var note = notePreview(day);
    if (!note) return "";
    return '<div class="cal-note-preview">' + esc(note) + "</div>";
  }

  function paintHeader() {
    var title = el("month-title");
    title.textContent = rangeTitle();
    title.setAttribute("aria-expanded", pickerOpen ? "true" : "false");
    title.setAttribute("aria-label", rangeTitle() + ". Choose a month.");
    el("today").disabled = isShowingToday();
    var step = view === "week" ? "week" : "month";
    el("prev").setAttribute("aria-label", "Previous " + step);
    el("next").setAttribute("aria-label", "Next " + step);
    root.querySelectorAll("[data-view]").forEach(function (btn) {
      var on = btn.getAttribute("data-view") === view;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    paintCounts();
    paintPicker();
  }

  function paintCounts() {
    var box = el("counts");
    if (!box) return;
    var days = daysInView();
    var keys = {};
    days.forEach(function (day) { keys[isoDay(day)] = true; });
    var matched = events.filter(function (event) {
      return keys[isoDay(event.date)] && !hiddenKeys[event.id];
    });
    var overdue = matched.filter(function (event) { return event.isOverdue; }).length;
    var notes = 0;
    days.forEach(function (day) { if (trim(noteBody(day))) notes += 1; });
    var label = matched.length + (view === "week" ? " this week" : " this month");
    if (notes) label += " · " + notes + (notes === 1 ? " note" : " notes");
    box.innerHTML = "<span>" + esc(label) + "</span>" +
      (overdue ? '<span class="cal-count-overdue">' + overdue + " overdue</span>" : "");
  }

  function paintPicker() {
    var box = el("picker");
    if (!box) return;
    if (!pickerOpen) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    var now = new Date();
    var months = MONTHS.map(function (name, index) {
      var on = pickerYear === month.getFullYear() && index === month.getMonth();
      var todayMonth = pickerYear === now.getFullYear() && index === now.getMonth();
      return '<button type="button" class="cal-picker-month' +
        (on ? " is-on" : "") +
        (todayMonth ? " is-today" : "") +
        '" data-month="' + index + '">' + name + "</button>";
    }).join("");
    box.innerHTML =
      '<div class="cal-picker-year">' +
        '<button class="cal-nav-btn" type="button" data-el="picker-prev" aria-label="Previous year">‹</button>' +
        "<strong>" + pickerYear + "</strong>" +
        '<button class="cal-nav-btn" type="button" data-el="picker-next" aria-label="Next year">›</button>' +
      "</div>" +
      '<div class="cal-picker-months">' + months + "</div>";
    box.querySelector("[data-el='picker-prev']").addEventListener("click", function () {
      pickerYear -= 1;
      paintPicker();
    });
    box.querySelector("[data-el='picker-next']").addEventListener("click", function () {
      pickerYear += 1;
      paintPicker();
    });
    box.querySelectorAll("[data-month]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        jumpToMonth(pickerYear, Number(btn.getAttribute("data-month")));
      });
    });
  }

  function paintBoard() {
    var board = el("board");
    if (!board) return;
    var scroller = board.querySelector(".cal-agenda, .cal-week-grid");
    var scrollTop = scroller ? scroller.scrollTop : 0;
    if (view === "week") board.innerHTML = weekHtml();
    else if (view === "agenda") board.innerHTML = agendaHtml();
    else board.innerHTML = monthHtml();
    bindDayClicks(board);
    var next = board.querySelector(".cal-agenda, .cal-week-grid");
    if (next) next.scrollTop = scrollTop;
  }

  function weekdayRow() {
    return (
      '<div class="cal-weekdays">' +
        weekdaySymbols().map(function (name, index) {
          var weekend = index === 0 || index === 6;
          return '<span class="' + (weekend ? "is-weekend" : "") + '">' + esc(name) + "</span>";
        }).join("") +
      "</div>"
    );
  }

  function monthHtml() {
    var cells = daysInMonthGrid().map(function (day) {
      var inMonth = day.getMonth() === month.getMonth();
      var note = notePreview(day);
      var cap = note ? 2 : 4;
      return (
        '<button type="button" class="' + cellClass(day, inMonth) + '" data-day="' + isoDay(day) + '" title="' + esc(cellTip(day)) + '">' +
          dayHead(day) +
          '<div class="cal-cell-events">' + eventsHtml(day, cap) + "</div>" +
          noteHtml(day) +
        "</button>"
      );
    }).join("");
    return weekdayRow() + '<div class="cal-grid">' + cells + "</div>" + legendHtml();
  }

  function weekHtml() {
    var start = startOfWeek(selectedDay);
    var cols = [];
    for (var i = 0; i < 7; i += 1) {
      var day = addDays(start, i);
      cols.push(
        '<button type="button" class="cal-week-col ' + cellClass(day, true) + '" data-day="' + isoDay(day) + '" title="' + esc(cellTip(day)) + '">' +
          dayHead(day) +
          '<div class="cal-cell-events">' + eventsHtml(day, null) + "</div>" +
          noteHtml(day) +
        "</button>"
      );
    }
    return weekdayRow() + '<div class="cal-week-grid">' + cols.join("") + "</div>" + legendHtml();
  }

  function agendaHtml() {
    var days = daysInView().filter(function (day) {
      return sameDay(day, selectedDay) || eventsOn(day).length || trim(noteBody(day));
    });
    if (!days.length) {
      return '<div class="cal-agenda"><p class="cal-empty">Nothing on this month.</p></div>' + legendHtml();
    }
    var rows = days.map(function (day) {
      var items = eventsOn(day);
      var body = items.length
        ? '<div class="cal-cell-events">' + eventsHtml(day, null) + "</div>"
        : '<p class="cal-empty">Nothing scheduled.</p>';
      return (
        '<button type="button" class="cal-agenda-day' +
          (sameDay(day, selectedDay) ? " is-selected" : "") +
          (isToday(day) ? " is-today" : "") +
          '" data-day="' + isoDay(day) + '">' +
          '<div class="cal-agenda-date">' +
            '<span class="cal-daynum">' + day.getDate() + "</span>" +
            "<div><div class=\"wd\">" + esc(weekdayTitle(day)) + "</div>" +
            "<div class=\"md\">" + esc(day.toLocaleDateString("en-US", { month: "long" })) + "</div></div>" +
          "</div>" +
          '<div class="cal-agenda-body">' + body + noteHtml(day) + "</div>" +
        "</button>"
      );
    }).join("");
    return '<div class="cal-agenda">' + rows + "</div>" + legendHtml();
  }

  function bindDayClicks(board) {
    board.querySelectorAll("[data-day]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var parts = btn.getAttribute("data-day").split("-");
        var day = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        var inMonth = sameMonth(day, month);
        clearTimeout(noteTimer);
        persistCurrentNote().then(function () {
          selectedDay = startOfDay(day);
          if (view === "week" || (view === "month" && !inMonth)) month = startOfMonth(day);
          render();
        });
      });
    });
  }

  function render() {
    paintHeader();
    paintBoard();
    renderDayPane();
  }

  function eventLine(event, hidden) {
    var action = hidden
      ? '<button type="button" class="cal-restore-btn" data-restore="' + esc(event.id) + '">Put back</button>'
      : '<button type="button" class="cal-remove-btn" data-remove="' + esc(event.id) + '">Remove</button>';
    var open = hidden
      ? '<div class="cal-event-row is-hidden">'
      : '<button type="button" class="cal-event-row" data-event="' + esc(event.id) + '">';
    return (
      '<div class="cal-event-line">' +
        open +
          '<span class="cal-event-icon" style="background:' + event.tint + '">' + esc(event.icon) + "</span>" +
          "<div><strong>" + esc(event.title) + "</strong>" +
          '<div class="detail' + (event.isOverdue && !hidden ? " is-overdue" : "") + '">' +
            esc(hidden ? "Hidden on the calendar" : event.detail) +
          "</div></div>" +
          (hidden ? "" : '<span class="chev">›</span>') +
        (hidden ? "</div>" : "</button>") +
        action +
      "</div>"
    );
  }

  function renderDayPane() {
    var pane = el("day-pane");
    var items = eventsOn(selectedDay);
    var key = isoDay(selectedDay);
    var noteText = notesByDay[key] || "";

    var html =
      '<div class="cal-day-header">' +
        '<div class="weekday">' + esc(weekdayTitle(selectedDay)) +
          (isToday(selectedDay) ? '<span class="today-pill">Today</span>' : "") +
          '<span class="cal-day-nav">' +
            '<button class="cal-nav-btn" type="button" data-el="day-prev" aria-label="Previous day">‹</button>' +
            '<button class="cal-nav-btn" type="button" data-el="day-next" aria-label="Next day">›</button>' +
          "</span>" +
        "</div>" +
        "<h2>" + esc(longDate(selectedDay)) + "</h2>" +
      "</div>" +
      '<div class="cal-day-scroll">' +
        '<div class="cal-section">' +
          "<h3>From the studio</h3>" +
          '<p class="sub">Remove takes an item off this day. The record stays in Studio.</p>';

    var hidden = eventsOn(selectedDay, true);
    if (!items.length) {
      html += '<p class="cal-empty">' +
        (hidden.length ? "Nothing showing." : (isToday(selectedDay) ? "Nothing due today." : "Nothing scheduled.")) +
        "</p>";
    } else {
      items.forEach(function (event) {
        html += eventLine(event, false);
      });
    }

    html += "</div>";

    if (hidden.length) {
      html +=
        '<div class="cal-section">' +
          "<h3>Hidden</h3>" +
          '<p class="sub">Off the calendar until you put them back.</p>';
      hidden.forEach(function (event) {
        html += eventLine(event, true);
      });
      html += "</div>";
    }

    html +=
      '<div class="cal-notes-card">' +
        '<div class="cal-notes-head"><h3>Notes</h3>' +
          (trim(noteText) ? '<button type="button" class="cal-remove-btn" data-el="clear-note">Remove</button>' : "") +
        "</div>" +
        '<p class="sub">This text shows as a small line on the day in the grid.</p>' +
        '<textarea data-el="note" placeholder="Call, pickup, reminder…">' + esc(noteText) + "</textarea>" +
      "</div></div>";

    pane.innerHTML = html;

    pane.querySelector("[data-el='day-prev']").addEventListener("click", function () { moveSelection(-1); });
    pane.querySelector("[data-el='day-next']").addEventListener("click", function () { moveSelection(1); });

    pane.querySelectorAll("[data-event]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-event");
        var event = events.filter(function (e) { return e.id === id; })[0];
        if (event) openEvent(event);
      });
    });
    pane.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-remove");
        var event = events.filter(function (e) { return e.id === id; })[0];
        if (event) hideEvent(event);
      });
    });
    pane.querySelectorAll("[data-restore]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-restore");
        var event = events.filter(function (e) { return e.id === id; })[0];
        if (event) restoreEvent(event);
      });
    });
    var clearNote = pane.querySelector("[data-el='clear-note']");
    if (clearNote) {
      clearNote.addEventListener("click", function () {
        notesByDay[key] = "";
        clearTimeout(noteTimer);
        persistCurrentNote().then(function () { render(); });
      });
    }

    var note = el("note");
    if (note) {
      note.addEventListener("input", function () {
        notesByDay[key] = note.value;
        paintHeader();
        paintBoard();
        clearTimeout(noteTimer);
        noteTimer = setTimeout(function () {
          persistCurrentNote();
        }, 450);
      });
    }
  }

  function moveSelection(delta) {
    clearTimeout(noteTimer);
    persistCurrentNote().then(function () {
      selectedDay = addDays(selectedDay, delta);
      if (view === "week" || !sameMonth(selectedDay, month)) month = startOfMonth(selectedDay);
      render();
    });
  }

  function jumpToMonth(year, monthIndex) {
    clearTimeout(noteTimer);
    persistCurrentNote().then(function () {
      var dim = new Date(year, monthIndex + 1, 0).getDate();
      var dayNum = Math.min(selectedDay.getDate(), dim);
      selectedDay = new Date(year, monthIndex, dayNum);
      month = new Date(year, monthIndex, 1);
      pickerOpen = false;
      render();
    });
  }

  function hideMiss(message) {
    showMsg(/does not exist|schema cache/i.test(message || "")
      ? "Run sql/039_calendar_hidden.sql in Supabase, then refresh."
      : (message || "Could not update the calendar."), false);
  }

  function hideEvent(event) {
    if (!db || hiddenKeys[event.id]) return;
    db.from("calendar_hidden").insert({ event_key: event.id }).select("id,event_key").single()
      .then(function (res) {
        if (res.error) {
          hideMiss(res.error.message);
          return;
        }
        hiddenKeys[event.id] = res.data.id;
        render();
      });
  }

  function restoreEvent(event) {
    var id = hiddenKeys[event.id];
    if (!db || !id) return;
    db.from("calendar_hidden").delete().eq("id", id).then(function (res) {
      if (res.error) {
        hideMiss(res.error.message);
        return;
      }
      delete hiddenKeys[event.id];
      render();
    });
  }

  function persistCurrentNote() {
    if (!db) return Promise.resolve();
    var key = isoDay(selectedDay);
    var body = notesByDay[key] || "";
    var trimmed = trim(body);
    var existingId = noteIds[key];

    if (!trimmed) {
      if (!existingId) return Promise.resolve();
      return db.from("calendar_day_notes").delete().eq("id", existingId).then(function (res) {
        if (res.error) showMsg(res.error.message, false);
        else {
          delete notesByDay[key];
          delete noteIds[key];
        }
      });
    }

    if (existingId) {
      return db.from("calendar_day_notes").update({ body: body }).eq("id", existingId).then(function (res) {
        if (res.error) showMsg(res.error.message, false);
      });
    }

    return db.from("calendar_day_notes").insert({ day: key, body: body }).select("id,day").single()
      .then(function (res) {
        if (res.error) {
          showMsg(/does not exist|schema cache/i.test(res.error.message || "")
            ? "Run sql/007_calendar.sql in Supabase, then refresh."
            : res.error.message, false);
          return;
        }
        noteIds[key] = res.data.id;
      });
  }

  function openEvent(event) {
    if (!window.STLApp || !window.STLApp.navigate) return;
    if (event.destination === "billing") window.STLApp.navigate("billing");
    else if (event.destination === "renewals") window.STLApp.navigate("renewals");
    else if (event.destination === "projects") window.STLApp.navigate("projects");
  }

  function buildEvents(data) {
    var today = startOfDay(new Date());
    var list = [];

    (data.renewals || []).forEach(function (r) {
      var due = parseISO(r.due_date);
      if (!due) return;
      var overdue = due < today;
      list.push({
        id: "renewal-" + r.id,
        date: due,
        title: trim(r.title) || "Renewal",
        detail: overdue ? "Overdue renewal" : "Renewal due",
        tint: overdue ? COLORS.danger : COLORS.renewal,
        icon: "R",
        kind: "renewal",
        sortRank: 1,
        isOverdue: overdue,
        destination: "renewals"
      });
    });

    (data.invoices || []).forEach(function (doc) {
      if (doc.kind !== "invoice") return;
      if (doc.status === "paid") return;
      var due = parseISO(doc.due_on);
      if (!due) return;
      var overdue = due < today && doc.status !== "paid";
      var title = trim(doc.number) || "Invoice";
      if (trim(doc.client_name)) title += " · " + trim(doc.client_name);
      list.push({
        id: "invoice-" + doc.id,
        date: due,
        title: title,
        detail: overdue
          ? ("Invoice overdue · " + money(doc.amount))
          : ("Invoice due · " + money(doc.amount)),
        tint: overdue ? COLORS.danger : COLORS.invoice,
        icon: "$",
        kind: "invoice",
        sortRank: 0,
        isOverdue: overdue,
        destination: "billing"
      });
    });

    (data.projects || []).forEach(function (p) {
      var due = parseISO(p.due_date);
      if (!due) return;
      var overdue = due < today;
      list.push({
        id: "project-" + p.id,
        date: due,
        title: trim(p.name) || "Project",
        detail: overdue ? "Project overdue" : "Project due",
        tint: overdue ? COLORS.danger : COLORS.project,
        icon: "P",
        kind: "project",
        sortRank: 2,
        isOverdue: overdue,
        destination: "projects"
      });
    });

    (data.meetings || []).forEach(function (m) {
      var when = parseISO(m.meeting_date);
      if (!when) return;
      var project = (data.projects || []).filter(function (p) { return p.link_id === m.linked_project_id; })[0];
      list.push({
        id: "meeting-" + m.id,
        date: when,
        title: trim(m.topic) || "Meeting",
        detail: (project && project.name) || trim(m.attendees) || "Meeting",
        tint: COLORS.meeting,
        icon: "M",
        kind: "meeting",
        sortRank: 4,
        isOverdue: false,
        destination: "projects"
      });
    });

    events = list;
  }

  function safeQuery(table, columns) {
    return db.from(table).select(columns).then(function (res) {
      if (res.error) return [];
      return res.data || [];
    }).catch(function () { return []; });
  }

  function hiddenQuery() {
    return db.from("calendar_hidden").select("id,event_key").then(function (res) {
      return res;
    }).catch(function (err) {
      return { data: null, error: err || { message: "Could not load hidden items." } };
    });
  }

  function load(quiet) {
    loading = true;
    if (!quiet) showMsg("Loading calendar…", true);
    return Promise.all([
      db.from("calendar_day_notes").select("id,day,body"),
      safeQuery("billing_documents", "id,kind,number,client_name,amount,status,due_on"),
      safeQuery("client_projects", "id,name,due_date,link_id"),
      safeQuery("meeting_logs", "id,meeting_date,topic,attendees,linked_project_id"),
      safeQuery("renewal_items", "id,title,due_date"),
      hiddenQuery()
    ]).then(function (results) {
      loading = false;
      var notesRes = results[0];
      if (notesRes.error) {
        showMsg(/does not exist|schema cache/i.test(notesRes.error.message || "")
          ? "Run sql/007_calendar.sql in Supabase, then refresh."
          : notesRes.error.message, false);
      } else {
        notesByDay = {};
        noteIds = {};
        (notesRes.data || []).forEach(function (row) {
          var key = String(row.day).slice(0, 10);
          notesByDay[key] = row.body || "";
          noteIds[key] = row.id;
        });
        if (!quiet) showMsg("");
      }

      hiddenKeys = {};
      var hiddenRes = results[5];
      if (hiddenRes && hiddenRes.error) {
        if (!notesRes.error) hideMiss(hiddenRes.error.message);
      } else {
        (hiddenRes && hiddenRes.data || []).forEach(function (row) {
          if (row && row.event_key) hiddenKeys[row.event_key] = row.id;
        });
      }

      buildEvents({
        invoices: results[1],
        projects: results[2],
        meetings: results[3],
        renewals: results[4]
      });
      render();
    }).catch(function (err) {
      loading = false;
      showMsg((err && err.message) || "Could not load calendar.", false);
      render();
    });
  }

  function onKey(e) {
    if (!root || !root.isConnected) return;
    if (pickerOpen && e.key === "Escape") {
      pickerOpen = false;
      paintPicker();
      var title = el("month-title");
      if (title) title.setAttribute("aria-expanded", "false");
      e.preventDefault();
      return;
    }
    if (pickerOpen) return;
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowLeft") moveSelection(-1);
    else if (e.key === "ArrowRight") moveSelection(1);
    else if (e.key === "ArrowUp") moveSelection(-7);
    else if (e.key === "ArrowDown") moveSelection(7);
    else return;
    e.preventDefault();
  }

  function bindChrome() {
    el("prev").addEventListener("click", function () {
      clearTimeout(noteTimer);
      persistCurrentNote().then(function () {
        if (view === "week") {
          selectedDay = addDays(selectedDay, -7);
          month = startOfMonth(selectedDay);
        } else {
          month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
        }
        pickerOpen = false;
        render();
      });
    });
    el("next").addEventListener("click", function () {
      clearTimeout(noteTimer);
      persistCurrentNote().then(function () {
        if (view === "week") {
          selectedDay = addDays(selectedDay, 7);
          month = startOfMonth(selectedDay);
        } else {
          month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
        }
        pickerOpen = false;
        render();
      });
    });
    el("today").addEventListener("click", function () {
      clearTimeout(noteTimer);
      persistCurrentNote().then(function () {
        var now = new Date();
        month = startOfMonth(now);
        selectedDay = startOfDay(now);
        pickerOpen = false;
        render();
      });
    });
    el("month-title").addEventListener("click", function () {
      pickerOpen = !pickerOpen;
      if (pickerOpen) pickerYear = (view === "week" ? selectedDay : month).getFullYear();
      paintHeader();
    });
    root.querySelectorAll("[data-view]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var next = btn.getAttribute("data-view");
        if (next === view) return;
        clearTimeout(noteTimer);
        persistCurrentNote().then(function () {
          view = next;
          if (view === "week") month = startOfMonth(selectedDay);
          pickerOpen = false;
          render();
        });
      });
    });
    document.addEventListener("keydown", onKey);
  }

  window.STLCalendar = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      month = startOfMonth(new Date());
      selectedDay = startOfDay(new Date());
      view = "month";
      pickerOpen = false;
      panel.classList.add("calendar-wide");
      panel.innerHTML = shell();
      bindChrome();
      render();
      load();
    },
    shown: function () {
      if (!db || !root) return;
      persistCurrentNote().then(function () { load(true); });
    },
    unmount: function (panel) {
      document.removeEventListener("keydown", onKey);
      clearTimeout(noteTimer);
      persistCurrentNote();
      if (panel) panel.classList.remove("calendar-wide");
      root = null;
    }
  };
})();

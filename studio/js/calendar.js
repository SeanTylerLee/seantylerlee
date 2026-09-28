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

  var root = null;
  var db = null;
  var month = startOfMonth(new Date());
  var selectedDay = startOfDay(new Date());
  var notesByDay = {};
  var noteIds = {};
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

  function eventsOn(day) {
    return events.filter(function (e) { return sameDay(e.date, day); }).sort(function (a, b) {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
      return a.title.localeCompare(b.title);
    });
  }

  function notePreview(day) {
    var body = notesByDay[isoDay(day)] || "";
    var line = body.split(/\n/).map(function (x) { return x.trim(); }).find(function (x) { return x; });
    return line || "";
  }

  function shell() {
    return (
      '<div class="calendar-workspace">' +
        '<section class="cal-month">' +
          '<div class="cal-month-header">' +
            '<button class="cal-nav-btn" type="button" data-el="prev" aria-label="Previous month">‹</button>' +
            '<h1 data-el="month-title"></h1>' +
            '<button class="cal-nav-btn" type="button" data-el="next" aria-label="Next month">›</button>' +
            '<button class="cal-today-btn" type="button" data-el="today">Today</button>' +
          "</div>" +
          '<p class="status cal-banner" data-el="banner"></p>' +
          '<div class="cal-weekdays" data-el="weekdays"></div>' +
          '<div class="cal-grid" data-el="grid"></div>' +
          '<div class="cal-legend">' +
            legendItem("Renewal", COLORS.renewal) +
            legendItem("Invoice", COLORS.invoice) +
            legendItem("Project", COLORS.project) +
            legendItem("Lead", COLORS.lead) +
            legendItem("Meeting", COLORS.meeting) +
            legendItem("Note", COLORS.note) +
          "</div>" +
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

  function render() {
    el("month-title").textContent = monthTitle(month);
    el("today").disabled = isShowingToday();

    var weekdays = el("weekdays");
    weekdays.innerHTML = weekdaySymbols().map(function (name) {
      return "<span>" + esc(name) + "</span>";
    }).join("");

    var grid = el("grid");
    grid.innerHTML = "";
    daysInMonthGrid().forEach(function (day) {
      var inMonth = day.getMonth() === month.getMonth();
      var selected = sameDay(day, selectedDay);
      var today = isToday(day);
      var items = eventsOn(day);
      var overdue = items.some(function (e) { return e.isOverdue; });
      var note = notePreview(day);
      var extra = items.length > 2 ? items.length - 2 : 0;

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-cell"
        + (inMonth ? "" : " is-out")
        + (selected ? " is-selected" : "")
        + (today ? " is-today" : "")
        + (overdue && inMonth ? " is-overdue" : "");

      var html =
        '<div class="cal-cell-top">' +
          '<span class="cal-daynum">' + day.getDate() + "</span>" +
          (overdue ? '<span class="cal-overdue-dot"></span>' : "") +
        "</div>";

      items.slice(0, 2).forEach(function (event) {
        html +=
          '<div class="cal-event">' +
            '<span class="cal-event-bar" style="background:' + event.tint + '"></span>' +
            "<span>" + esc(event.title) + "</span>" +
          "</div>";
      });
      if (extra > 0) html += '<div class="cal-more">+' + extra + " more</div>";
      if (note) html += '<div class="cal-note-preview">' + esc(note) + "</div>";

      btn.innerHTML = html;
      btn.addEventListener("click", function () {
        persistCurrentNote().then(function () {
          selectedDay = startOfDay(day);
          if (!inMonth) month = startOfMonth(day);
          render();
        });
      });
      grid.appendChild(btn);
    });

    renderDayPane();
  }

  function renderDayPane() {
    var pane = el("day-pane");
    var items = eventsOn(selectedDay);
    var key = isoDay(selectedDay);
    var noteBody = notesByDay[key] || "";

    var html =
      '<div class="cal-day-header">' +
        '<div class="weekday">' + esc(weekdayTitle(selectedDay)) +
          (isToday(selectedDay) ? '<span class="today-pill">Today</span>' : "") +
        "</div>" +
        "<h2>" + esc(longDate(selectedDay)) + "</h2>" +
      "</div>" +
      '<div class="cal-day-scroll">' +
        '<div class="cal-section">' +
          "<h3>From the studio</h3>" +
          '<p class="sub">Renewals, invoices, projects, leads, and meetings on this day.</p>';

    if (!items.length) {
      html += '<p class="cal-empty">Nothing due today.</p>';
    } else {
      items.forEach(function (event) {
        html +=
          '<button type="button" class="cal-event-row" data-event="' + esc(event.id) + '">' +
            '<span class="cal-event-icon" style="background:' + event.tint + '">' + esc(event.icon) + "</span>" +
            "<div><strong>" + esc(event.title) + "</strong>" +
            '<div class="detail' + (event.isOverdue ? " is-overdue" : "") + '">' + esc(event.detail) + "</div></div>" +
            '<span class="chev">›</span>' +
          "</button>";
      });
    }

    html +=
      "</div>" +
      '<div class="cal-notes-card">' +
        "<h3>Notes</h3>" +
        '<p class="sub">This text shows as a small line on the day in the grid.</p>' +
        '<textarea data-el="note" placeholder="Call, pickup, reminder…">' + esc(noteBody) + "</textarea>" +
      "</div></div>";

    pane.innerHTML = html;

    pane.querySelectorAll("[data-event]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-event");
        var event = events.filter(function (e) { return e.id === id; })[0];
        if (event) openEvent(event);
      });
    });

    var note = el("note");
    if (note) {
      note.addEventListener("input", function () {
        notesByDay[key] = note.value;
        clearTimeout(noteTimer);
        noteTimer = setTimeout(function () {
          persistCurrentNote().then(function () {
            // refresh note previews in grid without losing textarea focus
            renderMonthCellsOnly();
          });
        }, 450);
      });
    }
  }

  function renderMonthCellsOnly() {
    // lightweight grid refresh for note previews
    var grid = el("grid");
    if (!grid) return;
    var buttons = grid.querySelectorAll(".cal-cell");
    var days = daysInMonthGrid();
    buttons.forEach(function (btn, index) {
      var day = days[index];
      if (!day) return;
      var preview = btn.querySelector(".cal-note-preview");
      var text = notePreview(day);
      if (text) {
        if (!preview) {
          preview = document.createElement("div");
          preview.className = "cal-note-preview";
          btn.appendChild(preview);
        }
        preview.textContent = text;
      } else if (preview) {
        preview.remove();
      }
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
    else if (event.destination === "leads") window.STLApp.navigate("leads");
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

    (data.leads || []).forEach(function (lead) {
      if (lead.status === "dead" || lead.status === "converted") return;
      var follow = parseISO(lead.follow_up);
      if (!follow) return;
      var overdue = follow < today;
      list.push({
        id: "lead-" + lead.id,
        date: follow,
        title: trim(lead.name) || trim(lead.company_name) || "Lead",
        detail: "Lead follow-up · " + (lead.status || "open"),
        tint: COLORS.lead,
        icon: "L",
        kind: "lead",
        sortRank: 3,
        isOverdue: overdue,
        destination: "leads"
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

  function load() {
    loading = true;
    showMsg("Loading calendar…", true);
    return Promise.all([
      db.from("calendar_day_notes").select("id,day,body"),
      safeQuery("billing_documents", "id,kind,number,client_name,amount,status,due_on"),
      safeQuery("client_projects", "id,name,due_date,link_id"),
      safeQuery("meeting_logs", "id,meeting_date,topic,attendees,linked_project_id"),
      safeQuery("renewal_items", "id,title,due_date"),
      safeQuery("studio_leads", "id,name,company_name,status,follow_up")
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
        showMsg("");
      }

      buildEvents({
        invoices: results[1],
        projects: results[2],
        meetings: results[3],
        renewals: results[4],
        leads: results[5]
      });
      render();
    }).catch(function (err) {
      loading = false;
      showMsg((err && err.message) || "Could not load calendar.", false);
      render();
    });
  }

  function bindChrome() {
    el("prev").addEventListener("click", function () {
      persistCurrentNote().then(function () {
        month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
        render();
      });
    });
    el("next").addEventListener("click", function () {
      persistCurrentNote().then(function () {
        month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
        render();
      });
    });
    el("today").addEventListener("click", function () {
      persistCurrentNote().then(function () {
        var now = new Date();
        month = startOfMonth(now);
        selectedDay = startOfDay(now);
        render();
      });
    });
  }

  window.STLCalendar = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      month = startOfMonth(new Date());
      selectedDay = startOfDay(new Date());
      panel.classList.add("calendar-wide");
      panel.innerHTML = shell();
      bindChrome();
      load();
    },
    unmount: function (panel) {
      clearTimeout(noteTimer);
      persistCurrentNote();
      if (panel) panel.classList.remove("calendar-wide");
      root = null;
    }
  };
})();

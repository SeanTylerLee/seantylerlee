(function () {
  "use strict";

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  var root = null;
  var db = null;
  var selectedYear = new Date().getFullYear();
  var selectedMonth = new Date().getMonth() + 1;
  var renewals = [];
  var documents = [];
  var projects = [];
  var hours = [];
  var issues = [];
  var apps = [];
  var appIssues = [];
  var inboxUnread = 0;
  var supportOpen = 0;
  var pc4hPendingReviews = 0;
  var backupAt = "";
  var fleetSignups = [];
  var incomes = [];
  var expenses = [];
  var draws = [];
  var reservePercent = 30;
  var dayNotes = [];
  var comps = [];
  var pp = { loading: true, rows: [], days: [], error: "" };
  var bank = { loading: true, snapshot: null, error: "" };
  var baseLoaded = false;
  var FLEET_SEEN_KEY = "stl-fleet-signup-seen-at";

  function M() { return window.STLMoney; }

  function el(name) {
    return root ? root.querySelector('[data-el="' + name + '"]') : null;
  }

  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }

  function go(section) {
    if (window.STLApp && window.STLApp.navigate) window.STLApp.navigate(section);
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function parseISO(iso) {
    if (!iso) return null;
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return null;
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function daysUntil(iso) {
    var due = parseISO(iso);
    if (!due) return 0;
    var start = new Date();
    start = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    return Math.round((due - start) / 86400000);
  }

  function attentionRenewals() {
    return renewals.filter(function (item) {
      var days = daysUntil(item.due_date);
      var remind = Math.max(0, Number(item.remind_days_before) || 0);
      return days < 0 || (days >= 0 && days <= remind);
    }).sort(function (a, b) { return daysUntil(a.due_date) - daysUntil(b.due_date); });
  }

  function invoiceTotals(doc) {
    var payload = (doc && doc.payload) || {};
    var paid = payload.amountPaid;
    if (paid == null && doc && doc.status === "paid") paid = Number(doc.amount) || 0;
    if (!window.STLBillingDoc) {
      var amount = Number(doc.amount) || 0;
      var remaining = Math.max(0, amount - (Number(paid) || 0));
      return { total: amount, amountPaid: Number(paid) || 0, balance: remaining };
    }
    return window.STLBillingDoc.compute(Object.assign({}, payload, {
      kind: "invoice",
      amountPaid: paid || 0,
      items: payload.items && payload.items.length ? payload.items : [{ desc: "", qty: 1, rate: Number(doc.amount) || 0 }]
    }));
  }

  function followUpDocuments() {
    var today = todayISO();
    return documents.filter(function (doc) {
      if (doc.kind !== "invoice") return false;
      return invoiceTotals(doc).balance > 0;
    }).sort(function (a, b) {
      var aOver = a.due_on && a.due_on <= today;
      var bOver = b.due_on && b.due_on <= today;
      if (aOver !== bOver) return aOver ? -1 : 1;
      return String(a.due_on || "") < String(b.due_on || "") ? -1 : 1;
    });
  }

  function unbilledProjects() {
    var byProject = {};
    hours.forEach(function (h) {
      if (h.is_billed) return;
      byProject[h.project_id] = (byProject[h.project_id] || 0) + Number(h.hours || 0);
    });
    return projects
      .map(function (p) {
        return { project: p, hours: M().round2(byProject[p.id] || 0) };
      })
      .filter(function (row) { return row.hours > 0; })
      .sort(function (a, b) { return b.hours - a.hours; });
  }

  function overdueProjects() {
    var today = todayISO();
    return projects.filter(function (p) {
      return p.due_date && p.due_date < today;
    });
  }

  function openProjectIssues() {
    return issues.filter(function (i) {
      return i.status === "open" || i.status === "inProgress";
    });
  }

  function fleetTime(value) {
    var time = new Date(value || "").getTime();
    return isNaN(time) ? 0 : time;
  }

  function fleetSeenMs() {
    try {
      var saved = localStorage.getItem(FLEET_SEEN_KEY) || "";
      if (saved) return fleetTime(saved);
    } catch (err) {}
    var start = new Date();
    start.setDate(start.getDate() - 7);
    return start.getTime();
  }

  function newFleetSignups() {
    var seen = fleetSeenMs();
    return fleetSignups.filter(function (fleet) {
      if (!fleet || fleet.is_test) return false;
      if (!String(fleet.portal_email || "").trim()) return false;
      return fleetTime(fleet.created_at) > seen;
    }).sort(function (a, b) {
      return fleetTime(b.created_at) - fleetTime(a.created_at);
    });
  }

  function markFleetsSeen() {
    var newest = "";
    var newestMs = fleetSeenMs();
    fleetSignups.forEach(function (fleet) {
      var created = String(fleet.created_at || "");
      var time = fleetTime(created);
      if (time > newestMs) {
        newestMs = time;
        newest = created;
      }
    });
    if (!newest) newest = new Date().toISOString();
    try { localStorage.setItem(FLEET_SEEN_KEY, newest); } catch (err) {}
  }

  function needsYouCount() {
    var renewalIds = {};
    attentionRenewals().forEach(function (item) { if (item.id) renewalIds[item.id] = true; });
    unloggedRenewalsDueThisMonth().forEach(function (item) { if (item.id) renewalIds[item.id] = true; });
    return followUpDocuments().length
      + unbilledProjects().length
      + overdueProjects().length
      + Object.keys(renewalIds).length
      + openProjectIssues().length
      + inboxUnread
      + supportOpen
      + pc4hPendingReviews
      + newFleetSignups().length
      + (backupStale() ? 1 : 0);
  }

  function backupDays() {
    if (!backupAt) return null;
    var t = new Date(backupAt).getTime();
    if (isNaN(t)) return null;
    var start = new Date();
    start = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    var then = new Date(t);
    then = new Date(then.getFullYear(), then.getMonth(), then.getDate());
    return Math.round((start - then) / 86400000);
  }

  function backupStale() {
    var days = backupDays();
    return days == null || days > 30;
  }

  function backupLabel() {
    var days = backupDays();
    if (days == null) return "Never";
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    return days + " days ago";
  }

  function unloggedRenewalsDueThisMonth() {
    var prefix = selectedYear + "-" + String(selectedMonth).padStart(2, "0");
    return renewals.filter(function (item) {
      var due = String(item.due_date || "").slice(0, 7);
      return due === prefix && Number(item.amount) > 0 && !item.logged_expense_id;
    }).sort(function (a, b) {
      return String(a.due_date || "") < String(b.due_date || "") ? -1 : 1;
    });
  }

  function renewalsDueThisMonth() {
    var prefix = selectedYear + "-" + String(selectedMonth).padStart(2, "0");
    return renewals.filter(function (item) {
      return String(item.due_date || "").slice(0, 7) === prefix && Number(item.amount) > 0;
    }).sort(function (a, b) {
      return String(a.due_date || "") < String(b.due_date || "") ? -1 : 1;
    });
  }

  function renewalsDueMonthTotal() {
    return M().round2(renewalsDueThisMonth().reduce(function (s, item) {
      return s + (Number(item.amount) || 0);
    }, 0));
  }

  // ---------- new Overview cards ----------

  function num(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function centralTodayKey() {
    try {
      var map = {};
      new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(new Date()).forEach(function (part) { map[part.type] = part.value; });
      return map.year + "-" + map.month + "-" + map.day;
    } catch (err) {
      return todayISO();
    }
  }

  function stat(label, value, extra) {
    return '<div class="ov-stat' + (extra ? " " + extra : "") + '"><span class="v">' + M().esc(value) + '</span><span class="k">' + M().esc(label) + "</span></div>";
  }

  function cardHead(title, goTo, linkText) {
    return '<div class="ov-card-head"><h2>' + M().esc(title) + "</h2>" +
      (goTo ? '<button type="button" class="ov-link" data-go="' + goTo + '">' + M().esc(linkText || "Open") + " ›</button>" : "") +
      "</div>";
  }

  function greetingHtml() {
    var now = new Date();
    var h = now.getHours();
    var hello = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    var dateText = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    var count = needsYouCount();
    return (
      '<div class="ov-hello">' +
        "<div><h1>" + hello + "</h1>" +
        '<p class="ov-hello-date">' + M().esc(dateText) + "</p></div>" +
        '<span class="ov-count ' + (count === 0 ? "clear" : "busy") + '">' +
          (count === 0 ? "All clear" : count + (count === 1 ? " thing needs you" : " things need you")) +
        "</span>" +
      "</div>"
    );
  }

  function pulseHtml() {
    var html = '<div class="ov-card">' + cardHead("Permit Path today", "permitPathAdmin", "Analytics");
    if (pp.loading) return html + '<p class="ov-note">Loading…</p></div>';
    if (pp.error) return html + '<p class="ov-note">' + M().esc(pp.error) + "</p></div>";
    var rows = pp.rows || [];
    var midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    var weekAgo = Date.now() - 7 * 86400000;
    var seen = function (row) { return new Date(row.last_seen || "").getTime() || 0; };
    var activeToday = rows.filter(function (row) { return seen(row) >= midnight.getTime(); }).length;
    var activeWeek = rows.filter(function (row) { return seen(row) >= weekAgo; }).length;
    var newToday = rows.filter(function (row) { return (new Date(row.first_seen || "").getTime() || 0) >= midnight.getTime(); }).length;
    var newWeek = rows.filter(function (row) { return (new Date(row.first_seen || "").getTime() || 0) >= weekAgo; }).length;
    var subscribed = rows.filter(function (row) { return row.is_subscribed; }).length;
    var taps = 0;
    var tapTotal = 0;
    var n;
    for (n = 1; n <= 5; n++) {
      var c = rows.reduce(function (s, row) { return s + num(row["review_star_" + n]); }, 0);
      taps += c;
      tapTotal += c * n;
    }
    var key = centralTodayKey();
    var today = { opens: 0, navigations_started: 0, imports: 0, subscribe_tapped: 0 };
    (pp.days || []).forEach(function (day) {
      if (String(day.day || "").slice(0, 10) !== key) return;
      today.opens += num(day.opens);
      today.navigations_started += num(day.navigations_started);
      today.imports += num(day.imports_pdf) + num(day.imports_qr);
      today.subscribe_tapped += num(day.subscribe_tapped);
    });
    html +=
      '<div class="ov-stats">' +
        stat("Active today", activeToday, "lead") +
        stat("New today", newToday, newToday ? "lead good" : "lead") +
        stat("Opens today", today.opens) +
        stat("Go taps today", today.navigations_started) +
        stat("Imports today", today.imports) +
        stat("Subscribe taps today", today.subscribe_tapped) +
      "</div>" +
      '<div class="ov-mini">' +
        "<span>" + rows.length + " installs</span>" +
        "<span>" + subscribed + " subscribed</span>" +
        "<span>" + activeWeek + " active this week</span>" +
        "<span>" + newWeek + " new this week</span>" +
        (taps ? '<span><b class="ov-star">★</b> ' + (tapTotal / taps).toFixed(1) + " in-app (" + taps + ")</span>" : "") +
      "</div>" +
    "</div>";
    return html;
  }

  function moneyHtml() {
    var year = M().currentYear();
    var month = new Date().getMonth();
    var yIn = incomes.filter(function (r) { return Number(r.year) === year; });
    var yEx = expenses.filter(function (r) { return Number(r.year) === year; });
    var income = M().round2(yIn.reduce(function (s, r) { return s + M().yearTotal(r); }, 0));
    var expense = M().round2(yEx.reduce(function (s, r) { return s + M().yearTotal(r); }, 0));
    var profit = M().round2(income - expense);
    var reserve = profit > 0 ? M().round2(profit * Math.min(100, Math.max(0, reservePercent)) / 100) : 0;
    var drawn = M().round2(draws.filter(function (r) { return Number(r.year) === year; })
      .reduce(function (s, r) { return s + num(r.amount); }, 0));
    var slice = M().monthSlices(year, yIn, yEx)[month] || { income: 0, expense: 0, profit: 0 };
    var owed = M().round2(followUpDocuments().reduce(function (s, doc) { return s + invoiceTotals(doc).balance; }, 0));

    var cash = "";
    if (bank.loading) cash = '<span class="ov-cash-note">Loading Mercury…</span>';
    else if (bank.snapshot) {
      var list = bank.snapshot.accounts || [];
      var total = list.reduce(function (s, a) { return s + num(a.currentBalance); }, 0);
      cash = '<span class="ov-cash">' + M().esc(M().money(total)) + '</span><span class="ov-cash-note">in Mercury' +
        (list.length > 1 ? " · " + list.length + " accounts" : "") + "</span>";
    } else cash = '<span class="ov-cash-note">' + M().esc(bank.error || "Bank not connected") + "</span>";

    return (
      '<div class="ov-card">' + cardHead("Money", "finances", "Finances") +
        '<div class="ov-cash-row" data-go="bank">' + cash + "</div>" +
        '<div class="ov-stats">' +
          stat(MONTHS[month] + " income", M().money(slice.income)) +
          stat(MONTHS[month] + " expenses", M().money(slice.expense)) +
          stat(MONTHS[month] + " profit", M().money(slice.profit), slice.profit >= 0 ? "good" : "bad") +
          stat(year + " income", M().money(income)) +
          stat(year + " expenses", M().money(expense)) +
          stat(year + " profit", M().money(profit), profit >= 0 ? "good" : "bad") +
        "</div>" +
        '<div class="ov-mini">' +
          '<span data-go="taxes">Set aside for taxes ' + M().esc(M().money(reserve)) + " (" + reservePercent + "%)</span>" +
          '<span data-go="ownerDraws">Owner draws ' + M().esc(M().money(drawn)) + "</span>" +
          (owed > 0 ? '<span data-go="billing" class="warn">Clients owe ' + M().esc(M().money(owed)) + "</span>" : "") +
        "</div>" +
      "</div>"
    );
  }

  function upcomingHtml() {
    var DAYS = 14;
    var items = [];
    var add = function (iso, title, detail, tint, goTo) {
      var d = daysUntil(iso);
      if (!parseISO(iso) || d < 0 || d > DAYS) return;
      items.push({ iso: String(iso).slice(0, 10), d: d, title: title, detail: detail, tint: tint, goTo: goTo });
    };
    renewals.forEach(function (r) {
      add(r.due_date, r.title || "Renewal", "Renewal" + (r.amount ? " · " + M().money(r.amount) : ""), "#8C59D9", "renewals");
    });
    documents.forEach(function (doc) {
      if (doc.kind !== "invoice" || !doc.due_on) return;
      var bal = invoiceTotals(doc).balance;
      if (bal <= 0) return;
      add(doc.due_on, "Invoice " + (doc.number || "") + (doc.client_name ? " · " + doc.client_name : ""), "Payment due · " + M().money(bal), "#F29E2E", "billing");
    });
    projects.forEach(function (p) {
      add(p.due_date, p.name || p.title || "Project", "Project due", "#7361D9", "projects");
    });
    dayNotes.forEach(function (note) {
      var body = String(note.body || "").trim();
      if (!body) return;
      add(note.day, body.split(/\n/)[0].slice(0, 90), "Calendar note", "#5973CC", "calendar");
    });
    items.sort(function (a, b) { return a.d - b.d || a.title.localeCompare(b.title); });
    var html = '<div class="ov-card">' + cardHead("Coming up · next 2 weeks", "calendar", "Calendar");
    if (!items.length) return html + '<p class="ov-note" style="margin-top:8px">Nothing on the calendar for the next two weeks.</p></div>';
    items.slice(0, 12).forEach(function (it) {
      var when = it.d === 0 ? "Today" : it.d === 1 ? "Tomorrow" : M().formatDate ? M().formatDate(it.iso) : it.iso;
      html += row(it.title, when + " · " + it.detail, it.tint, it.goTo);
    });
    if (items.length > 12) html += '<p class="ov-note">' + (items.length - 12) + " more on the calendar.</p>";
    return html + "</div>";
  }

  function competitorsHtml() {
    var shown = comps.filter(function (c) { return c.is_self || !(c.details && c.details.hidden); });
    if (!shown.length) return "";
    shown.sort(function (a, b) { return (b.is_self ? 1 : 0) - (a.is_self ? 1 : 0); });
    var oldest = "";
    var lines = shown.map(function (c) {
      var d = c.details || {};
      if (d.ratings_checked_on && (!oldest || d.ratings_checked_on < oldest)) oldest = d.ratings_checked_on;
      var rating = Number(d.ios_rating);
      var price = Number(d.price_monthly);
      return (
        '<div class="ov-comp' + (c.is_self ? " is-you" : "") + '">' +
          "<span>" + M().esc(c.app_name || c.company_name || "App") + "</span>" +
          "<span>" + (Number.isFinite(rating) && d.ios_rating ? '<b class="ov-star">★</b> ' + rating.toFixed(1) + (d.ios_rating_count ? ' <i>(' + M().esc(d.ios_rating_count) + ")</i>" : "") : "—") + "</span>" +
          "<span>" + (Number.isFinite(price) && d.price_monthly ? "$" + price.toFixed(2) + "/mo" : "—") + "</span>" +
        "</div>"
      );
    }).join("");
    var stale = oldest && daysUntil(oldest) < -60;
    return (
      '<div class="ov-card">' + cardHead("Competitors", "competitors", "Compare") +
        '<div class="ov-comp ov-comp-head"><span>App</span><span>App Store</span><span>Monthly</span></div>' +
        lines +
        (stale ? '<p class="ov-note warn" style="margin-top:8px">Prices and ratings were last checked ' + M().esc(M().formatDate ? M().formatDate(oldest) : oldest) + ". Time to recheck.</p>" : "") +
      "</div>"
    );
  }

  function shell() {
    return (
      '<div class="overview-workspace">' +
        '<p class="status ov-banner" data-el="banner"></p>' +
        '<div data-el="body"></div>' +
      "</div>"
    );
  }

  function row(title, detail, tint, goTo, secondaryTitle, secondaryAction) {
    return (
      '<div class="ov-row" data-go="' + (goTo || "") + '">' +
        '<span class="dot" style="background:' + tint + '"></span>' +
        '<div><strong>' + M().esc(title) + '</strong><span class="detail">' + M().esc(detail) + "</span></div>" +
        (secondaryTitle
          ? '<div class="actions"><button class="btn btn-ghost" type="button" data-secondary="' + M().esc(secondaryAction || "") + '">' + M().esc(secondaryTitle) + "</button></div>"
          : "") +
      "</div>"
    );
  }

  function render() {
    if (!root || !el("body") || !baseLoaded) return;
    var count = needsYouCount();
    var html = greetingHtml();

    html +=
      '<div class="ov-card">' +
        '<div class="ov-chips ov-chips-ops">' +
          '<button type="button" class="ov-chip inbox' + (inboxUnread ? " has-alert" : "") + '" data-go="inbox"><span class="k">Messages unread</span><span class="v">' + inboxUnread + "</span></button>" +
          '<button type="button" class="ov-chip support' + (supportOpen ? " has-alert" : "") + '" data-go="support"><span class="k">Support open</span><span class="v">' + supportOpen + "</span></button>" +
          '<button type="button" class="ov-chip pc4h' + (pc4hPendingReviews ? " has-alert" : "") + '" data-go="pc4hAdmin" data-pc4h-reviews="1"><span class="k">PC4H reviews waiting</span><span class="v">' + pc4hPendingReviews + "</span></button>" +
          '<button type="button" class="ov-chip fleet' + (newFleetSignups().length ? " has-alert" : "") + '" data-go="permitPathAdmin" data-fleet-signups="1"><span class="k">New fleet signups</span><span class="v">' + newFleetSignups().length + "</span></button>" +
          '<button type="button" class="ov-chip backup' + (backupStale() ? " has-alert" : "") + '" data-go="settings"><span class="k">Backup Log</span><span class="v">' + M().esc(backupLabel()) + "</span></button>" +
        "</div>" +
      "</div>";

    html += '<div class="ov-grid"><div class="ov-col">';
    var dueMonth = renewalsDueThisMonth();
    if (dueMonth.length) {
      html +=
        '<div class="ov-card">' +
          '<div style="display:flex;align-items:baseline;gap:10px">' +
            "<h2>Expected renewals · " + MONTHS[selectedMonth - 1] + "</h2>" +
            '<span class="ov-count busy" style="margin-left:auto">' + M().money(renewalsDueMonthTotal()) + "</span>" +
          "</div>" +
          '<p class="ov-note" style="margin-top:8px">From Renewals with an amount set. Log as expense when you pay so the P&amp;L stays accurate.</p>';
      dueMonth.forEach(function (item) {
        html += row(
          item.title || "Renewal",
          M().money(item.amount) + " · due " + (item.due_date || "—") + (item.logged_expense_id ? " · logged" : " · not logged"),
          item.logged_expense_id ? "#38B375" : "#8C59D9",
          "renewals"
        );
      });
      html += "</div>";
    }

    html +=
      '<div class="ov-card">' +
        '<div style="display:flex;align-items:baseline;gap:10px">' +
          "<h2>Needs you today</h2>" +
          '<span class="ov-count ' + (count === 0 ? "clear" : "busy") + '" style="margin-left:auto">' +
            (count === 0 ? "Clear" : String(count)) +
          "</span>" +
        "</div>";

    if (count === 0) {
      html += '<p class="ov-note" style="margin-top:10px">Nothing overdue, waiting, or unbilled. Enjoy it.</p>';
    } else {
      if (inboxUnread > 0) {
        html += '<div class="ov-section"><h3>Messages</h3>';
        html += row(
          inboxUnread === 1 ? "1 unread message" : inboxUnread + " unread messages",
          "Website contact, quotes, and notify-me",
          "#3D6B99",
          "inbox"
        );
        html += "</div>";
      }

      if (supportOpen > 0) {
        html += '<div class="ov-section"><h3>Support</h3>';
        html += row(
          supportOpen === 1 ? "1 open ticket" : supportOpen + " open tickets",
          "Customer tickets waiting on you",
          "#BF5261",
          "support"
        );
        html += "</div>";
      }

      if (backupStale()) {
        html += '<div class="ov-section"><h3>Backup</h3>';
        html += row(
          backupDays() == null ? "No Backup Log yet" : "Backup Log is " + backupDays() + " days old",
          "Download a zip from Settings. Studio nags after 30 days.",
          "#5A6578",
          "settings"
        );
        html += "</div>";
      }

      var freshFleets = newFleetSignups();
      if (freshFleets.length) {
        html += '<div class="ov-section"><h3>Fleet signups</h3>';
        freshFleets.forEach(function (fleet) {
          var when = fleet.created_at ? new Date(fleet.created_at).toLocaleString() : "";
          var detail = (fleet.portal_email || fleet.contact_email || "Fleet login") + (when ? " · " + when : "");
          html +=
            '<div class="ov-row" data-go="permitPathAdmin" data-fleet-signups="1">' +
              '<span class="dot" style="background:#1A4F8B"></span>' +
              '<div><strong>' + M().esc(fleet.company_name || "New fleet") + '</strong><span class="detail">' + M().esc(detail) + "</span></div>" +
            "</div>";
        });
        html += "</div>";
      }

      if (pc4hPendingReviews > 0) {
        html += '<div class="ov-section"><h3>Pilot Car 4 Hire</h3>';
        html += row(
          pc4hPendingReviews === 1 ? "1 review waiting" : pc4hPendingReviews + " reviews waiting",
          "Accept or reject before it shows on the listing",
          "#0F1A2E",
          "pc4hAdmin"
        );
        html += "</div>";
      }

      var followUps = followUpDocuments();
      if (followUps.length) {
        html += '<div class="ov-section"><h3>Billing</h3>';
        followUps.slice(0, 8).forEach(function (doc) {
          var t = invoiceTotals(doc);
          var overdue = doc.due_on && doc.due_on <= todayISO();
          var label = overdue ? "Overdue" : (t.amountPaid > 0 ? "Partial" : "Unpaid");
          html += row(
            (doc.client_name || "Client") + (doc.number ? " · " + doc.number : ""),
            label + " · " + M().money(t.balance) + " remaining" + (doc.due_on ? " · due " + doc.due_on : ""),
            overdue ? "#e64747" : "#f29e2e",
            "billing"
          );
        });
        html += "</div>";
      }

      var unlogged = unloggedRenewalsDueThisMonth();
      if (unlogged.length) {
        html += '<div class="ov-section"><h3>Renewals to log as expenses</h3>';
        unlogged.slice(0, 8).forEach(function (item) {
          html += row(
            item.title || "Renewal",
            M().money(item.amount) + " due " + (item.due_date || "—") + " · not logged yet",
            "#8C59D9",
            "renewals"
          );
        });
        html += "</div>";
      }

      var unbilled = unbilledProjects();
      if (unbilled.length) {
        html += '<div class="ov-section"><h3>Unbilled hours</h3>';
        unbilled.forEach(function (rowItem) {
          html += row(
            rowItem.project.name || "Project",
            rowItem.hours + " hours not invoiced yet",
            "#f29e2e",
            "projects",
            "Bill",
            "bill:" + rowItem.project.id
          );
        });
        html += "</div>";
      }

      var overdue = overdueProjects();
      if (overdue.length) {
        html += '<div class="ov-section"><h3>Project due dates</h3>';
        overdue.forEach(function (p) {
          html += row(p.name || "Project", "Due " + p.due_date, "#e64747", "projects");
        });
        html += "</div>";
      }

      var projectIssues = openProjectIssues();
      if (projectIssues.length) {
        html += '<div class="ov-section"><h3>Project issues</h3>';
        projectIssues.slice(0, 8).forEach(function (issue) {
          var project = projects.filter(function (p) { return p.id === issue.project_id; })[0];
          html += row(
            issue.title || "Issue",
            (project && project.name) || "Project",
            issue.priority === "high" ? "#e64747" : "#1a70eb",
            "projects",
            "Fix",
            "fixIssue:" + issue.id
          );
        });
        html += "</div>";
      }

      var loggedIds = {};
      unlogged.forEach(function (item) { if (item.id) loggedIds[item.id] = true; });
      var renew = attentionRenewals().filter(function (item) { return !loggedIds[item.id]; });
      if (renew.length) {
        html += '<div class="ov-section"><h3>Renewals</h3>';
        renew.forEach(function (item) {
          var days = daysUntil(item.due_date);
          html += row(
            item.title || "Renewal",
            days < 0 ? "Overdue" : "Due soon",
            days < 0 ? "#e64747" : "#f29e2e",
            "renewals"
          );
        });
        html += "</div>";
      }
    }
    html += "</div>";
    html += upcomingHtml();
    html += '</div><div class="ov-col">' + pulseHtml() + moneyHtml() + competitorsHtml() + "</div></div>";

    var ranked = apps.slice().sort(function (a, b) {
      var rank = { "In Development": 0, Live: 1, Paused: 2, Idea: 3, Archived: 4 };
      var ra = rank[a.status] != null ? rank[a.status] : 9;
      var rb = rank[b.status] != null ? rank[b.status] : 9;
      if (ra !== rb) return ra - rb;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    if (ranked.length) {
      html += '<div class="ov-apps">';
      ranked.forEach(function (app) {
        var openCount = appIssues.filter(function (i) {
          return i.app_id === app.id && (i.status === "open" || i.status === "inProgress");
        }).length;
        var hex = String(app.accent_hex || "1A70EB").replace(/^#/, "");
        var platforms = Array.isArray(app.platforms) ? app.platforms.join(" · ") : "";
        var mark = app._iconUrl
          ? '<img class="ov-app-mark" src="' + M().esc(app._iconUrl) + '" alt="" />'
          : '<span class="ov-app-mark" style="background:#' + M().esc(hex) + '">' +
            M().esc((app.name || "?").charAt(0).toUpperCase()) +
            "</span>";
        var adminSection = window.STLAppPanels && window.STLAppPanels.sectionFor
          ? window.STLAppPanels.sectionFor(app)
          : "";
        html +=
          '<button type="button" class="ov-app"' +
            (adminSection ? ' data-go="' + adminSection + '" data-studio-pane="app"' : "") +
          ">" +
            '<div class="ov-app-head">' +
              mark +
              "<div>" +
                "<h3>" + M().esc(app.name || "Untitled app") + "</h3>" +
                '<span class="apps-badge">' + M().esc(app.status || "Idea") + "</span>" +
              "</div>" +
            "</div>" +
            (app.summary ? '<p class="sum">' + M().esc(app.summary) + "</p>" : "") +
            '<div class="ov-app-foot">' +
              (platforms ? "<span>" + M().esc(platforms) + "</span>" : "") +
              (openCount ? '<span class="issue">' + openCount + " open</span>" : "") +
            "</div>" +
          "</button>";
      });
      html += "</div>";
    }

    var liveCount = apps.filter(function (a) { return a.status === "Live"; }).length;
    var devCount = apps.filter(function (a) { return a.status === "In Development"; }).length;
    html +=
      '<div class="ov-card">' +
        '<div class="ov-totals">' +
          '<div class="ov-total"><span class="k">Apps</span><span class="v">' + apps.length + "</span></div>" +
          '<div class="ov-total"><span class="k">Live</span><span class="v">' + liveCount + "</span></div>" +
          '<div class="ov-total"><span class="k">In Development</span><span class="v">' + devCount + "</span></div>" +
        "</div>" +
      "</div>";

    el("body").innerHTML = html;
    bind();
  }

  function bind() {
    var prev = el("year-prev");
    var next = el("year-next");
    if (prev) prev.onclick = function () {
      selectedYear -= 1;
      render();
    };
    if (next) next.onclick = function () {
      if (selectedYear >= M().currentYear()) return;
      selectedYear += 1;
      render();
    };
    var month = el("month");
    if (month) month.onchange = function () {
      selectedMonth = Number(month.value);
      render();
    };
    var exportMonth = el("export-month");
    if (exportMonth) exportMonth.onclick = exportMonthReport;
    var exportTax = el("export-tax");
    if (exportTax) exportTax.onclick = exportTaxPacket;

    root.querySelectorAll("[data-go]").forEach(function (node) {
      node.addEventListener("click", function (event) {
        if (event.target.closest("[data-secondary]")) return;
        var target = node.getAttribute("data-go");
        var studioPane = node.getAttribute("data-studio-pane");
        if (studioPane && target && window.STLApp && window.STLApp.navigate) {
          window.STLApp.navigate(target, { tab: studioPane });
          return;
        }
        if (node.getAttribute("data-fleet-signups")) {
          markFleetsSeen();
          if (window.STLPermitPathAdmin && typeof window.STLPermitPathAdmin.openFleet === "function") {
            window.STLPermitPathAdmin.openFleet();
          }
        }
        if (target === "pc4hAdmin" || node.getAttribute("data-pc4h-reviews")) {
          if (window.STLPc4hAdmin && typeof window.STLPc4hAdmin.focusReviews === "function") {
            window.STLPc4hAdmin.focusReviews();
          }
        }
        if (target) go(target);
      });
    });

    root.querySelectorAll("[data-secondary]").forEach(function (btn) {
      btn.addEventListener("click", function (event) {
        event.stopPropagation();
        var action = btn.getAttribute("data-secondary") || "";
        if (action.indexOf("fixIssue:") === 0) {
          fixIssue(action.slice(10));
        } else if (action.indexOf("bill:") === 0) {
          var projectId = action.slice(5);
          if (window.STLProjects && typeof window.STLProjects.openAndBill === "function") {
            window.STLProjects.openAndBill(projectId);
          }
          go("projects");
        }
      });
    });
  }

  function fixIssue(id) {
    db.from("project_issues").update({ status: "fixed" }).eq("id", id).then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      issues = issues.map(function (i) {
        if (i.id === id) i.status = "fixed";
        return i;
      });
      render();
      showMsg("Issue marked fixed.", true);
    });
  }

  function safe(table, cols) {
    return db.from(table).select(cols || "*").then(function (res) {
      return res.error ? [] : (res.data || []);
    }).catch(function () { return []; });
  }

  function loadFleetSignups() {
    if (!window.STLLocalApi || typeof window.STLLocalApi.get !== "function") {
      return Promise.resolve([]);
    }
    return window.STLLocalApi.get("/api/permitpath-fleets").then(function (res) {
      if (!res.ok) return [];
      var data = res.data || {};
      return Array.isArray(data.fleets) ? data.fleets : [];
    }).catch(function () { return []; });
  }

  function loadPc4hPendingReviews() {
    if (!window.STLLocalApi || typeof window.STLLocalApi.get !== "function") {
      return Promise.resolve(0);
    }
    return window.STLLocalApi.get("/api/pc4h-admin/snapshot").then(function (res) {
      if (!res.ok) return 0;
      var data = res.data || {};
      if (typeof data.stats === "object" && data.stats && data.stats.pendingReviews != null) {
        return Number(data.stats.pendingReviews) || 0;
      }
      return (Array.isArray(data.reviews) ? data.reviews : []).filter(function (row) {
        return row && row.status === "pending";
      }).length;
    }).catch(function () { return 0; });
  }

  function load() {
    showMsg("Loading overview…", true);
    Promise.all([
      safe("renewal_items"),
      safe("billing_documents"),
      safe("client_projects"),
      safe("project_hour_entries"),
      safe("project_issues"),
      safe("managed_apps"),
      safe("app_issues"),
      safe("studio_inbox", "id,status"),
      safe("support_tickets", "id,status"),
      loadPc4hPendingReviews(),
      loadFleetSignups(),
      db.from("studio_settings").select("value").eq("key", "backup_log_at").maybeSingle().then(function (res) {
        return (res.data && res.data.value) || "";
      }).catch(function () { return ""; }),
      safe("business_incomes"),
      safe("business_expenses"),
      safe("owner_draws"),
      db.from("studio_settings").select("value").eq("key", "tax_reserve_percent").maybeSingle().then(function (res) {
        return res.data ? res.data.value : null;
      }).catch(function () { return null; }),
      safe("calendar_day_notes", "id,day,body"),
      safe("studio_competitors", "is_self,app_name,company_name,details,created_at")
    ]).then(function (pair) {
      baseLoaded = true;
      incomes = pair[12] || [];
      expenses = pair[13] || [];
      draws = pair[14] || [];
      if (pair[15] != null && Number.isFinite(Number(pair[15]))) reservePercent = Number(pair[15]);
      dayNotes = pair[16] || [];
      comps = (pair[17] || []).sort(function (a, b) { return String(a.created_at) < String(b.created_at) ? -1 : 1; });
      renewals = pair[0];
      documents = pair[1];
      projects = pair[2];
      hours = pair[3];
      issues = pair[4];
      apps = pair[5];
      appIssues = pair[6];
      inboxUnread = (pair[7] || []).filter(function (row) { return row.status === "unread"; }).length;
      supportOpen = (pair[8] || []).filter(function (row) {
        return row.status === "open" || row.status === "inProgress" || row.status === "waiting";
      }).length;
      pc4hPendingReviews = Number(pair[9]) || 0;
      fleetSignups = pair[10] || [];
      backupAt = pair[11] || "";
      var paths = [];
      apps.forEach(function (app) {
        if (app.icon_path && paths.indexOf(app.icon_path) < 0) paths.push(app.icon_path);
      });
      if (!paths.length) {
        showMsg("");
        render();
        return;
      }
      return db.storage.from("app-icons").createSignedUrls(paths, 3600).then(function (res) {
        var map = {};
        (res.data || []).forEach(function (row) {
          if (row && row.path && row.signedUrl) map[row.path] = row.signedUrl;
        });
        apps.forEach(function (app) {
          app._iconUrl = map[app.icon_path] || "";
        });
        showMsg("");
        render();
      }).catch(function () {
        showMsg("");
        render();
      });
    }).catch(function (err) {
      baseLoaded = true;
      showMsg((err && err.message) || "Could not load overview.", false);
      render();
    });
  }

  function loadSlow() {
    var api = window.STLLocalApi;
    if (!api || typeof api.get !== "function" || (api.available && !api.available())) {
      pp = { loading: false, rows: [], days: [], error: "Sign in again to load app numbers." };
      bank = { loading: false, snapshot: null, error: "Bank not connected" };
      render();
      return;
    }
    pp = { loading: true, rows: [], days: [], error: "" };
    bank = { loading: true, snapshot: null, error: "" };
    api.get("/api/direct-app-analytics").then(function (res) {
      if (!res.ok) pp = { loading: false, rows: [], days: [], error: (res.data && res.data.error) || "Could not load app numbers." };
      else pp = { loading: false, rows: (res.data && res.data.rows) || [], days: (res.data && res.data.days) || [], error: "" };
      render();
    }).catch(function (err) {
      pp = { loading: false, rows: [], days: [], error: (err && err.message) || "Could not load app numbers." };
      render();
    });
    api.get("/api/mercury/snapshot").then(function (res) {
      if (!res.ok) bank = { loading: false, snapshot: null, error: (res.data && res.data.error) || "Could not load Mercury." };
      else bank = { loading: false, snapshot: res.data || null, error: "" };
      render();
    }).catch(function () {
      bank = { loading: false, snapshot: null, error: "Could not load Mercury." };
      render();
    });
  }

  window.STLOverview = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      selectedYear = M().currentYear();
      selectedMonth = new Date().getMonth() + 1;
      panel.classList.add("overview-wide");
      panel.innerHTML = shell();
      baseLoaded = false;
      load();
      loadSlow();
    },
    unmount: function (panel) {
      if (panel) panel.classList.remove("overview-wide");
      root = null;
    }
  };
})();

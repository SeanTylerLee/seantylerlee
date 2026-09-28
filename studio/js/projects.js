(function () {
  "use strict";

  var SECTIONS = [
    { id: "overview", title: "Overview", color: "#1A70EB" },
    { id: "issues", title: "Issues", color: "#D96640" },
    { id: "logins", title: "Logins", color: "#D98C2E" },
    { id: "costs", title: "Costs", color: "#38B375" },
    { id: "hours", title: "Hours", color: "#7361D9" },
    { id: "information", title: "Information", color: "#12213D" },
    { id: "timeframe", title: "Time Frame", color: "#8C59D9" },
    { id: "meetings", title: "Meetings", color: "#5973CC" },
    { id: "billing", title: "Billing", color: "#F29E2E" },
    { id: "handoff", title: "Handoff", color: "#338C8C" }
  ];

  var HANDOFF_DEFAULTS = [
    "Source / code handed off",
    "Store accounts transferred",
    "Domains / DNS transferred",
    "Logins packet sent",
    "Final invoice paid",
    "Client confirmed they have everything"
  ];

  var root = null;
  var db = null;
  var projects = [];
  var selectedId = null;
  var section = "overview";
  var cache = { logins: [], costs: [], hours: [], issues: [], handoff: [], meetings: [], billing: [] };
  var timerTick = null;
  var dirty = false;
  var saving = false;
  var reveal = {};
  var studioClients = [];

  function money(n) {
    return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function trimmed(n) {
    var x = Number(n) || 0;
    return Math.floor(x) === x ? String(x) : String(parseFloat(x.toPrecision(12)));
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function addDaysISO(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function el(name) {
    return root.querySelector('[data-el="' + name + '"]');
  }

  function showMsg(msg, ok) {
    ["banner", "msg"].forEach(function (name) {
      var box = el(name);
      if (!box) return;
      box.textContent = msg || "";
      box.classList.toggle("is-on", !!msg);
      box.classList.toggle("is-ok", !!ok);
      box.classList.toggle("is-bad", !!msg && !ok);
    });
  }

  function missingTable(err) {
    var msg = (err && err.message) || "";
    return /does not exist|schema cache|not find/i.test(msg);
  }

  function selected() {
    return projects.filter(function (p) { return p.id === selectedId; })[0] || null;
  }

  function openIssueCount() {
    return cache.issues.filter(function (i) {
      return i.status === "open" || i.status === "inProgress";
    }).length;
  }

  function totalCosts() {
    return round2(cache.costs.reduce(function (s, c) { return s + Number(c.amount || 0); }, 0));
  }

  function totalHours() {
    return round2(cache.hours.reduce(function (s, h) { return s + Number(h.hours || 0); }, 0));
  }

  function unbilledHours() {
    return round2(cache.hours.filter(function (h) { return !h.is_billed; }).reduce(function (s, h) {
      return s + Number(h.hours || 0);
    }, 0));
  }

  function handoffDone() {
    return cache.handoff.filter(function (h) { return h.is_done; }).length;
  }

  function elapsedLabel(startIso) {
    if (!startIso) return "0s";
    var start = new Date(startIso).getTime();
    var seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    if (h > 0) return h + "h " + m + "m " + s + "s";
    if (m > 0) return m + "m " + s + "s";
    return s + "s";
  }

  function elapsedHours(startIso, endIso) {
    var start = new Date(startIso).getTime();
    var end = endIso ? new Date(endIso).getTime() : Date.now();
    return Math.max(0.01, round2((end - start) / 3600000));
  }

  function shell() {
    return (
      '<div class="projects-workspace">' +
        '<div class="projects-top">' +
          '<div class="project-capsules" data-el="capsules"></div>' +
          '<button class="btn btn-add" type="button" data-el="add" title="New project">+</button>' +
          '<button class="btn btn-ghost btn-delete" type="button" data-el="delete-project" title="Delete project">Delete</button>' +
        "</div>" +
        '<p class="status proj-status" data-el="banner" style="margin:0;border-radius:0"></p>' +
        '<div class="projects-sections" data-el="sections"></div>' +
        '<div class="projects-body" data-el="body"><div class="projects-empty"><h2>Loading projects…</h2></div></div>' +
      "</div>"
    );
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

  function syncSaveButton() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.disabled = !selected() || !dirty || saving;
    btn.textContent = saving ? "Saving…" : "Save";
  }

  function hideSaveButton() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }

  function confirmLeaveIfDirty() {
    if (!dirty) return true;
    return window.confirm("You have unsaved changes. Leave without saving?");
  }

  function renderCapsules() {
    var wrap = el("capsules");
    wrap.innerHTML = "";
    if (!projects.length) {
      wrap.innerHTML = '<span style="font-size:12px;color:#3d4f78">No projects yet</span>';
      return;
    }
    projects.forEach(function (p) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "project-capsule" + (p.id === selectedId ? " is-on" : "");
      btn.textContent = p.name || "Untitled";
      btn.addEventListener("click", function () {
        if (p.id === selectedId) return;
        harvestForm();
        if (!confirmLeaveIfDirty()) return;
        clearDirty();
        selectedId = p.id;
        section = "overview";
        reveal = {};
        loadChildren().then(renderAll);
      });
      wrap.appendChild(btn);
    });
  }

  function renderSections() {
    var wrap = el("sections");
    wrap.innerHTML = "";
    wrap.style.display = selected() ? "flex" : "none";
    if (!selected()) return;
    SECTIONS.forEach(function (s) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "section-tab" + (section === s.id ? " is-on" : "");
      btn.style.setProperty("--tab-color", s.color);
      var title = s.title;
      if (s.id === "issues" && openIssueCount() > 0) title = "Issues · " + openIssueCount();
      var icon = title.charAt(0);
      btn.innerHTML =
        '<span class="dot" style="background:linear-gradient(135deg,' + s.color + ',' + s.color + "cc)\">" +
        esc(icon) +
        "</span>" +
        "<span>" + esc(title) + "</span>";
      btn.addEventListener("click", function () {
        if (section === s.id) return;
        harvestForm();
        section = s.id;
        renderAll();
        if (dirty) showMsg("Unsaved changes", true);
      });
      wrap.appendChild(btn);
    });
  }

  function field(label, name, value, type) {
    type = type || "text";
    if (type === "textarea") {
      return '<div class="proj-field' + (name === "information" ? " tall" : "") + '"><label>' + label + "</label><textarea data-field=\"" + name + "\">" + esc(value || "") + "</textarea></div>";
    }
    if (type === "select") {
      return '<div class="proj-field"><label>' + label + "</label><select data-field=\"" + name + "\">" + value + "</select></div>";
    }
    return '<div class="proj-field"><label>' + label + '</label><input data-field="' + name + '" type="' + type + '" value="' + esc(value || "") + '" /></div>';
  }

  function clientOptions(p) {
    var opts = '<option value="">None</option>';
    studioClients.forEach(function (c) {
      var label = (c.company_name || c.name || "Untitled").trim();
      if (c.company_name && c.name) label = c.company_name + " · " + c.name;
      opts += '<option value="' + esc(c.link_id) + '"' + (p.linked_client_id === c.link_id ? " selected" : "") + ">" + esc(label) + "</option>";
    });
    return opts;
  }

  function linkedClientHint(p) {
    var c = studioClients.filter(function (x) { return x.link_id === p.linked_client_id; })[0];
    if (!studioClients.length) {
      return '<p class="sub">Add a client in Clients, then link them here. Quotes and invoices will fill from that contact.</p>';
    }
    if (!c) {
      return '<p class="sub">Link a client to autofill name, email, phone, and address on quotes and invoices.</p>';
    }
    var bits = [c.email, c.phone, c.address].map(function (v) { return String(v || "").trim(); }).filter(Boolean);
    return bits.length
      ? '<p class="sub">' + esc(bits.join(" · ")) + "</p>"
      : '<p class="sub">Linked client has no email/phone/address yet.</p>';
  }

  function renderOverview(p) {
    var hoursLabel = unbilledHours() > 0 ? "Unbilled" : "Hours";
    var hoursValue = unbilledHours() > 0 ? unbilledHours() : totalHours();
    var handoff = cache.handoff.length ? handoffDone() + "/" + cache.handoff.length : "—";
    return (
      '<p class="status proj-status" data-el="msg"></p>' +
      '<div class="proj-card"><h3>Project</h3>' +
        '<div class="proj-grid">' +
          field("Project name", "name", p.name) +
          field("Company", "company_name", p.company_name) +
        "</div>" +
        '<div class="proj-field"><label>Client</label><select data-field="linked_client_id">' + clientOptions(p) + "</select></div>" +
        linkedClientHint(p) +
      "</div>" +
      '<div class="proj-card"><h3>Snapshot</h3><div class="chips">' +
        '<div class="chip"><span class="k">Logins</span><span class="v">' + cache.logins.length + "</span></div>" +
        '<div class="chip"><span class="k">Costs</span><span class="v">' + money(totalCosts()) + "</span></div>" +
        '<div class="chip' + (unbilledHours() > 0 ? " warn" : "") + '"><span class="k">' + hoursLabel + '</span><span class="v">' + trimmed(hoursValue) + "</span></div>" +
        '<div class="chip"><span class="k">Handoff</span><span class="v">' + handoff + "</span></div>" +
        '<div class="chip' + (openIssueCount() > 0 ? " warn" : " ok") + '"><span class="k">Issues</span><span class="v">' + openIssueCount() + "</span></div>" +
      "</div></div>" +
      timerCard(p) +
      (String(p.information || "").trim()
        ? '<div class="proj-card"><h3>What they want built</h3><p style="margin:0;white-space:pre-wrap">' + esc(p.information) + "</p></div>"
        : "")
    );
  }

  function timerCard(p) {
    var running = !!p.timer_started_at;
    return (
      '<div class="proj-card"><h3>Timer</h3>' +
        '<p class="sub">' + (running
          ? "Running. Stop when you’re done — it saves a session with start and end times."
          : "Start when you sit down on this job.") + "</p>" +
        '<div class="timer-row">' +
          '<div><div class="timer-clock" data-el="timer-clock">' + (running ? elapsedLabel(p.timer_started_at) : "0s") + "</div>" +
          '<div class="timer-meta" data-el="timer-meta">' + (running ? "Started " + new Date(p.timer_started_at).toLocaleString() : "Stopped") + "</div></div>" +
          '<div class="row-actions">' +
            (running
              ? '<button class="btn btn-primary" type="button" data-action="stop-timer">Stop</button>'
              : '<button class="btn btn-primary" type="button" data-action="start-timer">Start</button>') +
          "</div>" +
        "</div></div>"
    );
  }

  function renderIssues() {
    var open = cache.issues.filter(function (i) { return i.status === "open" || i.status === "inProgress"; });
    var done = cache.issues.filter(function (i) { return i.status === "fixed" || i.status === "wontFix"; });
    var html = '<p class="status proj-status" data-el="msg"></p><div class="proj-card"><h3>Known issues</h3><p class="sub">Bugs, leftover work, and things to come back and fix.</p>';
    if (open.length) html += '<span class="badge warn">' + open.length + " open</span>";
    html += '<div class="row-actions"><button class="btn btn-ghost" type="button" data-action="add-issue">Add known issue</button></div></div>';
    if (!cache.issues.length) {
      html += '<div class="proj-card"><p class="sub" style="margin:0">Things still wrong or unfinished on this project will show up here.</p></div>';
      return html;
    }
    function card(issue) {
      return (
        '<div class="item-card" data-id="' + issue.id + '">' +
          '<div class="item-card-top"><strong>' + esc(issue.title || "New issue") + "</strong>" +
            '<span class="badge">' + esc(issue.priority) + "</span>" +
            '<span class="badge">' + esc(issue.status) + "</span></div>" +
          '<div class="proj-grid">' +
            field("Title", "title", issue.title) +
            '<div class="proj-field"><label>Status</label><select data-child="issue" data-key="status">' +
              opt("open", "Open", issue.status) + opt("inProgress", "Working", issue.status) +
              opt("fixed", "Fixed", issue.status) + opt("wontFix", "Won’t fix", issue.status) +
            "</select></div>" +
            '<div class="proj-field"><label>Priority</label><select data-child="issue" data-key="priority">' +
              opt("high", "High", issue.priority) + opt("normal", "Normal", issue.priority) + opt("low", "Low", issue.priority) +
            "</select></div>" +
            field("Platform", "platform", issue.platform) +
          "</div>" +
          field("Notes", "details", issue.details, "textarea") +
          '<div class="row-actions">' +
            '<button class="btn btn-ghost" type="button" data-action="toggle-issue">Mark ' + ((issue.status === "open" || issue.status === "inProgress") ? "fixed" : "open") + "</button>" +
            '<button class="btn btn-ghost" type="button" data-action="remove-issue">Remove</button>' +
          "</div></div>"
      );
    }
    open.forEach(function (i) { html += card(i); });
    done.forEach(function (i) { html += card(i); });
    return html;
  }

  function opt(value, label, current) {
    return '<option value="' + value + '"' + (current === value ? " selected" : "") + ">" + label + "</option>";
  }

  function renderLogins() {
    var html =
      '<p class="status proj-status" data-el="msg"></p>' +
      '<div class="proj-card"><h3>Logins</h3><p class="sub">Store site logins for this company. Export a PDF for the client.</p>' +
      '<div class="row-actions">' +
        '<button class="btn btn-ghost" type="button" data-action="add-login">Add login</button>' +
        '<button class="btn btn-ghost" type="button" data-action="login-pdf" ' + (cache.logins.length ? "" : "disabled") + ">Download logins PDF</button>" +
      "</div></div>";
    if (!cache.logins.length) {
      html += '<div class="proj-card"><p class="sub" style="margin:0">No logins yet. Add hosting, domains, stores, and admin panels.</p></div>';
      return html;
    }
    cache.logins.forEach(function (login) {
      var shown = !!reveal[login.id];
      html +=
        '<div class="item-card" data-id="' + login.id + '">' +
          '<div class="proj-grid">' +
            field("Site / service", "site_name", login.site_name) +
            field("URL", "url", login.url) +
            field("Username / email", "username", login.username) +
            '<div class="proj-field"><label>Password</label><div class="pw-wrap">' +
              '<input data-child="login" data-key="password" type="' + (shown ? "text" : "password") + '" value="' + esc(login.password) + '" />' +
              '<button class="btn btn-ghost" type="button" data-action="reveal-pw">' + (shown ? "Hide" : "Show") + "</button>" +
            "</div></div>" +
          "</div>" +
          field("Notes", "notes", login.notes, "textarea") +
          '<div class="row-actions"><button class="btn btn-ghost" type="button" data-action="remove-login">Remove</button></div>' +
        "</div>";
    });
    return html;
  }

  function renderCosts() {
    var html =
      '<p class="status proj-status" data-el="msg"></p>' +
      '<div class="proj-card"><h3>Costs</h3><p class="sub">Money you spent on this job.</p>' +
      '<div class="chips"><div class="chip"><span class="k">Total</span><span class="v">' + money(totalCosts()) + "</span></div></div>" +
      '<div class="row-actions"><button class="btn btn-ghost" type="button" data-action="add-cost">Add cost</button></div></div>';
    if (!cache.costs.length) {
      html += '<div class="proj-card"><p class="sub" style="margin:0">No costs yet.</p></div>';
      return html;
    }
    cache.costs.forEach(function (cost) {
      html +=
        '<div class="item-card" data-id="' + cost.id + '">' +
          '<div class="proj-grid">' +
            field("Title", "title", cost.title) +
            field("Amount", "amount", cost.amount, "number") +
            field("Date", "date", cost.date, "date") +
          "</div>" +
          field("Notes", "notes", cost.notes, "textarea") +
          '<div class="row-actions"><button class="btn btn-ghost" type="button" data-action="remove-cost">Remove</button></div>' +
        "</div>";
    });
    return html;
  }

  function renderHours(p) {
    var html =
      '<p class="status proj-status" data-el="msg"></p>' +
      timerCard(p) +
      '<div class="proj-card"><h3>Hours</h3><p class="sub">Start the timer when you sit down. Stop it when you’re done, or log hours by hand.</p>' +
      '<div class="chips">' +
        '<div class="chip' + (unbilledHours() > 0 ? " warn" : "") + '"><span class="k">Unbilled</span><span class="v">' + trimmed(unbilledHours()) + "</span></div>" +
        '<div class="chip"><span class="k">Total</span><span class="v">' + trimmed(totalHours()) + "</span></div>" +
      "</div>" +
      '<div class="row-actions">' +
        '<button class="btn btn-primary" type="button" data-action="bill-hours"' + (unbilledHours() > 0 ? "" : " disabled") + ">Bill unbilled hours</button>" +
        '<button class="btn btn-ghost" type="button" data-action="hours-pdf"' + (cache.hours.length ? "" : " disabled") + ">Download hours PDF</button>" +
        '<button class="btn btn-ghost" type="button" data-action="add-hours">Log hours</button>' +
      "</div></div>";
    if (!cache.hours.length) {
      html += '<div class="proj-card"><p class="sub" style="margin:0">No hours logged yet.</p></div>';
      return html;
    }
    cache.hours.forEach(function (entry) {
      var stamp = "";
      if (entry.started_at && entry.ended_at) {
        stamp = '<div class="timer-meta" style="margin-bottom:8px;color:#0070f8;font-weight:700">' +
          new Date(entry.started_at).toLocaleString() + " – " + new Date(entry.ended_at).toLocaleTimeString() +
          "</div>";
      }
      html +=
        '<div class="item-card' + (entry.is_billed ? " is-dim" : "") + '" data-id="' + entry.id + '">' +
          stamp +
          '<div class="proj-grid">' +
            field("Date", "date", entry.date, "date") +
            field("Hours", "hours", entry.hours, "number") +
          "</div>" +
          field("What you worked on", "notes", entry.notes, "textarea") +
          '<div class="proj-field"><label><input data-child="hours" data-key="is_billed" type="checkbox"' + (entry.is_billed ? " checked" : "") + " /> Billed</label></div>" +
          '<div class="row-actions"><button class="btn btn-ghost" type="button" data-action="remove-hours">Remove</button></div>' +
        "</div>";
    });
    return html;
  }

  function renderInformation(p) {
    return (
      '<p class="status proj-status" data-el="msg"></p>' +
      '<div class="proj-card"><h3>Information</h3><p class="sub">What the company wants built, scope notes, and decisions.</p>' +
        field("Project brief", "information", p.information, "textarea") +
      "</div>"
    );
  }

  function renderTimeframe(p) {
    var hasDue = !!p.due_date;
    var overdue = hasDue && p.due_date < todayISO();
    return (
      '<p class="status proj-status" data-el="msg"></p>' +
      '<div class="proj-card"><h3>Time Frame</h3><p class="sub">Target completion date for this build.</p>' +
        '<div class="proj-field"><label><input data-action="toggle-due" type="checkbox"' + (hasDue ? " checked" : "") + " /> Has a due date</label></div>" +
        (hasDue ? field("Target completion", "due_date", p.due_date, "date") : "") +
        (overdue ? '<span class="badge danger">Overdue</span>' : "") +
      "</div>"
    );
  }

  function renderMeetings() {
    var html =
      '<p class="status proj-status" data-el="msg"></p>' +
      '<div class="proj-card"><h3>Meetings</h3><p class="sub">Calls and check-ins for this project. Put the long brief under Information.</p>' +
      '<div class="row-actions"><button class="btn btn-ghost" type="button" data-action="add-meeting">Add meeting</button></div></div>';
    if (!cache.meetings.length) {
      html += '<div class="proj-card"><p class="sub" style="margin:0">No meetings logged.</p></div>';
      return html;
    }
    cache.meetings.forEach(function (m) {
      html +=
        '<div class="item-card" data-id="' + m.id + '">' +
          '<div class="proj-grid">' +
            field("When", "meeting_date", m.meeting_date, "date") +
            field("Who", "attendees", m.attendees) +
            field("Topic", "topic", m.topic) +
          "</div>" +
          field("Notes", "notes", m.notes, "textarea") +
          '<div class="row-actions"><button class="btn btn-ghost" type="button" data-action="remove-meeting">Remove</button></div>' +
        "</div>";
    });
    return html;
  }

  function renderBilling(p) {
    var html =
      '<p class="status proj-status" data-el="msg"></p>' +
      '<div class="proj-card"><h3>Billing</h3><p class="sub">Quotes and invoices linked to this project. Create new ones in Billing, then put this project name on them.</p></div>';
    if (!cache.billing.length) {
      html += '<div class="proj-card"><p class="sub" style="margin:0">No saved quotes or invoices for this project yet.</p></div>';
      return html;
    }
    cache.billing.forEach(function (doc) {
      html +=
        '<div class="item-card">' +
          "<strong>" + esc(doc.kind.toUpperCase()) + " · " + esc(doc.number) + "</strong>" +
          '<div class="timer-meta">' + esc(doc.client_name || "") + " · " + money(doc.amount) + " · " + esc(doc.status) + "</div>" +
        "</div>";
    });
    return html;
  }

  function renderHandoff() {
    var done = handoffDone();
    var total = cache.handoff.length;
    var pct = total ? Math.round((done / total) * 100) : 0;
    var html =
      '<p class="status proj-status" data-el="msg"></p>' +
      '<div class="proj-card"><h3>Handoff</h3><p class="sub">' + done + " of " + total + " done</p>" +
      '<div class="progress"><span style="width:' + pct + '%"></span></div>' +
      '<div class="row-actions"><button class="btn btn-ghost" type="button" data-action="add-handoff">Add item</button></div></div>';
    if (!total) {
      html += '<div class="proj-card"><p class="sub" style="margin:0">Checklist will appear here.</p></div>';
      return html;
    }
    cache.handoff.forEach(function (item) {
      html +=
        '<div class="item-card" data-id="' + item.id + '">' +
          '<div class="check-row">' +
            '<input data-child="handoff" data-key="is_done" type="checkbox"' + (item.is_done ? " checked" : "") + " />" +
            '<div style="flex:1">' +
              field("Title", "title", item.title) +
              field("Notes", "notes", item.notes, "textarea") +
              '<div class="row-actions"><button class="btn btn-ghost" type="button" data-action="remove-handoff">Remove</button></div>' +
            "</div>" +
          "</div>" +
        "</div>";
    });
    return html;
  }

  function renderBody() {
    var body = el("body");
    var p = selected();
    if (!p) {
      var banner = (el("banner") && el("banner").textContent) || "";
      var blocked = /permission denied|missing|run sql/i.test(banner);
      body.innerHTML =
        '<div class="projects-empty">' +
          (blocked
            ? '<h2 style="color:#9b1c1c">Projects blocked</h2><p style="color:#9b1c1c;max-width:420px">' + esc(banner) + "</p>"
            : "<h2>No Projects Yet</h2><p>Add a client project to track logins, costs, hours, issues, and handoff.</p>") +
          (blocked
            ? ""
            : '<button class="btn btn-primary" type="button" data-el="empty-add">New Project</button>') +
        "</div>";
      var emptyAdd = body.querySelector('[data-el="empty-add"]');
      if (emptyAdd) emptyAdd.addEventListener("click", addProject);
      if (el("delete-project")) el("delete-project").disabled = true;
      return;
    }
    var html = "";
    if (section === "overview") html = renderOverview(p);
    else if (section === "issues") html = renderIssues();
    else if (section === "logins") html = renderLogins();
    else if (section === "costs") html = renderCosts();
    else if (section === "hours") html = renderHours(p);
    else if (section === "information") html = renderInformation(p);
    else if (section === "timeframe") html = renderTimeframe(p);
    else if (section === "meetings") html = renderMeetings();
    else if (section === "billing") html = renderBilling(p);
    else if (section === "handoff") html = renderHandoff();
    body.innerHTML = html;
    bindBody();
    startTimerTick();
  }

  function renderAll() {
    renderCapsules();
    renderSections();
    renderBody();
    if (el("delete-project")) el("delete-project").disabled = !selected();
    syncSaveButton();
  }

  function childRow(node) {
    return node.closest("[data-id]");
  }

  function cacheListForSection() {
    if (section === "issues") return cache.issues;
    if (section === "logins") return cache.logins;
    if (section === "costs") return cache.costs;
    if (section === "hours") return cache.hours;
    if (section === "meetings") return cache.meetings;
    if (section === "handoff") return cache.handoff;
    return null;
  }

  function applyLocal(input) {
    var p = selected();
    var row = childRow(input);
    var key = input.getAttribute("data-field") || input.getAttribute("data-key");
    var value = input.type === "checkbox" ? input.checked : input.value;
    if (key === "amount" || key === "hours") value = Number(value || 0);
    if (!row) {
      if (!p || !key) return false;
      p[key] = value;
      if (key === "linked_client_id") {
        var c = studioClients.filter(function (x) { return x.link_id === value; })[0];
        if (c) {
          var company = String(c.company_name || "").trim();
          var person = String(c.name || "").trim();
          if (company) p.company_name = company;
          else if (person && !String(p.company_name || "").trim()) p.company_name = person;
        }
        return true;
      }
      return key === "name";
    }
    var id = row.getAttribute("data-id");
    var list = cacheListForSection();
    if (!list) return false;
    list.forEach(function (item) {
      if (item.id !== id) return;
      item[key] = value;
      if (key === "is_done") item.done_at = value ? new Date().toISOString() : null;
    });
    return key === "status" || key === "priority" || key === "is_done" || key === "is_billed";
  }

  function harvestForm() {
    if (!root || !selected()) return;
    root.querySelectorAll("[data-field], [data-child]").forEach(function (input) {
      applyLocal(input);
    });
  }

  function saveAll() {
    var p = selected();
    if (!p || saving) return;
    harvestForm();
    saving = true;
    syncSaveButton();
    showMsg("Saving…", true);

    var projectPatch = {
      name: p.name || "",
      company_name: p.company_name || "",
      linked_client_id: p.linked_client_id || "",
      information: p.information || "",
      due_date: p.due_date || null
    };

    var jobs = [db.from("client_projects").update(projectPatch).eq("id", p.id)];

    function queueUpdates(table, rows, fields) {
      rows.forEach(function (row) {
        var patch = {};
        fields.forEach(function (f) { patch[f] = row[f]; });
        jobs.push(db.from(table).update(patch).eq("id", row.id));
      });
    }

    queueUpdates("project_logins", cache.logins, ["site_name", "url", "username", "password", "notes"]);
    queueUpdates("project_costs", cache.costs, ["title", "amount", "notes", "date"]);
    queueUpdates("project_hour_entries", cache.hours, ["date", "hours", "notes", "is_billed"]);
    queueUpdates("project_issues", cache.issues, ["title", "details", "status", "priority", "platform"]);
    queueUpdates("project_handoff_items", cache.handoff, ["title", "notes", "is_done", "done_at", "sort_order"]);
    queueUpdates("meeting_logs", cache.meetings, ["meeting_date", "attendees", "topic", "notes"]);

    Promise.all(jobs).then(function (results) {
      saving = false;
      var err = results.map(function (r) { return r && r.error; }).filter(Boolean)[0];
      if (err) {
        showMsg(err.message || "Save failed.", false);
        syncSaveButton();
        return;
      }
      Object.keys(projectPatch).forEach(function (k) { p[k] = projectPatch[k]; });
      clearDirty();
      showMsg("Saved", true);
      setTimeout(function () { if (!dirty) showMsg(""); }, 1000);
      renderCapsules();
      syncSaveButton();
    }).catch(function (err) {
      saving = false;
      showMsg((err && err.message) || "Save failed.", false);
      syncSaveButton();
    });
  }

  function patchFromInput(input) {
    var rerender = applyLocal(input);
    markDirty();
    if (input.getAttribute("data-field") === "name") renderCapsules();
    if (rerender) renderBody();
  }

  function bindBody() {
    var body = el("body");
    body.querySelectorAll("[data-field], [data-child]").forEach(function (input) {
      var evt = input.tagName === "SELECT" || input.type === "checkbox" || input.type === "date" ? "change" : "input";
      input.addEventListener(evt, function () { patchFromInput(input); });
    });

    body.querySelectorAll("[data-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        handleAction(btn.getAttribute("data-action"), childRow(btn));
      });
    });

    var dueToggle = body.querySelector('[data-action="toggle-due"]');
    if (dueToggle) {
      dueToggle.addEventListener("change", function () {
        var p = selected();
        if (!p) return;
        p.due_date = dueToggle.checked ? (p.due_date || addDaysISO(30)) : null;
        markDirty();
        renderBody();
      });
    }
  }

  function handleAction(action, row) {
    var p = selected();
    if (!p) return;
    var id = row && row.getAttribute("data-id");

    if (action === "start-timer") return startTimer();
    if (action === "stop-timer") return stopTimer();
    if (action === "add-issue") {
      return db.from("project_issues").insert({ project_id: p.id, title: "New issue", status: "open", priority: "normal" }).then(reloadChildren);
    }
    if (action === "remove-issue" && id && confirm("Remove this issue?")) {
      return db.from("project_issues").delete().eq("id", id).then(reloadChildren);
    }
    if (action === "toggle-issue" && id) {
      var issue = cache.issues.filter(function (i) { return i.id === id; })[0];
      var next = (issue.status === "open" || issue.status === "inProgress") ? "fixed" : "open";
      return updateChild("project_issues", id, { status: next }, true);
    }
    if (action === "add-login") {
      return db.from("project_logins").insert({ project_id: p.id, site_name: "" }).then(reloadChildren);
    }
    if (action === "remove-login" && id && confirm("Remove this login?")) {
      return db.from("project_logins").delete().eq("id", id).then(reloadChildren);
    }
    if (action === "reveal-pw" && id) {
      reveal[id] = !reveal[id];
      return renderBody();
    }
    if (action === "login-pdf") return downloadLoginsPdf(p);
    if (action === "add-cost") {
      return db.from("project_costs").insert({ project_id: p.id, title: "", amount: 0, date: todayISO() }).then(reloadChildren);
    }
    if (action === "remove-cost" && id && confirm("Remove this cost?")) {
      return db.from("project_costs").delete().eq("id", id).then(reloadChildren);
    }
    if (action === "add-hours") {
      return db.from("project_hour_entries").insert({ project_id: p.id, date: todayISO(), hours: 1, notes: "" }).then(reloadChildren);
    }
    if (action === "remove-hours" && id && confirm("Remove this hour entry?")) {
      return db.from("project_hour_entries").delete().eq("id", id).then(reloadChildren);
    }
    if (action === "bill-hours") return billUnbilled(p);
    if (action === "hours-pdf") return downloadHoursPdf(p);
    if (action === "add-meeting") {
      return db.from("meeting_logs").insert({
        linked_project_id: p.link_id,
        meeting_date: todayISO(),
        topic: "",
        attendees: "",
        notes: ""
      }).then(reloadChildren);
    }
    if (action === "remove-meeting" && id && confirm("Remove this meeting?")) {
      return db.from("meeting_logs").delete().eq("id", id).then(reloadChildren);
    }
    if (action === "add-handoff") {
      return db.from("project_handoff_items").insert({
        project_id: p.id,
        title: "New handoff item",
        sort_order: cache.handoff.length
      }).then(reloadChildren);
    }
    if (action === "remove-handoff" && id && confirm("Remove this handoff item?")) {
      return db.from("project_handoff_items").delete().eq("id", id).then(reloadChildren);
    }
  }

  function reloadChildren(res) {
    if (res && res.error) return showMsg(res.error.message, false);
    harvestForm();
    var snapshot = {
      logins: cache.logins.slice(),
      costs: cache.costs.slice(),
      hours: cache.hours.slice(),
      issues: cache.issues.slice(),
      handoff: cache.handoff.slice(),
      meetings: cache.meetings.slice()
    };
    var keepDirty = dirty;
    return loadChildren().then(function () {
      ["logins", "costs", "hours", "issues", "handoff", "meetings"].forEach(function (key) {
        var byId = {};
        snapshot[key].forEach(function (row) { byId[row.id] = row; });
        cache[key].forEach(function (row) {
          if (!byId[row.id]) return;
          Object.keys(byId[row.id]).forEach(function (field) {
            if (field === "id" || field === "project_id" || field === "user_id") return;
            row[field] = byId[row.id][field];
          });
        });
      });
      dirty = keepDirty;
      renderAll();
      if (dirty) showMsg("Unsaved changes", true);
      else showMsg("");
    });
  }

  function startTimer() {
    var p = selected();
    if (!p) return;
    var other = projects.filter(function (x) { return x.id !== p.id && x.timer_started_at; })[0];
    var chain = Promise.resolve();
    if (other) {
      chain = stopTimerFor(other);
    }
    chain.then(function () {
      var stamp = new Date().toISOString();
      return db.from("client_projects").update({ timer_started_at: stamp }).eq("id", p.id).then(function (res) {
        if (res.error) return showMsg(res.error.message, false);
        p.timer_started_at = stamp;
        renderBody();
      });
    });
  }

  function stopTimer() {
    return stopTimerFor(selected()).then(function () {
      return loadChildren().then(renderAll);
    });
  }

  function stopTimerFor(p) {
    if (!p || !p.timer_started_at) return Promise.resolve();
    var start = p.timer_started_at;
    var end = new Date().toISOString();
    var hours = elapsedHours(start, end);
    return db.from("project_hour_entries").insert({
      project_id: p.id,
      date: todayISO(),
      hours: hours,
      notes: "Timed session",
      started_at: start,
      ended_at: end
    }).then(function (res) {
      if (res.error) {
        showMsg(res.error.message, false);
        return;
      }
      return db.from("client_projects").update({ timer_started_at: null }).eq("id", p.id).then(function (res2) {
        if (res2.error) showMsg(res2.error.message, false);
        p.timer_started_at = null;
      });
    });
  }

  function startTimerTick() {
    clearInterval(timerTick);
    var p = selected();
    if (!p || !p.timer_started_at) return;
    timerTick = setInterval(function () {
      var clock = el("timer-clock");
      if (clock) clock.textContent = elapsedLabel(p.timer_started_at);
    }, 1000);
  }

  function billUnbilled(p) {
    var hours = unbilledHours();
    if (hours <= 0) return;
    var rate = 150;
    var total = round2(hours * rate);
    if (!confirm("Bill " + trimmed(hours) + " unbilled hours at " + money(rate) + "/hr (" + money(total) + ")?")) return;
    var year = new Date().getFullYear();
    var number = "INV-" + year + "-EXTRA";
    var draft = {
      kind: "invoice",
      number: number,
      documentDate: todayISO(),
      dueDate: addDaysISO(14),
      terms: "14",
      projectName: p.name,
      linkedProjectID: p.link_id,
      isExtraWork: true,
      clientName: p.company_name || p.name,
      fromName: "STL Apps LLC",
      fromContact: "Sean Tyler Lee",
      fromEmail: "seantylerlee@icloud.com",
      fromWebsite: "seantylerlee.com",
      items: [{ desc: "Extra work — " + trimmed(hours) + " hours", qty: hours, rate: rate }],
      amountPaid: 0,
      notes: "Extra work for " + p.name,
      paymentNotes: ""
    };
    db.from("billing_documents").insert({
      kind: "invoice",
      number: number + "-" + String(Date.now()).slice(-4),
      client_name: draft.clientName,
      project_name: p.name,
      status: "unpaid",
      amount: total,
      issued_on: todayISO(),
      due_on: addDaysISO(14),
      notes: draft.notes,
      payload: draft
    }).then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      var ids = cache.hours.filter(function (h) { return !h.is_billed; }).map(function (h) { return h.id; });
      if (!ids.length) return showMsg("Invoice created in Billing.", true);
      return db.from("project_hour_entries").update({ is_billed: true }).in("id", ids).then(function (res2) {
        if (res2.error) return showMsg(res2.error.message, false);
        showMsg("Invoice created and hours marked billed. Open Billing to edit/download.", true);
        return loadChildren().then(renderBody);
      });
    });
  }

  function downloadLoginsPdf(p) {
    if (!window.jspdf || !window.jspdf.jsPDF) return showMsg("PDF library missing.", false);
    var doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter" });
    var y = 48;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("IMPORTANT LOGINS", 48, y);
    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(p.name + (p.company_name ? " · " + p.company_name : ""), 48, y);
    y += 24;
    cache.logins.forEach(function (login, i) {
      if (y > 720) { doc.addPage(); y = 48; }
      doc.setFont("helvetica", "bold");
      doc.text((i + 1) + ". " + (login.site_name || "Login"), 48, y);
      y += 16;
      doc.setFont("helvetica", "normal");
      [["URL", login.url], ["Username", login.username], ["Password", login.password], ["Notes", login.notes]].forEach(function (row) {
        if (!row[1]) return;
        var lines = doc.splitTextToSize(row[0] + ": " + row[1], 516);
        doc.text(lines, 60, y);
        y += lines.length * 14 + 4;
      });
      y += 10;
    });
    doc.save("STL-Apps-LLC_Logins_" + (p.name || "project").replace(/\s+/g, "-") + ".pdf");
  }

  function downloadHoursPdf(p) {
    if (!window.jspdf || !window.jspdf.jsPDF) return showMsg("PDF library missing.", false);
    var doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter" });
    var y = 48;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Hours log", 48, y);
    y += 20;
    doc.setFontSize(11);
    doc.text(p.name + " · Total " + trimmed(totalHours()) + " hours", 48, y);
    y += 24;
    doc.setFont("helvetica", "normal");
    cache.hours.forEach(function (entry) {
      if (y > 720) { doc.addPage(); y = 48; }
      doc.setFont("helvetica", "bold");
      doc.text((entry.date || "") + " · " + trimmed(entry.hours) + " hr" + (entry.is_billed ? " · billed" : ""), 48, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      if (entry.notes) {
        var lines = doc.splitTextToSize(entry.notes, 516);
        doc.text(lines, 48, y);
        y += lines.length * 13 + 10;
      } else y += 10;
    });
    doc.save("STL-Apps-LLC_Hours_" + (p.name || "project").replace(/\s+/g, "-") + ".pdf");
  }

  function seedHandoff(projectId) {
    var rows = HANDOFF_DEFAULTS.map(function (title, index) {
      return { project_id: projectId, title: title, sort_order: index, is_done: false };
    });
    return db.from("project_handoff_items").insert(rows);
  }

  function addProject() {
    var name = window.prompt("Project name", "New project");
    if (name == null) return;
    name = String(name).trim() || "New project";
    db.from("client_projects").insert({ name: name, company_name: "" }).select("*").single()
      .then(function (res) {
        if (res.error) return showMsg(missingTable(res.error) ? "Run sql/003_projects.sql in Supabase, then refresh." : res.error.message, false);
        return seedHandoff(res.data.id).then(function () {
          selectedId = res.data.id;
          section = "overview";
          return loadProjects();
        });
      });
  }

  function deleteProject() {
    var p = selected();
    if (!p) return;
    if (!confirm('Delete project "' + (p.name || "Untitled") + '" and all its logins, costs, hours, issues, and handoff items?')) return;
    db.from("client_projects").delete().eq("id", p.id).then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      selectedId = null;
      section = "overview";
      loadProjects();
    });
  }

  function loadProjects() {
    showMsg("Loading projects…", true);
    return Promise.all([
      db.from("client_projects").select("*").order("updated_at", { ascending: false }),
      db.from("studio_clients").select("id,link_id,name,company_name,email,phone,address")
    ]).then(function (pair) {
      var res = pair[0];
      studioClients = (pair[1] && pair[1].data) || [];
      if (res.error) {
        var msg = res.error.message || "Could not load projects.";
        if (missingTable(res.error)) {
          msg = "Projects table missing. Run sql/003_projects.sql in Supabase, then refresh.";
        } else if (/permission denied|42501/i.test(msg)) {
          msg = "Permission denied. In Supabase SQL Editor, run sql/003b_projects_grants.sql, then refresh.";
        }
        showMsg(msg, false);
        projects = [];
        renderAll();
        return;
      }
      projects = res.data || [];
      if (selectedId && !projects.some(function (p) { return p.id === selectedId; })) selectedId = null;
      if (!selectedId && projects[0]) selectedId = projects[0].id;
      return loadChildren().then(function () {
        clearDirty();
        renderAll();
        if (!projects.length) showMsg("No projects yet — click New.", true);
        else showMsg("");
      });
    })
      .catch(function (err) {
        showMsg((err && err.message) || "Could not load projects.", false);
        projects = [];
        renderAll();
      });
  }

  function loadChildren() {
    var p = selected();
    cache = { logins: [], costs: [], hours: [], issues: [], handoff: [], meetings: [], billing: [] };
    if (!p) return Promise.resolve();
    return Promise.all([
      db.from("project_logins").select("*").eq("project_id", p.id).order("site_name"),
      db.from("project_costs").select("*").eq("project_id", p.id).order("date", { ascending: false }),
      db.from("project_hour_entries").select("*").eq("project_id", p.id).order("date", { ascending: false }),
      db.from("project_issues").select("*").eq("project_id", p.id).order("updated_at", { ascending: false }),
      db.from("project_handoff_items").select("*").eq("project_id", p.id).order("sort_order"),
      db.from("meeting_logs").select("*").eq("linked_project_id", p.link_id).order("meeting_date", { ascending: false }),
      db.from("billing_documents").select("*").order("updated_at", { ascending: false })
    ]).then(function (results) {
      var err = results.map(function (r) { return r.error; }).filter(Boolean)[0];
      if (err && missingTable(err)) {
        showMsg("Projects tables missing. Run the Projects SQL in Supabase, then refresh.", false);
        return;
      }
      if (err) {
        showMsg(err.message, false);
      }
      cache.logins = (results[0] && results[0].data) || [];
      cache.costs = (results[1] && results[1].data) || [];
      cache.hours = (results[2] && results[2].data) || [];
      cache.issues = (results[3] && results[3].data) || [];
      cache.handoff = (results[4] && results[4].data) || [];
      cache.meetings = (results[5] && results[5].data) || [];
      cache.billing = ((results[6] && results[6].data) || []).filter(function (doc) {
        var payload = doc.payload || {};
        return payload.linkedProjectID === p.link_id || doc.project_name === p.name;
      });
      if (!cache.handoff.length) {
        return seedHandoff(p.id).then(function (seedRes) {
          if (seedRes && seedRes.error) return;
          return db.from("project_handoff_items").select("*").eq("project_id", p.id).order("sort_order")
            .then(function (res) { cache.handoff = res.data || []; });
        });
      }
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not load project details.", false);
    });
  }

  function bindChrome() {
    el("add").addEventListener("click", function () {
      harvestForm();
      if (!confirmLeaveIfDirty()) return;
      addProject();
    });
    el("delete-project").addEventListener("click", function () {
      if (!confirmLeaveIfDirty()) return;
      deleteProject();
    });
  }

  window.STLProjects = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      selectedId = null;
      section = "overview";
      dirty = false;
      saving = false;
      panel.classList.add("projects-wide");
      panel.innerHTML = shell();
      bindChrome();
      syncSaveButton();
      loadProjects();
    },
    unmount: function (panel) {
      clearInterval(timerTick);
      hideSaveButton();
      if (panel) panel.classList.remove("projects-wide");
      root = null;
    },
    saveAll: saveAll,
    isDirty: function () { return dirty; }
  };
})();

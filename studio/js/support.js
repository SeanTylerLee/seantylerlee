(function () {
  "use strict";

  var STATUSES = [
    { id: "open", title: "Open" },
    { id: "inProgress", title: "Working" },
    { id: "waiting", title: "Waiting" },
    { id: "fixed", title: "Fixed" },
    { id: "closed", title: "Closed" },
    { id: "wontFix", title: "Won't fix" }
  ];
  var PRIORITIES = [
    { id: "urgent", title: "Urgent" },
    { id: "high", title: "High" },
    { id: "normal", title: "Normal" },
    { id: "low", title: "Low" }
  ];
  var CATEGORIES = [
    { id: "crash", title: "Crash" },
    { id: "bug", title: "Bug" },
    { id: "billing", title: "Billing" },
    { id: "howTo", title: "How-to" },
    { id: "login", title: "Login" },
    { id: "feature", title: "Feature" },
    { id: "store", title: "Store" },
    { id: "other", title: "Other" }
  ];
  var SOURCES = [
    { id: "email", title: "Email" },
    { id: "appStore", title: "App Store" },
    { id: "playStore", title: "Play Store" },
    { id: "inApp", title: "In-app" },
    { id: "phone", title: "Phone" },
    { id: "social", title: "Social" },
    { id: "website", title: "Website" },
    { id: "other", title: "Other" }
  ];
  var PLATFORMS = ["iOS", "iPadOS", "Android", "macOS", "Web", "Unknown"];

  var root = null;
  var db = null;
  var apps = [];
  var tickets = [];
  var selectedAppId = "all";
  var selectedId = null;
  var filter = "open";
  var search = "";
  var dirty = false;
  var saving = false;

  function el(name) { return root ? root.querySelector('[data-el="' + name + '"]') : null; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function trim(s) { return String(s == null ? "" : s).trim(); }
  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }
  function syncSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.disabled = !dirty || saving || !selectedId;
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
  function isDone(status) { return status === "fixed" || status === "closed" || status === "wontFix"; }
  function selected() { return tickets.filter(function (t) { return t.id === selectedId; })[0] || null; }

  function visibleTickets() {
    var list = tickets.slice();
    if (selectedAppId !== "all") list = list.filter(function (t) { return t.app_id === selectedAppId; });
    if (filter === "open") list = list.filter(function (t) { return t.status === "open" || t.status === "inProgress"; });
    else if (filter === "waiting") list = list.filter(function (t) { return t.status === "waiting"; });
    else if (filter === "done") list = list.filter(function (t) { return isDone(t.status); });
    var q = trim(search).toLowerCase();
    if (q) {
      list = list.filter(function (t) {
        return [t.title, t.ticket_number, t.customer_name, t.customer_email, t.details]
          .some(function (v) { return String(v || "").toLowerCase().indexOf(q) !== -1; });
      });
    }
    list.sort(function (a, b) {
      if (isDone(a.status) !== isDone(b.status)) return isDone(a.status) ? 1 : -1;
      return String(b.updated_at || "") < String(a.updated_at || "") ? -1 : 1;
    });
    return list;
  }

  function field(label, key, value, type) {
    if (type === "textarea") return '<div class="ops-field"><label>' + label + '</label><textarea data-key="' + key + '">' + esc(value || "") + "</textarea></div>";
    if (type === "select") return '<div class="ops-field"><label>' + label + "</label><select data-key=\"" + key + "\">" + value + "</select></div>";
    return '<div class="ops-field"><label>' + label + '</label><input data-key="' + key + '" type="' + (type || "text") + '" value="' + esc(value || "") + '" /></div>';
  }

  function opts(list, current, useId) {
    return list.map(function (item) {
      var id = useId ? item.id : item;
      var title = useId ? item.title : item;
      return '<option value="' + esc(id) + '"' + (current === id ? " selected" : "") + ">" + esc(title) + "</option>";
    }).join("");
  }

  function shell() {
    return (
      '<div class="ops-workspace">' +
        '<div class="ops-top" data-el="apps"></div>' +
        '<div class="ops-header"><h1>Support</h1><p>Customer tickets by app — crashes, billing questions, how-tos.</p></div>' +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="ops-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function renderApps() {
    var html = '<button type="button" class="ops-capsule' + (selectedAppId === "all" ? " is-on" : "") + '" data-app="all">All apps</button>';
    apps.forEach(function (app) {
      html += '<button type="button" class="ops-capsule' + (selectedAppId === app.id ? " is-on" : "") + '" data-app="' + app.id + '">' + esc(app.name || "App") + "</button>";
    });
    html += '<button type="button" class="ops-capsule" data-el="add" style="margin-left:auto">+ Ticket</button>';
    el("apps").innerHTML = html;
    el("apps").querySelectorAll("[data-app]").forEach(function (btn) {
      btn.onclick = function () {
        harvest();
        selectedAppId = btn.getAttribute("data-app");
        selectedId = null;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      };
    });
    var add = el("add");
    if (add) add.onclick = addTicket;
  }

  function render() {
    renderApps();
    var open = tickets.filter(function (t) { return t.status === "open" || t.status === "inProgress"; }).length;
    var waiting = tickets.filter(function (t) { return t.status === "waiting"; }).length;
    var done = tickets.filter(function (t) { return isDone(t.status); }).length;
    var list = visibleTickets();
    var ticket = selected();

    var html =
      '<div class="ops-chips">' +
        '<div class="ops-chip danger"><span class="k">Open</span><span class="v">' + open + "</span></div>" +
        '<div class="ops-chip warn"><span class="k">Waiting</span><span class="v">' + waiting + "</span></div>" +
        '<div class="ops-chip ok"><span class="k">Done</span><span class="v">' + done + "</span></div>" +
      "</div>" +
      '<div class="ops-filters">' +
        ["open", "waiting", "done", "all"].map(function (f) {
          return '<button type="button" class="ops-pill' + (filter === f ? " is-on" : "") + '" data-filter="' + f + '">' + f.charAt(0).toUpperCase() + f.slice(1) + "</button>";
        }).join("") +
        '<input data-el="search" type="search" placeholder="Search…" value="' + esc(search) + '" style="margin-left:auto;min-height:30px;border-radius:8px;border:1px solid rgba(0,24,72,.12);padding:0 10px;font-size:12px" />' +
      "</div>" +
      '<div class="ops-split">' +
        '<div class="ops-list">';

    if (!list.length) {
      html += '<p class="sub" style="padding:8px;color:#6b7388">No tickets in this filter.</p>';
    } else {
      list.forEach(function (t) {
        html +=
          '<button type="button" class="ops-item' + (t.id === selectedId ? " is-on" : "") + '" data-id="' + t.id + '">' +
            "<strong>#" + esc(t.ticket_number || "") + " · " + esc(t.title || "Untitled") + "</strong>" +
            "<span>" + esc(t.status || "open") + (trim(t.customer_name) ? " · " + esc(t.customer_name) : "") + "</span>" +
          "</button>";
      });
    }

    html += '</div><div class="ops-detail">';
    if (!ticket) {
      html += '<p class="sub">Pick a ticket on the left.</p>';
    } else {
      html +=
        '<div class="ops-grid">' +
          field("Number", "ticket_number", ticket.ticket_number) +
          field("Status", "status", opts(STATUSES, ticket.status, true), "select") +
          field("Title", "title", ticket.title) +
          field("Priority", "priority", opts(PRIORITIES, ticket.priority, true), "select") +
          field("Category", "category", opts(CATEGORIES, ticket.category, true), "select") +
          field("Source", "source", opts(SOURCES, ticket.source, true), "select") +
          field("Platform", "platform", opts(PLATFORMS, ticket.platform || "iOS", false), "select") +
          field("App", "app_id",
            '<option value="">None</option>' +
            apps.map(function (a) {
              return '<option value="' + a.id + '"' + (ticket.app_id === a.id ? " selected" : "") + ">" + esc(a.name || "App") + "</option>";
            }).join(""), "select") +
          field("Customer", "customer_name", ticket.customer_name) +
          field("Email", "customer_email", ticket.customer_email, "email") +
          field("Phone", "customer_phone", ticket.customer_phone) +
          field("App version", "app_version", ticket.app_version) +
          field("OS version", "os_version", ticket.os_version) +
          field("Device", "device", ticket.device) +
        "</div>" +
        field("Details", "details", ticket.details, "textarea") +
        field("Next step", "next_step", ticket.next_step) +
        field("Resolution", "resolution", ticket.resolution, "textarea") +
        field("Internal notes", "internal_notes", ticket.internal_notes, "textarea") +
        '<div class="ops-actions">' +
          '<button class="btn btn-ghost" type="button" data-status="waiting">Waiting</button>' +
          '<button class="btn btn-ghost" type="button" data-status="fixed">Mark fixed</button>' +
          '<button class="btn btn-ghost" type="button" data-status="open">Reopen</button>' +
          '<button class="btn btn-ghost" type="button" data-el="delete">Delete</button>' +
        "</div>";
    }
    html += "</div></div>";
    el("body").innerHTML = html;
    bind();
    syncSave();
  }

  function harvest() {
    var ticket = selected();
    if (!ticket) return;
    root.querySelectorAll(".ops-detail [data-key]").forEach(function (input) {
      ticket[input.getAttribute("data-key")] = input.value;
    });
  }

  function bind() {
    root.querySelectorAll("[data-filter]").forEach(function (btn) {
      btn.onclick = function () {
        harvest();
        filter = btn.getAttribute("data-filter");
        if (selectedId && !visible().some(function (t) { return t.id === selectedId; })) {
          selectedId = null;
        }
        render();
        if (dirty) showMsg("Unsaved changes", true);
      };
    });
    var searchEl = el("search");
    if (searchEl) {
      searchEl.oninput = function () {
        var caret = searchEl.selectionStart;
        harvest();
        search = searchEl.value;
        render();
        var again = el("search");
        if (again) {
          again.focus();
          try { again.setSelectionRange(caret, caret); } catch (e) {}
        }
        if (dirty) showMsg("Unsaved changes", true);
      };
    }
    root.querySelectorAll(".ops-list [data-id]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-id");
        if (id === selectedId) return;
        if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
        selectedId = id;
        if (dirty) {
          load();
          return;
        }
        render();
      };
    });
    root.querySelectorAll(".ops-detail [data-key]").forEach(function (input) {
      var evt = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(evt, function () {
        harvest();
        markDirty();
      });
    });
    root.querySelectorAll("[data-status]").forEach(function (btn) {
      btn.onclick = function () {
        harvest();
        var ticket = selected();
        if (!ticket) return;
        ticket.status = btn.getAttribute("data-status");
        if (ticket.status === "fixed" || ticket.status === "closed") {
          ticket.resolved_at = new Date().toISOString();
        }
        markDirty();
        render();
        showMsg("Unsaved changes", true);
      };
    });
    var del = el("delete");
    if (del) {
      del.onclick = function () {
        var ticket = selected();
        if (!ticket || !window.confirm("Delete this ticket?")) return;
        db.from("support_tickets").delete().eq("id", ticket.id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          tickets = tickets.filter(function (t) { return t.id !== ticket.id; });
          selectedId = null;
          clearDirty();
          render();
        });
      };
    }
  }

  function nextNumber() {
    var max = 0;
    tickets.forEach(function (t) {
      var n = parseInt(t.ticket_number, 10);
      if (!isNaN(n)) max = Math.max(max, n);
    });
    return String(max + 1).padStart(3, "0");
  }

  function addTicket() {
    harvest();
    db.from("support_tickets").insert({
      ticket_number: nextNumber(),
      title: "New ticket",
      status: "open",
      priority: "normal",
      category: "bug",
      source: "email",
      platform: "iOS",
      app_id: selectedAppId === "all" ? null : selectedAppId
    }).select("*").single().then(function (res) {
      if (res.error) return showMsg(/does not exist|schema cache/i.test(res.error.message || "") ? "Run sql/012_support_emails_leads.sql (and Apps SQL first)." : res.error.message, false);
      tickets.unshift(res.data);
      selectedId = res.data.id;
      filter = "open";
      clearDirty();
      render();
      showMsg("Ticket added. Edit, then Save.", true);
    });
  }

  function saveAll() {
    if (saving || !dirty) return;
    harvest();
    var ticket = selected();
    if (!ticket) {
      showMsg("Pick a ticket to save.", false);
      return;
    }
    saving = true;
    syncSave();
    showMsg("Saving…", true);
    db.from("support_tickets").update({
      ticket_number: ticket.ticket_number || "",
      title: ticket.title || "",
      details: ticket.details || "",
      customer_name: ticket.customer_name || "",
      customer_email: ticket.customer_email || "",
      customer_phone: ticket.customer_phone || "",
      platform: ticket.platform || "iOS",
      app_version: ticket.app_version || "",
      os_version: ticket.os_version || "",
      device: ticket.device || "",
      source: ticket.source || "email",
      category: ticket.category || "bug",
      priority: ticket.priority || "normal",
      status: ticket.status || "open",
      next_step: ticket.next_step || "",
      resolution: ticket.resolution || "",
      internal_notes: ticket.internal_notes || "",
      app_id: ticket.app_id || null,
      resolved_at: ticket.resolved_at || null
    }).eq("id", ticket.id).then(function (res) {
      saving = false;
      if (res.error) { showMsg(res.error.message, false); syncSave(); return; }
      clearDirty();
      showMsg("Saved", true);
      setTimeout(function () { showMsg(""); }, 900);
      render();
    });
  }

  function load() {
    showMsg("Loading support…", true);
    Promise.all([
      db.from("managed_apps").select("id,name").order("name"),
      db.from("support_tickets").select("*").order("updated_at", { ascending: false })
    ]).then(function (pair) {
      apps = (pair[0].data || []);
      if (pair[1].error) {
        showMsg(/does not exist|schema cache/i.test(pair[1].error.message || "") ? "Run sql/012_support_emails_leads.sql in Supabase." : pair[1].error.message, false);
        tickets = [];
      } else {
        tickets = pair[1].data || [];
      }
      clearDirty();
      showMsg("");
      render();
    });
  }

  window.STLSupport = {
    mount: function (panel, client) {
      db = client; root = panel; selectedAppId = "all"; selectedId = null; filter = "open"; search = ""; dirty = false; saving = false;
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

(function () {
  "use strict";

  var CATEGORIES = [
    { id: "llc", title: "LLC / SOS" },
    { id: "appleDeveloper", title: "Apple Developer" },
    { id: "googlePlay", title: "Google Play" },
    { id: "domain", title: "Domain" },
    { id: "insurance", title: "Insurance" },
    { id: "tax", title: "Tax / EIN" },
    { id: "other", title: "Other" }
  ];

  var SUGGESTIONS = [
    { title: "Oklahoma LLC annual certificate", category: "llc", days: 365 },
    { title: "Apple Developer Program", category: "appleDeveloper", days: 365 },
    { title: "Google Play developer fee", category: "googlePlay", days: 365 },
    { title: "Primary domain renewal", category: "domain", days: 365 },
    { title: "Business insurance", category: "insurance", days: 365 }
  ];

  var root = null;
  var db = null;
  var renewals = [];
  var expandedId = null;
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

  function trim(s) {
    return String(s == null ? "" : s).trim();
  }

  function money(n) {
    return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
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
    var msg = (err && err.message) || "";
    return /does not exist|schema cache|not find/i.test(msg);
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function addDaysISO(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function parseISO(iso) {
    if (!iso) return null;
    var parts = String(iso).slice(0, 10).split("-");
    if (parts.length !== 3) return null;
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function formatDate(iso) {
    var d = parseISO(iso);
    if (!d) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function daysUntilDue(item) {
    var due = parseISO(item.due_date);
    if (!due) return 0;
    var start = new Date();
    start = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    return Math.round((due - start) / 86400000);
  }

  function isOverdue(item) {
    return daysUntilDue(item) < 0;
  }

  function isDueSoon(item) {
    var days = daysUntilDue(item);
    var remind = Math.max(0, Number(item.remind_days_before) || 0);
    return days >= 0 && days <= remind;
  }

  function statusLabel(item) {
    if (isOverdue(item)) return "Overdue";
    if (isDueSoon(item)) return "Due soon";
    return "Upcoming";
  }

  function statusClass(item) {
    if (isOverdue(item)) return "danger";
    if (isDueSoon(item)) return "warn";
    return "accent";
  }

  function dayLabel(item) {
    var days = daysUntilDue(item);
    if (days < 0) {
      var late = -days;
      return late + " day" + (late === 1 ? "" : "s") + " late";
    }
    if (days === 0) return "Due today";
    return "in " + days + " day" + (days === 1 ? "" : "s");
  }

  function displayTitle(item) {
    return trim(item.title) || "New renewal";
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

  function categoryOptions(current) {
    return CATEGORIES.map(function (c) {
      return '<option value="' + c.id + '"' + (current === c.id ? " selected" : "") + ">" + esc(c.title) + "</option>";
    }).join("");
  }

  function field(label, key, value, type) {
    if (type === "textarea") {
      return '<div class="renewal-field"><label>' + label + '</label><textarea data-key="' + key + '">' + esc(value || "") + "</textarea></div>";
    }
    if (type === "select") {
      return '<div class="renewal-field"><label>' + label + "</label><select data-key=\"" + key + "\">" + value + "</select></div>";
    }
    return '<div class="renewal-field"><label>' + label + '</label><input data-key="' + key + '" type="' + (type || "text") + '" value="' + esc(value || "") + '" /></div>';
  }

  function shell() {
    return (
      '<div class="renewals-workspace">' +
        '<div class="renewals-header">' +
          "<h1>Renewals</h1>" +
          "<p>LLC filings, Apple Developer, domains, insurance. Set an amount, then Log as expense when you pay.</p>" +
        "</div>" +
        '<p class="status renewals-banner" data-el="banner"></p>' +
        '<div class="renewals-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function groups() {
    var overdue = renewals.filter(isOverdue);
    var dueSoon = renewals.filter(function (item) { return isDueSoon(item) && !isOverdue(item); });
    var upcoming = renewals.filter(function (item) { return !isOverdue(item) && !isDueSoon(item); });
    return { overdue: overdue, dueSoon: dueSoon, upcoming: upcoming };
  }

  function cardHTML(item) {
    var open = item.id === expandedId;
    var klass = statusClass(item);
    return (
      '<div class="renewal-card' + (open ? " is-open" : "") + '" data-id="' + item.id + '">' +
        '<button type="button" class="renewal-card-head" data-action="toggle">' +
          '<span class="chev">▸</span>' +
          '<span class="meta">' +
            "<strong>" + esc(displayTitle(item)) + "</strong>" +
            '<span class="line">' + esc(formatDate(item.due_date)) +
            (Number(item.amount) > 0 ? " · " + money(item.amount) : "") +
            (item.logged_expense_id ? " · logged to Expenses" : "") +
            "</span>" +
          "</span>" +
          '<span class="side">' +
            '<span class="renewal-badge ' + klass + '">' + esc(statusLabel(item)) + "</span>" +
            '<span class="renewal-days ' + klass + '">' + esc(dayLabel(item)) + "</span>" +
          "</span>" +
        "</button>" +
        '<div class="renewal-card-body">' +
          field("Title", "title", item.title) +
          '<div class="renewal-grid">' +
            field("Category", "category", categoryOptions(item.category || "other"), "select") +
            field("Due date", "due_date", item.due_date, "date") +
            field("Remind days before", "remind_days_before", item.remind_days_before, "number") +
            field("Amount", "amount", item.amount == null ? "" : item.amount, "number") +
          "</div>" +
          field("Notes", "notes", item.notes, "textarea") +
          '<div class="renewals-actions" style="justify-content:flex-end;gap:8px;flex-wrap:wrap">' +
            '<button class="btn btn-ghost" type="button" data-action="log-expense"' +
              (Number(item.amount) > 0 ? "" : " disabled title=\"Set an amount first\"") + ">" +
              (item.logged_expense_id ? "Log again as expense" : "Log as expense") +
            "</button>" +
            '<button class="btn btn-ghost" type="button" data-action="remove">Remove</button>' +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function sectionHTML(title, items) {
    if (!items.length) return "";
    return (
      '<div class="renewals-section"><h2>' + esc(title) + "</h2>" +
      items.map(cardHTML).join("") +
      "</div>"
    );
  }

  function render() {
    var body = el("body");
    if (!body) return;
    var g = groups();
    var html =
      '<div class="renewals-chips">' +
        '<div class="renewals-chip ' + (g.overdue.length ? "danger" : "accent") + '"><span class="k">Overdue</span><span class="v">' + g.overdue.length + "</span></div>" +
        '<div class="renewals-chip ' + (g.dueSoon.length ? "warn" : "accent") + '"><span class="k">Due soon</span><span class="v">' + g.dueSoon.length + "</span></div>" +
        '<div class="renewals-chip accent"><span class="k">Upcoming</span><span class="v">' + g.upcoming.length + "</span></div>" +
      "</div>";

    if (!renewals.length) {
      html +=
        '<div class="renewals-empty">No renewals yet. Add your Oklahoma LLC filing, Apple Developer Program, domains, and insurance so nothing sneaks up on you.</div>' +
        '<div class="renewals-actions">' +
          '<button class="btn btn-ghost" type="button" data-el="add-common">Add common renewals</button>' +
          '<button class="btn btn-ghost" type="button" data-el="add">Add renewal</button>' +
        "</div>";
    } else {
      html += sectionHTML("Overdue", g.overdue);
      html += sectionHTML("Due soon", g.dueSoon);
      html += sectionHTML("Upcoming", g.upcoming);
      html += '<div class="renewals-actions"><button class="btn btn-ghost" type="button" data-el="add">Add renewal</button></div>';
    }

    body.innerHTML = html;
    bind();
    syncSaveButton();
  }

  function applyLocal(input, card) {
    var id = card.getAttribute("data-id");
    var key = input.getAttribute("data-key");
    var value = input.value;
    if (key === "remind_days_before") value = Math.max(0, Number(value || 0));
    if (key === "amount") value = value === "" ? 0 : Number(value || 0);
    renewals.forEach(function (item) {
      if (item.id === id) item[key] = value;
    });
  }

  function harvest() {
    if (!root) return;
    root.querySelectorAll(".renewal-card").forEach(function (card) {
      card.querySelectorAll("[data-key]").forEach(function (input) {
        applyLocal(input, card);
      });
    });
  }

  function bind() {
    root.querySelectorAll('[data-action="toggle"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var card = btn.closest(".renewal-card");
        var id = card.getAttribute("data-id");
        harvest();
        expandedId = expandedId === id ? null : id;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      });
    });

    root.querySelectorAll("[data-key]").forEach(function (input) {
      var evt = input.tagName === "SELECT" || input.type === "date" || input.type === "number" ? "change" : "input";
      input.addEventListener(evt, function () {
        applyLocal(input, input.closest(".renewal-card"));
        markDirty();
        if (input.getAttribute("data-key") === "title") {
          var card = input.closest(".renewal-card");
          var item = renewals.filter(function (x) { return x.id === card.getAttribute("data-id"); })[0];
          var strong = card.querySelector("strong");
          if (strong && item) strong.textContent = displayTitle(item);
        }
        if (
          input.getAttribute("data-key") === "due_date" ||
          input.getAttribute("data-key") === "remind_days_before" ||
          input.getAttribute("data-key") === "amount"
        ) {
          harvest();
          render();
          if (dirty) showMsg("Unsaved changes", true);
        }
      });
    });

    root.querySelectorAll('[data-action="remove"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.closest(".renewal-card").getAttribute("data-id");
        var item = renewals.filter(function (x) { return x.id === id; })[0];
        if (!item) return;
        if (!window.confirm('Remove "' + displayTitle(item) + '"?')) return;
        db.from("renewal_items").delete().eq("id", id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          if (expandedId === id) expandedId = null;
          renewals = renewals.filter(function (x) { return x.id !== id; });
          render();
          if (dirty) showMsg("Unsaved changes", true);
        });
      });
    });

    root.querySelectorAll('[data-action="log-expense"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.closest(".renewal-card").getAttribute("data-id");
        logAsExpense(id);
      });
    });

    var add = el("add");
    if (add) add.addEventListener("click", addRenewal);
    var addCommon = el("add-common");
    if (addCommon) addCommon.addEventListener("click", addSuggestedDefaults);
  }

  function logAsExpense(id) {
    harvest();
    var item = renewals.filter(function (x) { return x.id === id; })[0];
    if (!item) return;
    var amount = Number(item.amount) || 0;
    if (amount <= 0) return showMsg("Set an amount greater than zero first.", false);
    if (item.logged_expense_id) {
      if (!window.confirm("This renewal was already logged to Expenses. Create another expense row?")) return;
    } else if (!window.confirm('Log "' + displayTitle(item) + '" as a ' + money(amount) + " expense?")) {
      return;
    }
    var due = String(item.due_date || todayISO()).slice(0, 10);
    var year = Number(due.slice(0, 4)) || new Date().getFullYear();
    var noteBits = [];
    if (trim(item.notes)) noteBits.push(trim(item.notes));
    noteBits.push("From renewal · due " + due);
    showMsg("Logging to Expenses…", true);
    db.from("business_expenses").insert({
      title: displayTitle(item),
      amount: amount,
      year: year,
      date: due,
      is_recurring: true,
      recurrence: "yearly",
      recurring_month_count: 0,
      notes: noteBits.join("\n"),
      receipt_path: "",
      receipt_file_name: ""
    }).select("*").single().then(function (res) {
      if (res.error) {
        var msg = res.error.message || "Could not create expense.";
        if (/amount|logged_expense|column/i.test(msg) && /renewal/i.test(msg)) {
          msg = "Run sql/020_renewals_expense.sql in Supabase, then refresh.";
        } else if (missingTable(res.error) || /business_expenses/i.test(msg)) {
          msg = "Run sql/009_money.sql in Supabase, then refresh.";
        }
        showMsg(msg, false);
        return null;
      }
      return db.from("renewal_items").update({
        amount: amount,
        logged_expense_id: res.data.id
      }).eq("id", id).select("*").single().then(function (up) {
        if (up.error) {
          var hint = up.error.message || "Expense created, but could not mark the renewal.";
          if (/amount|logged_expense|column|schema cache/i.test(hint)) {
            hint = "Expense created. Run sql/020_renewals_expense.sql so Studio can remember it was logged.";
          }
          showMsg(hint, false);
          return;
        }
        renewals = renewals.map(function (row) {
          return row.id === id ? up.data : row;
        });
        clearDirty();
        render();
        showMsg("Logged to Expenses for " + year + ". Open Expenses to attach a receipt.", true);
      });
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not log expense.", false);
    });
  }

  function addRenewal() {
    harvest();
    db.from("renewal_items").insert({
      title: "New renewal",
      category: "other",
      due_date: addDaysISO(30),
      remind_days_before: 30,
      amount: 0,
      notes: "",
      notification_id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
    }).select("*").single().then(function (res) {
      if (res.error) {
        var msg = res.error.message || "";
        if (missingTable(res.error)) msg = "Run sql/008_renewals.sql in Supabase, then refresh.";
        else if (/amount|logged_expense|column|schema cache/i.test(msg)) {
          msg = "Run sql/020_renewals_expense.sql in Supabase, then refresh.";
        }
        showMsg(msg, false);
        return;
      }
      renewals.push(res.data);
      expandedId = res.data.id;
      clearDirty();
      render();
      showMsg("Renewal added. Edit details, then Save.", true);
    });
  }

  function addSuggestedDefaults() {
    harvest();
    var rows = SUGGESTIONS.map(function (s) {
      return {
        title: s.title,
        category: s.category,
        due_date: addDaysISO(s.days),
        remind_days_before: 30,
        amount: 0,
        notes: "",
        notification_id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()
      };
    });
    db.from("renewal_items").insert(rows).select("*").then(function (res) {
      if (res.error) {
        var msg = res.error.message || "";
        if (missingTable(res.error)) msg = "Run sql/008_renewals.sql in Supabase, then refresh.";
        else if (/amount|logged_expense|column|schema cache/i.test(msg)) {
          msg = "Run sql/020_renewals_expense.sql in Supabase, then refresh.";
        }
        showMsg(msg, false);
        return;
      }
      renewals = renewals.concat(res.data || []);
      clearDirty();
      render();
      showMsg("Common renewals added. Adjust due dates, then Save.", true);
    });
  }

  function saveAll() {
    if (saving || !dirty) return;
    harvest();
    saving = true;
    syncSaveButton();
    showMsg("Saving…", true);
    var jobs = renewals.map(function (item) {
      return db.from("renewal_items").update({
        title: item.title || "",
        category: item.category || "other",
        due_date: item.due_date || todayISO(),
        notes: item.notes || "",
        remind_days_before: Math.max(0, Number(item.remind_days_before) || 0),
        amount: Number(item.amount) || 0,
        logged_expense_id: item.logged_expense_id || null
      }).eq("id", item.id);
    });
    Promise.all(jobs).then(function (results) {
      saving = false;
      var err = results.map(function (r) { return r && r.error; }).filter(Boolean)[0];
      if (err) {
        var msg = err.message || "Save failed.";
        if (/amount|logged_expense|column|schema cache/i.test(msg)) {
          msg = "Run sql/020_renewals_expense.sql in Supabase, then refresh.";
        }
        showMsg(msg, false);
        syncSaveButton();
        return;
      }
      clearDirty();
      showMsg("Saved", true);
      setTimeout(function () { if (!dirty) showMsg(""); }, 1000);
      render();
    }).catch(function (err) {
      saving = false;
      showMsg((err && err.message) || "Save failed.", false);
      syncSaveButton();
    });
  }

  function load() {
    showMsg("Loading renewals…", true);
    return db.from("renewal_items").select("*").order("due_date")
      .then(function (res) {
        if (res.error) {
          var msg = res.error.message || "Could not load renewals.";
          if (missingTable(res.error)) msg = "Run sql/008_renewals.sql in Supabase, then refresh.";
          else if (/permission denied|42501/i.test(msg)) msg = "Permission denied. Re-run sql/008_renewals.sql in Supabase.";
          showMsg(msg, false);
          renewals = [];
          render();
          return;
        }
        renewals = res.data || [];
        clearDirty();
        render();
        showMsg(renewals.length ? "" : "No renewals yet — add one or use Add common renewals.", true);
      })
      .catch(function (err) {
        showMsg((err && err.message) || "Could not load renewals.", false);
        renewals = [];
        render();
      });
  }

  window.STLRenewals = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      expandedId = null;
      dirty = false;
      saving = false;
      panel.classList.add("renewals-wide");
      panel.innerHTML = shell();
      syncSaveButton();
      load();
    },
    unmount: function (panel) {
      hideSaveButton();
      if (panel) panel.classList.remove("renewals-wide");
      root = null;
    },
    saveAll: saveAll,
    isDirty: function () { return dirty; }
  };
})();

(function () {
  "use strict";

  var root = null;
  var db = null;
  var lists = [];
  var contacts = [];
  var templates = [];
  var selectedListId = null;
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
    btn.disabled = !dirty || saving;
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

  function columns(list) {
    var raw = list.column_names;
    if (Array.isArray(raw)) return raw.slice(0, 5);
    if (typeof raw === "string") {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.slice(0, 5);
      } catch (e) {}
    }
    return ["Email", "Name", "Company", "Phone", "Notes"];
  }

  function listContacts(listId) {
    return contacts.filter(function (c) { return c.list_id === listId; })
      .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
  }

  function shell() {
    return '<div class="ops-workspace"><div class="ops-header"><h1>Emails</h1><p>Mailing lists and message templates — not a mailbox. Track who still needs a send.</p></div><p class="status ops-banner" data-el="banner"></p><div class="ops-body" data-el="body"></div></div>';
  }

  function render() {
    var still = contacts.filter(function (c) { return !c.is_sent; }).length;
    var sent = contacts.filter(function (c) { return c.is_sent; }).length;
    var html =
      '<div class="ops-chips">' +
        '<div class="ops-chip warn"><span class="k">Still to send</span><span class="v">' + still + "</span></div>" +
        '<div class="ops-chip ok"><span class="k">Sent</span><span class="v">' + sent + "</span></div>" +
        '<div class="ops-chip"><span class="k">Lists</span><span class="v">' + lists.length + "</span></div>" +
      "</div>";

    html += '<div class="ops-card"><h3>Lists</h3><p class="sub">Each list is a small contact sheet with a Sent checkbox.</p>';
    if (!lists.length) {
      html += '<p class="sub">No lists yet.</p>';
    } else {
      lists.forEach(function (list) {
        var rows = listContacts(list.id);
        var open = selectedListId === list.id;
        html +=
          '<div class="ops-card' + (open ? " is-open" : "") + '" style="background:rgba(60,60,67,.05);box-shadow:none" data-list="' + list.id + '">' +
            '<button type="button" class="ops-card-head" data-action="toggle-list"><span class="chev">▸</span>' +
            '<div style="flex:1"><strong>' + esc(list.name || "List") + '</strong><span class="sub" style="display:block;margin:2px 0 0">' +
            rows.length + " contacts · " + rows.filter(function (c) { return !c.is_sent; }).length + " left</span></div></button>";
        if (open) {
          var cols = columns(list);
          html += '<div class="ops-card-body" style="display:block">';
          html += '<div class="ops-field"><label>List name</label><input data-list-name="' + list.id + '" type="text" value="' + esc(list.name || "") + '" /></div>';
          html += '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>';
          cols.forEach(function (col, i) {
            html += '<th style="text-align:left;padding:4px;border-bottom:1px solid #d5e3fb">' + esc(col) + "</th>";
          });
          html += '<th style="padding:4px;border-bottom:1px solid #d5e3fb">Sent</th><th></th></tr></thead><tbody>';
          rows.forEach(function (contact) {
            var cells = Array.isArray(contact.cells) ? contact.cells : [];
            html += '<tr data-contact="' + contact.id + '">';
            for (var i = 0; i < cols.length; i += 1) {
              html += '<td style="padding:4px"><input data-cell="' + i + '" type="text" value="' + esc(cells[i] || "") + '" style="width:100%;min-height:28px;border:1px solid #d5e3fb;border-radius:6px;padding:4px 6px" /></td>';
            }
            html += '<td style="padding:4px;text-align:center"><input data-sent type="checkbox"' + (contact.is_sent ? " checked" : "") + " /></td>";
            html += '<td style="padding:4px"><button class="btn btn-ghost" type="button" data-action="remove-contact" style="min-height:26px;font-size:11px">Remove</button></td></tr>';
          });
          html += "</tbody></table></div>";
          html +=
            '<div class="ops-actions">' +
              '<button class="btn btn-ghost" type="button" data-action="add-contact">Add contact</button>' +
              '<button class="btn btn-ghost" type="button" data-action="mark-remaining">Mark remaining sent</button>' +
              '<button class="btn btn-ghost" type="button" data-action="remove-list">Remove list</button>' +
            "</div></div>";
        }
        html += "</div>";
      });
    }
    html += '<div class="ops-actions"><button class="btn btn-ghost" type="button" data-el="add-list">Add list</button></div></div>';

    html += '<div class="ops-card"><h3>Templates</h3><p class="sub">Subject + body you can copy into Mail.</p>';
    if (!templates.length) {
      html += '<p class="sub">No templates yet.</p>';
    } else {
      templates.forEach(function (tpl) {
        html +=
          '<div class="ops-card" style="background:rgba(60,60,67,.05);box-shadow:none" data-tpl="' + tpl.id + '">' +
            '<div class="ops-field"><label>Subject</label><input data-tpl-title type="text" value="' + esc(tpl.title || "") + '" /></div>' +
            '<div class="ops-field"><label>Body</label><textarea data-tpl-body>' + esc(tpl.body || "") + "</textarea></div>" +
            '<div class="ops-actions">' +
              '<button class="btn btn-ghost" type="button" data-action="copy-tpl">Copy</button>' +
              '<button class="btn btn-ghost" type="button" data-action="remove-tpl">Remove</button>' +
            "</div></div>";
      });
    }
    html += '<div class="ops-actions"><button class="btn btn-ghost" type="button" data-el="add-tpl">Add template</button></div></div>';

    el("body").innerHTML = html;
    bind();
    syncSave();
  }

  function harvest() {
    root.querySelectorAll("[data-list-name]").forEach(function (input) {
      var id = input.getAttribute("data-list-name");
      lists.forEach(function (l) { if (l.id === id) l.name = input.value; });
    });
    root.querySelectorAll("[data-contact]").forEach(function (row) {
      var id = row.getAttribute("data-contact");
      var cells = [];
      row.querySelectorAll("[data-cell]").forEach(function (input) {
        cells[Number(input.getAttribute("data-cell"))] = input.value;
      });
      var sent = row.querySelector("[data-sent]");
      contacts.forEach(function (c) {
        if (c.id !== id) return;
        c.cells = cells;
        c.email = cells[0] || "";
        c.name = cells[1] || "";
        c.company = cells[2] || "";
        c.phone = cells[3] || "";
        c.notes = cells[4] || "";
        c.is_sent = !!(sent && sent.checked);
        if (c.is_sent && !c.sent_at) c.sent_at = new Date().toISOString();
        if (!c.is_sent) c.sent_at = null;
      });
    });
    root.querySelectorAll("[data-tpl]").forEach(function (card) {
      var id = card.getAttribute("data-tpl");
      var title = card.querySelector("[data-tpl-title]");
      var body = card.querySelector("[data-tpl-body]");
      templates.forEach(function (t) {
        if (t.id !== id) return;
        if (title) t.title = title.value;
        if (body) t.body = body.value;
      });
    });
  }

  function bind() {
    root.querySelectorAll("[data-action='toggle-list']").forEach(function (btn) {
      btn.onclick = function () {
        harvest();
        var id = btn.closest("[data-list]").getAttribute("data-list");
        selectedListId = selectedListId === id ? null : id;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      };
    });
    root.querySelectorAll("input, textarea").forEach(function (input) {
      input.addEventListener("input", function () { harvest(); markDirty(); });
      input.addEventListener("change", function () { harvest(); markDirty(); });
    });
    var addList = el("add-list");
    if (addList) addList.onclick = addListFn;
    var addTpl = el("add-tpl");
    if (addTpl) addTpl.onclick = addTemplate;
    root.querySelectorAll("[data-action='add-contact']").forEach(function (btn) {
      btn.onclick = function () { addContact(btn.closest("[data-list]").getAttribute("data-list")); };
    });
    root.querySelectorAll("[data-action='remove-contact']").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.closest("[data-contact]").getAttribute("data-contact");
        db.from("email_contacts").delete().eq("id", id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          contacts = contacts.filter(function (c) { return c.id !== id; });
          render();
        });
      };
    });
    root.querySelectorAll("[data-action='mark-remaining']").forEach(function (btn) {
      btn.onclick = function () {
        harvest();
        var listId = btn.closest("[data-list]").getAttribute("data-list");
        contacts.forEach(function (c) {
          if (c.list_id === listId && !c.is_sent) {
            c.is_sent = true;
            c.sent_at = new Date().toISOString();
          }
        });
        markDirty();
        render();
        showMsg("Unsaved changes", true);
      };
    });
    root.querySelectorAll("[data-action='remove-list']").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.closest("[data-list]").getAttribute("data-list");
        if (!window.confirm("Remove this list and its contacts?")) return;
        db.from("email_lists").delete().eq("id", id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          lists = lists.filter(function (l) { return l.id !== id; });
          contacts = contacts.filter(function (c) { return c.list_id !== id; });
          if (selectedListId === id) selectedListId = null;
          render();
        });
      };
    });
    root.querySelectorAll("[data-action='copy-tpl']").forEach(function (btn) {
      btn.onclick = function () {
        harvest();
        var id = btn.closest("[data-tpl]").getAttribute("data-tpl");
        var tpl = templates.filter(function (t) { return t.id === id; })[0];
        if (!tpl) return;
        var text = (tpl.title || "") + "\n\n" + (tpl.body || "");
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { showMsg("Copied to clipboard.", true); });
        } else {
          showMsg("Copy failed — select and copy manually.", false);
        }
      };
    });
    root.querySelectorAll("[data-action='remove-tpl']").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.closest("[data-tpl]").getAttribute("data-tpl");
        if (!window.confirm("Remove this template?")) return;
        db.from("email_templates").delete().eq("id", id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          templates = templates.filter(function (t) { return t.id !== id; });
          render();
        });
      };
    });
  }

  function addListFn() {
    db.from("email_lists").insert({
      name: "New list",
      column_names: ["Email", "Name", "Company", "Phone", "Notes"]
    }).select("*").single().then(function (res) {
      if (res.error) return showMsg(/does not exist|schema cache/i.test(res.error.message || "") ? "Run sql/012_support_emails_leads.sql in Supabase." : res.error.message, false);
      lists.unshift(res.data);
      selectedListId = res.data.id;
      clearDirty();
      render();
      showMsg("List added.", true);
    });
  }

  function addContact(listId) {
    var rows = listContacts(listId);
    db.from("email_contacts").insert({
      list_id: listId,
      cells: ["", "", "", "", ""],
      sort_order: rows.length
    }).select("*").single().then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      contacts.push(res.data);
      render();
    });
  }

  function addTemplate() {
    db.from("email_templates").insert({
      title: "New subject",
      body: ""
    }).select("*").single().then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      templates.unshift(res.data);
      clearDirty();
      render();
    });
  }

  function saveAll() {
    if (saving || !dirty) return;
    harvest();
    saving = true;
    syncSave();
    showMsg("Saving…", true);
    var jobs = [];
    lists.forEach(function (l) {
      jobs.push(db.from("email_lists").update({ name: l.name || "" }).eq("id", l.id));
    });
    contacts.forEach(function (c) {
      jobs.push(db.from("email_contacts").update({
        cells: c.cells || [],
        email: c.email || "",
        name: c.name || "",
        company: c.company || "",
        phone: c.phone || "",
        notes: c.notes || "",
        is_sent: !!c.is_sent,
        sent_at: c.sent_at || null,
        sort_order: c.sort_order || 0
      }).eq("id", c.id));
    });
    templates.forEach(function (t) {
      jobs.push(db.from("email_templates").update({
        title: t.title || "",
        body: t.body || ""
      }).eq("id", t.id));
    });
    Promise.all(jobs).then(function (results) {
      saving = false;
      var err = results.map(function (r) { return r && r.error; }).filter(Boolean)[0];
      if (err) { showMsg(err.message, false); syncSave(); return; }
      clearDirty();
      showMsg("Saved", true);
      setTimeout(function () { showMsg(""); }, 900);
      render();
    });
  }

  function load() {
    showMsg("Loading emails…", true);
    Promise.all([
      db.from("email_lists").select("*").order("updated_at", { ascending: false }),
      db.from("email_contacts").select("*"),
      db.from("email_templates").select("*").order("updated_at", { ascending: false })
    ]).then(function (pair) {
      if (pair[0].error) {
        showMsg(/does not exist|schema cache/i.test(pair[0].error.message || "") ? "Run sql/012_support_emails_leads.sql in Supabase." : pair[0].error.message, false);
        lists = []; contacts = []; templates = [];
        render();
        return;
      }
      lists = pair[0].data || [];
      contacts = (pair[1].data || []);
      templates = (pair[2].data || []);
      clearDirty();
      showMsg("");
      render();
    });
  }

  window.STLEmails = {
    mount: function (panel, client) {
      db = client; root = panel; selectedListId = null; dirty = false; saving = false;
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

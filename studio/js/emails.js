(function () {
  "use strict";

  var root = null;
  var db = null;
  var lists = [];
  var contacts = [];
  var selectedListId = null;

  function el(name) { return root ? root.querySelector('[data-el="' + name + '"]') : null; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function trim(s) { return String(s == null ? "" : s).trim(); }
  function emailOf(s) { return trim(s).toLowerCase(); }
  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }
  function hideSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }
  function selectedList() {
    return lists.filter(function (l) { return l.id === selectedListId; })[0] || null;
  }
  function listContacts(listId) {
    return contacts.filter(function (c) { return c.list_id === listId; })
      .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
  }
  function isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }
  function composeHref(email, list) {
    var href = "mailto:" + encodeURIComponent(trim(email));
    var q = [];
    if (trim(list && list.subject)) q.push("subject=" + encodeURIComponent(trim(list.subject)));
    if (trim(list && list.notes)) q.push("body=" + encodeURIComponent(trim(list.notes)));
    return q.length ? href + "?" + q.join("&") : href;
  }
  function saveListField(key, value) {
    var list = selectedList();
    if (!list) return;
    var patch = {};
    patch[key] = value;
    db.from("email_lists").update(patch).eq("id", list.id).then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      list[key] = value;
      if (key === "name") renderLists();
    });
  }

  function shell() {
    return (
      '<div class="ops-workspace inbox-shell">' +
        '<div class="inbox-head">' +
          "<div><h1>Email Lists</h1><p>Name a list, then add emails. Nothing is sent from Studio.</p></div>" +
          '<button class="btn btn-ghost" type="button" data-el="add-list">New list</button>' +
        "</div>" +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="inbox-split">' +
          '<div class="inbox-list" data-el="lists"></div>' +
          '<div class="inbox-read" data-el="detail"></div>' +
        "</div>" +
      "</div>"
    );
  }

  function renderLists() {
    var box = el("lists");
    if (!box) return;
    if (!lists.length) {
      box.innerHTML = '<p class="inbox-empty">No lists yet. Make one, then add emails.</p>';
      return;
    }
    box.innerHTML = lists.map(function (list) {
      var n = listContacts(list.id).length;
      return (
        '<button type="button" class="inbox-row' + (list.id === selectedListId ? " is-on" : "") + '" data-id="' + list.id + '">' +
          '<span class="inbox-dot"></span>' +
          '<span class="inbox-row-body">' +
            '<span class="inbox-row-top"><strong>' + esc(list.name || "Untitled list") + "</strong></span>" +
            '<span class="inbox-row-snip">' + n + (n === 1 ? " email" : " emails") + "</span>" +
          "</span>" +
        "</button>"
      );
    }).join("");
    box.querySelectorAll("[data-id]").forEach(function (btn) {
      btn.onclick = function () {
        selectedListId = btn.getAttribute("data-id");
        render();
      };
    });
  }

  function renderDetail() {
    var box = el("detail");
    if (!box) return;
    var list = selectedList();
    if (!list) {
      box.innerHTML = '<div class="inbox-placeholder"><strong>Select a list</strong><p>Each list is just a name and emails.</p></div>';
      return;
    }
    var rows = listContacts(list.id);
    var html =
      '<div class="inbox-letter">' +
        '<div class="ops-field"><label>List name</label>' +
          '<input data-el="list-name" type="text" value="' + esc(list.name || "") + '" />' +
        "</div>" +
        '<div class="ops-field"><label>Subject</label>' +
          '<input data-el="list-subject" type="text" value="' + esc(list.subject || "") + '" placeholder="Prefills the Mail subject" />' +
        "</div>" +
        '<p class="inbox-letter-meta" style="margin:0 0 12px">' + rows.length + (rows.length === 1 ? " email" : " emails") + "</p>";
    if (!rows.length) {
      html += '<p class="inbox-empty" style="padding:8px 0">No emails on this list yet.</p>';
    } else {
      html += '<ul class="mail-emails">';
      rows.forEach(function (c) {
        html +=
          '<li><span>' + esc(c.email || "") + "</span>" +
          '<span class="mail-email-actions">' +
            '<a class="btn btn-ghost" href="' + esc(composeHref(c.email, list)) + '">Mail</a>' +
            '<button class="btn btn-ghost" type="button" data-remove="' + c.id + '">Remove</button>' +
          "</span></li>";
      });
      html += "</ul>";
    }
    html +=
      '<form class="mail-add" data-el="add-form">' +
        '<input data-el="new-email" type="email" placeholder="email@example.com" autocomplete="off" />' +
        '<button class="btn btn-primary" type="submit">Add email</button>' +
      "</form>" +
      '<div class="ops-field" style="margin-top:16px"><label>Notes / template</label>' +
        '<textarea data-el="list-notes" rows="8" placeholder="Paste a template. Mail uses this as the body.">' +
          esc(list.notes || "") +
        "</textarea>" +
      "</div>" +
      '<div class="inbox-letter-more" style="margin-top:18px">' +
        '<button class="btn btn-ghost" type="button" data-el="remove-list">Delete list</button>' +
      "</div></div>";
    box.innerHTML = html;
    bindDetail();
  }

  function bindDetail() {
    var nameEl = el("list-name");
    if (nameEl) {
      nameEl.addEventListener("change", function () {
        var list = selectedList();
        if (!list) return;
        var name = trim(nameEl.value) || "Untitled list";
        saveListField("name", name);
      });
    }
    var subjectEl = el("list-subject");
    if (subjectEl) {
      subjectEl.addEventListener("change", function () {
        saveListField("subject", trim(subjectEl.value));
      });
    }
    var notesEl = el("list-notes");
    if (notesEl) {
      notesEl.addEventListener("change", function () {
        saveListField("notes", notesEl.value);
      });
    }
    var form = el("add-form");
    if (form) {
      form.onsubmit = function (e) {
        e.preventDefault();
        addEmail(emailOf(el("new-email") && el("new-email").value));
      };
    }
    root.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.onclick = function () { removeEmail(btn.getAttribute("data-remove")); };
    });
    var removeList = el("remove-list");
    if (removeList) {
      removeList.onclick = function () {
        var list = selectedList();
        if (!list || !window.confirm("Delete this list and its emails?")) return;
        db.from("email_lists").delete().eq("id", list.id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          lists = lists.filter(function (l) { return l.id !== list.id; });
          contacts = contacts.filter(function (c) { return c.list_id !== list.id; });
          selectedListId = lists[0] ? lists[0].id : null;
          showMsg("List deleted.", true);
          render();
        });
      };
    }
  }

  function render() {
    renderLists();
    renderDetail();
    hideSave();
  }

  function addListFn() {
    var name = trim(window.prompt("Name for this list"));
    if (!name) return;
    db.from("email_lists").insert({
      name: name,
      column_names: ["Email"]
    }).select("*").single().then(function (res) {
      if (res.error) return showMsg(/does not exist|schema cache/i.test(res.error.message || "") ? "Run sql/012_support_emails_leads.sql in Supabase." : res.error.message, false);
      lists.unshift(res.data);
      selectedListId = res.data.id;
      showMsg("List added.", true);
      render();
    });
  }

  function addEmail(email, extra) {
    var list = selectedList();
    if (!list) return;
    extra = extra || {};
    if (!isEmail(email)) {
      showMsg("Enter a valid email.", false);
      return;
    }
    if (listContacts(list.id).some(function (c) { return emailOf(c.email) === email; })) {
      showMsg("That email is already on this list.", false);
      return;
    }
    db.from("email_contacts").insert({
      list_id: list.id,
      email: email,
      name: extra.name || "",
      cells: [email],
      sort_order: listContacts(list.id).length
    }).select("*").single().then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      contacts.push(res.data);
      showMsg("Added " + email + ".", true);
      render();
    });
  }

  function removeEmail(id) {
    db.from("email_contacts").delete().eq("id", id).then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      contacts = contacts.filter(function (c) { return c.id !== id; });
      render();
    });
  }

  function load() {
    showMsg("Loading lists…", true);
    Promise.all([
      db.from("email_lists").select("*").order("updated_at", { ascending: false }),
      db.from("email_contacts").select("*")
    ]).then(function (pair) {
      if (pair[0].error) {
        showMsg(/does not exist|schema cache/i.test(pair[0].error.message || "") ? "Run sql/012_support_emails_leads.sql in Supabase." : pair[0].error.message, false);
        lists = [];
        contacts = [];
        render();
        return;
      }
      lists = pair[0].data || [];
      contacts = pair[1].data || [];
      if (!selectedListId && lists[0]) selectedListId = lists[0].id;
      showMsg("");
      render();
    });
  }

  window.STLEmails = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      selectedListId = null;
      panel.classList.add("ops-wide");
      panel.innerHTML = shell();
      hideSave();
      var add = el("add-list");
      if (add) add.onclick = addListFn;
      load();
    },
    unmount: function (panel) {
      hideSave();
      if (panel) panel.classList.remove("ops-wide");
      root = null;
    },
    lists: function () { return lists.slice(); }
  };
})();

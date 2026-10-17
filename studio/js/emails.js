(function () {
  "use strict";

  var root = null;
  var db = null;
  var lists = [];
  var contacts = [];
  var selectedListId = null;
  var pageNotesId = null;
  var pageNotesSaved = "";
  var pageNotesOpen = false;
  var contactFilter = "open";
  var selectedIds = {};
  var queueIds = [];
  var queueIndex = 0;

  function el(name) { return root ? root.querySelector('[data-el="' + name + '"]') : null; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function trim(s) { return String(s == null ? "" : s).trim(); }
  function emailOf(s) { return trim(s).toLowerCase(); }
  function isSent(c) { return !!(c && c.is_sent); }
  function sentLabel(c) {
    if (!isSent(c)) return "";
    var d = c.sent_at ? String(c.sent_at).slice(0, 10) : "";
    return d ? "Contacted " + d : "Contacted";
  }
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
  function openContacts(listId) {
    return listContacts(listId).filter(function (c) { return !isSent(c); });
  }
  function visibleContacts(listId) {
    var rows = listContacts(listId);
    if (contactFilter === "open") return rows.filter(function (c) { return !isSent(c); });
    if (contactFilter === "sent") return rows.filter(isSent);
    return rows;
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
  function openMailFor(email, list) {
    var a = document.createElement("a");
    a.href = composeHref(email, list);
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function selectedContactRows() {
    var list = selectedList();
    if (!list) return [];
    return listContacts(list.id).filter(function (c) { return selectedIds[c.id]; });
  }
  function queueContact() {
    while (queueIndex < queueIds.length) {
      var id = queueIds[queueIndex];
      var c = contacts.filter(function (row) { return row.id === id; })[0];
      if (c) return c;
      queueIndex += 1;
    }
    return null;
  }
  function saveListField(key, value) {
    var list = selectedList();
    if (!list) return;
    list[key] = value;
    var patch = {};
    patch[key] = value;
    db.from("email_lists").update(patch).eq("id", list.id).then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      if (key === "name") renderLists();
    });
  }

  function harvestListFields() {
    var list = selectedList();
    if (!list) return;
    var subjectEl = el("list-subject");
    var notesEl = el("list-notes");
    if (subjectEl && trim(subjectEl.value) !== trim(list.subject || "")) saveListField("subject", trim(subjectEl.value));
    if (notesEl && notesEl.value !== (list.notes || "")) saveListField("notes", notesEl.value);
  }

  function shell() {
    return (
      '<div class="ops-workspace inbox-shell">' +
        '<div class="inbox-head">' +
          "<div><h1>Email Lists</h1><p>Name a list, then add emails. Open Mail one at a time. Nothing is sent from Studio.</p></div>" +
          '<div class="inbox-head-actions">' +
            '<button class="btn btn-ghost" type="button" data-el="page-notes-toggle" aria-expanded="false">Notes</button>' +
            '<button class="btn btn-ghost" type="button" data-el="add-list">New list</button>' +
          "</div>" +
        "</div>" +
        '<div class="mail-page-notes" data-el="page-notes" hidden>' +
          '<div class="ops-field">' +
            "<label>Notes</label>" +
            '<textarea data-el="page-notes-body" rows="8" placeholder="Notes for Email Lists. Saved on this page only."></textarea>' +
          "</div>" +
          '<div class="mail-page-notes-bar">' +
            '<button class="btn btn-primary" type="button" data-el="page-notes-save" disabled>Save notes</button>' +
          "</div>" +
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
      var rows = listContacts(list.id);
      var left = rows.filter(function (c) { return !isSent(c); }).length;
      var n = rows.length;
      var snip = n
        ? left + " left · " + n + (n === 1 ? " email" : " emails")
        : "No emails";
      return (
        '<button type="button" class="inbox-row' + (list.id === selectedListId ? " is-on" : "") + '" data-id="' + list.id + '">' +
          '<span class="inbox-dot"></span>' +
          '<span class="inbox-row-body">' +
            '<span class="inbox-row-top"><strong>' + esc(list.name || "Untitled list") + "</strong></span>" +
            '<span class="inbox-row-snip">' + esc(snip) + "</span>" +
          "</span>" +
        "</button>"
      );
    }).join("");
    box.querySelectorAll("[data-id]").forEach(function (btn) {
      btn.onclick = function () {
        harvestListFields();
        selectedListId = btn.getAttribute("data-id");
        selectedIds = {};
        queueIds = [];
        queueIndex = 0;
        render();
      };
    });
  }

  function queueHtml(list) {
    if (!queueIds.length) return "";
    var cur = queueContact();
    var total = queueIds.length;
    var pos = Math.min(queueIndex + 1, total);
    if (!cur) {
      return (
        '<div class="mail-queue">' +
          "<p><strong>Queue finished.</strong> " + total + " in this batch.</p>" +
          '<div class="mail-queue-actions">' +
            '<button class="btn btn-ghost" type="button" data-el="queue-clear">Clear queue</button>' +
          "</div>" +
        "</div>"
      );
    }
    return (
      '<div class="mail-queue">' +
        "<p><strong>" + pos + " of " + total + "</strong> · " + esc(cur.email || "") +
          (isSent(cur) ? " · already contacted" : "") + "</p>" +
        '<div class="mail-queue-actions">' +
          '<a class="btn btn-primary" data-el="queue-mail" href="' + esc(composeHref(cur.email, list)) + '">Open Mail</a>' +
          '<button class="btn btn-primary" type="button" data-el="queue-sent">Sent, next</button>' +
          '<button class="btn btn-ghost" type="button" data-el="queue-skip">Skip</button>' +
          '<button class="btn btn-ghost" type="button" data-el="queue-clear">Clear queue</button>' +
        "</div>" +
      "</div>"
    );
  }

  function renderDetail() {
    var box = el("detail");
    if (!box) return;
    var list = selectedList();
    if (!list) {
      box.innerHTML = '<div class="inbox-placeholder"><strong>Select a list</strong><p>Each list is just a name and emails.</p></div>';
      return;
    }
    var all = listContacts(list.id);
    var open = all.filter(function (c) { return !isSent(c); });
    var rows = visibleContacts(list.id);
    var picked = selectedContactRows().length;
    var html =
      '<div class="inbox-letter">' +
        '<div class="ops-field"><label>List name</label>' +
          '<input data-el="list-name" type="text" value="' + esc(list.name || "") + '" />' +
        "</div>" +
        '<div class="ops-field"><label>Subject</label>' +
          '<input data-el="list-subject" type="text" value="' + esc(list.subject || "") + '" placeholder="Prefills the Mail subject" />' +
        "</div>" +
        '<p class="inbox-letter-meta" style="margin:0 0 12px">' +
          open.length + " not contacted · " + all.length + (all.length === 1 ? " email" : " emails") +
        "</p>" +
        queueHtml(list) +
        '<div class="ops-filters mail-filters">' +
          filterBtn("open", "Not contacted") +
          filterBtn("sent", "Contacted") +
          filterBtn("all", "All") +
        "</div>" +
        '<div class="mail-batch">' +
          '<button class="btn btn-ghost" type="button" data-el="pick-10">Select next 10</button>' +
          '<button class="btn btn-ghost" type="button" data-el="pick-25">Select next 25</button>' +
          '<button class="btn btn-ghost" type="button" data-el="queue-open">Queue next 25</button>' +
          '<button class="btn btn-primary" type="button" data-el="queue-picked">Queue selected' +
            (picked ? " (" + picked + ")" : "") + "</button>" +
        "</div>";
    if (!all.length) {
      html += '<p class="inbox-empty" style="padding:8px 0">No emails on this list yet.</p>';
    } else if (!rows.length) {
      html += '<p class="inbox-empty" style="padding:8px 0">Nothing in this filter.</p>';
    } else {
      html += '<ul class="mail-emails">';
      rows.forEach(function (c) {
        html +=
          '<li class="' + (isSent(c) ? "is-sent" : "") + '">' +
            '<label class="mail-pick">' +
              '<input type="checkbox" data-pick="' + c.id + '"' + (selectedIds[c.id] ? " checked" : "") + " />" +
              "<span>" + esc(c.email || "") + "</span>" +
              (isSent(c) ? '<em class="mail-sent-tag">' + esc(sentLabel(c)) + "</em>" : "") +
            "</label>" +
            '<span class="mail-email-actions">' +
              '<a class="btn btn-ghost" href="' + esc(composeHref(c.email, list)) + '">Mail</a>' +
              (isSent(c)
                ? '<button class="btn btn-ghost" type="button" data-unsent="' + c.id + '">Undo</button>'
                : '<button class="btn btn-ghost" type="button" data-sent="' + c.id + '">Contacted</button>') +
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

  function filterBtn(id, label) {
    return (
      '<button type="button" class="ops-pill' + (contactFilter === id ? " is-on" : "") + '" data-filter="' + id + '">' +
        esc(label) +
      "</button>"
    );
  }

  function startQueue(rows) {
    harvestListFields();
    if (!rows.length) {
      showMsg("Nothing to queue.", false);
      return;
    }
    queueIds = rows.map(function (c) { return c.id; });
    queueIndex = 0;
    var list = selectedList();
    var first = queueContact();
    render();
    if (first && list) openMailFor(first.email, list);
    showMsg("Queue of " + queueIds.length + ". Send, then Sent, next.", true);
  }

  function pickNext(n) {
    var list = selectedList();
    if (!list) return;
    var open = openContacts(list.id);
    selectedIds = {};
    open.slice(0, n).forEach(function (c) { selectedIds[c.id] = true; });
    if (!open.length) showMsg("Everyone on this list is already contacted.", false);
    else showMsg("Selected " + Math.min(n, open.length) + " not contacted.", true);
    render();
  }

  function advanceQueue(mark) {
    var list = selectedList();
    var cur = queueContact();
    if (!cur) {
      render();
      return;
    }
    function go() {
      queueIndex += 1;
      render();
      var next = queueContact();
      if (next && list) openMailFor(next.email, list);
      else showMsg("Queue finished.", true);
    }
    if (mark) setSent(cur.id, true, go);
    else go();
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
    root.querySelectorAll("[data-filter]").forEach(function (btn) {
      btn.onclick = function () {
        contactFilter = btn.getAttribute("data-filter") || "open";
        render();
      };
    });
    root.querySelectorAll("[data-pick]").forEach(function (box) {
      box.onchange = function () {
        var id = box.getAttribute("data-pick");
        if (box.checked) selectedIds[id] = true;
        else delete selectedIds[id];
        var q = el("queue-picked");
        var n = selectedContactRows().length;
        if (q) q.textContent = "Queue selected" + (n ? " (" + n + ")" : "");
      };
    });
    var pick10 = el("pick-10");
    if (pick10) pick10.onclick = function () { pickNext(10); };
    var pick25 = el("pick-25");
    if (pick25) pick25.onclick = function () { pickNext(25); };
    var queueOpen = el("queue-open");
    if (queueOpen) {
      queueOpen.onclick = function () {
        var list = selectedList();
        if (!list) return;
        startQueue(openContacts(list.id).slice(0, 25));
      };
    }
    var queuePicked = el("queue-picked");
    if (queuePicked) {
      queuePicked.onclick = function () {
        startQueue(selectedContactRows());
      };
    }
    var queueSent = el("queue-sent");
    if (queueSent) queueSent.onclick = function () { advanceQueue(true); };
    var queueSkip = el("queue-skip");
    if (queueSkip) queueSkip.onclick = function () { advanceQueue(false); };
    var queueClear = el("queue-clear");
    if (queueClear) {
      queueClear.onclick = function () {
        queueIds = [];
        queueIndex = 0;
        render();
      };
    }
    root.querySelectorAll("[data-sent]").forEach(function (btn) {
      btn.onclick = function () { setSent(btn.getAttribute("data-sent"), true); };
    });
    root.querySelectorAll("[data-unsent]").forEach(function (btn) {
      btn.onclick = function () { setSent(btn.getAttribute("data-unsent"), false); };
    });
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
          selectedIds = {};
          queueIds = [];
          queueIndex = 0;
          showMsg("List deleted.", true);
          render();
        });
      };
    }
  }

  function setSent(id, sent, then) {
    harvestListFields();
    var patch = sent
      ? { is_sent: true, sent_at: new Date().toISOString() }
      : { is_sent: false, sent_at: null };
    db.from("email_contacts").update(patch).eq("id", id).select("*").single().then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      contacts = contacts.map(function (c) { return c.id === id ? res.data : c; });
      if (sent) delete selectedIds[id];
      if (then) then();
      else {
        showMsg(sent ? "Marked contacted." : "Marked not contacted.", true);
        render();
      }
    });
  }

  function pageNotesDirty() {
    var box = el("page-notes-body");
    return !!box && box.value !== pageNotesSaved;
  }

  function syncPageNotesSave() {
    var btn = el("page-notes-save");
    if (btn) btn.disabled = !pageNotesDirty();
  }

  function paintPageNotes(fill) {
    var panel = el("page-notes");
    var toggle = el("page-notes-toggle");
    var box = el("page-notes-body");
    if (panel) {
      if (pageNotesOpen) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    }
    if (toggle) {
      toggle.classList.toggle("is-on", pageNotesOpen);
      toggle.setAttribute("aria-expanded", pageNotesOpen ? "true" : "false");
    }
    if (box && fill && (document.activeElement !== box || !box.value)) box.value = pageNotesSaved;
    syncPageNotesSave();
  }

  function togglePageNotes() {
    pageNotesOpen = !pageNotesOpen;
    paintPageNotes();
    if (pageNotesOpen) {
      var box = el("page-notes-body");
      if (box) box.focus();
    }
  }

  function savePageNotes() {
    var box = el("page-notes-body");
    if (!box || !pageNotesDirty()) return;
    var body = box.value;
    var btn = el("page-notes-save");
    if (btn) btn.disabled = true;
    var req = pageNotesId
      ? db.from("email_page_notes").update({ body: body }).eq("id", pageNotesId).select("id, body").single()
      : db.from("email_page_notes").insert({ body: body }).select("id, body").single();
    req.then(function (res) {
      if (res.error) {
        syncPageNotesSave();
        var missing = /does not exist|schema cache/i.test(res.error.message || "");
        showMsg(missing ? "Run sql/033_email_page_notes.sql in Supabase." : res.error.message, false);
        return;
      }
      pageNotesId = res.data.id;
      pageNotesSaved = res.data.body || "";
      if (box && box.value === body) box.value = pageNotesSaved;
      syncPageNotesSave();
      showMsg("Notes saved.", true);
    });
  }

  function loadPageNotes() {
    return db.from("email_page_notes").select("id, body").limit(1).maybeSingle().then(function (res) {
      if (res.error) {
        if (/does not exist|schema cache/i.test(res.error.message || "")) {
          showMsg("Run sql/033_email_page_notes.sql in Supabase.", false);
        }
        return;
      }
      pageNotesId = res.data ? res.data.id : null;
      pageNotesSaved = res.data && res.data.body ? res.data.body : "";
      paintPageNotes(true);
    });
  }

  function render() {
    renderLists();
    renderDetail();
    hideSave();
    paintPageNotes(false);
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
      selectedIds = {};
      queueIds = [];
      queueIndex = 0;
      showMsg("List added.", true);
      render();
    });
  }

  function addEmail(email, extra) {
    harvestListFields();
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
    harvestListFields();
    db.from("email_contacts").delete().eq("id", id).then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      contacts = contacts.filter(function (c) { return c.id !== id; });
      delete selectedIds[id];
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
      selectedIds = {};
      queueIds = [];
      queueIndex = 0;
      contactFilter = "open";
      panel.classList.add("ops-wide");
      panel.innerHTML = shell();
      hideSave();
      pageNotesId = null;
      pageNotesSaved = "";
      pageNotesOpen = false;
      var add = el("add-list");
      if (add) add.onclick = addListFn;
      var notesToggle = el("page-notes-toggle");
      if (notesToggle) notesToggle.onclick = togglePageNotes;
      var notesBox = el("page-notes-body");
      if (notesBox) notesBox.addEventListener("input", syncPageNotesSave);
      var notesSave = el("page-notes-save");
      if (notesSave) notesSave.onclick = savePageNotes;
      load();
      loadPageNotes();
    },
    unmount: function (panel) {
      hideSave();
      if (panel) panel.classList.remove("ops-wide");
      root = null;
    },
    lists: function () { return lists.slice(); }
  };
})();

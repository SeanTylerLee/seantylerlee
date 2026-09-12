(function () {
  "use strict";

  var root = null;
  var db = null;
  var noteId = null;
  var saving = false;
  var dirty = false;

  function el(name) {
    return root.querySelector('[data-el="' + name + '"]');
  }

  function showMsg(msg, ok) {
    var box = el("msg");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }

  function missingTable(err) {
    var msg = (err && err.message) || "";
    return /studio_notes/i.test(msg) && /does not exist|schema cache|not find/i.test(msg);
  }

  function syncPlaceholder() {
    var empty = !String(el("body").value || "").trim();
    el("placeholder").classList.toggle("is-hidden", !empty);
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

  function load() {
    showMsg("Loading…", true);
    return db.from("studio_notes").select("id, body, updated_at").limit(1).maybeSingle()
      .then(function (res) {
        if (res.error) {
          showMsg(missingTable(res.error)
            ? "Run sql/002_notes.sql in Supabase, then refresh."
            : res.error.message, false);
          syncSaveButton();
          return;
        }
        if (res.data) {
          noteId = res.data.id;
          el("body").value = res.data.body || "";
        } else {
          noteId = null;
          el("body").value = "";
        }
        clearDirty();
        syncPlaceholder();
        showMsg(res.data ? "" : "Empty notepad — type, then Save.", true);
        setTimeout(function () {
          if (!dirty) showMsg("");
        }, 1200);
      });
  }

  function saveAll() {
    if (saving || !dirty) return;
    var body = el("body").value;
    saving = true;
    syncSaveButton();
    showMsg("Saving…", true);

    var req = noteId
      ? db.from("studio_notes").update({ body: body }).eq("id", noteId).select("id").single()
      : db.from("studio_notes").insert({ body: body }).select("id").single();

    req.then(function (res) {
      saving = false;
      if (res.error) {
        dirty = true;
        showMsg(missingTable(res.error)
          ? "Run sql/002_notes.sql in Supabase, then refresh."
          : res.error.message, false);
        syncSaveButton();
        return;
      }
      noteId = res.data.id;
      clearDirty();
      showMsg("Saved", true);
      setTimeout(function () {
        if (!dirty && !saving) showMsg("");
      }, 1000);
    }).catch(function (err) {
      saving = false;
      dirty = true;
      showMsg((err && err.message) || "Save failed.", false);
      syncSaveButton();
    });
  }

  function html() {
    return (
      '<div class="notes-workspace">' +
        '<div class="notes-bar">' +
          "<h1>Notes</h1>" +
          '<p class="status" data-el="msg"></p>' +
        "</div>" +
        '<div class="notes-editor-wrap">' +
          '<p class="notes-placeholder" data-el="placeholder">Write whatever you want… then click Save.</p>' +
          '<textarea class="notes-editor" data-el="body" spellcheck="true"></textarea>' +
        "</div>" +
      "</div>"
    );
  }

  function bind() {
    el("body").addEventListener("input", function () {
      syncPlaceholder();
      markDirty();
    });
  }

  window.STLNotes = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      noteId = null;
      dirty = false;
      saving = false;
      panel.classList.add("notes-wide");
      panel.innerHTML = html();
      bind();
      syncSaveButton();
      load();
      setTimeout(function () {
        if (el("body")) el("body").focus();
      }, 40);
    },
    unmount: function (panel) {
      hideSaveButton();
      if (panel) panel.classList.remove("notes-wide");
      root = null;
    },
    saveAll: saveAll,
    isDirty: function () { return dirty; }
  };
})();

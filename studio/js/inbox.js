(function () {
  "use strict";

  var TYPES = [
    { id: "contact", title: "Contact" },
    { id: "release_notify", title: "Notify me" }
  ];

  var root = null;
  var db = null;
  var items = [];
  var selectedId = null;
  var filter = "unread";
  var search = "";
  var loading = false;

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
  function hideSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }
  function selected() {
    return items.filter(function (row) { return row.id === selectedId; })[0] || null;
  }
  function typeTitle(source) {
    var found = TYPES.filter(function (t) { return t.id === source; })[0];
    return found ? found.title : "Message";
  }
  function when(iso) {
    if (!iso) return "";
    var t = new Date(iso).getTime();
    if (isNaN(t)) return "";
    var s = (Date.now() - t) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    if (s < 86400 * 7) return Math.floor(s / 86400) + "d ago";
    return new Date(iso).toLocaleDateString();
  }
  function stamp(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString();
  }

  function visible() {
    var list = items.slice();
    if (filter === "unread") list = list.filter(function (row) { return row.status === "unread"; });
    else if (filter === "archived") list = list.filter(function (row) { return row.status === "archived"; });
    else list = list.filter(function (row) { return row.status !== "archived"; });
    var q = trim(search).toLowerCase();
    if (q) {
      list = list.filter(function (row) {
        return [row.name, row.email, row.message, row.site, typeTitle(row.source)]
          .some(function (v) { return String(v || "").toLowerCase().indexOf(q) !== -1; });
      });
    }
    list.sort(function (a, b) {
      if ((a.status === "unread") !== (b.status === "unread")) return a.status === "unread" ? -1 : 1;
      return String(b.created_at || "") < String(a.created_at || "") ? -1 : 1;
    });
    return list;
  }

  function shell() {
    return (
      '<div class="ops-workspace">' +
        '<div class="ops-header"><h1>Inbox</h1><p>Website contact messages and notify-me signups. Reply from your own email using their address.</p></div>' +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="ops-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function render() {
    var unread = items.filter(function (row) { return row.status === "unread"; }).length;
    var contact = items.filter(function (row) { return row.source === "contact" && row.status !== "archived"; }).length;
    var notify = items.filter(function (row) { return row.source === "release_notify" && row.status !== "archived"; }).length;
    var list = visible();
    var row = selected();

    var html =
      '<div class="ops-chips">' +
        '<div class="ops-chip danger"><span class="k">Unread</span><span class="v">' + unread + "</span></div>" +
        '<div class="ops-chip"><span class="k">Contact</span><span class="v">' + contact + "</span></div>" +
        '<div class="ops-chip"><span class="k">Notify me</span><span class="v">' + notify + "</span></div>" +
      "</div>" +
      '<div class="ops-filters">' +
        [["unread", "Unread"], ["all", "All"], ["archived", "Archived"]].map(function (pair) {
          return '<button type="button" class="ops-pill' + (filter === pair[0] ? " is-on" : "") + '" data-filter="' + pair[0] + '">' + pair[1] + "</button>";
        }).join("") +
        '<input data-el="search" type="search" placeholder="Search…" value="' + esc(search) + '" style="margin-left:auto;min-height:30px;border-radius:8px;border:1px solid rgba(0,24,72,.12);padding:0 10px;font-size:12px" />' +
      "</div>" +
      '<div class="ops-split">' +
        '<div class="ops-list">';

    if (!list.length) {
      html += '<p class="sub" style="padding:8px;color:#6b7388">' +
        (items.length ? "Nothing in this filter." : "No messages yet. Contact form and notify-me signups from the website show up here.") +
        "</p>";
    } else {
      list.forEach(function (item) {
        var label = trim(item.name) || trim(item.email) || "Message";
        html +=
          '<button type="button" class="ops-item' +
            (item.id === selectedId ? " is-on" : "") +
            (item.status === "unread" ? " is-unread" : "") +
            '" data-id="' + item.id + '">' +
            "<strong>" + esc(label) + "</strong>" +
            "<span>" + esc(typeTitle(item.source)) + " · " + esc(when(item.created_at)) + "</span>" +
          "</button>";
      });
    }

    html += '</div><div class="ops-detail">';
    if (!row) {
      html += '<p class="sub">Pick a message on the left.</p>';
    } else {
      html +=
        '<p class="sub" style="margin-bottom:12px">' + esc(typeTitle(row.source)) +
          (row.site ? " · " + esc(row.site) : "") +
          " · " + esc(stamp(row.created_at)) +
        "</p>" +
        '<div class="ops-grid">' +
          '<div class="ops-field"><label>From</label><div>' + esc(row.name || "—") + "</div></div>" +
          '<div class="ops-field"><label>Email</label><div>' +
            (trim(row.email)
              ? '<a href="mailto:' + esc(row.email) + '">' + esc(row.email) + "</a>"
              : "—") +
          "</div></div>" +
        "</div>" +
        '<div class="ops-field"><label>Message</label><div class="inbox-message">' +
          esc(row.message || "").replace(/\n/g, "<br>") +
        "</div></div>" +
        '<div class="ops-actions">' +
          (trim(row.email) ? '<a class="btn btn-ghost" data-el="reply" href="mailto:' + esc(row.email) + '?subject=' + encodeURIComponent("Re: Permit Path") + '">Reply</a>' : "") +
          (row.status === "unread"
            ? '<button class="btn btn-ghost" type="button" data-el="read">Mark read</button>'
            : '<button class="btn btn-ghost" type="button" data-el="unread">Mark unread</button>') +
          (row.status === "archived"
            ? '<button class="btn btn-ghost" type="button" data-el="unarchive">Move to inbox</button>'
            : '<button class="btn btn-ghost" type="button" data-el="archive">Archive</button>') +
          '<button class="btn btn-ghost" type="button" data-el="delete">Delete</button>' +
        "</div>";
    }
    html += "</div></div>";
    el("body").innerHTML = html;
    bind();
    hideSave();
  }

  function bind() {
    root.querySelectorAll("[data-filter]").forEach(function (btn) {
      btn.onclick = function () {
        filter = btn.getAttribute("data-filter");
        if (selectedId && !visible().some(function (row) { return row.id === selectedId; })) {
          selectedId = null;
        }
        render();
      };
    });
    var searchEl = el("search");
    if (searchEl) {
      searchEl.oninput = function () {
        var caret = searchEl.selectionStart;
        search = searchEl.value;
        render();
        var again = el("search");
        if (again) {
          again.focus();
          try { again.setSelectionRange(caret, caret); } catch (e) {}
        }
      };
    }
    root.querySelectorAll(".ops-list [data-id]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-id");
        if (id === selectedId) return;
        selectedId = id;
        var row = selected();
        render();
        if (row && row.status === "unread") setStatus(row, "read");
      };
    });
    var readBtn = el("read");
    if (readBtn) readBtn.onclick = function () { setStatus(selected(), "read"); };
    var unreadBtn = el("unread");
    if (unreadBtn) unreadBtn.onclick = function () { setStatus(selected(), "unread"); };
    var archiveBtn = el("archive");
    if (archiveBtn) archiveBtn.onclick = function () { setStatus(selected(), "archived"); };
    var unarchiveBtn = el("unarchive");
    if (unarchiveBtn) unarchiveBtn.onclick = function () { setStatus(selected(), "read"); };
    var del = el("delete");
    if (del) {
      del.onclick = function () {
        var row = selected();
        if (!row || !window.confirm("Delete this message?")) return;
        db.from("studio_inbox").delete().eq("id", row.id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          items = items.filter(function (item) { return item.id !== row.id; });
          selectedId = null;
          showMsg("Deleted", true);
          setTimeout(function () { showMsg(""); }, 900);
          render();
        });
      };
    }
  }

  function setStatus(row, status) {
    if (!row || row.status === status) {
      render();
      return;
    }
    db.from("studio_inbox").update({ status: status }).eq("id", row.id).then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      row.status = status;
      render();
    });
  }

  function load() {
    if (!db) return;
    loading = true;
    showMsg("Loading inbox…", true);
    db.from("studio_inbox").select("*").order("created_at", { ascending: false }).then(function (res) {
      loading = false;
      if (res.error) {
        showMsg(/does not exist|schema cache/i.test(res.error.message || "") ? "Run sql/028_studio_inbox.sql in Supabase." : res.error.message, false);
        items = [];
      } else {
        items = res.data || [];
        showMsg("");
      }
      if (selectedId && !items.some(function (row) { return row.id === selectedId; })) selectedId = null;
      render();
    });
  }

  window.STLInbox = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      selectedId = null;
      filter = "unread";
      search = "";
      items = [];
      panel.classList.add("ops-wide");
      panel.innerHTML = shell();
      hideSave();
      load();
    },
    unmount: function (panel) {
      hideSave();
      if (panel) panel.classList.remove("ops-wide");
      root = null;
    },
    shown: function () {
      if (db && root && !loading) load();
    }
  };
})();

(function () {
  "use strict";

  var root = null;
  var db = null;
  var logins = [];
  var expandedId = null;
  var searchText = "";
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

  function displayTopic(login) {
    var value = trim(login.topic);
    return value || "New login";
  }

  function resolvedURL(raw) {
    var value = trim(raw);
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return "https://" + value;
  }

  function filtered() {
    var q = trim(searchText).toLowerCase();
    var list = logins.slice();
    if (q) {
      list = list.filter(function (login) {
        return [login.topic, login.url, login.username, login.password]
          .some(function (v) { return String(v || "").toLowerCase().indexOf(q) !== -1; });
      });
    }
    list.sort(function (a, b) {
      return displayTopic(a).localeCompare(displayTopic(b), undefined, { sensitivity: "base" });
    });
    return list;
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

  function field(label, key, value, prompt) {
    return (
      '<div class="vault-field"><label>' + label + "</label>" +
      '<input data-key="' + key + '" type="text" value="' + esc(value || "") +
      '" placeholder="' + esc(prompt || "") + '" /></div>'
    );
  }

  function shell() {
    return (
      '<div class="vault-workspace">' +
        '<div class="vault-header">' +
          "<h1>Login Vault</h1>" +
          "<p>Squarespace, domains, email, anything you log into. Name it, paste the site, username, and password.</p>" +
        "</div>" +
        '<p class="status vault-banner" data-el="banner"></p>' +
        '<div class="vault-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function render() {
    var body = el("body");
    if (!body) return;
    var rows = filtered();
    var html = "";

    html +=
      '<div class="vault-search">' +
        "<span aria-hidden=\"true\">⌕</span>" +
        '<input data-el="search" type="search" placeholder="Search topic, site, username…" value="' + esc(searchText) + '" />' +
        (searchText
          ? '<button class="btn btn-ghost" type="button" data-el="clear-search">Clear</button>'
          : "") +
      "</div>";

    html +=
      '<div class="vault-chip"><span class="k">Saved</span><span class="v">' + logins.length + "</span></div>";

    if (!logins.length) {
      html +=
        '<div class="vault-empty">Nothing in the vault yet. Add Squarespace, GoDaddy, Google, or any other login you need on hand.</div>' +
        '<div class="vault-actions" style="margin-top:10px"><button class="btn btn-ghost" type="button" data-el="add">Add login</button></div>';
    } else if (!rows.length) {
      html +=
        '<div class="vault-empty">Nothing matches that search.</div>' +
        '<div class="vault-actions" style="margin-top:10px"><button class="btn btn-ghost" type="button" data-el="clear-search">Clear search</button></div>';
    } else {
      rows.forEach(function (login) {
        var open = login.id === expandedId;
        var bits = [trim(login.username), trim(login.password)].filter(Boolean).join(" · ");
        html +=
          '<div class="vault-card' + (open ? " is-open" : "") + '" data-id="' + login.id + '">' +
            '<button type="button" class="vault-card-head" data-action="toggle">' +
              '<span class="chev">▸</span>' +
              '<span class="key">🔑</span>' +
              '<span class="meta">' +
                "<strong>" + esc(displayTopic(login)) + "</strong>" +
                (bits ? '<span class="line">' + esc(bits) + "</span>" : "") +
              "</span>" +
            "</button>" +
            '<div class="vault-card-body">' +
              '<div class="vault-grid">' +
                field("Topic", "topic", login.topic, "Squarespace, GoDaddy, Gmail…") +
                field("Website", "url", login.url, "https://www.squarespace.com") +
                field("Username / email", "username", login.username, "you@company.com") +
                field("Password", "password", login.password, "Password") +
              "</div>" +
              '<div class="vault-actions">' +
                (trim(login.url)
                  ? '<a class="btn btn-ghost" href="' + esc(resolvedURL(login.url)) + '" target="_blank" rel="noopener">Open site</a>'
                  : "") +
                '<button class="btn btn-ghost" type="button" data-action="remove">Remove</button>' +
              "</div>" +
            "</div>" +
          "</div>";
      });
      html += '<div class="vault-actions"><button class="btn btn-ghost" type="button" data-el="add">Add login</button></div>';
    }

    body.innerHTML = html;
    bind();
    syncSaveButton();
  }

  function applyLocal(input, card) {
    var id = card.getAttribute("data-id");
    var key = input.getAttribute("data-key");
    logins.forEach(function (login) {
      if (login.id === id) login[key] = input.value;
    });
  }

  function harvest() {
    if (!root) return;
    root.querySelectorAll(".vault-card").forEach(function (card) {
      card.querySelectorAll("[data-key]").forEach(function (input) {
        applyLocal(input, card);
      });
    });
  }

  function bind() {
    var search = el("search");
    if (search) {
      search.addEventListener("input", function () {
        var caret = search.selectionStart;
        harvest();
        searchText = search.value;
        expandedId = null;
        render();
        var again = el("search");
        if (again) {
          again.focus();
          try { again.setSelectionRange(caret, caret); } catch (e) {}
        }
        if (dirty) showMsg("Unsaved changes", true);
      });
    }

    root.querySelectorAll('[data-el="clear-search"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        harvest();
        searchText = "";
        expandedId = null;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      });
    });

    root.querySelectorAll('[data-action="toggle"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var card = btn.closest(".vault-card");
        var id = card.getAttribute("data-id");
        harvest();
        expandedId = expandedId === id ? null : id;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      });
    });

    root.querySelectorAll("[data-key]").forEach(function (input) {
      input.addEventListener("input", function () {
        applyLocal(input, input.closest(".vault-card"));
        markDirty();
        if (input.getAttribute("data-key") === "topic") {
          var card = input.closest(".vault-card");
          var login = logins.filter(function (x) { return x.id === card.getAttribute("data-id"); })[0];
          var strong = card.querySelector("strong");
          if (strong && login) strong.textContent = displayTopic(login);
        }
      });
    });

    root.querySelectorAll('[data-action="remove"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.closest(".vault-card").getAttribute("data-id");
        var login = logins.filter(function (x) { return x.id === id; })[0];
        if (!login) return;
        if (!window.confirm('Remove "' + displayTopic(login) + '" from the vault?')) return;
        db.from("vault_logins").delete().eq("id", id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          if (expandedId === id) expandedId = null;
          logins = logins.filter(function (x) { return x.id !== id; });
          render();
          if (dirty) showMsg("Unsaved changes", true);
        });
      });
    });

    var add = el("add");
    if (add) add.addEventListener("click", addLogin);
  }

  function addLogin() {
    harvest();
    db.from("vault_logins").insert({
      topic: "",
      url: "",
      username: "",
      password: ""
    }).select("*").single().then(function (res) {
      if (res.error) {
        showMsg(missingTable(res.error)
          ? "Run sql/006_vault.sql in Supabase, then refresh."
          : res.error.message, false);
        return;
      }
      logins.unshift(res.data);
      searchText = "";
      expandedId = res.data.id;
      clearDirty();
      render();
      showMsg("Login added. Fill it in, then Save.", true);
    });
  }

  function saveAll() {
    if (saving || !dirty) return;
    harvest();
    saving = true;
    syncSaveButton();
    showMsg("Saving…", true);
    var jobs = logins.map(function (login) {
      return db.from("vault_logins").update({
        topic: login.topic || "",
        url: login.url || "",
        username: login.username || "",
        password: login.password || ""
      }).eq("id", login.id);
    });
    Promise.all(jobs).then(function (results) {
      saving = false;
      var err = results.map(function (r) { return r && r.error; }).filter(Boolean)[0];
      if (err) {
        showMsg(err.message || "Save failed.", false);
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
    showMsg("Loading vault…", true);
    return db.from("vault_logins").select("*").order("topic")
      .then(function (res) {
        if (res.error) {
          var msg = res.error.message || "Could not load vault.";
          if (missingTable(res.error)) msg = "Run sql/006_vault.sql in Supabase, then refresh.";
          else if (/permission denied|42501/i.test(msg)) msg = "Permission denied. Re-run sql/006_vault.sql in Supabase.";
          showMsg(msg, false);
          logins = [];
          render();
          return;
        }
        logins = res.data || [];
        clearDirty();
        render();
        showMsg(logins.length ? "" : "Nothing in the vault yet — click Add login.", true);
      })
      .catch(function (err) {
        showMsg((err && err.message) || "Could not load vault.", false);
        logins = [];
        render();
      });
  }

  window.STLVault = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      expandedId = null;
      searchText = "";
      dirty = false;
      saving = false;
      panel.classList.add("vault-wide");
      panel.innerHTML = shell();
      syncSaveButton();
      load();
    },
    unmount: function (panel) {
      hideSaveButton();
      if (panel) panel.classList.remove("vault-wide");
      root = null;
    },
    saveAll: saveAll,
    isDirty: function () { return dirty; }
  };
})();

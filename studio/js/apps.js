(function () {
  "use strict";

  var STATUSES = ["Idea", "In Development", "Live", "Paused", "Archived"];
  var PLATFORMS = ["iOS", "Android", "macOS"];
  var ISSUE_STATUS = [
    { id: "open", title: "Open" },
    { id: "inProgress", title: "Working" },
    { id: "fixed", title: "Fixed" },
    { id: "wontFix", title: "Won't fix" }
  ];
  var ISSUE_PRIORITY = [
    { id: "high", title: "High" },
    { id: "normal", title: "Normal" },
    { id: "low", title: "Low" }
  ];

  var root = null;
  var db = null;
  var apps = [];
  var logins = [];
  var issues = [];
  var selectedId = null;
  var editing = false;
  var dirty = false;
  var saving = false;
  var expandedIssue = null;
  var expandedLogin = null;
  var revealPass = {};
  var userId = null;
  var iconUrls = {};
  var notesOpen = {};

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

  function markDirty() {
    dirty = true;
    syncSave();
    showMsg("Unsaved changes", true);
  }

  function clearDirty() {
    dirty = false;
    syncSave();
  }

  function platformsOf(app) {
    var raw = app.platforms;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [];
  }

  function openIssueCount(appId) {
    return issues.filter(function (i) {
      return i.app_id === appId && (i.status === "open" || i.status === "inProgress");
    }).length;
  }

  function selected() {
    return apps.filter(function (a) { return a.id === selectedId; })[0] || null;
  }

  function appLogins(appId) {
    return logins.filter(function (l) { return l.app_id === appId; })
      .sort(function (a, b) { return String(a.site_name || "").localeCompare(String(b.site_name || "")); });
  }

  function appIssues(appId) {
    return issues.filter(function (i) { return i.app_id === appId; })
      .sort(function (a, b) {
        var rank = { open: 0, inProgress: 1, fixed: 2, wontFix: 3 };
        var pr = { high: 0, normal: 1, low: 2 };
        if ((rank[a.status] || 9) !== (rank[b.status] || 9)) return (rank[a.status] || 9) - (rank[b.status] || 9);
        return (pr[a.priority] || 9) - (pr[b.priority] || 9);
      });
  }

  function statusClass(status) {
    if (status === "Live") return "live";
    if (status === "In Development") return "dev";
    if (status === "Paused") return "warn";
    return "";
  }

  function accent(app) {
    var hex = trim(app.accent_hex || "E8822E").replace("#", "");
    return "#" + hex;
  }

  function iconUrl(app) {
    if (!app || !app.icon_path) return "";
    return iconUrls[app.icon_path] || "";
  }

  function iconMarkup(app, className) {
    var url = iconUrl(app);
    if (url) {
      return '<img class="' + className + '" src="' + esc(url) + '" alt="" />';
    }
    return (
      '<span class="' + className + '" style="background:' + accent(app) + '">' +
      esc((app.name || "?").charAt(0).toUpperCase()) +
      "</span>"
    );
  }

  function resolveIcons() {
    var paths = [];
    apps.forEach(function (app) {
      if (app.icon_path && !iconUrls[app.icon_path] && paths.indexOf(app.icon_path) < 0) {
        paths.push(app.icon_path);
      }
    });
    if (!paths.length) return Promise.resolve();
    return db.storage.from("app-icons").createSignedUrls(paths, 3600).then(function (res) {
      if (res.error) return;
      (res.data || []).forEach(function (row) {
        if (row && row.path && row.signedUrl) iconUrls[row.path] = row.signedUrl;
      });
    }).catch(function () {});
  }

  function field(label, key, value, type) {
    if (type === "textarea") {
      return '<div class="apps-field"><label>' + label + '</label><textarea data-key="' + key + '">' + esc(value || "") + "</textarea></div>";
    }
    if (type === "select") {
      return '<div class="apps-field"><label>' + label + "</label><select data-key=\"" + key + "\">" + value + "</select></div>";
    }
    return '<div class="apps-field"><label>' + label + '</label><input data-key="' + key + '" type="' + (type || "text") + '" value="' + esc(value || "") + '" /></div>';
  }

  function shell() {
    return (
      '<div class="apps-workspace">' +
        '<div class="apps-top">' +
          '<div class="apps-capsules" data-el="capsules"></div>' +
          '<button class="btn-add" type="button" data-el="add" title="Add app">+</button>' +
        "</div>" +
        '<p class="status apps-banner" data-el="banner"></p>' +
        '<div class="apps-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function renderCapsules() {
    var wrap = el("capsules");
    if (!apps.length) {
      wrap.innerHTML = '<span style="font-size:13px;color:#6b7388;padding:0 4px">No apps yet</span>';
      return;
    }
    wrap.innerHTML = apps.map(function (app) {
      var open = openIssueCount(app.id);
      var title = (app.name || "Untitled") + (open ? " · " + open : "");
      return (
        '<button type="button" class="app-capsule' + (app.id === selectedId ? " is-on" : "") + '" data-id="' + app.id + '">' +
          iconMarkup(app, "app-capsule-icon") +
          "<span>" + esc(title) + "</span>" +
        "</button>"
      );
    }).join("");
    wrap.querySelectorAll("[data-id]").forEach(function (btn) {
      btn.onclick = function () {
        if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
        selectedId = btn.getAttribute("data-id");
        editing = false;
        expandedIssue = null;
        expandedLogin = null;
        clearDirty();
        render();
      };
    });
  }

  function render() {
    renderCapsules();
    var body = el("body");
    var app = selected();
    if (!app) {
      body.innerHTML =
        '<div class="apps-empty"><div><h2>No Apps Yet</h2><p>Add an app to track products in STL Apps.</p>' +
        '<button class="btn btn-primary" type="button" data-el="empty-add" style="min-height:32px;font-size:12px;margin-top:10px">New App</button></div></div>';
      var empty = el("empty-add");
      if (empty) empty.onclick = addApp;
      syncSave();
      return;
    }

    if (editing) {
      body.innerHTML = renderEditor(app);
      bindEditor(app);
      syncSave();
      return;
    }

    var plats = platformsOf(app);
    var openCount = openIssueCount(app.id);
    var html =
      '<div class="apps-card">' +
        '<div class="apps-header">' +
          iconMarkup(app, "app-mark") +
          "<div style=\"flex:1;min-width:0\">" +
            "<h1>" + esc(app.name || "Untitled") + "</h1>" +
            '<div class="apps-badges">' +
              '<span class="apps-badge ' + statusClass(app.status) + '">' + esc(app.status || "Idea") + "</span>" +
              plats.map(function (p) { return '<span class="apps-badge">' + esc(p) + "</span>"; }).join("") +
            "</div>" +
            (trim(app.summary) ? '<p class="apps-summary">' + esc(app.summary) + "</p>" : "") +
            '<div class="apps-versions">' +
              (trim(app.apple_build_number) ? "<div>Apple Build Number · " + esc(app.apple_build_number) + "</div>" : "") +
              (trim(app.apple_version) ? "<div>Apple Version · " + esc(app.apple_version) + "</div>" : "") +
              (trim(app.google_play_version) ? "<div>Google Play Version · " + esc(app.google_play_version) + "</div>" : "") +
            "</div>" +
          "</div>" +
        "</div>" +
        '<div class="apps-actions">' +
          '<button class="btn btn-ghost" type="button" data-el="edit">Edit</button>' +
          '<button class="btn btn-ghost" type="button" data-el="remove">Remove</button>' +
        "</div>" +
      "</div>";

    html += renderIssues(app, openCount);
    var openNotes = !!notesOpen[app.id];
    var preview = trim(app.notes);
    if (preview.length > 160) preview = preview.slice(0, 160).replace(/\s+\S*$/, "") + "…";
    html +=
      '<div class="apps-card apps-notes-card' + (openNotes ? " is-open" : "") + '">' +
        '<div class="apps-notes-head">' +
          "<h3>Notes</h3>" +
          '<button class="btn btn-ghost" type="button" data-el="notes-toggle">' + (openNotes ? "Collapse" : "Expand") + "</button>" +
        "</div>" +
        (openNotes
          ? '<textarea class="apps-notes-editor" data-el="notes" placeholder="Scratch notes for this app">' + esc(app.notes || "") + "</textarea>"
          : '<button type="button" class="apps-notes-preview" data-el="notes-toggle">' +
              (preview ? esc(preview) : "Expand to write or read notes.") +
            "</button>") +
      "</div>";

    html += renderLogins(app);

    html +=
      '<div class="apps-card"><h3>Website</h3><p class="sub">No live preview — open the site in your browser when you need it.</p>' +
      '<div class="apps-field"><label>Website URL</label><input data-el="website" type="text" value="' + esc(app.website_url || "") + '" placeholder="https://…" /></div>' +
      (trim(app.website_url)
        ? '<div class="apps-actions"><a class="btn btn-ghost" href="' + esc(normalizeURL(app.website_url)) + '" target="_blank" rel="noopener">Open in browser</a></div>'
        : "") +
      "</div>";

    body.innerHTML = html;
    bindDetail(app);
    syncSave();
  }

  function renderIssues(app, openCount) {
    var list = appIssues(app.id);
    var open = list.filter(function (i) { return i.status === "open" || i.status === "inProgress"; });
    var done = list.filter(function (i) { return i.status === "fixed" || i.status === "wontFix"; });
    var html =
      '<div class="apps-card"><h3>Known issues ' +
      (openCount ? '<span class="apps-badge warn">' + openCount + " open</span>" : "") +
      '</h3><p class="sub">Bugs and leftover work for this app.</p>';
    if (!list.length) {
      html += '<p class="sub">No known issues yet.</p>';
    } else {
      open.concat(done).forEach(function (issue) {
        html += issueCard(issue);
      });
    }
    html += '<div class="apps-actions"><button class="btn btn-ghost" type="button" data-el="add-issue">Add known issue</button></div></div>';
    return html;
  }

  function issueCard(issue) {
    var open = issue.id === expandedIssue;
    return (
      '<div class="issue-card' + (open ? " is-open" : "") + '" data-issue="' + issue.id + '">' +
        '<button type="button" class="issue-head" data-action="toggle-issue">' +
          '<span class="chev">▸</span>' +
          "<div style=\"flex:1\"><strong>" + esc(issue.title || "New issue") + "</strong>" +
          '<div class="apps-badges" style="margin-top:4px">' +
            '<span class="apps-badge">' + esc(issue.priority || "normal") + "</span>" +
            '<span class="apps-badge">' + esc(issue.status || "open") + "</span>" +
          "</div></div>" +
        "</button>" +
        '<div class="issue-body">' +
          field("Title", "title", issue.title) +
          '<div class="apps-grid">' +
            field("Status", "status", ISSUE_STATUS.map(function (s) {
              return '<option value="' + s.id + '"' + (issue.status === s.id ? " selected" : "") + ">" + s.title + "</option>";
            }).join(""), "select") +
            field("Priority", "priority", ISSUE_PRIORITY.map(function (s) {
              return '<option value="' + s.id + '"' + (issue.priority === s.id ? " selected" : "") + ">" + s.title + "</option>";
            }).join(""), "select") +
            field("Platform", "platform",
              '<option value=""' + (!issue.platform ? " selected" : "") + ">Any</option>" +
              PLATFORMS.map(function (p) {
                return '<option value="' + p + '"' + (issue.platform === p ? " selected" : "") + ">" + p + "</option>";
              }).join(""), "select") +
          "</div>" +
          field("Notes", "details", issue.details, "textarea") +
          '<div class="apps-actions">' +
            '<button class="btn btn-ghost" type="button" data-action="toggle-issue-status">' +
              ((issue.status === "open" || issue.status === "inProgress") ? "Mark fixed" : "Reopen") +
            "</button>" +
            '<button class="btn btn-ghost" type="button" data-action="remove-issue">Remove</button>' +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function renderLogins(app) {
    var list = appLogins(app.id);
    var html = '<div class="apps-card"><h3>App logins</h3><p class="sub">Store / portal logins for this product.</p>';
    if (!list.length) {
      html += '<p class="sub">No logins yet.</p>';
    } else {
      list.forEach(function (login) {
        var open = login.id === expandedLogin;
        var shown = !!revealPass[login.id];
        html +=
          '<div class="login-card' + (open ? " is-open" : "") + '" data-login="' + login.id + '">' +
            '<button type="button" class="login-head" data-action="toggle-login">' +
              '<span class="chev">▸</span>' +
              "<div><strong>" + esc(login.site_name || "Login") + "</strong>" +
              (trim(login.username) ? '<div class="sub" style="margin:2px 0 0">' + esc(login.username) + "</div>" : "") +
              "</div>" +
            "</button>" +
            '<div class="login-body">' +
              '<div class="apps-grid">' +
                field("Site / service", "site_name", login.site_name) +
                field("URL", "url", login.url) +
                field("Username / email", "username", login.username) +
                '<div class="apps-field"><label>Password</label><div class="pw-wrap">' +
                  '<input data-login-key="password" type="' + (shown ? "text" : "password") + '" value="' + esc(login.password || "") + '" />' +
                  '<button class="btn btn-ghost" type="button" data-action="reveal">' + (shown ? "Hide" : "Show") + "</button>" +
                "</div></div>" +
              "</div>" +
              field("Notes", "notes", login.notes, "textarea") +
              '<div class="apps-actions"><button class="btn btn-ghost" type="button" data-action="remove-login">Remove</button></div>' +
            "</div>" +
          "</div>";
      });
    }
    html += '<div class="apps-actions"><button class="btn btn-ghost" type="button" data-el="add-login">Add login</button></div></div>';
    return html;
  }

  function renderEditor(app) {
    var plats = platformsOf(app);
    return (
      '<div class="apps-card"><h3>Edit app</h3>' +
        '<div class="app-icon-row">' +
          iconMarkup(app, "app-mark") +
          '<div>' +
            '<input data-el="icon-file" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" hidden />' +
            '<button class="btn btn-ghost" type="button" data-el="icon-pick">Upload icon</button>' +
            (app.icon_path
              ? '<button class="btn btn-ghost" type="button" data-el="icon-clear">Remove icon</button>'
              : "") +
            '<p class="sub" style="margin-top:6px">PNG or JPEG. Shows on the Apps page and Overview.</p>' +
          "</div>" +
        "</div>" +
        field("Name", "name", app.name) +
        field("Summary", "summary", app.summary, "textarea") +
        field("Status", "status", STATUSES.map(function (s) {
          return '<option value="' + s + '"' + (app.status === s ? " selected" : "") + ">" + s + "</option>";
        }).join(""), "select") +
        '<div class="apps-field"><label>Platforms</label><div class="apps-platforms">' +
          PLATFORMS.map(function (p) {
            var on = plats.indexOf(p) >= 0;
            return (
              '<button type="button" class="platform-chip' + (on ? " is-on" : "") + '" data-platform="' + p + '" aria-pressed="' + (on ? "true" : "false") + '">' +
              p +
              "</button>"
            );
          }).join("") +
        "</div></div>" +
        '<div class="apps-grid">' +
          field("Accent color (hex)", "accent_hex", app.accent_hex || "E8822E") +
          field("Website URL", "website_url", app.website_url) +
          field("Apple Version", "apple_version", app.apple_version) +
          field("Apple Build Number", "apple_build_number", app.apple_build_number) +
          field("Google Play Version", "google_play_version", app.google_play_version) +
          field("Bundle ID", "bundle_identifier", app.bundle_identifier) +
          field("Apple App ID", "apple_app_id", app.apple_app_id) +
          field("Google package name", "google_package_name", app.google_package_name) +
        "</div>" +
        '<div class="apps-field"><label>Notes</label>' +
        '<textarea class="apps-notes-editor" data-key="notes">' + esc(app.notes || "") + "</textarea></div>" +
        '<div class="apps-actions">' +
          '<button class="btn btn-ghost" type="button" data-el="cancel-edit">Cancel</button>' +
        "</div>" +
      "</div>"
    );
  }

  function normalizeURL(raw) {
    var value = trim(raw);
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return "https://" + value;
  }

  function bindDetail(app) {
    el("edit").onclick = function () {
      editing = true;
      dirty = false;
      syncSave();
      render();
    };
    el("remove").onclick = function () { removeApp(app); };

    root.querySelectorAll('[data-el="notes-toggle"]').forEach(function (btn) {
      btn.onclick = function () {
        var box = el("notes");
        if (box) app.notes = box.value;
        notesOpen[app.id] = !notesOpen[app.id];
        render();
      };
    });
    var notes = el("notes");
    if (notes) {
      notes.oninput = function () {
        app.notes = notes.value;
        markDirty();
      };
    }
    var website = el("website");
    if (website) {
      website.oninput = function () {
        app.website_url = website.value;
        markDirty();
      };
    }

    bindIssuesAndLogins(app);
    var addIssue = el("add-issue");
    if (addIssue) addIssue.onclick = function () { addIssueRow(app.id); };
    var addLogin = el("add-login");
    if (addLogin) addLogin.onclick = function () { addLoginRow(app.id); };
  }

  function bindEditor(app) {
    root.querySelectorAll("[data-key]").forEach(function (input) {
      var evt = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(evt, function () {
        app[input.getAttribute("data-key")] = input.value;
        markDirty();
      });
    });
    root.querySelectorAll("[data-platform]").forEach(function (btn) {
      btn.onclick = function () {
        var list = platformsOf(app).slice();
        var name = btn.getAttribute("data-platform");
        var idx = list.indexOf(name);
        if (idx >= 0) list.splice(idx, 1);
        else list.push(name);
        app.platforms = list;
        markDirty();
        render();
      };
    });
    var pick = el("icon-pick");
    var fileInput = el("icon-file");
    if (pick && fileInput) {
      pick.onclick = function () { fileInput.click(); };
      fileInput.onchange = function () {
        var file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (file) uploadIcon(app, file);
      };
    }
    var clearIcon = el("icon-clear");
    if (clearIcon) {
      clearIcon.onclick = function () { clearIconFile(app); };
    }
    el("cancel-edit").onclick = function () {
      if (dirty && !window.confirm("Discard edits?")) return;
      editing = false;
      clearDirty();
      load();
    };
  }

  function bindIssuesAndLogins(app) {
    root.querySelectorAll("[data-action='toggle-issue']").forEach(function (btn) {
      btn.onclick = function () {
        harvestChildren();
        var id = btn.closest("[data-issue]").getAttribute("data-issue");
        expandedIssue = expandedIssue === id ? null : id;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      };
    });
    root.querySelectorAll("[data-action='toggle-login']").forEach(function (btn) {
      btn.onclick = function () {
        harvestChildren();
        var id = btn.closest("[data-login]").getAttribute("data-login");
        expandedLogin = expandedLogin === id ? null : id;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      };
    });
    root.querySelectorAll("[data-issue] [data-key], [data-login] [data-key], [data-login-key]").forEach(function (input) {
      var evt = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(evt, function () {
        harvestChildren();
        markDirty();
      });
    });
    root.querySelectorAll("[data-action='reveal']").forEach(function (btn) {
      btn.onclick = function () {
        harvestChildren();
        var id = btn.closest("[data-login]").getAttribute("data-login");
        revealPass[id] = !revealPass[id];
        render();
        if (dirty) showMsg("Unsaved changes", true);
      };
    });
    root.querySelectorAll("[data-action='toggle-issue-status']").forEach(function (btn) {
      btn.onclick = function () {
        harvestChildren();
        var id = btn.closest("[data-issue]").getAttribute("data-issue");
        issues.forEach(function (issue) {
          if (issue.id !== id) return;
          issue.status = (issue.status === "open" || issue.status === "inProgress") ? "fixed" : "open";
        });
        markDirty();
        render();
        showMsg("Unsaved changes", true);
      };
    });
    root.querySelectorAll("[data-action='remove-issue']").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.closest("[data-issue]").getAttribute("data-issue");
        if (!window.confirm("Remove this issue?")) return;
        db.from("app_issues").delete().eq("id", id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          issues = issues.filter(function (i) { return i.id !== id; });
          if (expandedIssue === id) expandedIssue = null;
          render();
          if (dirty) showMsg("Unsaved changes", true);
        });
      };
    });
    root.querySelectorAll("[data-action='remove-login']").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.closest("[data-login]").getAttribute("data-login");
        if (!window.confirm("Remove this login?")) return;
        db.from("app_logins").delete().eq("id", id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          logins = logins.filter(function (l) { return l.id !== id; });
          if (expandedLogin === id) expandedLogin = null;
          render();
          if (dirty) showMsg("Unsaved changes", true);
        });
      };
    });
  }

  function harvestChildren() {
    root.querySelectorAll("[data-issue]").forEach(function (card) {
      var id = card.getAttribute("data-issue");
      card.querySelectorAll("[data-key]").forEach(function (input) {
        issues.forEach(function (issue) {
          if (issue.id === id) issue[input.getAttribute("data-key")] = input.value;
        });
      });
    });
    root.querySelectorAll("[data-login]").forEach(function (card) {
      var id = card.getAttribute("data-login");
      card.querySelectorAll("[data-key]").forEach(function (input) {
        logins.forEach(function (login) {
          if (login.id === id) login[input.getAttribute("data-key")] = input.value;
        });
      });
      var pw = card.querySelector("[data-login-key='password']");
      if (pw) {
        logins.forEach(function (login) {
          if (login.id === id) login.password = pw.value;
        });
      }
    });
  }

  function harvestApp() {
    var app = selected();
    if (!app) return;
    if (editing) {
      root.querySelectorAll(".apps-card [data-key]").forEach(function (input) {
        if (input.closest("[data-issue]") || input.closest("[data-login]")) return;
        app[input.getAttribute("data-key")] = input.value;
      });
      var list = platformsOf(app);
    } else {
      var notes = el("notes");
      var website = el("website");
      if (notes) app.notes = notes.value;
      if (website) app.website_url = website.value;
    }
    harvestChildren();
  }

  function addApp() {
    var name = window.prompt("App name", "New app");
    if (name == null) return;
    name = trim(name) || "New app";
    db.from("managed_apps").insert({
      name: name,
      summary: "",
      status: "Idea",
      platforms: ["iOS"],
      accent_hex: "E8822E"
    }).select("*").single().then(function (res) {
      if (res.error) {
        showMsg(/does not exist|schema cache/i.test(res.error.message || "")
          ? "Run sql/011_apps.sql in Supabase, then refresh."
          : res.error.message, false);
        return;
      }
      apps.push(res.data);
      selectedId = res.data.id;
      editing = true;
      clearDirty();
      render();
      showMsg("App added. Fill details, then Save.", true);
    });
  }

  function removeApp(app) {
    if (!window.confirm('Remove "' + (app.name || "app") + '" and its logins/issues?')) return;
    db.from("managed_apps").delete().eq("id", app.id).then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      apps = apps.filter(function (a) { return a.id !== app.id; });
      logins = logins.filter(function (l) { return l.app_id !== app.id; });
      issues = issues.filter(function (i) { return i.app_id !== app.id; });
      selectedId = apps[0] ? apps[0].id : null;
      editing = false;
      clearDirty();
      render();
    });
  }

  function addIssueRow(appId) {
    db.from("app_issues").insert({
      app_id: appId,
      title: "New issue",
      status: "open",
      priority: "normal"
    }).select("*").single().then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      issues.unshift(res.data);
      expandedIssue = res.data.id;
      render();
      if (dirty) showMsg("Unsaved changes", true);
    });
  }

  function addLoginRow(appId) {
    db.from("app_logins").insert({
      app_id: appId,
      site_name: ""
    }).select("*").single().then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      logins.unshift(res.data);
      expandedLogin = res.data.id;
      render();
      if (dirty) showMsg("Unsaved changes", true);
    });
  }

  function saveAll() {
    if (saving || !dirty) return;
    harvestApp();
    var app = selected();
    if (!app) return;
    if (!trim(app.name)) return showMsg("App name is required.", false);
    saving = true;
    syncSave();
    showMsg("Saving…", true);

    var appPatch = {
      name: app.name || "",
      summary: app.summary || "",
      status: app.status || "Idea",
      platforms: platformsOf(app),
      bundle_identifier: app.bundle_identifier || "",
      apple_app_id: app.apple_app_id || "",
      google_package_name: app.google_package_name || "",
      apple_version: app.apple_version || "",
      apple_build_number: app.apple_build_number || "",
      google_play_version: app.google_play_version || "",
      notes: app.notes || "",
      website_url: app.website_url || "",
      accent_hex: (app.accent_hex || "E8822E").replace("#", ""),
      icon_path: app.icon_path || ""
    };

    var jobs = [db.from("managed_apps").update(appPatch).eq("id", app.id)];
    appIssues(app.id).forEach(function (issue) {
      jobs.push(db.from("app_issues").update({
        title: issue.title || "",
        details: issue.details || "",
        status: issue.status || "open",
        priority: issue.priority || "normal",
        platform: issue.platform || ""
      }).eq("id", issue.id));
    });
    appLogins(app.id).forEach(function (login) {
      jobs.push(db.from("app_logins").update({
        site_name: login.site_name || "",
        url: login.url || "",
        username: login.username || "",
        password: login.password || "",
        notes: login.notes || ""
      }).eq("id", login.id));
    });

    Promise.all(jobs).then(function (results) {
      saving = false;
      var err = results.map(function (r) { return r && r.error; }).filter(Boolean)[0];
      if (err) {
        showMsg(err.message || "Save failed.", false);
        syncSave();
        return;
      }
      Object.keys(appPatch).forEach(function (k) { app[k] = appPatch[k]; });
      editing = false;
      clearDirty();
      showMsg("Saved", true);
      setTimeout(function () { showMsg(""); }, 900);
      render();
    }).catch(function (err) {
      saving = false;
      showMsg((err && err.message) || "Save failed.", false);
      syncSave();
    });
  }

  function load() {
    showMsg("Loading apps…", true);
    return Promise.all([
      db.from("managed_apps").select("*").order("name"),
      db.from("app_logins").select("*"),
      db.from("app_issues").select("*").order("updated_at", { ascending: false })
    ]).then(function (pair) {
      if (pair[0].error) {
        showMsg(/does not exist|schema cache/i.test(pair[0].error.message || "")
          ? "Run sql/011_apps.sql in Supabase, then refresh."
          : pair[0].error.message, false);
        apps = [];
        logins = [];
        issues = [];
        render();
        return;
      }
      apps = pair[0].data || [];
      logins = (pair[1] && pair[1].data) || [];
      issues = (pair[2] && pair[2].data) || [];
      if (selectedId && !apps.some(function (a) { return a.id === selectedId; })) selectedId = null;
      if (!selectedId && apps[0]) selectedId = apps[0].id;
      return resolveIcons().then(function () {
        clearDirty();
        showMsg("");
        render();
      });
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not load apps.", false);
      render();
    });
  }

  function uploadIcon(app, file) {
    if (!userId) return showMsg("Not signed in.", false);
    if (!file) return;
    if (!/^image\//i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name || "")) {
      return showMsg("Use a PNG, JPEG, or WebP image.", false);
    }
    var path = "";
    showMsg("Uploading icon…", true);
    var ready = window.STLImageCompress && window.STLImageCompress.file
      ? window.STLImageCompress.file(file)
      : Promise.resolve(file);
    ready.then(function (out) {
      file = out;
      var ext = (String(file.name || "jpg").split(".").pop() || "jpg").toLowerCase();
      if (["png", "jpg", "jpeg", "webp"].indexOf(ext) < 0) ext = "jpg";
      path = userId + "/" + app.id + "/icon." + ext;
      return db.storage.from("app-icons").upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
    }).then(function (up) {
      if (!up) return null;
      if (up.error) {
        showMsg(/bucket|not found|row-level/i.test(up.error.message || "")
          ? "Run sql/014_app_icons.sql in Supabase, then refresh."
          : up.error.message, false);
        return null;
      }
      return db.from("managed_apps").update({ icon_path: path }).eq("id", app.id).select("*").single();
    }).then(function (res) {
      if (!res || res.error) {
        if (res && res.error) showMsg(res.error.message, false);
        return null;
      }
      app.icon_path = res.data.icon_path || path;
      apps = apps.map(function (a) { return a.id === app.id ? Object.assign(a, { icon_path: app.icon_path }) : a; });
      return db.storage.from("app-icons").createSignedUrl(path, 3600);
    }).then(function (signed) {
      if (!signed) return;
      if (signed.error) return showMsg(signed.error.message, false);
      iconUrls[path] = signed.data.signedUrl;
      showMsg("Icon uploaded.", true);
      render();
    });
  }

  function clearIconFile(app) {
    var path = app.icon_path;
    var finish = function () {
      return db.from("managed_apps").update({ icon_path: "" }).eq("id", app.id).select("*").single();
    };
    var chain = path
      ? db.storage.from("app-icons").remove([path]).then(finish, finish)
      : finish();
    chain.then(function (res) {
      if (res && res.error) return showMsg(res.error.message, false);
      app.icon_path = "";
      if (path) delete iconUrls[path];
      showMsg("Icon removed.", true);
      render();
    });
  }

  function bindChrome() {
    el("add").onclick = addApp;
  }

  window.STLApps = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      selectedId = null;
      editing = false;
      dirty = false;
      saving = false;
      expandedIssue = null;
      expandedLogin = null;
      revealPass = {};
      panel.classList.add("apps-wide");
      panel.innerHTML = shell();
      bindChrome();
      syncSave();
      db.auth.getUser().then(function (authRes) {
        userId = authRes.data && authRes.data.user && authRes.data.user.id;
        load();
      });
    },
    unmount: function (panel) {
      hideSave();
      if (panel) panel.classList.remove("apps-wide");
      root = null;
    },
    saveAll: saveAll,
    isDirty: function () { return dirty; }
  };
})();

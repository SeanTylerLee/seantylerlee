(function () {
  "use strict";

  var PLATFORMS = [
    { id: "ios", title: "iOS" },
    { id: "android", title: "Android" },
    { id: "web", title: "Web" }
  ];
  var NOTE_HINT = {
    ios: "App icon 1024×1024 PNG. iPhone 6.7\" screenshots 1290×2796. Write any other sizes you use.",
    android: "Hi-res icon 512×512 PNG. Phone screenshots 1080×1920. Feature graphic 1024×500.",
    web: "Favicon, Open Graph 1200×630, and any header or hero sizes you keep here."
  };
  var ICON_LABEL = { ios: "App icons", android: "App icons", web: "Logos" };
  var SHARED = "shared";

  var root = null;
  var db = null;
  var userId = "";
  var apps = [];
  var selectedAppId = null;
  var platform = "ios";
  var notes = {};
  var drafts = {};
  var files = [];
  var urls = {};
  var savingNotes = false;
  var selectedId = null;

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

  function appKey(id) {
    return id || SHARED;
  }

  function emptyNotes() {
    return { ios: { id: null, body: "" }, android: { id: null, body: "" }, web: { id: null, body: "" } };
  }

  function emptyDrafts() {
    return { ios: "", android: "", web: "" };
  }

  function ensureBucket(key) {
    if (!notes[key]) notes[key] = emptyNotes();
    if (!drafts[key]) drafts[key] = emptyDrafts();
    return key;
  }

  function currentKey() {
    return ensureBucket(appKey(selectedAppId));
  }

  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!msg && !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }

  function hideSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }

  function sqlHint(err) {
    var msg = (err && err.message) || "";
    if (/app_id|Could not find the 'app_id' column/i.test(msg)) {
      return "Run sql/041_image_assets_app.sql in Supabase, then refresh.";
    }
    if (/does not exist|schema cache|bucket|not found|row-level/i.test(msg)) {
      return "Run sql/037_image_assets.sql in Supabase, then refresh.";
    }
    return msg || "Could not save.";
  }

  function harvestNotes() {
    var box = el("notes");
    var key = currentKey();
    if (box) drafts[key][platform] = box.value;
  }

  function notesDirty() {
    var key = currentKey();
    return (drafts[key][platform] || "") !== (notes[key][platform].body || "");
  }

  function matchesApp(row) {
    var id = row && row.app_id ? row.app_id : null;
    if (!selectedAppId) return !id;
    return id === selectedAppId;
  }

  function hasUnassigned() {
    var i;
    for (i = 0; i < files.length; i++) {
      if (!files[i].app_id) return true;
    }
    if (notes[SHARED]) {
      if ((notes[SHARED].ios && notes[SHARED].ios.id) ||
          (notes[SHARED].android && notes[SHARED].android.id) ||
          (notes[SHARED].web && notes[SHARED].web.id)) return true;
    }
    return false;
  }

  function filesOf(kind) {
    return files.filter(function (f) {
      if (!matchesApp(f)) return false;
      if (f.platform !== platform) return false;
      if (platform === "web") return true;
      return f.kind === kind;
    }).sort(function (a, b) {
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  }

  function thumb(row) {
    var src = urls[row.storage_path] || "";
    if (!src) return '<div class="ia-empty">No preview</div>';
    return '<img src="' + esc(src) + '" alt="' + esc(row.file_name || "image") + '" />';
  }

  function fileCard(row) {
    var on = row.id === selectedId ? " is-on" : "";
    return (
      '<figure class="ia-card' + on + '" data-id="' + row.id + '">' +
        '<button type="button" class="ia-hit" data-select="' + row.id + '">' +
          thumb(row) +
        "</button>" +
        '<span class="ia-card-actions">' +
          '<button type="button" class="btn btn-primary" data-download="' + row.id + '">Download</button>' +
          '<button type="button" class="btn btn-ghost" data-remove="' + row.id + '">Delete</button>' +
        "</span>" +
        "<figcaption>" + esc(row.file_name || "image") + "</figcaption>" +
      "</figure>"
    );
  }

  function gridClass(kind) {
    if (platform === "web" || kind === "image") return " is-web";
    if (kind === "icon") return " is-icon";
    if (kind === "header") return " is-header";
    return "";
  }

  function section(kind, title) {
    var rows = filesOf(kind);
    var html =
      '<div class="ops-card ia-section">' +
        "<h3>" + esc(title) + "</h3>" +
        '<div class="ia-actions">' +
          '<button type="button" class="btn btn-primary" data-add="' + kind + '">Add images</button>' +
          '<input data-file="' + kind + '" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" multiple hidden />' +
        "</div>";
    if (!rows.length) html += '<p class="sub">Nothing stored yet.</p>';
    else {
      html += '<div class="ia-grid' + gridClass(kind) + '">';
      rows.forEach(function (row) { html += fileCard(row); });
      html += "</div>";
    }
    html += "</div>";
    return html;
  }

  function shell() {
    return (
      '<div class="ops-workspace ia-workspace">' +
        '<div class="ops-header">' +
          "<h1>Image Assets</h1>" +
          '<p class="sub">Pick an app, then store icons, screenshots, and headers. Notes on each tab keep size requirements.</p>' +
        "</div>" +
        '<div class="ops-top ia-apps" data-el="apps"></div>' +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="ops-filters ia-tabs" data-el="tabs"></div>' +
        '<div class="ops-body ia-body" data-el="page"></div>' +
      "</div>"
    );
  }

  function renderApps() {
    var box = el("apps");
    if (!box) return;
    var html = "";
    if (!apps.length && !hasUnassigned()) {
      html = '<span class="ia-apps-empty">Add the app on its admin page, under App.</span>';
    } else {
      apps.forEach(function (app) {
        html +=
          '<button type="button" class="ops-capsule' + (app.id === selectedAppId ? " is-on" : "") + '" data-app="' + app.id + '">' +
            esc(app.name || "App") +
          "</button>";
      });
      if (hasUnassigned() || !apps.length) {
        html +=
          '<button type="button" class="ops-capsule' + (!selectedAppId ? " is-on" : "") + '" data-app="">' +
            "Unassigned" +
          "</button>";
      }
    }
    box.innerHTML = html;
    box.querySelectorAll("[data-app]").forEach(function (btn) {
      btn.onclick = function () {
        var next = btn.getAttribute("data-app") || "";
        harvestNotes();
        selectedAppId = next || null;
        selectedId = null;
        render();
      };
    });
  }

  function renderTabs() {
    var box = el("tabs");
    if (!box) return;
    box.innerHTML = PLATFORMS.map(function (p) {
      return (
        '<button type="button" class="ops-pill' + (p.id === platform ? " is-on" : "") + '" data-platform="' + p.id + '">' +
          esc(p.title) +
        "</button>"
      );
    }).join("");
    box.querySelectorAll("[data-platform]").forEach(function (btn) {
      btn.onclick = function () {
        harvestNotes();
        platform = btn.getAttribute("data-platform");
        selectedId = null;
        render();
      };
    });
  }

  function renderPage() {
    var box = el("page");
    if (!box) return;
    var key = currentKey();
    var iconTitle = ICON_LABEL[platform] || "App icons";
    var sections = platform === "web"
      ? section("image", "Images")
      : section("icon", iconTitle) +
        section("screenshot", "Screenshots") +
        section("header", "Header images");
    box.innerHTML =
      '<div class="ops-card ia-notes">' +
        "<h3>Notes</h3>" +
        '<p class="sub">Screenshot sizes, icon rules, and anything else you want on this tab for this app.</p>' +
        '<textarea data-el="notes" rows="6" placeholder="' + esc(NOTE_HINT[platform] || "") + '">' +
          esc(drafts[key][platform] || "") +
        "</textarea>" +
        '<div class="ia-notes-bar">' +
          '<button type="button" class="btn btn-primary" data-el="save-notes">Save notes</button>' +
        "</div>" +
      "</div>" +
      sections;

    var notesBox = el("notes");
    var saveBtn = el("save-notes");
    if (notesBox) {
      notesBox.addEventListener("input", function () {
        drafts[currentKey()][platform] = notesBox.value;
        if (saveBtn) saveBtn.disabled = !notesDirty() || savingNotes;
      });
    }
    if (saveBtn) {
      saveBtn.disabled = !notesDirty() || savingNotes;
      saveBtn.onclick = saveNotes;
    }

    box.querySelectorAll("[data-add]").forEach(function (btn) {
      btn.onclick = function () {
        var kind = btn.getAttribute("data-add");
        var input = box.querySelector('[data-file="' + kind + '"]');
        if (input) input.click();
      };
    });
    box.querySelectorAll("[data-file]").forEach(function (input) {
      input.onchange = function () {
        var kind = input.getAttribute("data-file");
        var list = input.files ? Array.prototype.slice.call(input.files) : [];
        input.value = "";
        uploadFiles(kind, list);
      };
    });
    box.querySelectorAll("[data-select]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-select");
        selectedId = selectedId === id ? null : id;
        paintSelected();
      };
    });
    box.querySelectorAll("[data-download]").forEach(function (btn) {
      btn.onclick = function (event) {
        event.stopPropagation();
        downloadFile(btn.getAttribute("data-download"));
      };
    });
    box.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.onclick = function (event) {
        event.stopPropagation();
        removeFile(btn.getAttribute("data-remove"));
      };
    });
  }

  function paintSelected() {
    if (!root) return;
    root.querySelectorAll(".ia-card").forEach(function (card) {
      card.classList.toggle("is-on", card.getAttribute("data-id") === selectedId);
    });
  }

  function render() {
    hideSave();
    renderApps();
    renderTabs();
    renderPage();
  }

  function saveNotes() {
    harvestNotes();
    if (!notesDirty() || savingNotes) return;
    savingNotes = true;
    var key = currentKey();
    var body = drafts[key][platform] || "";
    var row = notes[key][platform];
    var btn = el("save-notes");
    if (btn) btn.disabled = true;
    var payload = { platform: platform, body: body, app_id: selectedAppId || null };
    var req = row.id
      ? db.from("image_asset_notes").update(payload).eq("id", row.id).select("id, platform, body, app_id").single()
      : db.from("image_asset_notes").insert(payload).select("id, platform, body, app_id").single();
    req.then(function (res) {
      savingNotes = false;
      if (res.error) {
        if (btn) btn.disabled = !notesDirty();
        return showMsg(sqlHint(res.error), false);
      }
      var nextKey = appKey(res.data.app_id);
      ensureBucket(nextKey);
      notes[nextKey][platform] = { id: res.data.id, body: res.data.body || "" };
      drafts[nextKey][platform] = notes[nextKey][platform].body;
      if (btn) btn.disabled = true;
      showMsg("Notes saved.", true);
    });
  }

  function extOf(file) {
    var ext = (String(file.name || "png").split(".").pop() || "png").toLowerCase();
    if (["png", "jpg", "jpeg", "webp"].indexOf(ext) < 0) ext = "png";
    return ext;
  }

  function uploadOne(kind, file) {
    var ext = extOf(file);
    var id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    var folder = selectedAppId || "shared";
    var path = userId + "/" + folder + "/" + platform + "/" + kind + "/" + id + "." + ext;
    var row = {
      platform: platform,
      kind: kind,
      storage_path: path,
      file_name: file.name || (kind + "." + ext),
      app_id: selectedAppId || null
    };
    return db.storage.from("image-assets").upload(path, file, { upsert: true, contentType: file.type || "image/png" }).then(function (up) {
      if (up.error) throw up.error;
      return db.from("image_asset_files").insert(row).select("*").single();
    }).then(function (res) {
      if (res.error) throw res.error;
      files.unshift(res.data);
      return signOne(res.data.storage_path);
    });
  }

  function uploadFiles(kind, list) {
    if (!userId) return showMsg("Not signed in.", false);
    if (!selectedAppId && apps.length && !hasUnassigned()) {
      return showMsg("Pick an app first.", false);
    }
    list = (list || []).filter(function (file) {
      return /^image\//i.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name || "");
    });
    if (!list.length) return showMsg("Use a PNG, JPEG, or WebP image.", false);
    showMsg("Uploading…", true);
    var chain = Promise.resolve();
    list.forEach(function (file) {
      chain = chain.then(function () {
        return uploadOne(kind, file);
      });
    });
    chain.then(function () {
      showMsg("Saved.", true);
      render();
    }).catch(function (err) {
      showMsg(sqlHint(err), false);
      render();
    });
  }

  function removeRow(row, quiet) {
    var finish = function () {
      return db.from("image_asset_files").delete().eq("id", row.id).then(function (res) {
        if (res.error) throw res.error;
        files = files.filter(function (f) { return f.id !== row.id; });
        if (row.storage_path) delete urls[row.storage_path];
      });
    };
    if (!row.storage_path) return finish();
    return db.storage.from("image-assets").remove([row.storage_path]).then(finish, finish);
  }

  function saveBlob(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName || "image";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function downloadFile(id) {
    var row = files.filter(function (f) { return f.id === id; })[0];
    if (!row || !row.storage_path) return showMsg("Missing file.", false);
    showMsg("Downloading…", true);
    db.storage.from("image-assets").download(row.storage_path).then(function (res) {
      if (res.error) return showMsg(sqlHint(res.error), false);
      saveBlob(res.data, row.file_name || "image");
      showMsg("Downloaded.", true);
    }).catch(function (err) {
      showMsg(sqlHint(err), false);
    });
  }

  function removeFile(id) {
    var row = files.filter(function (f) { return f.id === id; })[0];
    if (!row) return;
    if (!window.confirm("Delete this image?")) return;
    showMsg("Removing…", true);
    removeRow(row).then(function () {
      selectedId = null;
      if (!hasUnassigned() && !selectedAppId && apps[0]) selectedAppId = apps[0].id;
      showMsg("Removed.", true);
      render();
    }).catch(function (err) {
      showMsg(sqlHint(err), false);
    });
  }

  function signOne(path) {
    if (!path || urls[path]) return Promise.resolve();
    return db.storage.from("image-assets").createSignedUrl(path, 3600).then(function (res) {
      if (!res.error && res.data && res.data.signedUrl) urls[path] = res.data.signedUrl;
    });
  }

  function signAll() {
    var paths = files.map(function (f) { return f.storage_path; }).filter(Boolean);
    if (!paths.length) return Promise.resolve();
    return db.storage.from("image-assets").createSignedUrls(paths, 3600).then(function (res) {
      if (res.error) return;
      (res.data || []).forEach(function (item) {
        if (item && item.path && item.signedUrl) urls[item.path] = item.signedUrl;
      });
    });
  }

  function pickDefaultApp() {
    if (hasUnassigned() && !selectedAppId) return;
    if (selectedAppId && apps.some(function (a) { return a.id === selectedAppId; })) return;
    selectedAppId = apps[0] ? apps[0].id : null;
  }

  function load() {
    showMsg("Loading…", true);
    return Promise.all([
      db.from("managed_apps").select("id,name").order("name"),
      db.from("image_asset_notes").select("id, platform, body, app_id"),
      db.from("image_asset_files").select("*").order("created_at", { ascending: false })
    ]).then(function (triple) {
      if (triple[0].error) {
        showMsg(sqlHint(triple[0].error), false);
        render();
        return;
      }
      if (triple[1].error) {
        showMsg(sqlHint(triple[1].error), false);
        render();
        return;
      }
      if (triple[2].error) {
        showMsg(sqlHint(triple[2].error), false);
        render();
        return;
      }
      apps = triple[0].data || [];
      notes = {};
      drafts = {};
      ensureBucket(SHARED);
      apps.forEach(function (app) { ensureBucket(app.id); });
      (triple[1].data || []).forEach(function (row) {
        var key = ensureBucket(appKey(row.app_id));
        if (!notes[key][row.platform]) return;
        notes[key][row.platform] = { id: row.id, body: row.body || "" };
        drafts[key][row.platform] = row.body || "";
      });
      files = triple[2].data || [];
      pickDefaultApp();
      return signAll().then(function () {
        showMsg("");
        render();
      });
    }).catch(function (err) {
      showMsg(sqlHint(err), false);
      render();
    });
  }

  window.STLImageAssets = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      platform = "ios";
      apps = [];
      selectedAppId = null;
      files = [];
      urls = {};
      notes = {};
      drafts = {};
      selectedId = null;
      panel.classList.add("ops-wide");
      panel.innerHTML = shell();
      hideSave();
      client.auth.getUser().then(function (res) {
        userId = res && res.data && res.data.user ? res.data.user.id : "";
        load();
      });
    },
    shown: function () {
      hideSave();
    }
  };
})();

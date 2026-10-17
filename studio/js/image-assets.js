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
  var ICON_LABEL = { ios: "App icon", android: "App icon", web: "Logo" };

  var root = null;
  var db = null;
  var userId = "";
  var platform = "ios";
  var notes = { ios: { id: null, body: "" }, android: { id: null, body: "" }, web: { id: null, body: "" } };
  var drafts = { ios: "", android: "", web: "" };
  var files = [];
  var urls = {};
  var savingNotes = false;

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
    if (/does not exist|schema cache|bucket|not found|row-level/i.test(msg)) {
      return "Run sql/037_image_assets.sql in Supabase, then refresh.";
    }
    return msg || "Could not save.";
  }

  function harvestNotes() {
    var box = el("notes");
    if (box) drafts[platform] = box.value;
  }

  function notesDirty() {
    return (drafts[platform] || "") !== (notes[platform].body || "");
  }

  function filesOf(kind) {
    return files.filter(function (f) {
      return f.platform === platform && f.kind === kind;
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
    return (
      '<figure class="ia-card" data-id="' + row.id + '">' +
        thumb(row) +
        "<figcaption>" +
          "<span>" + esc(row.file_name || "image") + "</span>" +
          '<button type="button" class="btn btn-ghost" data-remove="' + row.id + '">Remove</button>' +
        "</figcaption>" +
      "</figure>"
    );
  }

  function section(kind, title, many) {
    var rows = filesOf(kind);
    var html =
      '<div class="ops-card ia-section">' +
        "<h3>" + esc(title) + "</h3>" +
        '<div class="ia-actions">' +
          '<button type="button" class="btn btn-primary" data-add="' + kind + '">' +
            (many ? "Add images" : rows.length ? "Replace" : "Add image") +
          "</button>" +
          '<input data-file="' + kind + '" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"' +
            (many ? " multiple" : "") + " hidden />" +
        "</div>";
    if (!rows.length) html += '<p class="sub">Nothing stored yet.</p>';
    else {
      html += '<div class="ia-grid' + (kind === "icon" ? " is-icon" : kind === "header" ? " is-header" : "") + '">';
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
          '<p class="sub">Store icons, screenshots, and headers. Notes on each tab keep size requirements.</p>' +
        "</div>" +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="ops-filters ia-tabs" data-el="tabs"></div>' +
        '<div class="ops-body ia-body" data-el="page"></div>' +
      "</div>"
    );
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
        render();
      };
    });
  }

  function renderPage() {
    var box = el("page");
    if (!box) return;
    var iconTitle = ICON_LABEL[platform] || "App icon";
    box.innerHTML =
      '<div class="ops-card ia-notes">' +
        "<h3>Notes</h3>" +
        '<p class="sub">Screenshot sizes, icon rules, and anything else you want on this tab.</p>' +
        '<textarea data-el="notes" rows="6" placeholder="' + esc(NOTE_HINT[platform] || "") + '">' +
          esc(drafts[platform] || "") +
        "</textarea>" +
        '<div class="ia-notes-bar">' +
          '<button type="button" class="btn btn-primary" data-el="save-notes">Save notes</button>' +
        "</div>" +
      "</div>" +
      section("icon", iconTitle, false) +
      section("screenshot", "Screenshots", true) +
      section("header", "Header image", false);

    var notesBox = el("notes");
    var saveBtn = el("save-notes");
    if (notesBox) {
      notesBox.addEventListener("input", function () {
        drafts[platform] = notesBox.value;
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
    box.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.onclick = function () {
        removeFile(btn.getAttribute("data-remove"));
      };
    });
  }

  function render() {
    hideSave();
    renderTabs();
    renderPage();
  }

  function saveNotes() {
    harvestNotes();
    if (!notesDirty() || savingNotes) return;
    savingNotes = true;
    var body = drafts[platform] || "";
    var row = notes[platform];
    var btn = el("save-notes");
    if (btn) btn.disabled = true;
    var req = row.id
      ? db.from("image_asset_notes").update({ body: body }).eq("id", row.id).select("id, platform, body").single()
      : db.from("image_asset_notes").insert({ platform: platform, body: body }).select("id, platform, body").single();
    req.then(function (res) {
      savingNotes = false;
      if (res.error) {
        if (btn) btn.disabled = !notesDirty();
        return showMsg(sqlHint(res.error), false);
      }
      notes[platform] = { id: res.data.id, body: res.data.body || "" };
      drafts[platform] = notes[platform].body;
      if (btn) btn.disabled = true;
      showMsg("Notes saved.", true);
    });
  }

  function extOf(file) {
    var ext = (String(file.name || "png").split(".").pop() || "png").toLowerCase();
    if (["png", "jpg", "jpeg", "webp"].indexOf(ext) < 0) ext = "png";
    return ext;
  }

  function uploadOne(kind, file, replaceRows) {
    var ext = extOf(file);
    var id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    var path = userId + "/" + platform + "/" + kind + "/" + id + "." + ext;
    return db.storage.from("image-assets").upload(path, file, { upsert: true, contentType: file.type || "image/png" }).then(function (up) {
      if (up.error) throw up.error;
      return db.from("image_asset_files").insert({
        platform: platform,
        kind: kind,
        storage_path: path,
        file_name: file.name || (kind + "." + ext)
      }).select("*").single();
    }).then(function (res) {
      if (res.error) throw res.error;
      files.unshift(res.data);
      return signOne(res.data.storage_path).then(function () {
        if (!replaceRows || !replaceRows.length) return;
        return Promise.all(replaceRows.map(function (old) {
          return removeRow(old, true);
        }));
      });
    });
  }

  function uploadFiles(kind, list) {
    if (!userId) return showMsg("Not signed in.", false);
    list = (list || []).filter(function (file) {
      return /^image\//i.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name || "");
    });
    if (!list.length) return showMsg("Use a PNG, JPEG, or WebP image.", false);
    var replaceRows = kind === "screenshot" ? [] : filesOf(kind).slice();
    showMsg("Uploading…", true);
    var chain = Promise.resolve();
    list.forEach(function (file, i) {
      chain = chain.then(function () {
        return uploadOne(kind, file, i === 0 ? replaceRows : []);
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

  function removeFile(id) {
    var row = files.filter(function (f) { return f.id === id; })[0];
    if (!row) return;
    if (!window.confirm("Remove this image?")) return;
    showMsg("Removing…", true);
    removeRow(row).then(function () {
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

  function load() {
    showMsg("Loading…", true);
    return Promise.all([
      db.from("image_asset_notes").select("id, platform, body"),
      db.from("image_asset_files").select("*").order("created_at", { ascending: false })
    ]).then(function (pair) {
      if (pair[0].error) {
        showMsg(sqlHint(pair[0].error), false);
        render();
        return;
      }
      if (pair[1].error) {
        showMsg(sqlHint(pair[1].error), false);
        render();
        return;
      }
      ["ios", "android", "web"].forEach(function (id) {
        notes[id] = { id: null, body: "" };
        drafts[id] = "";
      });
      (pair[0].data || []).forEach(function (row) {
        if (!notes[row.platform]) return;
        notes[row.platform] = { id: row.id, body: row.body || "" };
        drafts[row.platform] = row.body || "";
      });
      files = pair[1].data || [];
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
      files = [];
      urls = {};
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

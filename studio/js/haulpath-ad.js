(function () {
  "use strict";

  var root = null;
  var db = null;
  var userId = null;
  var saving = false;
  var apps = {
    haulpath: { title: "Haul Path", imageUrl: "", pendingFile: null, dirty: false, endpoint: "/api/haulpath/ad", filePrefix: "haulpath-ad" },
    pc4h: { title: "Pilot Car 4 Hire", imageUrl: "", pendingFile: null, dirty: false, endpoint: "/api/pc4h/ad", filePrefix: "pc4h-ad" }
  };

  function el(name) {
    return root ? root.querySelector('[data-el="' + name + '"]') : null;
  }

  function anyDirty() {
    return apps.haulpath.dirty || apps.pc4h.dirty;
  }

  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!msg && !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }

  function syncSaveButton() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.disabled = !anyDirty() || saving;
    btn.textContent = saving ? "Saving…" : "Save";
  }

  function card(id) {
    var app = apps[id];
    return (
      '<section class="ops-card" style="flex:1 1 320px;max-width:420px">' +
        "<h2>" + app.title + "</h2>" +
        "<h3>Current advertisement</h3>" +
        "<p class=\"sub\">Use a portrait photo, 1080 by 1920 pixels. Keep the words and logo in the middle. Leave the top 120 pixels and the bottom 240 pixels mostly empty so the phone notch and the Clear button do not cover them.</p>" +
        '<div data-el="preview-' + id + '" style="margin:12px 0;background:#0b1220;border-radius:16px;min-height:180px;display:flex;align-items:center;justify-content:center;overflow:hidden"></div>' +
        '<input data-el="file-' + id + '" type="file" accept="image/png,image/jpeg,image/webp" />' +
        '<div class="ops-actions" style="margin-top:12px">' +
          '<button class="btn" type="button" data-el="remove-' + id + '">Remove image</button>' +
        "</div>" +
      "</section>"
    );
  }

  function shell() {
    return (
      '<div class="ops-workspace">' +
        '<div class="ops-header">' +
          "<h1>Advertisement</h1>" +
          "<p>Each app has its own ad. The image in a section is what that app shows every time it opens, until the person taps Clear. Remove the image and save to turn that ad off.</p>" +
        "</div>" +
        '<p class="status" data-el="banner"></p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start">' +
          card("haulpath") +
          card("pc4h") +
        "</div>" +
      "</div>"
    );
  }

  function paint(id) {
    var box = el("preview-" + id);
    var app = apps[id];
    if (!box || !app) return;
    if (app.pendingFile) {
      var reader = new FileReader();
      reader.onload = function () {
        box.innerHTML = '<img alt="" src="' + reader.result + '" style="width:100%;max-height:520px;object-fit:contain" />';
      };
      reader.readAsDataURL(app.pendingFile);
      return;
    }
    if (app.imageUrl) {
      box.innerHTML = '<img alt="" src="' + app.imageUrl.replace(/"/g, "") + '" style="width:100%;max-height:520px;object-fit:contain" />';
      return;
    }
    box.innerHTML = '<p class="sub">No advertisement yet.</p>';
  }

  function markDirty(id) {
    apps[id].dirty = true;
    syncSaveButton();
    showMsg("Unsaved changes", true);
  }

  function upload(id) {
    var app = apps[id];
    if (!app.pendingFile) return Promise.resolve(app.imageUrl);
    if (!db || !db.storage) return Promise.reject(new Error("Not signed in."));
    if (!userId) return Promise.reject(new Error("Not signed in."));
    var ext = (String(app.pendingFile.name || "jpg").split(".").pop() || "jpg").toLowerCase();
    if (["png", "jpg", "jpeg", "webp"].indexOf(ext) < 0) ext = "jpg";
    var path = userId + "/" + app.filePrefix + "-" + Date.now() + "." + ext;
    return db.storage.from("announcement-images").upload(path, app.pendingFile, {
      upsert: false,
      contentType: app.pendingFile.type || "image/jpeg"
    }).then(function (up) {
      if (up && up.error) throw new Error(up.error.message || "Upload failed.");
      var pub = db.storage.from("announcement-images").getPublicUrl(path);
      var url = pub && pub.data && pub.data.publicUrl;
      if (!url) throw new Error("Could not get a public photo URL.");
      return url;
    });
  }

  function saveOne(id) {
    var app = apps[id];
    if (!app.dirty) return Promise.resolve();
    return upload(id).then(function (url) {
      app.imageUrl = url || "";
      app.pendingFile = null;
      return window.STLLocalApi.post(app.endpoint, { image_url: app.imageUrl });
    }).then(function (res) {
      if (!res || !res.ok) {
        throw new Error((res && res.data && res.data.error) || (app.title + " save failed."));
      }
      app.imageUrl = (res.data && res.data.image_url) || app.imageUrl;
      app.dirty = false;
      var file = el("file-" + id);
      if (file) file.value = "";
      paint(id);
    });
  }

  function saveAll() {
    if (saving || !anyDirty()) return;
    if (!window.STLLocalApi) {
      showMsg("Studio cannot reach the apps yet.", false);
      return;
    }
    saving = true;
    syncSaveButton();
    showMsg("Saving…", true);
    saveOne("haulpath").then(function () {
      return saveOne("pc4h");
    }).then(function () {
      saving = false;
      syncSaveButton();
      showMsg("Saved", true);
      setTimeout(function () { if (!anyDirty()) showMsg(""); }, 1200);
    }).catch(function (err) {
      saving = false;
      showMsg((err && err.message) || "Save failed.", false);
      syncSaveButton();
    });
  }

  function loadOne(id) {
    var app = apps[id];
    return window.STLLocalApi.get(app.endpoint).then(function (res) {
      if (!res || !res.ok) {
        throw new Error((res && res.data && res.data.error) || ("Could not load the " + app.title + " advertisement."));
      }
      app.imageUrl = (res.data && res.data.image_url) || "";
      app.dirty = false;
      paint(id);
    });
  }

  function load() {
    if (!window.STLLocalApi) {
      paint("haulpath");
      paint("pc4h");
      return;
    }
    var errors = [];
    var pending = 2;
    function done() {
      pending -= 1;
      if (pending > 0) return;
      syncSaveButton();
      if (errors.length) showMsg(errors.join(" "), false);
    }
    ["haulpath", "pc4h"].forEach(function (id) {
      loadOne(id).catch(function (err) {
        paint(id);
        errors.push((err && err.message) || ("Could not load the " + apps[id].title + " advertisement."));
      }).then(done);
    });
  }

  function bind(id) {
    var file = el("file-" + id);
    if (file) {
      file.addEventListener("change", function () {
        apps[id].pendingFile = file.files && file.files[0] ? file.files[0] : null;
        if (apps[id].pendingFile) markDirty(id);
        paint(id);
      });
    }
    var remove = el("remove-" + id);
    if (remove) {
      remove.addEventListener("click", function () {
        apps[id].pendingFile = null;
        apps[id].imageUrl = "";
        var input = el("file-" + id);
        if (input) input.value = "";
        markDirty(id);
        paint(id);
      });
    }
  }

  window.STLHaulPathAd = {
    mount: function (host, client) {
      root = host;
      db = client;
      userId = null;
      saving = false;
      apps.haulpath.pendingFile = null;
      apps.pc4h.pendingFile = null;
      apps.haulpath.dirty = false;
      apps.pc4h.dirty = false;
      if (db && db.auth && db.auth.getUser) {
        db.auth.getUser().then(function (res) {
          userId = res && res.data && res.data.user && res.data.user.id;
        });
      }
      root.innerHTML = shell();
      bind("haulpath");
      bind("pc4h");
      syncSaveButton();
      load();
    },
    shown: function () { syncSaveButton(); },
    saveAll: saveAll,
    isDirty: function () { return anyDirty(); },
    usesGlobalSave: function () { return true; },
    unmount: function () { root = null; }
  };
})();

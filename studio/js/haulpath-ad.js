(function () {
  "use strict";

  var root = null;
  var db = null;
  var userId = null;
  var imageUrl = "";
  var pendingFile = null;
  var dirty = false;
  var saving = false;

  function el(name) {
    return root ? root.querySelector('[data-el="' + name + '"]') : null;
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
    btn.disabled = !dirty || saving;
    btn.textContent = saving ? "Saving…" : "Save";
  }

  function shell() {
    return (
      '<div class="ops-workspace">' +
        '<div class="ops-header">' +
          "<h1>Advertisement</h1>" +
          "<p>Each app has its own ad. The image in a section is what that app shows every time it opens, until the person taps Clear. Remove the image and save to turn that ad off.</p>" +
        "</div>" +
        '<p class="status" data-el="banner"></p>' +
        '<section class="ops-card" style="max-width:420px">' +
          "<h2>Haul Path</h2>" +
          "<h3>Current advertisement</h3>" +
          "<p class=\"sub\">Use a portrait photo, 1080 by 1920 pixels. Keep the words and logo in the middle. Leave the top 120 pixels and the bottom 240 pixels mostly empty so the phone notch and the Clear button do not cover them.</p>" +
          '<div data-el="preview" style="margin:12px 0;background:#0b1220;border-radius:16px;min-height:180px;display:flex;align-items:center;justify-content:center;overflow:hidden"></div>' +
          '<input data-el="file" type="file" accept="image/png,image/jpeg,image/webp" />' +
          '<div class="ops-actions" style="margin-top:12px">' +
            '<button class="btn" type="button" data-el="remove">Remove image</button>' +
          "</div>" +
        "</section>" +
      "</div>"
    );
  }

  function paint() {
    var box = el("preview");
    if (!box) return;
    if (pendingFile) {
      var reader = new FileReader();
      reader.onload = function () {
        box.innerHTML = '<img alt="" src="' + reader.result + '" style="width:100%;max-height:520px;object-fit:contain" />';
      };
      reader.readAsDataURL(pendingFile);
      return;
    }
    if (imageUrl) {
      box.innerHTML = '<img alt="" src="' + imageUrl.replace(/"/g, "") + '" style="width:100%;max-height:520px;object-fit:contain" />';
      return;
    }
    box.innerHTML = '<p class="sub">No advertisement yet.</p>';
  }

  function markDirty() {
    dirty = true;
    syncSaveButton();
    showMsg("Unsaved changes", true);
  }

  function upload() {
    if (!pendingFile) return Promise.resolve(imageUrl);
    if (!db || !db.storage) return Promise.reject(new Error("Not signed in."));
    if (!userId) return Promise.reject(new Error("Not signed in."));
    var ext = (String(pendingFile.name || "jpg").split(".").pop() || "jpg").toLowerCase();
    if (["png", "jpg", "jpeg", "webp"].indexOf(ext) < 0) ext = "jpg";
    var path = userId + "/haulpath-ad-" + Date.now() + "." + ext;
    return db.storage.from("announcement-images").upload(path, pendingFile, {
      upsert: false,
      contentType: pendingFile.type || "image/jpeg"
    }).then(function (up) {
      if (up && up.error) throw new Error(up.error.message || "Upload failed.");
      var pub = db.storage.from("announcement-images").getPublicUrl(path);
      var url = pub && pub.data && pub.data.publicUrl;
      if (!url) throw new Error("Could not get a public photo URL.");
      return url;
    });
  }

  function saveAll() {
    if (saving || !dirty) return;
    if (!window.STLLocalApi) {
      showMsg("Studio cannot reach Haul Path yet.", false);
      return;
    }
    saving = true;
    syncSaveButton();
    showMsg("Saving…", true);
    upload().then(function (url) {
      imageUrl = url || "";
      pendingFile = null;
      return window.STLLocalApi.post("/api/haulpath/ad", { image_url: imageUrl });
    }).then(function (res) {
      saving = false;
      if (!res || !res.ok) {
        showMsg((res && res.data && res.data.error) || "Save failed.", false);
        syncSaveButton();
        return;
      }
      imageUrl = (res.data && res.data.image_url) || imageUrl;
      dirty = false;
      var file = el("file");
      if (file) file.value = "";
      paint();
      syncSaveButton();
      showMsg("Saved", true);
      setTimeout(function () { if (!dirty) showMsg(""); }, 1200);
    }).catch(function (err) {
      saving = false;
      showMsg((err && err.message) || "Save failed.", false);
      syncSaveButton();
    });
  }

  function load() {
    if (!window.STLLocalApi) {
      paint();
      return;
    }
    window.STLLocalApi.get("/api/haulpath/ad").then(function (res) {
      if (!res || !res.ok) {
        showMsg((res && res.data && res.data.error) || "Could not load the advertisement.", false);
        paint();
        return;
      }
      imageUrl = (res.data && res.data.image_url) || "";
      dirty = false;
      paint();
      syncSaveButton();
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not load the advertisement.", false);
      paint();
    });
  }

  window.STLHaulPathAd = {
    mount: function (host, client) {
      root = host;
      db = client;
      userId = null;
      pendingFile = null;
      dirty = false;
      if (db && db.auth && db.auth.getUser) {
        db.auth.getUser().then(function (res) {
          userId = res && res.data && res.data.user && res.data.user.id;
        });
      }
      root.innerHTML = shell();
      var file = el("file");
      if (file) {
        file.addEventListener("change", function () {
          pendingFile = file.files && file.files[0] ? file.files[0] : null;
          if (pendingFile) markDirty();
          paint();
        });
      }
      var remove = el("remove");
      if (remove) {
        remove.addEventListener("click", function () {
          pendingFile = null;
          imageUrl = "";
          var input = el("file");
          if (input) input.value = "";
          markDirty();
          paint();
        });
      }
      syncSaveButton();
      load();
    },
    shown: function () { syncSaveButton(); },
    saveAll: saveAll,
    isDirty: function () { return dirty; },
    usesGlobalSave: function () { return true; },
    unmount: function () { root = null; }
  };
})();

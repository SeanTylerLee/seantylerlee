(function () {
  "use strict";

  var FALLBACK_APPS = [
    { id: "permit-path", name: "Permit Path" }
  ];
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var SCHEMA_HINT = "Run sql/018_notifications.sql and sql/022_notification_style.sql in Supabase.";
  var PP_SQL_HINT = "Run supabase_announcements.sql then supabase_announcements_style.sql in the Permit Path Supabase SQL Editor.";
  var PP_KEYS_HINT =
    "Add Permit Path URL + service_role key to secrets/permitpath_*.txt on this Mac, run sql/019_permitpath_announce.sql, then open Studio once while signed in.";
  var STYLE_SQL_HINT = "Run sql/022_notification_style.sql in Studio Supabase, then refresh.";
  var FONTS = [
    { id: "system", label: "System" },
    { id: "serif", label: "Serif" },
    { id: "rounded", label: "Rounded" }
  ];
  var SIZES = [
    { id: "small", label: "Small" },
    { id: "medium", label: "Medium" },
    { id: "large", label: "Large" },
    { id: "xlarge", label: "Extra large" }
  ];
  var COLOR_PRESETS = ["#555555", "#111111", "#1A2659", "#2966EB", "#CC1A1A", "#148F54"];

  var root = null;
  var db = null;
  var userId = null;
  var apps = FALLBACK_APPS.slice();
  var history = [];
  var selectedAppId = "permit-path";
  var subject = "";
  var message = "";
  var imageUrl = "";
  var imagePreview = "";
  var pendingFile = null;
  var messageFont = "system";
  var messageSize = "medium";
  var messageColor = "#555555";
  var sending = false;
  var deletingId = null;

  function el(name) { return root ? root.querySelector('[data-el="' + name + '"]') : null; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function trim(s) { return String(s == null ? "" : s).trim(); }
  function isUuid(v) { return UUID_RE.test(String(v || "")); }
  function schemaMissing(err) {
    return /does not exist|schema cache|Could not find the table/i.test((err && err.message) || "");
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

  function formatWhen(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try {
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    } catch (e) {
      return d.toLocaleString();
    }
  }

  function fontCss(id) {
    if (id === "serif") return 'Georgia, "Times New Roman", serif';
    if (id === "rounded") return 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", sans-serif';
    return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  }
  function sizePx(id) {
    if (id === "small") return "14px";
    if (id === "large") return "20px";
    if (id === "xlarge") return "24px";
    return "16px";
  }

  function shell() {
    return (
      '<div class="ops-workspace">' +
        '<div class="ops-header">' +
          "<h1>Notifications</h1>" +
          "<p>Send a message to Permit Path. Users see it the next time they open the app and must clear it to continue.</p>" +
        "</div>" +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="ops-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function selectedApp() {
    return apps.filter(function (a) { return a.id === selectedAppId; })[0] || null;
  }

  function isPermitPathApp(app) {
    if (!app) return false;
    if (app.id === "permit-path") return true;
    return /permit\s*path/i.test(app.name || "");
  }

  function harvest() {
    var appSel = el("app");
    var subjectEl = el("subject");
    var messageEl = el("message");
    var fontEl = el("font");
    var sizeEl = el("size");
    var colorEl = el("color");
    if (appSel) selectedAppId = appSel.value || selectedAppId;
    if (subjectEl) subject = subjectEl.value;
    if (messageEl) message = messageEl.value;
    if (fontEl) messageFont = fontEl.value || "system";
    if (sizeEl) messageSize = sizeEl.value || "medium";
    if (colorEl) messageColor = colorEl.value || "#555555";
  }

  function optionsHtml(list, selected) {
    return list.map(function (item) {
      return '<option value="' + esc(item.id) + '"' + (item.id === selected ? " selected" : "") + ">" +
        esc(item.label) + "</option>";
    }).join("");
  }

  function historyHtml() {
    var html =
      '<div class="ops-card">' +
        "<h3>Sent</h3>" +
        '<p class="sub">Newest first. Saved in Studio; Permit Path users see uncleared messages on open.</p>';

    if (!history.length) {
      html += '<p class="sub">No notifications sent yet.</p></div>';
      return html;
    }

    history.forEach(function (item) {
      var busy = deletingId && item.id === deletingId;
      html +=
        '<div class="ops-card" style="background:rgba(60,60,67,.05);box-shadow:none;margin-bottom:8px">' +
          '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">' +
            "<div>" +
              "<strong style=\"font-size:13px\">" + esc(item.subject || "(No subject)") + "</strong>" +
              '<span class="sub" style="display:block;margin:2px 0 0">' +
                esc(item.app_name || "App") + " · " + esc(formatWhen(item.created_at)) +
              "</span>" +
            "</div>" +
            '<button class="btn" type="button" data-el="delete" data-id="' + esc(item.id) + '"' +
              (busy || sending ? " disabled" : "") +
              ' style="flex-shrink:0;background:#fff;border:1px solid rgba(242,69,69,.35);color:#CC1A1A">' +
              (busy ? "Deleting…" : "Delete") +
            "</button>" +
          "</div>";
      if (item.image_url) {
        html += '<img src="' + esc(item.image_url) + '" alt="" style="display:block;width:100%;max-height:160px;object-fit:cover;border-radius:10px;margin:10px 0 0" />';
      }
      html +=
          '<p style="margin:10px 0 0;line-height:1.45;white-space:pre-wrap;font-family:' +
            fontCss(item.message_font) + ";font-size:" + sizePx(item.message_size) + ";color:" +
            esc(item.message_color || "#555555") + '">' + esc(item.message || "") + "</p>" +
        "</div>";
    });

    html += "</div>";
    return html;
  }

  function photoHtml() {
    var src = imagePreview || imageUrl;
    if (!src) {
      return (
        '<div class="ops-field"><label>Photo (optional)</label>' +
          '<input data-el="photo" type="file" accept="image/*" />' +
          '<p class="sub">Shown at the top of the card in Permit Path.</p>' +
        "</div>"
      );
    }
    return (
      '<div class="ops-field"><label>Photo</label>' +
        '<img src="' + esc(src) + '" alt="" style="display:block;width:100%;max-height:180px;object-fit:cover;border-radius:12px;margin:0 0 8px" />' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<input data-el="photo" type="file" accept="image/*" />' +
          '<button class="btn" type="button" data-el="clear-photo">Remove photo</button>' +
        "</div>" +
      "</div>"
    );
  }

  function bindCompose() {
    var appSel = el("app");
    var subjectEl = el("subject");
    var messageEl = el("message");
    var fontEl = el("font");
    var sizeEl = el("size");
    var colorEl = el("color");
    var sendBtn = el("send");
    var photoEl = el("photo");
    var clearPhoto = el("clear-photo");

    if (appSel) appSel.onchange = function () { harvest(); };
    if (subjectEl) subjectEl.oninput = function () { harvest(); };
    if (messageEl) messageEl.oninput = function () { harvest(); };
    if (fontEl) fontEl.onchange = function () { harvest(); };
    if (sizeEl) sizeEl.onchange = function () { harvest(); };
    if (colorEl) colorEl.oninput = function () { harvest(); };
    if (photoEl) photoEl.onchange = onPickPhoto;
    if (clearPhoto) clearPhoto.onclick = function () {
      pendingFile = null;
      imageUrl = "";
      imagePreview = "";
      render();
    };
    if (sendBtn) {
      sendBtn.disabled = sending || !!deletingId;
      sendBtn.textContent = sending ? "Sending…" : "Send notification";
      sendBtn.onclick = sendNotification;
    }

    var swatches = root ? root.querySelectorAll("[data-swatch]") : [];
    for (var s = 0; s < swatches.length; s++) {
      swatches[s].onclick = function (ev) {
        messageColor = ev.currentTarget.getAttribute("data-swatch") || "#555555";
        render();
      };
    }

    var deleteBtns = root ? root.querySelectorAll('[data-el="delete"]') : [];
    for (var i = 0; i < deleteBtns.length; i++) {
      deleteBtns[i].onclick = function (ev) {
        var id = ev.currentTarget.getAttribute("data-id");
        deleteNotification(id);
      };
    }
  }

  function onPickPhoto(ev) {
    var file = ev.target && ev.target.files && ev.target.files[0];
    if (!file) return;
    if (!/^image\//i.test(file.type || "") && !/\.(png|jpe?g|webp|heic)$/i.test(file.name || "")) {
      return showMsg("Use a PNG, JPEG, or WebP photo.", false);
    }
    var ready = window.STLImageCompress && window.STLImageCompress.file
      ? window.STLImageCompress.file(file)
      : Promise.resolve(file);
    ready.then(function (out) {
      pendingFile = out || file;
      if (imagePreview) try { URL.revokeObjectURL(imagePreview); } catch (e) { /* ignore */ }
      imagePreview = URL.createObjectURL(pendingFile);
      imageUrl = "";
      render();
    });
  }

  function render() {
    var body = el("body");
    if (!body) return;

    var options = apps.map(function (app) {
      return '<option value="' + esc(app.id) + '"' + (app.id === selectedAppId ? " selected" : "") + ">" + esc(app.name || "App") + "</option>";
    }).join("");

    var swatchHtml = COLOR_PRESETS.map(function (hex) {
      var on = hex.toLowerCase() === String(messageColor || "").toLowerCase();
      return '<button type="button" data-swatch="' + hex + '" title="' + hex + '" style="width:22px;height:22px;border-radius:50%;border:' +
        (on ? "2px solid #111" : "1px solid rgba(0,0,0,.2)") + ";background:" + hex + ';padding:0;cursor:pointer"></button>';
    }).join("");

    body.innerHTML =
      '<div class="ops-card">' +
        "<h3>Compose</h3>" +
        '<p class="sub">Photo optional. Font, size, and color apply to the message users see under the photo.</p>' +
        '<div class="ops-field"><label>App</label><select data-el="app">' + options + "</select></div>" +
        '<div class="ops-field"><label>Subject</label><input data-el="subject" type="text" maxlength="120" placeholder="Short title users will see" value="' + esc(subject) + '" /></div>' +
        photoHtml() +
        '<div class="ops-field"><label>Message</label><textarea data-el="message" rows="8" maxlength="2000" placeholder="Notification body">' + esc(message) + "</textarea></div>" +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">' +
          '<div class="ops-field"><label>Font</label><select data-el="font">' + optionsHtml(FONTS, messageFont) + "</select></div>" +
          '<div class="ops-field"><label>Size</label><select data-el="size">' + optionsHtml(SIZES, messageSize) + "</select></div>" +
          '<div class="ops-field"><label>Color</label>' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
              '<input data-el="color" type="color" value="' + esc(messageColor || "#555555") + '" style="width:42px;height:32px;padding:0;border:none;background:transparent" />' +
              swatchHtml +
            "</div>" +
          "</div>" +
        "</div>" +
        '<div class="ops-actions">' +
          '<button class="btn btn-primary" type="button" data-el="send"' + (sending ? " disabled" : "") + ">" +
            (sending ? "Sending…" : "Send notification") +
          "</button>" +
        "</div>" +
      "</div>" +
      historyHtml();

    bindCompose();
  }

  function preferPermitPath(list) {
    var match = list.filter(function (a) {
      return /permit\s*path/i.test(a.name || "");
    })[0];
    if (match) selectedAppId = match.id;
    else if (list.length && !list.some(function (a) { return a.id === selectedAppId; })) {
      selectedAppId = list[0].id;
    }
  }

  function publishErrorMessage(err) {
    var msg = (err && err.message) || String(err || "Publish failed.");
    if (/permitpath_|service_role|keys missing|permitpath_supabase/i.test(msg)) return PP_KEYS_HINT;
    if (/image_url|message_font|022_notification/i.test(msg)) return STYLE_SQL_HINT;
    if (/app_announcements|supabase_announcements|table missing|schema cache/i.test(msg)) return PP_SQL_HINT;
    return msg;
  }

  function uploadPhoto() {
    if (!pendingFile) return Promise.resolve(trim(imageUrl));
    if (!db || !db.storage) return Promise.reject(new Error(STYLE_SQL_HINT));
    if (!userId) return Promise.reject(new Error("Not signed in."));
    var ext = (String(pendingFile.name || "jpg").split(".").pop() || "jpg").toLowerCase();
    if (["png", "jpg", "jpeg", "webp"].indexOf(ext) < 0) ext = "jpg";
    var path = userId + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
    return db.storage.from("announcement-images").upload(path, pendingFile, {
      upsert: false,
      contentType: pendingFile.type || "image/jpeg"
    }).then(function (up) {
      if (up && up.error) {
        var m = up.error.message || "";
        throw new Error(/bucket|not found|row-level|policy/i.test(m) ? STYLE_SQL_HINT : m);
      }
      var pub = db.storage.from("announcement-images").getPublicUrl(path);
      var url = pub && pub.data && pub.data.publicUrl;
      if (!url) throw new Error("Could not get a public photo URL.");
      return url;
    });
  }

  function publishToPermitPath(row, studioId) {
    if (!window.STLLocalApi || typeof window.STLLocalApi.post !== "function") {
      return Promise.reject(new Error(PP_KEYS_HINT));
    }
    return window.STLLocalApi.post("/api/announcements/publish", {
      subject: row.subject,
      message: row.message,
      image_url: row.image_url || "",
      message_font: row.message_font || "system",
      message_size: row.message_size || "medium",
      message_color: row.message_color || "",
      studio_notification_id: studioId || null
    }).then(function (res) {
      if (!res.ok) {
        var errMsg = (res.data && (res.data.error || res.data.message)) || ("Publish failed (" + res.status + ")");
        throw new Error(errMsg);
      }
      return res.data;
    });
  }

  function deleteFromPermitPath(studioId) {
    if (!window.STLLocalApi || typeof window.STLLocalApi.post !== "function") {
      return Promise.reject(new Error(PP_KEYS_HINT));
    }
    return window.STLLocalApi.post("/api/announcements/delete", {
      studio_notification_id: studioId
    }).then(function (res) {
      if (!res.ok) {
        var errMsg = (res.data && (res.data.error || res.data.message)) || ("Delete failed (" + res.status + ")");
        throw new Error(errMsg);
      }
      return res.data;
    });
  }

  function deleteNotification(id) {
    if (!id || deletingId || sending) return;
    if (!db || !db.from) return showMsg("Not signed in.", false);
    var item = history.filter(function (h) { return h.id === id; })[0];
    var label = item && item.subject ? item.subject : "this notification";
    if (!window.confirm('Delete "' + label + '"?\n\nIt will be removed from Studio and from Permit Path so users no longer see it.')) {
      return;
    }

    deletingId = id;
    render();
    showMsg("Deleting…", true);

    deleteFromPermitPath(id).then(function () {
      return db.from("app_notifications").delete().eq("id", id).then(function (res) {
        if (res.error) throw res.error;
        history = history.filter(function (h) { return h.id !== id; });
        deletingId = null;
        render();
        showMsg("Deleted. Permit Path users will no longer see this message.", true);
      });
    }).catch(function (err) {
      deletingId = null;
      render();
      showMsg(schemaMissing(err) ? SCHEMA_HINT : publishErrorMessage(err), false);
    });
  }

  function resetCompose() {
    subject = "";
    message = "";
    imageUrl = "";
    imagePreview = "";
    pendingFile = null;
    messageFont = "system";
    messageSize = "medium";
    messageColor = "#555555";
  }

  function sendNotification() {
    harvest();
    var app = selectedApp();
    if (!app) return showMsg("Select an app.", false);
    if (!isPermitPathApp(app)) {
      return showMsg("Delivery is only wired for Permit Path right now. Select Permit Path.", false);
    }
    if (!trim(subject)) return showMsg("Add a subject.", false);
    if (!trim(message)) return showMsg("Add a message.", false);
    if (!db || !db.from) return showMsg("Not signed in.", false);
    if (sending) return;

    sending = true;
    render();
    showMsg("Saving and sending to Permit Path…", true);

    uploadPhoto().then(function (url) {
      var row = {
        app_id: isUuid(app.id) ? app.id : null,
        app_name: app.name || "App",
        subject: trim(subject),
        message: trim(message),
        image_url: url || "",
        message_font: messageFont || "system",
        message_size: messageSize || "medium",
        message_color: messageColor || ""
      };
      return db.from("app_notifications").insert(row).select("*").single().then(function (res) {
        if (res.error) throw res.error;
        var saved = res.data;
        history = [saved].concat(history);
        return publishToPermitPath(row, saved && saved.id);
      });
    }).then(function () {
      sending = false;
      resetCompose();
      render();
      showMsg("Sent to Permit Path. Users will see it the next time they open the app.", true);
    }).catch(function (err) {
      sending = false;
      render();
      var msg = (err && err.message) || "Could not save notification.";
      if (/image_url|message_font|column/i.test(msg)) showMsg(STYLE_SQL_HINT, false);
      else showMsg(schemaMissing(err) ? SCHEMA_HINT : publishErrorMessage(err), false);
    });
  }

  function load() {
    showMsg("Loading…", true);
    if (!db || !db.from) {
      apps = FALLBACK_APPS.slice();
      history = [];
      preferPermitPath(apps);
      showMsg("");
      render();
      return;
    }

    var userReady = db.auth && db.auth.getUser
      ? db.auth.getUser().then(function (res) {
          userId = res && res.data && res.data.user && res.data.user.id;
        })
      : Promise.resolve();

    userReady.then(function () {
      return Promise.all([
        db.from("managed_apps").select("id,name").order("name"),
        db.from("app_notifications").select("*").order("created_at", { ascending: false })
      ]);
    }).then(function (pair) {
      var appsRes = pair[0];
      var histRes = pair[1];

      if (appsRes.error || !(appsRes.data || []).length) {
        apps = FALLBACK_APPS.slice();
      } else {
        apps = (appsRes.data || []).map(function (a) {
          return { id: a.id, name: a.name || "App" };
        });
      }
      preferPermitPath(apps);

      if (histRes.error) {
        history = [];
        render();
        showMsg(schemaMissing(histRes.error) ? SCHEMA_HINT : histRes.error.message, false);
        return;
      }
      history = histRes.data || [];
      showMsg("");
      render();
    }).catch(function (err) {
      apps = FALLBACK_APPS.slice();
      history = [];
      preferPermitPath(apps);
      render();
      showMsg((err && err.message) || "Could not load notifications.", false);
    });
  }

  window.STLNotifications = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      userId = null;
      resetCompose();
      sending = false;
      deletingId = null;
      history = [];
      selectedAppId = "permit-path";
      apps = FALLBACK_APPS.slice();
      panel.classList.add("ops-wide");
      panel.innerHTML = shell();
      hideSave();
      load();
    },
    unmount: function (panel) {
      hideSave();
      if (panel) panel.classList.remove("ops-wide");
      root = null;
    }
  };
})();

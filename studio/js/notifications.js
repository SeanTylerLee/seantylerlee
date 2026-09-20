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
  var STYLE_SQL_HINT = "Run sql/022_notification_style.sql (and sql/023_notification_blocks.sql if you already ran 022) in Studio Supabase, then refresh.";
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
  var lines = [blankLine()];
  var selectedLine = 0;
  var imageUrl = "";
  var imagePreview = "";
  var pendingFile = null;
  var sending = false;
  var deletingId = null;

  function blankLine() {
    return { text: "", font: "system", size: "medium", color: "#555555" };
  }
  function el(name) { return root ? root.querySelector('[data-el="' + name + '"]') : null; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function trim(s) { return String(s == null ? "" : s).trim(); }
  function isUuid(v) { return UUID_RE.test(String(v || "")); }
  function schemaMissing(err) {
    return /does not exist|schema cache|Could not find the table/i.test((err && err.message) || "");
  }
  function currentLine() {
    if (!lines[selectedLine]) selectedLine = 0;
    if (!lines.length) lines = [blankLine()];
    return lines[selectedLine];
  }
  function plainMessage() {
    return lines.map(function (ln) { return ln.text || ""; }).join("\n").replace(/\s+$/, "");
  }
  function styleBlocks() {
    return lines.map(function (ln) {
      return {
        text: ln.text || "",
        font: ln.font || "system",
        size: ln.size || "medium",
        color: ln.color || "#555555"
      };
    });
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
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit"
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
  function optionsHtml(list, selected) {
    return list.map(function (item) {
      return '<option value="' + esc(item.id) + '"' + (item.id === selected ? " selected" : "") + ">" +
        esc(item.label) + "</option>";
    }).join("");
  }

  function shell() {
    return (
      '<div class="ops-workspace">' +
        '<div class="ops-header">' +
          "<h1>Notifications</h1>" +
          "<p>Send a message to Permit Path. The card on the right is what users see on their phones.</p>" +
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

  function harvestMeta() {
    var appSel = el("app");
    var subjectEl = el("subject");
    if (appSel) selectedAppId = appSel.value || selectedAppId;
    if (subjectEl) subject = subjectEl.value;
  }

  function harvestLinesFromDom() {
    var inputs = root ? root.querySelectorAll("[data-line]") : [];
    for (var i = 0; i < inputs.length; i++) {
      var idx = parseInt(inputs[i].getAttribute("data-line"), 10);
      if (!isNaN(idx) && lines[idx]) lines[idx].text = inputs[i].value;
    }
  }

  function photoStatusHtml() {
    var has = !!(pendingFile || imageUrl || imagePreview);
    return (
      '<div class="ops-field"><label>Photo (optional)</label>' +
        (has
          ? '<p class="sub" style="margin:0 0 8px">Photo added. See the phone preview on the right.</p>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
              '<input data-el="photo" type="file" accept="image/*" />' +
              '<button class="btn" type="button" data-el="clear-photo">Remove photo</button>' +
            "</div>"
          : '<input data-el="photo" type="file" accept="image/*" />' +
            '<p class="sub">Shown at the top of the card. It only appears in the phone preview.</p>') +
      "</div>"
    );
  }

  function lineInputsHtml() {
    return lines.map(function (ln, i) {
      var on = i === selectedLine;
      return (
        '<div style="display:flex;gap:8px;align-items:flex-start;margin:0 0 8px">' +
          '<input data-line="' + i + '" type="text" maxlength="400" placeholder="Line ' + (i + 1) + '"' +
            ' value="' + esc(ln.text || "") + '"' +
            ' style="flex:1;padding:8px 10px;border-radius:8px;border:2px solid ' +
            (on ? "#2966EB" : "rgba(60,60,67,.18)") + ";font-family:" + fontCss(ln.font) +
            ";font-size:" + sizePx(ln.size) + ";color:" + esc(ln.color || "#555555") + '" />' +
          (lines.length > 1
            ? '<button class="btn" type="button" data-remove-line="' + i + '" style="flex-shrink:0">×</button>'
            : "") +
        "</div>"
      );
    }).join("");
  }

  function phonePreviewHtml() {
    var photoSrc = imagePreview || imageUrl;
    var blocks = "";
    var anyText = false;
    lines.forEach(function (ln) {
      var t = ln.text || "";
      if (trim(t)) anyText = true;
      blocks +=
        '<div style="white-space:pre-wrap;line-height:1.4;margin:0 0 4px;font-family:' +
        fontCss(ln.font) + ";font-size:" + sizePx(ln.size) + ";color:" +
        esc(ln.color || "#555555") + '">' + (t ? esc(t) : "&nbsp;") + "</div>";
    });
    if (!anyText) {
      blocks = '<div style="color:#8f8f93;font-size:16px">Your message will show here.</div>';
    }
    return (
      '<div style="width:100%;max-width:340px;margin:0 auto;background:linear-gradient(180deg,#1A2659,#0D1433);border-radius:36px;padding:16px 14px 22px;box-shadow:0 18px 40px rgba(0,0,0,.28)">' +
        '<div style="width:72px;height:5px;background:rgba(255,255,255,.25);border-radius:99px;margin:4px auto 18px"></div>' +
        '<div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 10px 24px rgba(0,0,0,.22)">' +
          (photoSrc
            ? '<img src="' + esc(photoSrc) + '" alt="" style="display:block;width:100%;height:180px;object-fit:cover" />'
            : "") +
          '<div style="padding:24px">' +
            '<div style="font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:#2966EB">Message From Permit Path</div>' +
            '<div style="margin-top:12px;font-size:22px;font-weight:700;color:#111;line-height:1.25">' +
              esc(trim(subject) || "Announcement") +
            "</div>" +
            '<div style="margin-top:12px;max-height:220px;overflow:auto">' + blocks + "</div>" +
          "</div>" +
        "</div>" +
        '<div style="margin-top:16px;background:#2966EB;color:#fff;text-align:center;font-weight:700;padding:14px 12px;border-radius:12px">Clear</div>' +
      "</div>"
    );
  }

  function historyHtml() {
    var html =
      '<div class="ops-card" style="margin-top:18px">' +
        "<h3>Sent</h3>" +
        '<p class="sub">Newest first. Delete removes it from Studio and from Permit Path, including for users who have not opened it yet.</p>';
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
          "</div>" +
          '<p style="margin:10px 0 0;font-size:13px;line-height:1.45;white-space:pre-wrap">' +
            esc(item.message || "") + "</p>" +
        "</div>";
    });
    html += "</div>";
    return html;
  }

  function styleControlsHtml() {
    var ln = currentLine();
    var swatchHtml = COLOR_PRESETS.map(function (hex) {
      var on = hex.toLowerCase() === String(ln.color || "").toLowerCase();
      return '<button type="button" data-swatch="' + hex + '" title="' + hex + '" style="width:22px;height:22px;border-radius:50%;border:' +
        (on ? "2px solid #111" : "1px solid rgba(0,0,0,.2)") + ";background:" + hex + ';padding:0;cursor:pointer"></button>';
    }).join("");
    return (
      '<p class="sub" style="margin:0 0 8px">Click a line, then set font, size, and color for that line only.</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">' +
        '<div class="ops-field"><label>Font</label><select data-el="font">' + optionsHtml(FONTS, ln.font || "system") + "</select></div>" +
        '<div class="ops-field"><label>Size</label><select data-el="size">' + optionsHtml(SIZES, ln.size || "medium") + "</select></div>" +
        '<div class="ops-field"><label>Color</label>' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<input data-el="color" type="color" value="' + esc(ln.color || "#555555") + '" style="width:42px;height:32px;padding:0;border:none;background:transparent" />' +
            swatchHtml +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function updatePreview() {
    var box = el("preview");
    if (box) box.innerHTML = phonePreviewHtml();
  }

  function refreshLineChrome() {
    var styleBox = el("line-style");
    if (styleBox) {
      styleBox.innerHTML = styleControlsHtml();
      bindStyleControls();
    }
    var inputs = root ? root.querySelectorAll("[data-line]") : [];
    for (var i = 0; i < inputs.length; i++) {
      var idx = parseInt(inputs[i].getAttribute("data-line"), 10);
      var ln = lines[idx] || blankLine();
      var on = idx === selectedLine;
      inputs[i].style.border = "2px solid " + (on ? "#2966EB" : "rgba(60,60,67,.18)");
      inputs[i].style.fontFamily = fontCss(ln.font);
      inputs[i].style.fontSize = sizePx(ln.size);
      inputs[i].style.color = ln.color || "#555555";
    }
    updatePreview();
  }

  function applyStyleToSelected(patch) {
    var ln = currentLine();
    if (patch.font) ln.font = patch.font;
    if (patch.size) ln.size = patch.size;
    if (patch.color) ln.color = patch.color;
    refreshLineChrome();
  }

  function bindStyleControls() {
    var fontEl = el("font");
    var sizeEl = el("size");
    var colorEl = el("color");
    if (fontEl) fontEl.onchange = function () { applyStyleToSelected({ font: fontEl.value }); };
    if (sizeEl) sizeEl.onchange = function () { applyStyleToSelected({ size: sizeEl.value }); };
    if (colorEl) colorEl.oninput = function () { applyStyleToSelected({ color: colorEl.value }); };
    var swatches = root ? root.querySelectorAll("[data-swatch]") : [];
    for (var s = 0; s < swatches.length; s++) {
      swatches[s].onclick = function (ev) {
        applyStyleToSelected({ color: ev.currentTarget.getAttribute("data-swatch") || "#555555" });
      };
    }
  }

  function bindLines() {
    var inputs = root ? root.querySelectorAll("[data-line]") : [];
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].onfocus = function (ev) {
        selectedLine = parseInt(ev.currentTarget.getAttribute("data-line"), 10) || 0;
        refreshLineChrome();
      };
      inputs[i].oninput = function (ev) {
        var idx = parseInt(ev.currentTarget.getAttribute("data-line"), 10);
        if (!isNaN(idx) && lines[idx]) lines[idx].text = ev.currentTarget.value;
        selectedLine = idx;
        updatePreview();
      };
      inputs[i].onkeydown = function (ev) {
        var idx = parseInt(ev.currentTarget.getAttribute("data-line"), 10);
        if (ev.key === "Enter") {
          ev.preventDefault();
          harvestLinesFromDom();
          var copy = currentLine();
          lines.splice(idx + 1, 0, {
            text: "",
            font: copy.font,
            size: copy.size,
            color: copy.color
          });
          selectedLine = idx + 1;
          render();
          var next = root && root.querySelector('[data-line="' + selectedLine + '"]');
          if (next) next.focus();
        } else if (ev.key === "Backspace" && !(ev.currentTarget.value || "") && lines.length > 1) {
          ev.preventDefault();
          harvestLinesFromDom();
          lines.splice(idx, 1);
          selectedLine = Math.max(0, idx - 1);
          render();
          var prev = root && root.querySelector('[data-line="' + selectedLine + '"]');
          if (prev) prev.focus();
        }
      };
    }
    var removes = root ? root.querySelectorAll("[data-remove-line]") : [];
    for (var r = 0; r < removes.length; r++) {
      removes[r].onclick = function (ev) {
        var idx = parseInt(ev.currentTarget.getAttribute("data-remove-line"), 10);
        harvestLinesFromDom();
        if (lines.length < 2) return;
        lines.splice(idx, 1);
        selectedLine = Math.min(selectedLine, lines.length - 1);
        render();
      };
    }
  }

  function bindCompose() {
    var appSel = el("app");
    var subjectEl = el("subject");
    var sendBtn = el("send");
    var photoEl = el("photo");
    var clearPhoto = el("clear-photo");
    var addLine = el("add-line");
    if (appSel) appSel.onchange = function () { harvestMeta(); };
    if (subjectEl) {
      subjectEl.oninput = function () { harvestMeta(); updatePreview(); };
    }
    if (photoEl) photoEl.onchange = onPickPhoto;
    if (clearPhoto) clearPhoto.onclick = function () {
      pendingFile = null;
      imageUrl = "";
      if (imagePreview) try { URL.revokeObjectURL(imagePreview); } catch (e) { /* ignore */ }
      imagePreview = "";
      render();
    };
    if (addLine) addLine.onclick = function () {
      harvestLinesFromDom();
      var copy = currentLine();
      lines.push({ text: "", font: copy.font, size: copy.size, color: copy.color });
      selectedLine = lines.length - 1;
      render();
      var next = root && root.querySelector('[data-line="' + selectedLine + '"]');
      if (next) next.focus();
    };
    if (sendBtn) {
      sendBtn.disabled = sending || !!deletingId;
      sendBtn.textContent = sending ? "Sending…" : "Send notification";
      sendBtn.onclick = sendNotification;
    }
    bindStyleControls();
    bindLines();
    var deleteBtns = root ? root.querySelectorAll('[data-el="delete"]') : [];
    for (var i = 0; i < deleteBtns.length; i++) {
      deleteBtns[i].onclick = function (ev) {
        deleteNotification(ev.currentTarget.getAttribute("data-id"));
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
      return '<option value="' + esc(app.id) + '"' + (app.id === selectedAppId ? " selected" : "") + ">" +
        esc(app.name || "App") + "</option>";
    }).join("");

    body.innerHTML =
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:24px;align-items:start">' +
        '<div>' +
          '<div class="ops-card">' +
            "<h3>Compose</h3>" +
            '<p class="sub">Each line can have its own font, size, and color. Click a line to style it.</p>' +
            '<div class="ops-field"><label>App</label><select data-el="app">' + options + "</select></div>" +
            '<div class="ops-field"><label>Subject</label><input data-el="subject" type="text" maxlength="120" placeholder="Short title users will see" value="' + esc(subject) + '" /></div>' +
            photoStatusHtml() +
            '<div class="ops-field"><label>Message lines</label>' +
              '<div data-el="lines">' + lineInputsHtml() + "</div>" +
              '<button class="btn" type="button" data-el="add-line" style="margin-top:4px">Add line</button>' +
            "</div>" +
            '<div data-el="line-style">' + styleControlsHtml() + "</div>" +
            '<div class="ops-actions">' +
              '<button class="btn btn-primary" type="button" data-el="send"' + (sending ? " disabled" : "") + ">" +
                (sending ? "Sending…" : "Send notification") +
              "</button>" +
            "</div>" +
          "</div>" +
          historyHtml() +
        "</div>" +
        '<div>' +
          '<div class="ops-card" style="position:sticky;top:16px">' +
            "<h3>Phone preview</h3>" +
            '<p class="sub">This is the card users see in Permit Path.</p>' +
            '<div data-el="preview">' + phonePreviewHtml() + "</div>" +
          "</div>" +
        "</div>" +
      "</div>";
    bindCompose();
  }

  function preferPermitPath(list) {
    var match = list.filter(function (a) { return /permit\s*path/i.test(a.name || ""); })[0];
    if (match) selectedAppId = match.id;
    else if (list.length && !list.some(function (a) { return a.id === selectedAppId; })) {
      selectedAppId = list[0].id;
    }
  }

  function publishErrorMessage(err) {
    var msg = (err && err.message) || String(err || "Publish failed.");
    if (/permitpath_|service_role|keys missing|permitpath_supabase/i.test(msg)) return PP_KEYS_HINT;
    if (/image_url|message_font|message_blocks|022_notification|023_notification/i.test(msg)) return STYLE_SQL_HINT;
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
      message_blocks: row.message_blocks || [],
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
    if (!window.confirm('Delete "' + label + '"?\n\nIt will be removed from Studio and from Permit Path. Users who have not opened it yet will not see it.')) {
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
        showMsg("Deleted. Users who have not opened the app yet will not see this message.", true);
      });
    }).catch(function (err) {
      deletingId = null;
      render();
      showMsg(schemaMissing(err) ? SCHEMA_HINT : publishErrorMessage(err), false);
    });
  }

  function resetCompose() {
    subject = "";
    lines = [blankLine()];
    selectedLine = 0;
    imageUrl = "";
    if (imagePreview) try { URL.revokeObjectURL(imagePreview); } catch (e) { /* ignore */ }
    imagePreview = "";
    pendingFile = null;
  }

  function sendNotification() {
    harvestMeta();
    harvestLinesFromDom();
    var app = selectedApp();
    if (!app) return showMsg("Select an app.", false);
    if (!isPermitPathApp(app)) {
      return showMsg("Delivery is only wired for Permit Path right now. Select Permit Path.", false);
    }
    if (!trim(subject)) return showMsg("Add a subject.", false);
    var message = plainMessage();
    if (!trim(message)) return showMsg("Add a message.", false);
    if (!db || !db.from) return showMsg("Not signed in.", false);
    if (sending) return;

    var first = lines.filter(function (ln) { return trim(ln.text); })[0] || currentLine();
    sending = true;
    render();
    showMsg("Saving and sending to Permit Path…", true);

    uploadPhoto().then(function (url) {
      var row = {
        app_id: isUuid(app.id) ? app.id : null,
        app_name: app.name || "App",
        subject: trim(subject),
        message: message,
        image_url: url || "",
        message_font: first.font || "system",
        message_size: first.size || "medium",
        message_color: first.color || "",
        message_blocks: styleBlocks()
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
      if (/image_url|message_font|message_blocks|column/i.test(msg)) showMsg(STYLE_SQL_HINT, false);
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

(function () {
  "use strict";

  var FALLBACK_APPS = [
    { id: "permit-path", name: "Permit Path" }
  ];
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var SCHEMA_HINT = "Run sql/018_notifications.sql in Supabase.";
  var PP_SQL_HINT = "Run supabase_announcements.sql in the Permit Path Supabase SQL Editor.";
  var PP_KEYS_HINT =
    "Add Permit Path URL + service_role key to secrets/permitpath_*.txt on this Mac, run sql/019_permitpath_announce.sql, then open Studio once while signed in.";

  var root = null;
  var db = null;
  var apps = FALLBACK_APPS.slice();
  var history = [];
  var selectedAppId = "permit-path";
  var subject = "";
  var message = "";
  var sending = false;

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
    if (appSel) selectedAppId = appSel.value || selectedAppId;
    if (subjectEl) subject = subjectEl.value;
    if (messageEl) message = messageEl.value;
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
      html +=
        '<div class="ops-card" style="background:rgba(60,60,67,.05);box-shadow:none;margin-bottom:8px">' +
          '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">' +
            "<div>" +
              "<strong style=\"font-size:13px\">" + esc(item.subject || "(No subject)") + "</strong>" +
              '<span class="sub" style="display:block;margin:2px 0 0">' +
                esc(item.app_name || "App") + " · " + esc(formatWhen(item.created_at)) +
              "</span>" +
            "</div>" +
          "</div>" +
          '<p style="margin:10px 0 0;font-size:13px;line-height:1.45;white-space:pre-wrap">' + esc(item.message || "") + "</p>" +
        "</div>";
    });

    html += "</div>";
    return html;
  }

  function bindCompose() {
    var appSel = el("app");
    var subjectEl = el("subject");
    var messageEl = el("message");
    var sendBtn = el("send");

    if (appSel) appSel.onchange = function () { harvest(); };
    if (subjectEl) subjectEl.oninput = function () { harvest(); };
    if (messageEl) messageEl.oninput = function () { harvest(); };
    if (sendBtn) {
      sendBtn.disabled = sending;
      sendBtn.textContent = sending ? "Sending…" : "Send notification";
      sendBtn.onclick = sendNotification;
    }
  }

  function render() {
    var body = el("body");
    if (!body) return;

    var options = apps.map(function (app) {
      return '<option value="' + esc(app.id) + '"' + (app.id === selectedAppId ? " selected" : "") + ">" + esc(app.name || "App") + "</option>";
    }).join("");

    body.innerHTML =
      '<div class="ops-card">' +
        "<h3>Compose</h3>" +
        '<p class="sub">Choose Permit Path, write a subject and message, then send. Users must clear it on next open.</p>' +
        '<div class="ops-field"><label>App</label><select data-el="app">' + options + "</select></div>" +
        '<div class="ops-field"><label>Subject</label><input data-el="subject" type="text" maxlength="120" placeholder="Short title users will see" value="' + esc(subject) + '" /></div>' +
        '<div class="ops-field"><label>Message</label><textarea data-el="message" rows="8" maxlength="2000" placeholder="Notification body">' + esc(message) + "</textarea></div>" +
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
    if (/app_announcements|supabase_announcements|table missing|schema cache/i.test(msg)) return PP_SQL_HINT;
    return msg;
  }

  function publishToPermitPath(row, studioId) {
    if (!window.STLLocalApi || typeof window.STLLocalApi.post !== "function") {
      return Promise.reject(new Error(PP_KEYS_HINT));
    }
    return window.STLLocalApi.post("/api/announcements/publish", {
      subject: row.subject,
      message: row.message,
      studio_notification_id: studioId || null
    }).then(function (res) {
      if (!res.ok) {
        var errMsg = (res.data && (res.data.error || res.data.message)) || ("Publish failed (" + res.status + ")");
        throw new Error(errMsg);
      }
      return res.data;
    });
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

    var row = {
      app_id: isUuid(app.id) ? app.id : null,
      app_name: app.name || "App",
      subject: trim(subject),
      message: trim(message)
    };

    sending = true;
    render();
    showMsg("Saving and sending to Permit Path…", true);

    db.from("app_notifications").insert(row).select("*").single().then(function (res) {
      if (res.error) {
        sending = false;
        render();
        return showMsg(schemaMissing(res.error) ? SCHEMA_HINT : res.error.message, false);
      }

      var saved = res.data;
      history = [saved].concat(history);

      return publishToPermitPath(row, saved && saved.id).then(function () {
        sending = false;
        subject = "";
        message = "";
        render();
        showMsg("Sent to Permit Path. Users will see it the next time they open the app.", true);
      }).catch(function (err) {
        sending = false;
        subject = "";
        message = "";
        render();
        showMsg("Saved in Studio, but Permit Path delivery failed: " + publishErrorMessage(err), false);
      });
    }).catch(function (err) {
      sending = false;
      render();
      showMsg((err && err.message) || "Could not save notification.", false);
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

    Promise.all([
      db.from("managed_apps").select("id,name").order("name"),
      db.from("app_notifications").select("*").order("created_at", { ascending: false })
    ]).then(function (pair) {
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
      subject = "";
      message = "";
      sending = false;
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

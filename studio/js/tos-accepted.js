(function () {
  "use strict";

  var root = null;
  var app = null;
  var rows = [];
  var platform = "android";
  var expandedId = "";
  var loading = false;
  var error = "";

  function el(name) {
    return root ? root.querySelector('[data-el="' + name + '"]') : null;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isPermitPath(row) {
    if (!row) return false;
    var blob = [row.name, row.bundle_identifier, row.google_package_name].join(" ").toLowerCase();
    return blob.indexOf("permit") >= 0 ||
      blob.indexOf("com.haulpath.permitpath") >= 0 ||
      blob.indexOf("com.seantylerlee.permitpath") >= 0;
  }

  function shortId(value) {
    var text = String(value || "");
    return text.length > 8 ? text.slice(0, 8) : text;
  }

  function when(value) {
    var date = new Date(value || "");
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString();
  }

  function forPlatform(name) {
    return rows.filter(function (row) { return row.platform === name; });
  }

  function shell() {
    return (
      '<div class="tos-panel">' +
        '<div class="tos-subtabs">' +
          '<button type="button" class="tos-subtab" data-platform="android">Android</button>' +
          '<button type="button" class="tos-subtab" data-platform="ios">Apple</button>' +
        "</div>" +
        '<p class="tos-note" data-el="note"></p>' +
        '<div data-el="list"></div>' +
      "</div>"
    );
  }

  function render() {
    if (!root) return;
    if (!root.querySelector("[data-el='list']")) root.innerHTML = shell();
    root.querySelectorAll("[data-platform]").forEach(function (btn) {
      var name = btn.getAttribute("data-platform");
      var label = name === "ios" ? "Apple" : "Android";
      btn.textContent = label + " (" + forPlatform(name).length + ")";
      btn.classList.toggle("is-on", name === platform);
      btn.onclick = function () {
        platform = name;
        expandedId = "";
        render();
      };
    });
    var note = el("note");
    var list = el("list");
    if (!isPermitPath(app)) {
      if (note) note.textContent = "TOS Accepted is kept for Permit Path. Select Permit Path to see Android and Apple acceptances.";
      if (list) list.innerHTML = "";
      return;
    }
    if (loading) {
      if (note) note.textContent = "Loading acceptances…";
      if (list) list.innerHTML = "";
      return;
    }
    if (error) {
      if (note) note.textContent = error;
      if (list) list.innerHTML = "";
      return;
    }
    var visible = forPlatform(platform);
    if (note) {
      note.textContent = visible.length
        ? ""
        : (platform === "ios"
          ? "No Apple acceptances yet."
          : "No Android acceptances yet.");
    }
    if (!list) return;
    list.innerHTML = visible.map(function (row) {
      var open = row.id === expandedId;
      var who = row.account_email ? row.account_email : "Guest";
      return (
        '<button type="button" class="tos-row' + (open ? " is-open" : "") + '" data-id="' + esc(row.id) + '">' +
          '<span class="tos-when">' + esc(when(row.accepted_at)) + "</span>" +
          "<span>" + esc(who) + "</span>" +
          '<span class="tos-meta">Install ' + esc(shortId(row.install_id)) + "</span>" +
          '<span class="tos-meta">IP ' + esc(row.ip_address || "—") + "</span>" +
          '<span class="tos-meta">App ' + esc(row.app_version || "—") + "</span>" +
          '<span class="tos-meta">Terms ' + esc(row.terms_version || "—") + "</span>" +
        "</button>" +
        (open
          ? '<div class="tos-copy"><h3>Highlights</h3><pre>' + esc(row.highlights || "") + "</pre>" +
            "<h3>Full terms</h3><pre>" + esc(row.terms_text || "") + "</pre></div>"
          : "")
      );
    }).join("");
    list.querySelectorAll(".tos-row").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-id") || "";
        expandedId = expandedId === id ? "" : id;
        render();
      };
    });
  }

  function load() {
    if (!isPermitPath(app)) {
      rows = [];
      error = "";
      loading = false;
      render();
      return;
    }
    if (!window.STLLocalApi || !window.STLLocalApi.available || !window.STLLocalApi.available()) {
      error = "Sign in, then open Studio again so the terms list can load.";
      loading = false;
      render();
      return;
    }
    loading = true;
    error = "";
    render();
    window.STLLocalApi.get("/api/tos-acceptances").then(function (res) {
      loading = false;
      if (!res.ok) {
        rows = [];
        error = (res.data && res.data.error) || "Could not load acceptances.";
      } else {
        rows = (res.data && res.data.rows) || [];
        error = "";
      }
      render();
    }).catch(function (err) {
      loading = false;
      rows = [];
      error = (err && err.message) || "Could not load acceptances.";
      render();
    });
  }

  window.STLTos = {
    mount: function (host) {
      root = host;
      expandedId = "";
      root.innerHTML = shell();
      render();
    },
    unmount: function () {
      root = null;
      app = null;
      rows = [];
    },
    setApp: function (next) {
      app = next || null;
      expandedId = "";
      load();
    }
  };
})();

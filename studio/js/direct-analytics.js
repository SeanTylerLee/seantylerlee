(function () {
  "use strict";

  var root = null;
  var rows = [];
  var filter = "all";
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

  function num(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function when(value) {
    var date = new Date(value || "");
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString();
  }

  function shortId(value) {
    var text = String(value || "");
    return text.length > 8 ? text.slice(0, 8) : text;
  }

  function sum(list, key) {
    return list.reduce(function (total, row) { return total + num(row[key]); }, 0);
  }

  function visibleRows() {
    return rows.filter(function (row) {
      if (filter === "ios" || filter === "android") return row.platform === filter;
      if (filter === "subscribed") return !!row.is_subscribed;
      if (filter === "free") return !row.is_subscribed;
      return true;
    });
  }

  function shell() {
    return (
      '<div class="tos-panel direct-panel">' +
        '<p class="tos-note">Counts come from the app on each phone. A person shows up after they open a build that sends this report. The Apple and Google reports stay on Apps → Analytics. This list has no email.</p>' +
        '<div class="direct-stats" data-el="stats"></div>' +
        '<div class="tos-subtabs" data-el="filters"></div>' +
        '<p class="tos-note" data-el="note"></p>' +
        '<div data-el="list"></div>' +
      "</div>"
    );
  }

  function stat(label, value) {
    return '<div class="direct-stat"><span>' + esc(value) + '</span><small>' + esc(label) + "</small></div>";
  }

  function render() {
    if (!root) return;
    if (!root.querySelector("[data-el='list']")) root.innerHTML = shell();
    var stats = el("stats");
    var subscribed = rows.filter(function (row) { return row.is_subscribed; }).length;
    if (stats) {
      stats.innerHTML =
        stat("Installs", rows.length) +
        stat("Subscribed", subscribed) +
        stat("Not subscribed", Math.max(0, rows.length - subscribed)) +
        stat("iPhone", rows.filter(function (row) { return row.platform === "ios"; }).length) +
        stat("Android", rows.filter(function (row) { return row.platform === "android"; }).length) +
        stat("Routes built", sum(rows, "routes_built")) +
        stat("Navigations", sum(rows, "navigations_started")) +
        stat("Permits imported", sum(rows, "permits_imported")) +
        stat("Routes shared", sum(rows, "routes_shared"));
    }
    var filters = [
      ["all", "All"],
      ["ios", "iPhone"],
      ["android", "Android"],
      ["subscribed", "Subscribed"],
      ["free", "Not subscribed"]
    ];
    var bar = el("filters");
    if (bar) {
      bar.innerHTML = filters.map(function (item) {
        return '<button type="button" class="tos-subtab' + (filter === item[0] ? " is-on" : "") + '" data-filter="' + item[0] + '">' + item[1] + "</button>";
      }).join("");
      bar.querySelectorAll("[data-filter]").forEach(function (btn) {
        btn.onclick = function () {
          filter = btn.getAttribute("data-filter") || "all";
          render();
        };
      });
    }
    var note = el("note");
    var list = el("list");
    if (loading) {
      if (note) note.textContent = "Loading direct app analytics…";
      if (list) list.innerHTML = "";
      return;
    }
    if (error) {
      if (note) note.textContent = error;
      if (list) list.innerHTML = "";
      return;
    }
    var visible = visibleRows();
    if (note) {
      note.textContent = visible.length
        ? "Each row is one install. Counts are what that phone has reported so far."
        : "No installs have reported yet. Run sql/020_direct_app_analytics.sql in the Permit Path Supabase SQL editor, then open the app on a phone.";
    }
    if (!list) return;
    list.innerHTML = visible.map(function (row) {
      var phone = row.platform === "ios" ? "iPhone" : "Android";
      return (
        '<div class="tos-row">' +
          "<span>" + esc(phone) + "</span>" +
          "<span>" + (row.is_subscribed ? "Subscribed" : "Not subscribed") + "</span>" +
          '<span class="tos-meta">Built ' + num(row.routes_built) + "</span>" +
          '<span class="tos-meta">Navigated ' + num(row.navigations_started) + "</span>" +
          '<span class="tos-meta">Imported ' + num(row.permits_imported) + "</span>" +
          '<span class="tos-meta">Shared ' + num(row.routes_shared) + "</span>" +
          '<span class="tos-meta">App ' + esc(row.app_version || "—") + "</span>" +
          '<span class="tos-meta">Last open ' + esc(when(row.last_seen)) + "</span>" +
          '<span class="tos-meta">Install ' + esc(shortId(row.install_id)) + "</span>" +
        "</div>"
      );
    }).join("");
  }

  function load() {
    if (!window.STLLocalApi || !window.STLLocalApi.available || !window.STLLocalApi.available()) {
      error = "Sign in, then open Studio again so direct app analytics can load.";
      loading = false;
      render();
      return;
    }
    loading = true;
    error = "";
    render();
    window.STLLocalApi.get("/api/direct-app-analytics")
      .then(function (res) {
        rows = (res && res.rows) || [];
        loading = false;
        render();
      })
      .catch(function (err) {
        rows = [];
        loading = false;
        error = (err && err.message) || "Could not load direct app analytics.";
        render();
      });
  }

  window.STLDirectAnalytics = {
    mount: function (panel) {
      root = panel;
      rows = [];
      filter = "all";
      error = "";
      if (root) root.innerHTML = shell();
      load();
    },
    unmount: function () {
      root = null;
    },
    shown: function () {
      load();
    }
  };
})();

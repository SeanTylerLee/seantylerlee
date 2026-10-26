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
    var signedIn = rows.filter(function (row) { return row.is_signed_in; }).length;
    var miles = Math.round(sum(rows, "miles_driven"));
    if (stats) {
      stats.innerHTML =
        stat("Installs", rows.length) +
        stat("Subscribed", subscribed) +
        stat("Not subscribed", Math.max(0, rows.length - subscribed)) +
        stat("Signed in", signedIn) +
        stat("Guest", Math.max(0, rows.length - signedIn)) +
        stat("iPhone", rows.filter(function (row) { return row.platform === "ios"; }).length) +
        stat("Android", rows.filter(function (row) { return row.platform === "android"; }).length) +
        stat("Go taps", sum(rows, "navigations_started")) +
        stat("Arrived", sum(rows, "arrivals")) +
        stat("Miles on finished trips", miles.toLocaleString("en-US")) +
        stat("Off the line", sum(rows, "off_route_trips")) +
        stat("Go on a Texas import", sum(rows, "navigations_official")) +
        stat("Go on a built route", sum(rows, "navigations_built")) +
        stat("Paywall shown", sum(rows, "paywall_shown")) +
        stat("Subscribe tapped", sum(rows, "subscribe_tapped")) +
        stat("Restore tapped", sum(rows, "restore_tapped")) +
        stat("Hit 4-waypoint cap", sum(rows, "waypoint_cap")) +
        stat("Import locked", sum(rows, "import_locked")) +
        stat("Chose free", sum(rows, "free_tier_chosen")) +
        stat("PDF imports", sum(rows, "imports_pdf")) +
        stat("QR imports", sum(rows, "imports_qr")) +
        stat("Saved routes opened", sum(rows, "saved_routes_opened")) +
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
        ? "Each row is one install. Miles are along the route from where that trip started to arrival. Days open counts different days the app was opened."
        : "No installs have reported yet. Run sql/020 and sql/021 in the Permit Path Supabase SQL editor, then open a new app build.";
    }
    if (!list) return;
    list.innerHTML = visible.map(function (row) {
      var phone = row.platform === "ios" ? "iPhone" : "Android";
      var first = new Date(row.first_seen || "");
      var age = isNaN(first.getTime()) ? "" : Math.max(0, Math.round((Date.now() - first.getTime()) / 86400000));
      return (
        '<div class="tos-row">' +
          "<span>" + esc(phone) + "</span>" +
          "<span>" + (row.is_subscribed ? "Subscribed" : "Not subscribed") + "</span>" +
          "<span>" + (row.is_signed_in ? "Signed in" : "Guest") + "</span>" +
          '<span class="tos-meta">Go ' + num(row.navigations_started) + " · arrived " + num(row.arrivals) + "</span>" +
          '<span class="tos-meta">Miles ' + Math.round(num(row.miles_driven)) + "</span>" +
          '<span class="tos-meta">Off line ' + num(row.off_route_trips) + "</span>" +
          '<span class="tos-meta">Texas ' + num(row.navigations_official) + " · built " + num(row.navigations_built) + "</span>" +
          '<span class="tos-meta">Paywall ' + num(row.paywall_shown) + " · subscribe " + num(row.subscribe_tapped) + " · restore " + num(row.restore_tapped) + "</span>" +
          '<span class="tos-meta">Cap ' + num(row.waypoint_cap) + " · import lock " + num(row.import_locked) + " · free " + num(row.free_tier_chosen) + "</span>" +
          '<span class="tos-meta">PDF ' + num(row.imports_pdf) + " · QR " + num(row.imports_qr) + " · saved " + num(row.saved_routes_opened) + "</span>" +
          '<span class="tos-meta">Days open ' + num(row.days_opened) + (age === "" ? "" : " · " + age + "d since first open") + "</span>" +
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

(function () {
  "use strict";

  var root = null;
  var rows = [];
  var days = [];
  var live = null;
  var filter = "all";
  var loading = false;
  var error = "";
  var notice = "";
  var deletingId = "";

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
        '<div data-el="live"></div>' +
        '<h3 class="direct-section-title">Total</h3>' +
        '<div class="direct-totals" data-el="totals"></div>' +
        '<div class="direct-stats" data-el="stats"></div>' +
        '<h3 class="direct-section-title">By day</h3>' +
        '<div data-el="days"></div>' +
        '<div class="tos-subtabs" data-el="filters"></div>' +
        '<p class="tos-note" data-el="note"></p>' +
        '<div data-el="list"></div>' +
      "</div>"
    );
  }

  function stat(label, value, extraClass) {
    return (
      '<div class="direct-stat' + (extraClass ? " " + extraClass : "") + '">' +
        "<span>" + esc(value) + "</span>" +
        "<small>" + esc(label) + "</small>" +
      "</div>"
    );
  }

  function bindDeletes() {
    if (!root) return;
    root.querySelectorAll("[data-delete-install]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-delete-install") || "";
        if (!id || deletingId) return;
        var phone = btn.getAttribute("data-delete-phone") || "this install";
        if (!window.confirm(
          "Remove " + phone + " (" + shortId(id) + ") from Direct App Analytics?\n\n" +
          "This only clears the Studio counters for that phone. If they open the app again, a new row can appear."
        )) return;
        deleteInstall(id);
      };
    });
  }

  function deleteInstall(installId) {
    if (!window.STLLocalApi || !window.STLLocalApi.available || !window.STLLocalApi.available()) {
      notice = "Sign in, then open Studio again so deletes can run.";
      render();
      return;
    }
    deletingId = installId;
    notice = "";
    render();
    window.STLLocalApi.post("/api/direct-app-analytics/delete", { install_id: installId })
      .then(function (res) {
        deletingId = "";
        if (!res.ok) {
          notice = (res.data && res.data.error) || "Could not delete that install.";
          render();
          return;
        }
        rows = rows.filter(function (row) { return String(row.install_id || "") !== installId; });
        notice = "Install removed.";
        render();
      })
      .catch(function (err) {
        deletingId = "";
        notice = (err && err.message) || "Could not delete that install.";
        render();
      });
  }

  function render() {
    if (!root) return;
    if (!root.querySelector("[data-el='list']")) root.innerHTML = shell();
    var iosCount = rows.filter(function (row) { return row.platform === "ios"; }).length;
    var androidCount = rows.filter(function (row) { return row.platform === "android"; }).length;
    var totals = el("totals");
    if (totals) {
      totals.innerHTML =
        stat("Total installs", rows.length, "direct-stat-lead") +
        stat("iPhone users", iosCount, "direct-stat-lead") +
        stat("Android users", androidCount, "direct-stat-lead");
    }
    var stats = el("stats");
    var subscribed = rows.filter(function (row) { return row.is_subscribed; }).length;
    var signedIn = rows.filter(function (row) { return row.is_signed_in; }).length;
    var miles = Math.round(sum(rows, "miles_driven"));
    if (stats) {
      stats.innerHTML =
        stat("Subscribed", subscribed) +
        stat("Not subscribed", Math.max(0, rows.length - subscribed)) +
        stat("Signed in", signedIn) +
        stat("Guest", Math.max(0, rows.length - signedIn)) +
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
    var liveBox = el("live");
    if (liveBox) {
      var site = live || { miles: 0, permits_imported: 0, reset_note: "Miles driven with Permit Path since October 30, 2026." };
      liveBox.innerHTML =
        '<div class="fleet-company-notes">' +
          "<p><strong>Website live stats.</strong> permitpathnav.com reads these numbers.</p>" +
          "<p>" + Math.round(num(site.miles)).toLocaleString("en-US") + " miles since October 30, 2026. " +
            Math.round(num(site.permits_imported)).toLocaleString("en-US") + " permits imported (PDF + QR).</p>" +
          "<p>" + esc(site.reset_note || "Miles driven with Permit Path since October 30, 2026.") + "</p>" +
        "</div>";
    }
    var dayBox = el("days");
    if (dayBox) {
      var shownDays = days.filter(function (day) {
        if (filter === "ios" || filter === "android") return day.platform === filter;
        return true;
      });
      var byDay = {};
      shownDays.forEach(function (day) {
        var key = String(day.day || "").slice(0, 10);
        if (!key) return;
        if (!byDay[key]) byDay[key] = { day: key };
        ["opens", "navigations_started", "arrivals", "miles_driven", "off_route_trips", "navigations_official", "navigations_built", "paywall_shown", "imports_pdf", "imports_qr"].forEach(function (field) {
          byDay[key][field] = num(byDay[key][field]) + num(day[field]);
        });
      });
      var dayKeys = Object.keys(byDay).sort().reverse();
      dayBox.innerHTML = dayKeys.length
        ? dayKeys.map(function (key) {
          var day = byDay[key];
          return (
            '<article class="direct-card direct-day">' +
              '<header class="direct-card-head"><div class="direct-card-name"><span class="direct-platform">' + esc(key) + "</span></div></header>" +
              '<div class="direct-metrics">' +
                '<div class="direct-metric"><strong>' + num(day.opens) + "</strong><span>Opens</span></div>" +
                '<div class="direct-metric"><strong>' + num(day.navigations_started) + "</strong><span>Go taps</span></div>" +
                '<div class="direct-metric"><strong>' + num(day.arrivals) + "</strong><span>Arrived</span></div>" +
                '<div class="direct-metric"><strong>' + Math.round(num(day.miles_driven)).toLocaleString("en-US") + "</strong><span>Miles</span></div>" +
                '<div class="direct-metric"><strong>' + num(day.off_route_trips) + "</strong><span>Off the line</span></div>" +
                '<div class="direct-metric"><strong>' + num(day.navigations_official) + "</strong><span>Texas Go</span></div>" +
                '<div class="direct-metric"><strong>' + num(day.navigations_built) + "</strong><span>Built Go</span></div>" +
                '<div class="direct-metric"><strong>' + num(day.paywall_shown) + "</strong><span>Paywall</span></div>" +
                '<div class="direct-metric"><strong>' + num(day.imports_pdf) + "</strong><span>PDF imports</span></div>" +
                '<div class="direct-metric"><strong>' + num(day.imports_qr) + "</strong><span>QR imports</span></div>" +
              "</div>" +
            "</article>"
          );
        }).join("")
        : '<p class="tos-note">No daily counts yet. Run sql/065_direct_app_days.sql in the Permit Path SQL editor. Counts start the next time a phone opens the app. The total above is still the all-time number.</p>';
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
      if (notice) {
        note.textContent = notice;
      } else {
        note.textContent = visible.length
          ? "Each row is one install. Miles are along the route from where that trip started to arrival. Days open counts different days the app was opened. Delete removes that phone from this list only."
          : "No installs have reported yet. Run sql/020 and sql/021 in the Permit Path Supabase SQL editor, then open a new app build.";
      }
    }
    if (!list) return;
    function metric(label, value) {
      return (
        '<div class="direct-metric">' +
          '<strong>' + esc(value) + "</strong>" +
          "<span>" + esc(label) + "</span>" +
        "</div>"
      );
    }
    function badge(text, kind) {
      return '<span class="direct-badge direct-badge-' + kind + '">' + esc(text) + "</span>";
    }
    list.innerHTML = visible.map(function (row) {
      var phone = row.platform === "ios" ? "iPhone" : "Android";
      var platformKind = row.platform === "ios" ? "ios" : "android";
      var first = new Date(row.first_seen || "");
      var age = isNaN(first.getTime()) ? "" : Math.max(0, Math.round((Date.now() - first.getTime()) / 86400000));
      var id = String(row.install_id || "");
      var busy = deletingId && deletingId === id;
      var ageLabel = age === "" ? "—" : age + "d";
      return (
        '<article class="direct-card">' +
          '<header class="direct-card-head">' +
            '<div class="direct-card-title">' +
              '<div class="direct-card-name">' +
                '<span class="direct-platform direct-platform-' + platformKind + '">' + esc(phone) + "</span>" +
                badge(row.is_subscribed ? "Subscribed" : "Not subscribed", row.is_subscribed ? "paid" : "free") +
                badge(row.is_signed_in ? "Signed in" : "Guest", row.is_signed_in ? "account" : "guest") +
              "</div>" +
              '<div class="direct-card-sub">' +
                "<span>App " + esc(row.app_version || "—") + "</span>" +
                "<span>Last open " + esc(when(row.last_seen) || "—") + "</span>" +
                "<span>Install " + esc(shortId(id)) + "</span>" +
              "</div>" +
            "</div>" +
            '<div class="direct-card-actions">' +
              '<button type="button" class="btn btn-danger" data-delete-install="' + esc(id) + '" data-delete-phone="' + esc(phone) + '"' +
                (busy || deletingId ? " disabled" : "") + ">" +
                (busy ? "Deleting…" : "Delete") +
              "</button>" +
            "</div>" +
          "</header>" +
          '<div class="direct-metrics">' +
            metric("Go taps", num(row.navigations_started)) +
            metric("Arrived", num(row.arrivals)) +
            metric("Miles", Math.round(num(row.miles_driven))) +
            metric("Off line", num(row.off_route_trips)) +
            metric("Texas Go", num(row.navigations_official)) +
            metric("Built Go", num(row.navigations_built)) +
            metric("Paywall", num(row.paywall_shown)) +
            metric("Subscribe", num(row.subscribe_tapped)) +
            metric("Restore", num(row.restore_tapped)) +
            metric("Waypoint cap", num(row.waypoint_cap)) +
            metric("Import lock", num(row.import_locked)) +
            metric("Chose free", num(row.free_tier_chosen)) +
            metric("PDF import", num(row.imports_pdf)) +
            metric("QR import", num(row.imports_qr)) +
            metric("Saved opened", num(row.saved_routes_opened)) +
            metric("Routes shared", num(row.routes_shared)) +
            metric("Days open", num(row.days_opened)) +
            metric("Since first", ageLabel) +
          "</div>" +
        "</article>"
      );
    }).join("");
    bindDeletes();
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
    notice = "";
    render();
    window.STLLocalApi.get("/api/direct-app-analytics")
      .then(function (res) {
        loading = false;
        if (!res.ok) {
          rows = [];
          days = [];
          error = (res.data && res.data.error) || "Could not load direct app analytics.";
        } else {
          rows = (res.data && res.data.rows) || [];
          days = (res.data && res.data.days) || [];
          live = (res.data && res.data.live) || null;
          error = "";
        }
        render();
      })
      .catch(function (err) {
        rows = [];
        days = [];
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
      notice = "";
      deletingId = "";
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

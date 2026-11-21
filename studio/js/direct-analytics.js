(function () {
  "use strict";

  var root = null;
  var rows = [];
  var days = [];
  var live = null;
  var fleets = [];
  var seats = [];
  var fleetError = "";
  var filter = "all";
  var calendarMonth = "";
  var selectedDay = "";
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

  var IMPORT_STATES = [
    ["tx", "Texas"],
    ["wy", "Wyoming"],
    ["nd", "North Dakota"],
    ["co", "Colorado"],
    ["va", "Virginia"],
    ["ga", "Georgia"],
    ["ky", "Kentucky"]
  ];

  function importCount(row, kind, code) {
    return num(row["import_" + kind + "_" + code]);
  }

  function stateImportTable(sourceRows, emptyNote) {
    var body = IMPORT_STATES.map(function (item) {
      var code = item[0];
      var pdf = 0;
      var qr = 0;
      var fail = 0;
      sourceRows.forEach(function (row) {
        pdf += importCount(row, "pdf", code);
        qr += importCount(row, "qr", code);
        fail += importCount(row, "fail", code);
      });
      return (
        "<tr>" +
          "<th>" + esc(item[1]) + "</th>" +
          "<td>" + pdf + "</td>" +
          "<td>" + qr + "</td>" +
          "<td>" + fail + "</td>" +
        "</tr>"
      );
    }).join("");
    var hasAny = sourceRows.some(function (row) {
      return IMPORT_STATES.some(function (item) {
        return importCount(row, "pdf", item[0]) || importCount(row, "qr", item[0]) || importCount(row, "fail", item[0]);
      });
    });
    if (!hasAny) {
      return emptyNote ? '<p class="tos-note">' + esc(emptyNote) + "</p>" : "";
    }
    return (
      '<table class="direct-state-table">' +
        "<thead><tr><th>State</th><th>PDF</th><th>QR</th><th>Failed</th></tr></thead>" +
        "<tbody>" + body + "</tbody>" +
      "</table>"
    );
  }

  function when(value) {
    var date = new Date(value || "");
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString();
  }

  function line(label, value, extra) {
    var zero = value === 0 || value === "0";
    var text = typeof value === "number" ? value.toLocaleString("en-US") : String(value);
    return (
      '<div class="direct-line' + (zero ? " is-zero" : "") + (extra ? " " + extra : "") + '">' +
        "<span>" + esc(label) + "</span>" +
        "<strong>" + esc(text) + "</strong>" +
      "</div>"
    );
  }

  function panel(title, inner) {
    return (
      '<section class="direct-panel-block">' +
        "<h4>" + esc(title) + "</h4>" +
        '<div class="direct-lines">' + inner + "</div>" +
      "</section>"
    );
  }

  function pad2(value) {
    return (value < 10 ? "0" : "") + value;
  }

  function centralToday() {
    var map = {};
    try {
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date()).forEach(function (part) {
        map[part.type] = part.value;
      });
    } catch (err) {
      var now = new Date();
      map = {
        year: String(now.getFullYear()),
        month: pad2(now.getMonth() + 1),
        day: pad2(now.getDate())
      };
    }
    return {
      month: map.year + "-" + map.month,
      day: map.year + "-" + map.month + "-" + map.day
    };
  }

  function shiftMonth(ym, delta) {
    var date = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + delta, 1);
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1);
  }

  function monthTitle(ym) {
    var names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return names[Number(ym.slice(5, 7)) - 1] + " " + ym.slice(0, 4);
  }

  function metric(label, value) {
    var text = typeof value === "number" ? value.toLocaleString("en-US") : String(value);
    return (
      '<div class="direct-metric">' +
        "<strong>" + esc(text) + "</strong>" +
        "<span>" + esc(label) + "</span>" +
      "</div>"
    );
  }

  function openedDay(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    if (!match) return "";
    var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString();
  }

  function seenAt(row) {
    var time = new Date(row.last_seen || "").getTime();
    return isNaN(time) ? 0 : time;
  }

  function versionCounts() {
    var counts = {};
    rows.forEach(function (row) {
      var phone = row.platform === "ios" ? "iPhone" : row.platform === "android" ? "Android" : "Other";
      var version = String(row.app_version || "").trim() || "Unknown";
      var label = phone + " " + version;
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.keys(counts).map(function (label) {
      return { label: label, count: counts[label] };
    }).sort(function (a, b) {
      return b.count - a.count || a.label.localeCompare(b.label);
    });
  }

  function shortId(value) {
    var text = String(value || "");
    return text.length > 8 ? text.slice(0, 8) : text;
  }

  function sum(list, key) {
    return list.reduce(function (total, row) { return total + num(row[key]); }, 0);
  }

  function fleetForInstall(installId) {
    var id = String(installId || "").trim().toLowerCase();
    if (id.length < 8) return null;
    var companies = {};
    fleets.forEach(function (fleet) {
      companies[String(fleet.id)] = fleet;
    });
    var match = null;
    seats.forEach(function (seat) {
      if (match) return;
      if (String(seat.install_id || "").trim().toLowerCase() !== id) return;
      if (!String(seat.code || "").trim()) return;
      var fleet = companies[String(seat.fleet_id)] || {};
      var note = String(seat.label || "");
      if (/^cs_/.test(note)) note = "";
      match = {
        company: String(fleet.company_name || "Fleet").trim() || "Fleet",
        code: String(seat.code || "").trim(),
        note: note.trim()
      };
    });
    return match;
  }

  function visibleRows() {
    return rows.filter(function (row) {
      if (filter === "fleet") return !!fleetForInstall(row.install_id);
      if (filter === "ios" || filter === "android") return row.platform === filter;
      if (filter === "subscribed") return !!row.is_subscribed;
      if (filter === "free") return !row.is_subscribed;
      return true;
    }).sort(function (a, b) {
      if (filter === "fleet") {
        var left = fleetForInstall(a.install_id) || {};
        var right = fleetForInstall(b.install_id) || {};
        var company = String(left.company || "").localeCompare(String(right.company || ""));
        if (company) return company;
        return String(left.code || "").localeCompare(String(right.code || ""));
      }
      var subscribed = (b.is_subscribed ? 1 : 0) - (a.is_subscribed ? 1 : 0);
      if (subscribed) return subscribed;
      return seenAt(b) - seenAt(a);
    });
  }

  function shell() {
    return (
      '<div class="tos-panel direct-panel">' +
        '<div data-el="live"></div>' +
        '<h3 class="direct-section-title">At a glance</h3>' +
        '<div class="direct-hero" data-el="totals"></div>' +
        '<div class="direct-boards" data-el="boards"></div>' +
        '<h3 class="direct-section-title">Imports by state</h3>' +
        '<div data-el="state-imports"></div>' +
        '<h3 class="direct-section-title">Star rating</h3>' +
        '<div data-el="review-stats"></div>' +
        '<h3 class="direct-section-title">App versions</h3>' +
        '<div data-el="versions"></div>' +
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
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    var activeToday = rows.filter(function (row) { return seenAt(row) >= today.getTime(); }).length;
    var activeWeek = rows.filter(function (row) { return seenAt(row) >= weekAgo; }).length;
    var totals = el("totals");
    if (totals) {
      totals.innerHTML =
        stat("Total installs", rows.length, "direct-stat-lead") +
        stat("iPhone users", iosCount, "direct-stat-lead") +
        stat("Android users", androidCount, "direct-stat-lead") +
        stat("Active today", activeToday, "direct-stat-lead") +
        stat("Active in 7 days", activeWeek, "direct-stat-lead");
    }
    var subscribed = rows.filter(function (row) { return row.is_subscribed; }).length;
    var signedIn = rows.filter(function (row) { return row.is_signed_in; }).length;
    var miles = Math.round(sum(rows, "miles_driven"));
    var boards = el("boards");
    if (boards) {
      boards.innerHTML =
        panel("People",
          line("Subscribed", subscribed, "is-paid") +
          line("Not subscribed", Math.max(0, rows.length - subscribed)) +
          line("Signed in", signedIn) +
          line("Guest", Math.max(0, rows.length - signedIn))
        ) +
        panel("On the road",
          line("Go taps", sum(rows, "navigations_started")) +
          line("Arrived", sum(rows, "arrivals")) +
          line("Miles on finished trips", miles) +
          line("Off the line", sum(rows, "off_route_trips")) +
          line("Go on an official import", sum(rows, "navigations_official")) +
          line("Go on a built route", sum(rows, "navigations_built")) +
          line("Routes built", sum(rows, "routes_built"))
        ) +
        panel("Paywall",
          line("Paywall shown", sum(rows, "paywall_shown")) +
          line("Subscribe tapped", sum(rows, "subscribe_tapped")) +
          line("Restore tapped", sum(rows, "restore_tapped")) +
          line("Hit 4-waypoint cap", sum(rows, "waypoint_cap")) +
          line("Import locked", sum(rows, "import_locked")) +
          line("Chose free", sum(rows, "free_tier_chosen"))
        ) +
        panel("Imports and sharing",
          line("PDF imports", sum(rows, "imports_pdf")) +
          line("QR imports", sum(rows, "imports_qr")) +
          line("Saved routes opened", sum(rows, "saved_routes_opened")) +
          line("Routes shared", sum(rows, "routes_shared"))
        );
    }
    var stateBox = el("state-imports");
    if (stateBox) {
      stateBox.innerHTML = stateImportTable(
        rows,
        "No per-state imports yet. Paste sql/078_import_by_state.sql, then open a 5.1.0 build and import a permit."
      );
    }
    var reviewBox = el("review-stats");
    if (reviewBox) {
      reviewBox.innerHTML =
        '<div class="direct-lines direct-lines-wide">' +
          line("Prompt shown", sum(rows, "review_prompt_shown")) +
          line("1 star tap", sum(rows, "review_star_1")) +
          line("2 star taps", sum(rows, "review_star_2")) +
          line("3 star taps", sum(rows, "review_star_3")) +
          line("4 star taps", sum(rows, "review_star_4")) +
          line("5 star taps", sum(rows, "review_star_5")) +
          line("Submit", sum(rows, "review_submit")) +
          line("Not now", sum(rows, "review_not_now")) +
          line("Cancel", sum(rows, "review_cancel")) +
          line("Left store too fast", sum(rows, "review_bounce")) +
        "</div>";
    }
    var versions = el("versions");
    if (versions) {
      var versionList = versionCounts();
      versions.innerHTML = versionList.length
        ? '<div class="direct-versions">' + versionList.map(function (item) {
            return '<div class="direct-version"><span>' + esc(item.label) + "</span><strong>" + esc(item.count) + "</strong></div>";
          }).join("") + "</div>"
        : '<p class="tos-note">No app versions yet.</p>';
    }
    var filters = [
      ["all", "All"],
      ["ios", "iPhone"],
      ["android", "Android"],
      ["subscribed", "Subscribed"],
      ["free", "Not subscribed"],
      ["fleet", "Fleet codes"]
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
      var site = live || { miles: 0, permits_imported: 0, reset_note: "Statistics were reset on Oct. 30, 2026" };
      liveBox.innerHTML =
        '<div class="fleet-company-notes">' +
          "<p><strong>Website live stats.</strong> permitpathnav.com reads these lifetime totals. The site still says they were reset on Oct. 30, 2026.</p>" +
          "<p>" + Math.round(num(site.miles)).toLocaleString("en-US") + " miles. " +
            Math.round(num(site.permits_imported)).toLocaleString("en-US") + " permits imported (PDF + QR). " +
            Math.round(num(site.routes_built)).toLocaleString("en-US") + " manual routes built.</p>" +
          "<p>" + esc(site.reset_note || "Statistics were reset on Oct. 30, 2026") + "</p>" +
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
        ["opens", "navigations_started", "arrivals", "miles_driven", "off_route_trips", "navigations_official", "navigations_built", "paywall_shown", "subscribe_tapped", "free_tier_chosen", "imports_pdf", "imports_qr", "review_prompt_shown", "review_star_1", "review_star_2", "review_star_3", "review_star_4", "review_star_5", "review_not_now", "review_cancel", "review_submit", "review_bounce"].forEach(function (field) {
          byDay[key][field] = num(byDay[key][field]) + num(day[field]);
        });
        IMPORT_STATES.forEach(function (item) {
          ["pdf", "qr", "fail"].forEach(function (kind) {
            var field = "import_" + kind + "_" + item[0];
            byDay[key][field] = num(byDay[key][field]) + num(day[field]);
          });
        });
      });
      var dayKeys = Object.keys(byDay).sort();
      if (!dayKeys.length) {
        dayBox.innerHTML = '<p class="tos-note">No daily counts yet. Run sql/065_direct_app_days.sql in the Permit Path SQL editor. Counts start the next time a phone opens the app. The total above is still the all-time number.</p>';
      } else {
        if (!calendarMonth) calendarMonth = centralToday().month;
        var todayKey = centralToday().day;
        var year = Number(calendarMonth.slice(0, 4));
        var month = Number(calendarMonth.slice(5, 7));
        var firstWeekday = new Date(year, month - 1, 1).getDay();
        var daysInMonth = new Date(year, month, 0).getDate();
        var cells = [];
        var i;
        for (i = 0; i < firstWeekday; i++) cells.push("");
        for (i = 1; i <= daysInMonth; i++) cells.push(calendarMonth + "-" + pad2(i));
        while (cells.length % 7) cells.push("");
        var grid = cells.map(function (key) {
          if (!key) return '<div class="direct-cal-day is-pad"></div>';
          var day = byDay[key];
          var miles = day ? Math.round(num(day.miles_driven)) : 0;
          var subscribe = day ? num(day.subscribe_tapped) : 0;
          var routes = day ? num(day.imports_pdf) + num(day.imports_qr) : 0;
          var classes = "direct-cal-day";
          if (day) classes += " has-data";
          if (key === todayKey) classes += " is-today";
          if (key === selectedDay) classes += " is-on";
          var highlights =
            (miles ? '<span class="direct-cal-hl direct-cal-miles">' + miles.toLocaleString("en-US") + " mi</span>" : "") +
            (subscribe ? '<span class="direct-cal-hl direct-cal-sub">' + subscribe.toLocaleString("en-US") + " subscribe</span>" : "") +
            (routes ? '<span class="direct-cal-hl direct-cal-routes">' + routes.toLocaleString("en-US") + " routes</span>" : "");
          return (
            '<button type="button" class="' + classes + '" data-day="' + key + '">' +
              '<span class="direct-cal-num">' + Number(key.slice(8, 10)) + "</span>" +
              highlights +
            "</button>"
          );
        }).join("");
        var picked = byDay[selectedDay];
        var detail = "";
        if (selectedDay) {
          detail =
            '<article class="direct-card direct-day direct-cal-detail">' +
              '<header class="direct-card-head"><div class="direct-card-name"><span class="direct-platform">' + esc(openedDay(selectedDay) || selectedDay) + "</span></div></header>" +
              (picked
                ? '<div class="direct-metrics">' +
                    metric("Opens", num(picked.opens)) +
                    metric("Go taps", num(picked.navigations_started)) +
                    metric("Arrived", num(picked.arrivals)) +
                    metric("Miles", Math.round(num(picked.miles_driven))) +
                    metric("Off the line", num(picked.off_route_trips)) +
                    metric("Official Go", num(picked.navigations_official)) +
                    metric("Built Go", num(picked.navigations_built)) +
                    metric("Paywall", num(picked.paywall_shown)) +
                    metric("Subscribe", num(picked.subscribe_tapped)) +
                    metric("Chose free", num(picked.free_tier_chosen)) +
                    metric("Routes", num(picked.imports_pdf) + num(picked.imports_qr)) +
                    metric("PDF imports", num(picked.imports_pdf)) +
                    metric("QR imports", num(picked.imports_qr)) +
                    (num(picked.review_prompt_shown) || num(picked.review_submit) || num(picked.review_not_now) || num(picked.review_cancel) || num(picked.review_bounce)
                      ? metric("Rate shown", num(picked.review_prompt_shown)) +
                        metric("1★", num(picked.review_star_1)) +
                        metric("2★", num(picked.review_star_2)) +
                        metric("3★", num(picked.review_star_3)) +
                        metric("4★", num(picked.review_star_4)) +
                        metric("5★", num(picked.review_star_5)) +
                        metric("Rate submit", num(picked.review_submit)) +
                        metric("Not now", num(picked.review_not_now)) +
                        metric("Rate cancel", num(picked.review_cancel)) +
                        metric("Rate bounce", num(picked.review_bounce))
                      : "") +
                  "</div>" +
                  stateImportTable([picked], "")
                : '<p class="tos-note">No reports on this day.</p>') +
            "</article>";
        }
        dayBox.innerHTML =
          '<div class="direct-cal">' +
            '<div class="direct-cal-head">' +
              '<button type="button" class="direct-cal-nav" data-cal="-1" aria-label="Previous month">‹</button>' +
              "<h4>" + esc(monthTitle(calendarMonth)) + "</h4>" +
              '<button type="button" class="direct-cal-nav" data-cal="1" aria-label="Next month">›</button>' +
            "</div>" +
            '<p class="direct-cal-legend"><span class="direct-cal-miles">Miles</span><span class="direct-cal-sub">Subscribe</span><span class="direct-cal-routes">Routes (PDF + QR)</span></p>' +
            '<div class="direct-cal-grid">' +
              ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(function (name) {
                return '<div class="direct-cal-dow">' + name + "</div>";
              }).join("") +
              grid +
            "</div>" +
          "</div>" +
          detail;
        dayBox.querySelectorAll("[data-cal]").forEach(function (btn) {
          btn.onclick = function () {
            calendarMonth = shiftMonth(calendarMonth, Number(btn.getAttribute("data-cal")) || 0);
            render();
          };
        });
        dayBox.querySelectorAll("[data-day]").forEach(function (btn) {
          btn.onclick = function () {
            var key = btn.getAttribute("data-day") || "";
            selectedDay = selectedDay === key ? "" : key;
            render();
          };
        });
      }
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
      } else if (filter === "fleet" && fleetError) {
        note.textContent = fleetError + " The totals above still count every phone.";
      } else if (filter === "fleet") {
        note.textContent = visible.length
          ? "Each card is one phone that entered a fleet code. The totals above still count every phone. A code nobody has entered yet stays on Fleet Management."
          : "No phone that entered a fleet code has reported yet. The totals above still count every phone. Unused codes stay on Fleet Management.";
      } else {
        note.textContent = visible.length
          ? ""
          : "No installs have reported yet. Run sql/020 and sql/021 in the Permit Path Supabase SQL editor, then open a new app build.";
      }
    }
    if (!list) return;
    function badge(text, kind) {
      return '<span class="direct-badge direct-badge-' + kind + '">' + esc(text) + "</span>";
    }
    var lastGroup = "";
    list.innerHTML = visible.map(function (row) {
      var phone = row.platform === "ios" ? "iPhone" : "Android";
      var platformKind = row.platform === "ios" ? "ios" : "android";
      var first = new Date(row.first_seen || "");
      var age = isNaN(first.getTime()) ? "" : Math.max(0, Math.round((Date.now() - first.getTime()) / 86400000));
      var id = String(row.install_id || "");
      var fleet = fleetForInstall(id);
      var busy = deletingId && deletingId === id;
      var ageLabel = age === "" ? "—" : age + "d";
      var group = filter === "fleet"
        ? (fleet ? fleet.company : "Fleet")
        : (row.is_subscribed ? "Subscribed" : "Not subscribed");
      var heading = "";
      if (group !== lastGroup) {
        lastGroup = group;
        heading = '<h3 class="direct-group-title">' + group + "</h3>";
      }
      return (
        heading +
        '<article class="direct-card' + (row.is_subscribed ? " is-subscribed" : " is-free") + '">' +
          '<header class="direct-card-head">' +
            '<div class="direct-card-title">' +
              '<div class="direct-card-name">' +
                '<span class="direct-platform direct-platform-' + platformKind + '">' + esc(phone) + "</span>" +
                badge(row.is_subscribed ? "Subscribed" : "Not subscribed", row.is_subscribed ? "paid" : "free") +
                badge(row.is_signed_in ? "Signed in" : "Guest", row.is_signed_in ? "account" : "guest") +
                (fleet ? badge(fleet.code, "account") : "") +
              "</div>" +
              '<div class="direct-card-sub">' +
                (fleet ? "<span>" + esc(fleet.company) + "</span>" : "") +
                (fleet && fleet.note ? "<span>" + esc(fleet.note) + "</span>" : "") +
                "<span>App " + esc(row.app_version || "—") + "</span>" +
                "<span>Last opened " + esc(openedDay(row.last_open_date) || "—") + "</span>" +
                "<span>Last activity " + esc(when(row.last_seen) || "—") + "</span>" +
                (row.subscribe_tapped_at
                  ? "<span>Last subscribe " + esc(when(row.subscribe_tapped_at)) + "</span>"
                  : "") +
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
            metric("Routes built", num(row.routes_built)) +
            metric("Go taps", num(row.navigations_started)) +
            metric("Arrived", num(row.arrivals)) +
            metric("Miles", Math.round(num(row.miles_driven))) +
            metric("Off line", num(row.off_route_trips)) +
            metric("Official Go", num(row.navigations_official)) +
            metric("Built Go", num(row.navigations_built)) +
            metric("Paywall", num(row.paywall_shown)) +
            metric("Subscribe", num(row.subscribe_tapped)) +
            metric("Restore", num(row.restore_tapped)) +
            metric("Waypoint cap", num(row.waypoint_cap)) +
            metric("Import lock", num(row.import_locked)) +
            metric("Chose free", num(row.free_tier_chosen)) +
            metric("PDF import", num(row.imports_pdf)) +
            metric("QR import", num(row.imports_qr)) +
            IMPORT_STATES.map(function (item) {
              var pdf = importCount(row, "pdf", item[0]);
              var qr = importCount(row, "qr", item[0]);
              var fail = importCount(row, "fail", item[0]);
              if (!pdf && !qr && !fail) return "";
              return metric(item[1] + " PDF", pdf) + metric(item[1] + " QR", qr) + metric(item[1] + " fail", fail);
            }).join("") +
            metric("Saved opened", num(row.saved_routes_opened)) +
            metric("Routes shared", num(row.routes_shared)) +
            (num(row.review_prompt_shown) || num(row.review_submit) || num(row.review_not_now) || num(row.review_cancel) || num(row.review_bounce) || num(row.review_star_1) || num(row.review_star_2) || num(row.review_star_3) || num(row.review_star_4) || num(row.review_star_5)
              ? metric("Rate shown", num(row.review_prompt_shown)) +
                metric("1★ tap", num(row.review_star_1)) +
                metric("2★ tap", num(row.review_star_2)) +
                metric("3★ tap", num(row.review_star_3)) +
                metric("4★ tap", num(row.review_star_4)) +
                metric("5★ tap", num(row.review_star_5)) +
                metric("Rate submit", num(row.review_submit)) +
                metric("Rate not now", num(row.review_not_now)) +
                metric("Rate cancel", num(row.review_cancel)) +
                metric("Rate bounce", num(row.review_bounce))
              : "") +
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
    window.STLLocalApi.get("/api/permitpath-fleets")
      .then(function (res) {
        var data = (res && res.data) || {};
        if (!res || !res.ok) {
          fleets = [];
          seats = [];
          fleetError = data.error || "Could not load fleet codes.";
        } else {
          fleets = data.fleets || [];
          seats = data.seats || [];
          fleetError = "";
        }
        render();
      })
      .catch(function () {
        fleets = [];
        seats = [];
        fleetError = "Could not load fleet codes.";
        render();
      });
  }

  window.STLDirectAnalytics = {
    mount: function (panel) {
      root = panel;
      rows = [];
      fleets = [];
      seats = [];
      fleetError = "";
      filter = "all";
      calendarMonth = "";
      selectedDay = "";
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

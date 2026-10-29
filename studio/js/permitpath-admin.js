(function () {
  "use strict";

  var PP_ADMIN_USER_ID = "ee962eec-a890-4ce8-9dcc-b9b30d241008";
  var MS_PER_DAY = 24 * 60 * 60 * 1000;
  var USAGE_EVENTS_WINDOW_DAYS = 90;
  var USAGE_EVENT_TYPE_LABELS = {
    app_open: "App opens",
    navigation_started: "Navigations",
    route_built: "Routes built"
  };
  var USAGE_EVENT_TYPE_ORDER = ["app_open", "navigation_started", "route_built"];
  var USER_FILTER_META = {
    all: { label: "All users" },
    subscribed: { label: "Subscribed" },
    not_subscribed: { label: "Not subscribed" },
    new7: { label: "New (7 days)" },
    new30: { label: "New (30 days)" },
    active7: { label: "Active (7 days)" },
    expiring_soon: { label: "Expiring soon" },
    paying_inactive: { label: "Subscribed, inactive 14d+" },
    lapsed: { label: "Lapsed" }
  };
  var KEYS_HINT =
    "Add Permit Path URL + service_role key to secrets/permitpath_*.txt on this Mac, run sql/019_permitpath_announce.sql, then open Studio once while signed in.";

  var root = null;
  var profiles = [];
  var deletedAccounts = [];
  var usageEvents = [];
  var subscriptionPeriods = [];
  var periodsByUser = {};
  var loading = false;
  var deleting = false;
  var tab = "overview";
  var lastAccountsTab = "overview";
  var fleetTrialRequests = [];
  var userFilter = null;
  var userSearch = "";
  var userSort = "seen";
  var generatedAt = "";
  var deletionFilter = "all";
  var selectedKey = "";
  var selectedProfile = null;
  var pendingDelete = null;

  function el(name) {
    return root ? root.querySelector('[data-el="' + name + '"]') : null;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function trim(s) {
    return String(s == null ? "" : s).trim();
  }
  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!msg && !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }
  function hideSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }
  function isTruthyFlag(v) {
    return v === true || v === "true" || v === 1 || v === "1";
  }
  function profileDate(value) {
    if (value === null || value === undefined || value === "") return null;
    var d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  function formatDisplayDate(isoOrStr) {
    if (isoOrStr === null || isoOrStr === undefined || isoOrStr === "") return "—";
    var d = new Date(isoOrStr);
    if (Number.isNaN(d.getTime())) return String(isoOrStr);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  function formatRelativeTimeAgo(isoOrStr) {
    if (isoOrStr === null || isoOrStr === undefined || isoOrStr === "") return "";
    var then = new Date(isoOrStr);
    if (Number.isNaN(then.getTime())) return "";
    var diffMs = Date.now() - then.getTime();
    if (diffMs < 0) diffMs = 0;
    var totalMinutes = Math.floor(diffMs / 60000);
    if (totalMinutes < 1) return "just now";
    var days = Math.floor(totalMinutes / (60 * 24));
    var hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    var minutes = totalMinutes % 60;
    var parts = [];
    if (days > 0) parts.push(days === 1 ? "1 day" : days + " days");
    if (hours > 0) parts.push(hours === 1 ? "1 hour" : hours + " hours");
    if (days === 0 && hours === 0) parts.push(minutes === 1 ? "1 minute" : minutes + " minutes");
    if (!parts.length) return "just now";
    if (parts.length === 1) return parts[0] + " ago";
    return parts.join(" and ") + " ago";
  }
  function isWithinPastDays(isoOrStr, days) {
    var d = profileDate(isoOrStr);
    if (!d) return false;
    return Date.now() - d.getTime() <= days * MS_PER_DAY;
  }
  function isOlderThanDays(isoOrStr, days) {
    var d = profileDate(isoOrStr);
    if (!d) return true;
    return Date.now() - d.getTime() > days * MS_PER_DAY;
  }
  function isExpiringWithinDays(isoOrStr, days) {
    var d = profileDate(isoOrStr);
    if (!d) return false;
    var now = Date.now();
    var end = now + days * MS_PER_DAY;
    var t = d.getTime();
    return t >= now && t <= end;
  }
  function isLapsedProfile(profile) {
    if (!profile || isTruthyFlag(profile.subscription_is_active)) return false;
    var exp = profileDate(profile.subscription_expires_at);
    if (!exp) return false;
    return exp.getTime() < Date.now();
  }
  function isPayingButInactiveProfile(profile) {
    if (!profile || !isTruthyFlag(profile.subscription_is_active)) return false;
    return isOlderThanDays(profile.last_seen_at, 14);
  }
  function profileListKey(profile) {
    if (!profile) return "";
    if (profile.user_id) return "u:" + String(profile.user_id);
    if (profile.id) return "p:" + String(profile.id);
    if (profile.email) return "e:" + String(profile.email).toLowerCase();
    return "";
  }
  function computeProfileMetrics(list) {
    var subscribed = 0;
    var new7 = 0;
    var new30 = 0;
    var active7 = 0;
    var expiringSoon = 0;
    var payingInactive = 0;
    var lapsed = 0;
    (list || []).forEach(function (p) {
      if (isTruthyFlag(p.subscription_is_active)) subscribed++;
      if (isWithinPastDays(p.created_at, 7)) new7++;
      if (isWithinPastDays(p.created_at, 30)) new30++;
      if (isWithinPastDays(p.last_seen_at, 7)) active7++;
      if (isTruthyFlag(p.subscription_is_active) && isExpiringWithinDays(p.subscription_expires_at, 7)) {
        expiringSoon++;
      }
      if (isPayingButInactiveProfile(p)) payingInactive++;
      if (isLapsedProfile(p)) lapsed++;
    });
    return {
      total: (list || []).length,
      subscribed: subscribed,
      notSubscribed: Math.max(0, (list || []).length - subscribed),
      new7: new7,
      new30: new30,
      active7: active7,
      expiringSoon: expiringSoon,
      payingInactive: payingInactive,
      lapsed: lapsed
    };
  }
  function profileMatchesUserFilter(profile, filterKey) {
    if (!filterKey || filterKey === "all") return true;
    if (filterKey === "subscribed") return isTruthyFlag(profile.subscription_is_active);
    if (filterKey === "not_subscribed") return !isTruthyFlag(profile.subscription_is_active);
    if (filterKey === "new7") return isWithinPastDays(profile.created_at, 7);
    if (filterKey === "new30") return isWithinPastDays(profile.created_at, 30);
    if (filterKey === "active7") return isWithinPastDays(profile.last_seen_at, 7);
    if (filterKey === "expiring_soon") {
      return (
        isTruthyFlag(profile.subscription_is_active) &&
        isExpiringWithinDays(profile.subscription_expires_at, 7)
      );
    }
    if (filterKey === "paying_inactive") return isPayingButInactiveProfile(profile);
    if (filterKey === "lapsed") return isLapsedProfile(profile);
    return true;
  }
  function profileMatchesSearch(profile, query) {
    var q = trim(query).toLowerCase();
    if (!q) return true;
    var name = trim(profile && profile.full_name).toLowerCase();
    var email = trim(profile && profile.email).toLowerCase();
    var uid = trim(profile && profile.user_id).toLowerCase();
    return name.indexOf(q) !== -1 || email.indexOf(q) !== -1 || uid.indexOf(q) !== -1;
  }
  function filteredProfiles() {
    return (profiles || []).filter(function (p) {
      return profileMatchesUserFilter(p, userFilter) && profileMatchesSearch(p, userSearch);
    });
  }
  function userIdFromUsageEvent(ev) {
    if (!ev || typeof ev !== "object") return "";
    if (ev.user_id) return String(ev.user_id);
    var m = ev.metadata;
    if (m && typeof m === "object") {
      if (m.user_id) return String(m.user_id);
      if (m.userId) return String(m.userId);
      if (m.auth_user_id) return String(m.auth_user_id);
      if (m.uid) return String(m.uid);
    }
    return "";
  }
  function eventTypeKey(ev) {
    var t = trim(ev && ev.event_type);
    if (USAGE_EVENT_TYPE_LABELS[t]) return t;
    return t || "other";
  }
  function aggregateUsageCounts(events) {
    var counts = Object.create(null);
    USAGE_EVENT_TYPE_ORDER.forEach(function (k) {
      counts[k] = 0;
    });
    (events || []).forEach(function (ev) {
      var key = eventTypeKey(ev);
      if (counts[key] === undefined) return;
      counts[key]++;
    });
    return counts;
  }
  function countProfileActivity(userId) {
    var counts = Object.create(null);
    USAGE_EVENT_TYPE_ORDER.forEach(function (k) {
      counts[k] = 0;
    });
    if (!userId) return counts;
    var want = String(userId);
    (usageEvents || []).forEach(function (ev) {
      if (userIdFromUsageEvent(ev) !== want) return;
      var key = eventTypeKey(ev);
      if (counts[key] !== undefined) counts[key]++;
    });
    return counts;
  }
  function indexPeriods(list) {
    var map = Object.create(null);
    (list || []).forEach(function (row) {
      var uid = trim(row && row.user_id);
      if (!uid) return;
      if (!map[uid]) map[uid] = [];
      map[uid].push(row);
    });
    periodsByUser = map;
  }
  function statusMeta(profile) {
    if (isTruthyFlag(profile && profile.subscription_is_active)) {
      return { kind: "active", label: "Subscribed" };
    }
    if (isLapsedProfile(profile)) return { kind: "lapsed", label: "Lapsed" };
    return { kind: "inactive", label: "Not subscribed" };
  }
  function formatShortDate(isoOrStr) {
    var d = profileDate(isoOrStr);
    if (!d) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  function planLabel(productId) {
    var raw = trim(productId);
    var s = raw.toLowerCase();
    if (!s) return "No plan";
    if (/year|annual/.test(s)) return "Yearly";
    if (/month/.test(s)) return "Monthly";
    if (/week/.test(s)) return "Weekly";
    return raw;
  }
  function renewLine(profile) {
    var when = formatShortDate(profile && profile.subscription_expires_at);
    if (isTruthyFlag(profile && profile.subscription_is_active)) {
      if (!when) return "Subscribed";
      return isTruthyFlag(profile.subscription_will_auto_renew) ? "Renews " + when : "Ends " + when;
    }
    if (isLapsedProfile(profile) && when) return "Ended " + when;
    return "Not subscribed";
  }
  function displayName(profile) {
    return trim(profile && profile.full_name) || trim(profile && profile.email) || trim(profile && profile.user_id) || "Unknown";
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error("Copy is not available in this browser."));
  }
  function byCreatedDesc(a, b) {
    var at = profileDate(a.created_at);
    var bt = profileDate(b.created_at);
    return (bt ? bt.getTime() : 0) - (at ? at.getTime() : 0);
  }
  function sortedProfiles(list) {
    var rows = (list || []).slice();
    rows.sort(function (a, b) {
      if (userSort === "name") return displayName(a).localeCompare(displayName(b));
      if (userSort === "new") return byCreatedDesc(a, b);
      var as = profileDate(a.last_seen_at);
      var bs = profileDate(b.last_seen_at);
      if (!as && !bs) return byCreatedDesc(a, b);
      if (!as) return 1;
      if (!bs) return -1;
      return bs.getTime() - as.getTime();
    });
    return rows;
  }
  function peopleInGroup(filterKey, limit) {
    var rows = (profiles || []).filter(function (p) {
      return profileMatchesUserFilter(p, filterKey);
    });
    if (filterKey === "expiring_soon") {
      rows.sort(function (a, b) {
        var at = profileDate(a.subscription_expires_at);
        var bt = profileDate(b.subscription_expires_at);
        return (at ? at.getTime() : 0) - (bt ? bt.getTime() : 0);
      });
    } else if (filterKey === "paying_inactive") {
      rows.sort(function (a, b) {
        var at = profileDate(a.last_seen_at);
        var bt = profileDate(b.last_seen_at);
        return (at ? at.getTime() : 0) - (bt ? bt.getTime() : 0);
      });
    } else if (filterKey === "lapsed") {
      rows.sort(function (a, b) {
        var at = profileDate(a.subscription_expires_at);
        var bt = profileDate(b.subscription_expires_at);
        return (bt ? bt.getTime() : 0) - (at ? at.getTime() : 0);
      });
    } else {
      rows.sort(byCreatedDesc);
    }
    return limit ? rows.slice(0, limit) : rows;
  }
  function usagePeopleCounts(events) {
    var sets = Object.create(null);
    USAGE_EVENT_TYPE_ORDER.forEach(function (key) {
      sets[key] = Object.create(null);
    });
    (events || []).forEach(function (ev) {
      var key = eventTypeKey(ev);
      var uid = userIdFromUsageEvent(ev);
      if (!sets[key] || !uid) return;
      sets[key][uid] = true;
    });
    var counts = Object.create(null);
    USAGE_EVENT_TYPE_ORDER.forEach(function (key) {
      counts[key] = Object.keys(sets[key]).length;
    });
    return counts;
  }
  function deletionSourceLabel(source) {
    if (source === "self") return "Self-deleted";
    if (source === "admin") return "Removed by admin";
    return source ? String(source) : "Unknown";
  }
  function filteredDeleted() {
    if (deletionFilter === "self" || deletionFilter === "admin") {
      return (deletedAccounts || []).filter(function (row) {
        return row.deletion_source === deletionFilter;
      });
    }
    return (deletedAccounts || []).slice();
  }
  function errorMessage(err) {
    var msg = (err && err.message) || String(err || "Request failed.");
    if (/permitpath_|service_role|keys missing|permitpath_supabase/i.test(msg)) return KEYS_HINT;
    return msg;
  }

  function isAccountsTab(name) {
    return name === "overview" || name === "users" || name === "deleted" || name === "accounts";
  }

  function shell() {
    return (
      '<div class="ops-workspace pp-admin">' +
        '<div class="ops-header">' +
          "<h1>Permit Path Admin</h1>" +
          "<p>Account holders, phone analytics, and company fleets.</p>" +
        "</div>" +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="ops-filters pp-admin-tabs">' +
          '<button type="button" class="ops-pill" data-tab="accounts">Account holders overview</button>' +
          '<button type="button" class="ops-pill" data-tab="direct">Direct App Analytics</button>' +
          '<button type="button" class="ops-pill" data-tab="fleet">Fleet Management</button>' +
          '<button type="button" class="btn btn-ghost" data-el="refresh" style="margin-left:auto">Refresh</button>' +
        "</div>" +
        '<div class="pp-admin-subtabs" data-el="account-subtabs" hidden>' +
          '<button type="button" class="ops-pill" data-subtab="overview">Overview</button>' +
          '<button type="button" class="ops-pill" data-subtab="users">Users</button>' +
          '<button type="button" class="ops-pill" data-subtab="deleted">Deleted</button>' +
        "</div>" +
        '<div class="ops-body pp-admin-body" data-el="body"></div>' +
        '<div class="pp-admin-drawer-backdrop" data-el="drawer-backdrop" hidden></div>' +
        '<aside class="pp-admin-drawer" data-el="drawer" hidden aria-hidden="true">' +
          '<div class="pp-admin-drawer-head">' +
            "<div>" +
              '<p class="pp-admin-drawer-kicker">User</p>' +
              '<h2 class="pp-admin-drawer-title" data-el="drawer-title">Details</h2>' +
            "</div>" +
            '<button type="button" class="btn btn-ghost" data-el="drawer-close">Close</button>' +
          "</div>" +
          '<div class="pp-admin-drawer-body" data-el="drawer-body"></div>' +
        "</aside>" +
        '<div class="pp-admin-modal" data-el="delete-modal" hidden>' +
          '<div class="pp-admin-modal-card">' +
            "<h3>Delete this account?</h3>" +
            "<p>This permanently removes the account from Permit Path. Their profile and usage data will be deleted. This cannot be undone.</p>" +
            '<div data-el="delete-identity"></div>' +
            '<div class="pp-admin-modal-actions">' +
              '<button type="button" class="btn btn-ghost" data-el="delete-cancel">Cancel</button>' +
              '<button type="button" class="btn btn-danger" data-el="delete-confirm">Delete account</button>' +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function syncTabPills() {
    if (!root) return;
    var onAccounts = isAccountsTab(tab) && tab !== "direct" && tab !== "fleet";
    root.querySelectorAll(".pp-admin-tabs [data-tab]").forEach(function (btn) {
      var name = btn.getAttribute("data-tab");
      var active = name === tab || (name === "accounts" && onAccounts);
      btn.classList.toggle("is-on", active);
    });
    var sub = el("account-subtabs");
    if (sub) {
      sub.hidden = !onAccounts;
      sub.querySelectorAll("[data-subtab]").forEach(function (btn) {
        btn.classList.toggle("is-on", btn.getAttribute("data-subtab") === tab);
      });
    }
    var refresh = el("refresh");
    if (refresh) refresh.textContent = loading ? "Loading…" : "Refresh";
  }

  function setTab(next) {
    var wanted = next || "overview";
    if (wanted === "accounts") wanted = lastAccountsTab || "overview";
    tab = wanted;
    if (isAccountsTab(tab) && tab !== "accounts") lastAccountsTab = tab;
    if (tab !== "users") closeDrawer();
    render();
  }

  function setUserFilter(filterKey) {
    if (!filterKey || filterKey === "all") userFilter = null;
    else if (userFilter === filterKey) userFilter = null;
    else userFilter = filterKey;
    tab = "users";
    lastAccountsTab = "users";
    render();
  }

  function openDrawer(profile) {
    selectedProfile = profile || null;
    selectedKey = profileListKey(profile);
    var drawer = el("drawer");
    var backdrop = el("drawer-backdrop");
    var title = el("drawer-title");
    var body = el("drawer-body");
    if (!drawer || !body || !profile) return;
    if (title) {
      title.textContent =
        trim(profile.full_name) || trim(profile.email) || "User details";
    }
    body.innerHTML = drawerHtml(profile);
    drawer.hidden = false;
    drawer.setAttribute("aria-hidden", "false");
    if (backdrop) backdrop.hidden = false;
    bindDrawer();
    renderBodyOnly();
  }

  function closeDrawer() {
    selectedProfile = null;
    selectedKey = "";
    var drawer = el("drawer");
    var backdrop = el("drawer-backdrop");
    var body = el("drawer-body");
    if (drawer) {
      drawer.hidden = true;
      drawer.setAttribute("aria-hidden", "true");
    }
    if (backdrop) backdrop.hidden = true;
    if (body) body.innerHTML = "";
    var modal = el("delete-modal");
    if (!modal || modal.hidden) {
      /* keep page scrollable */
    }
  }

  function openDeleteModal(profile) {
    pendingDelete = profile || null;
    var modal = el("delete-modal");
    var identity = el("delete-identity");
    if (!modal || !pendingDelete) return;
    if (identity) {
      identity.innerHTML =
        '<p class="pp-admin-modal-name">' +
        esc(trim(profile.full_name) || "Unnamed user") +
        "</p>" +
        (trim(profile.email)
          ? '<p class="pp-admin-modal-email">' + esc(trim(profile.email)) + "</p>"
          : "");
    }
    modal.hidden = false;
  }

  function closeDeleteModal() {
    pendingDelete = null;
    var modal = el("delete-modal");
    if (modal) modal.hidden = true;
  }

  function drawerHtml(profile) {
    var uid = trim(profile.user_id);
    var status = statusMeta(profile);
    var activity = countProfileActivity(uid);
    var periods = periodsByUser[uid] || [];
    var html = "";
    html += '<div class="pp-admin-drawer-status"><span class="pp-admin-pill pp-admin-pill--' + esc(status.kind) + '">' + esc(status.label) + "</span>";
    html += '<span class="pp-admin-drawer-plan">' + esc(planLabel(profile.subscription_product_id)) + " · " + esc(renewLine(profile)) + "</span></div>";
    if (trim(profile.email)) {
      html += '<button type="button" class="btn btn-ghost" data-el="copy-email">Copy email</button>';
    }
    html += '<div class="pp-admin-detail-grid">';
    html += detailCell("Email", trim(profile.email) || "—");
    html += detailCell("User ID", uid || "—", true);
    html += detailCell("Status", status.label);
    html += detailCell(
      "Routes built",
      profile.routes_built_count == null ? "—" : String(profile.routes_built_count)
    );
    html += detailCell("Created", formatDisplayDate(profile.created_at));
    html += detailCell(
      "Last seen",
      formatDisplayDate(profile.last_seen_at) +
        (formatRelativeTimeAgo(profile.last_seen_at)
          ? " · " + formatRelativeTimeAgo(profile.last_seen_at)
          : "")
    );
    html += detailCell("Expires", formatDisplayDate(profile.subscription_expires_at));
    html += detailCell(
      "Auto renew",
      profile.subscription_will_auto_renew == null
        ? "—"
        : isTruthyFlag(profile.subscription_will_auto_renew)
          ? "Yes"
          : "No"
    );
    html += "</div>";
    html += detailFull("Product ID", trim(profile.subscription_product_id) || "—");
    html += detailFull("Original transaction", trim(profile.original_transaction_id) || "—");

    html += '<div class="pp-admin-activity">';
    html += "<h4>Activity (last " + USAGE_EVENTS_WINDOW_DAYS + " days)</h4>";
    html += '<div class="pp-admin-activity-grid">';
    USAGE_EVENT_TYPE_ORDER.forEach(function (key) {
      html +=
        '<div class="pp-admin-activity-item"><strong>' +
        esc(String(activity[key] || 0)) +
        "</strong><span>" +
        esc(USAGE_EVENT_TYPE_LABELS[key] || key) +
        "</span></div>";
    });
    html += "</div></div>";

    html += '<div class="pp-admin-periods">';
    html += "<h4>Subscription periods</h4>";
    if (!periods.length) {
      html += '<p class="sub">No periods on file.</p>';
    } else {
      html += '<ul class="pp-admin-period-list">';
      periods.slice(0, 12).forEach(function (row) {
        html +=
          "<li><span>" +
          esc(formatDisplayDate(row.started_at)) +
          " → " +
          esc(row.ended_at ? formatDisplayDate(row.ended_at) : "open") +
          "</span><span class=\"muted\">" +
          esc(trim(row.product_id) || "—") +
          "</span></li>";
      });
      html += "</ul>";
    }
    html += "</div>";

    html +=
      '<div class="pp-admin-danger">' +
      "<h4>Danger zone</h4>" +
      "<p>Permanently delete this Permit Path account.</p>" +
      '<button type="button" class="btn btn-danger" data-el="drawer-delete">Delete account</button>' +
      "</div>";
    return html;
  }

  function detailCell(label, value, code) {
    return (
      '<div class="pp-admin-detail-cell"><span class="pp-admin-detail-label">' +
      esc(label) +
      "</span><div class=\"pp-admin-detail-value\">" +
      (code ? "<code>" + esc(value) + "</code>" : esc(value)) +
      "</div></div>"
    );
  }
  function detailFull(label, value) {
    return (
      '<div class="pp-admin-detail-full"><span class="pp-admin-detail-label">' +
      esc(label) +
      '</span><div class="pp-admin-detail-value">' +
      esc(value) +
      "</div></div>"
    );
  }

  function personButton(profile, extra) {
    var key = profileListKey(profile);
    var email = trim(profile.email);
    var name = displayName(profile);
    return (
      '<button type="button" class="pp-admin-person" data-open-profile="' +
      esc(key) +
      '"><span class="pp-admin-person-name">' +
      esc(name) +
      "</span><span class=\"pp-admin-person-meta\">" +
      esc(extra || email || renewLine(profile)) +
      "</span></button>"
    );
  }

  function watchGroup(title, filterKey, emptyText) {
    var rows = peopleInGroup(filterKey, 5);
    var total = (profiles || []).filter(function (p) {
      return profileMatchesUserFilter(p, filterKey);
    }).length;
    var html =
      '<section class="pp-admin-watch-group"><div class="pp-admin-watch-head"><h4>' +
      esc(title) +
      "</h4>";
    if (total) {
      html +=
        '<button type="button" class="btn btn-ghost" data-user-filter="' +
        esc(filterKey) +
        '">See all ' +
        total +
        "</button>";
    }
    html += "</div>";
    if (!rows.length) {
      html += '<p class="sub">' + esc(emptyText) + "</p>";
    } else {
      rows.forEach(function (profile) {
        var extra = renewLine(profile);
        if (filterKey === "paying_inactive") {
          extra = formatRelativeTimeAgo(profile.last_seen_at) || "No last seen";
        }
        html += personButton(profile, extra);
      });
    }
    html += "</section>";
    return html;
  }

  function overviewHtml() {
    var metrics = computeProfileMetrics(profiles);
    var activity = aggregateUsageCounts(usageEvents);
    var people = usagePeopleCounts(usageEvents);
    var deletedCount = (deletedAccounts || []).length;
    var updated = formatRelativeTimeAgo(generatedAt);
    var newest = (profiles || []).slice().sort(byCreatedDesc).slice(0, 6);
    var html = "";

    if (updated) {
      html += '<p class="sub pp-admin-updated">Updated ' + esc(updated) + ".</p>";
    }

    html += '<div class="ops-card"><div class="pp-admin-watch-head"><h3>Free trial requests</h3>';
    html += '<button type="button" class="btn btn-ghost" data-tab-jump="fleet">Fleet Management</button></div>';
    if (!fleetTrialRequests.length) {
      html += '<p class="sub">No fleets are waiting on trial codes.</p>';
    } else {
      fleetTrialRequests.forEach(function (fleet) {
        var when = fleet.trial_requested_at ? formatRelativeTimeAgo(fleet.trial_requested_at) || formatShortDate(fleet.trial_requested_at) : "";
        html += '<p><strong>' + esc(fleet.company_name) + "</strong> · " + esc(String(fleet.trial_request_seats)) + " drivers";
        if (fleet.portal_email) html += " · " + esc(fleet.portal_email);
        if (when) html += " · " + esc(when);
        html += "</p>";
      });
    }
    html += "</div>";

    html += '<div class="ops-chips pp-admin-chips">';
    html += chipCard("Users", metrics.total, "all", userFilter == null, "");
    html += chipCard("Subscribed", metrics.subscribed, "subscribed", userFilter === "subscribed", "ok");
    html += chipCard("Active in 7 days", metrics.active7, "active7", userFilter === "active7", "");
    html += chipCard("New in 7 days", metrics.new7, "new7", userFilter === "new7", "");
    html +=
      '<button type="button" class="ops-chip pp-admin-chip' +
      (deletedCount ? " danger" : "") +
      (tab === "deleted" ? " is-on" : "") +
      '" data-tab-jump="deleted"><span class="k">Deleted</span><span class="v">' +
      esc(String(deletedCount)) +
      "</span></button>";
    html += "</div>";

    html += '<div class="ops-card"><h3>Needs a look</h3>';
    html += '<div class="pp-admin-watch">';
    html += watchGroup("Expiring in 7 days", "expiring_soon", "No subscriptions end in the next 7 days.");
    html += watchGroup("Subscribed, quiet 14 days", "paying_inactive", "Every subscriber has opened the app in the last 14 days.");
    html += watchGroup("Lapsed", "lapsed", "No lapsed subscriptions.");
    html += "</div></div>";

    html += '<div class="ops-card"><h3>Activity · last ' + USAGE_EVENTS_WINDOW_DAYS + " days</h3>";
    html += '<div class="pp-admin-activity-grid">';
    USAGE_EVENT_TYPE_ORDER.forEach(function (key) {
      var folks = people[key] || 0;
      html +=
        '<div class="pp-admin-activity-item"><strong>' +
        esc(String(activity[key] || 0)) +
        "</strong><span>" +
        esc(USAGE_EVENT_TYPE_LABELS[key] || key) +
        "</span><span class=\"muted\">" +
        esc(folks === 1 ? "1 person" : folks + " people") +
        "</span></div>";
    });
    html += "</div></div>";

    html += '<div class="ops-card"><div class="pp-admin-watch-head"><h3>Newest accounts</h3>';
    html +=
      '<button type="button" class="btn btn-ghost" data-user-filter="new30">New in 30 days · ' +
      metrics.new30 +
      "</button></div>";
    if (!newest.length) {
      html += '<p class="sub">No accounts yet.</p>';
    } else {
      newest.forEach(function (profile) {
        var when = formatRelativeTimeAgo(profile.created_at) || formatShortDate(profile.created_at);
        html += personButton(profile, (when ? when + " · " : "") + renewLine(profile));
      });
    }
    html += "</div>";
    return html;
  }

  function chipCard(label, value, filterKey, active, tone, staticOnly) {
    var cls = "ops-chip pp-admin-chip" + (tone ? " " + tone : "") + (active ? " is-on" : "");
    if (staticOnly || !filterKey) {
      return (
        '<div class="' +
        cls +
        '"><span class="k">' +
        esc(label) +
        '</span><span class="v">' +
        esc(String(value)) +
        "</span></div>"
      );
    }
    return (
      '<button type="button" class="' +
      cls +
      '" data-user-filter="' +
      esc(filterKey) +
      '"><span class="k">' +
      esc(label) +
      '</span><span class="v">' +
      esc(String(value)) +
      "</span></button>"
    );
  }

  function usersHtml() {
    var list = sortedProfiles(filteredProfiles());
    var html = "";
    html += '<div class="pp-admin-toolbar">';
    html +=
      '<div class="ops-field pp-admin-search"><label>Search users</label>' +
      '<input data-el="user-search" type="search" placeholder="Name, email, or user ID…" value="' +
      esc(userSearch) +
      '" autocomplete="off" spellcheck="false" /></div>';
    html += '<div class="ops-filters pp-admin-sort">';
    [
      ["seen", "Last seen"],
      ["new", "Newest"],
      ["name", "Name"]
    ].forEach(function (pair) {
      html +=
        '<button type="button" class="ops-pill' +
        (userSort === pair[0] ? " is-on" : "") +
        '" data-user-sort="' +
        pair[0] +
        '">' +
        pair[1] +
        "</button>";
    });
    html += "</div>";
    if (userFilter) {
      var meta = USER_FILTER_META[userFilter];
      html +=
        '<div class="pp-admin-filter-chip">Showing: ' +
        esc(meta ? meta.label : userFilter) +
        ' <button type="button" class="btn btn-ghost" data-el="clear-filter">Clear</button></div>';
    }
    html +=
      '<span class="pp-admin-count">' +
      (userFilter || trim(userSearch)
        ? list.length + " of " + profiles.length + " users shown"
        : profiles.length + (profiles.length === 1 ? " user" : " users")) +
      "</span>";
    html += "</div>";

    if (!profiles.length) {
      html += '<div class="ops-empty">No profiles found.</div>';
      return html;
    }
    if (!list.length) {
      html +=
        '<div class="ops-empty">' +
        (trim(userSearch)
          ? "No users match “" + esc(userSearch) + "”."
          : "No users match this filter.") +
        "</div>";
      return html;
    }

    html += '<div class="pp-admin-table-wrap"><table class="pp-admin-table"><thead><tr>';
    ["Name", "Status", "Last seen", "Routes", "Plan"].forEach(function (h) {
      html += "<th>" + esc(h) + "</th>";
    });
    html += "</tr></thead><tbody>";
    list.forEach(function (p) {
      var key = profileListKey(p);
      var status = statusMeta(p);
      var ago = formatRelativeTimeAgo(p.last_seen_at);
      html +=
        '<tr data-profile-key="' +
        esc(key) +
        '"' +
        (key && key === selectedKey ? ' class="is-selected"' : "") +
        ">" +
        '<td data-label="Name"><div class="pp-admin-table-name">' +
        esc(displayName(p)) +
        "</div>" +
        (trim(p.email) && trim(p.full_name)
          ? '<div class="pp-admin-table-sub">' + esc(trim(p.email)) + "</div>"
          : "") +
        '<div class="pp-admin-table-sub">' +
        esc(renewLine(p)) +
        "</div></td>" +
        '<td data-label="Status"><span class="pp-admin-pill pp-admin-pill--' +
        esc(status.kind) +
        '">' +
        esc(status.label) +
        "</span></td>" +
        '<td data-label="Last seen" title="' +
        esc(formatDisplayDate(p.last_seen_at)) +
        '">' +
        esc(ago || "—") +
        "</td>" +
        '<td data-label="Routes">' +
        esc(p.routes_built_count == null ? "—" : String(p.routes_built_count)) +
        "</td>" +
        '<td data-label="Plan">' +
        esc(planLabel(p.subscription_product_id)) +
        "</td>" +
        "</tr>";
    });
    html += "</tbody></table></div>";
    return html;
  }

  function deletedHtml() {
    var list = filteredDeleted();
    var html = "";
    html += '<p class="sub">Users who deleted themselves in the app, or accounts you removed from this page.</p>';
    html += '<div class="ops-filters">';
    [
      ["all", "All"],
      ["self", "Self-deleted"],
      ["admin", "Removed by admin"]
    ].forEach(function (pair) {
      html +=
        '<button type="button" class="ops-pill' +
        (deletionFilter === pair[0] ? " is-on" : "") +
        '" data-deletion-filter="' +
        pair[0] +
        '">' +
        pair[1] +
        "</button>";
    });
    html +=
      '<span class="pp-admin-count" style="margin-left:auto">' +
      (deletionFilter !== "all"
        ? list.length + " of " + deletedAccounts.length + " deletions"
        : deletedAccounts.length + (deletedAccounts.length === 1 ? " deletion" : " deletions")) +
      "</span></div>";

    if (!deletedAccounts.length) {
      html += '<div class="ops-empty">No deleted accounts yet.</div>';
      return html;
    }
    if (!list.length) {
      html += '<div class="ops-empty">No deletions match this filter.</div>';
      return html;
    }

    html += '<div class="pp-admin-deleted-list">';
    list.forEach(function (row) {
      var title = trim(row.full_name) || trim(row.email) || trim(row.user_id) || "Unknown account";
      var ago = formatRelativeTimeAgo(row.deleted_at);
      html +=
        '<details class="pp-admin-deleted-row">' +
        "<summary>" +
        '<div class="pp-admin-deleted-main"><strong>' +
        esc(title) +
        "</strong>" +
        (trim(row.full_name) && trim(row.email)
          ? '<span class="muted">' + esc(trim(row.email)) + "</span>"
          : "") +
        "</div>" +
        '<div class="pp-admin-deleted-aside">' +
        '<span class="pp-admin-pill pp-admin-pill--' +
        (row.deletion_source === "admin" ? "admin" : "self") +
        '">' +
        esc(deletionSourceLabel(row.deletion_source)) +
        "</span>" +
        (ago ? '<span class="muted">' + esc(ago) + "</span>" : "") +
        "</div></summary>" +
        '<div class="pp-admin-detail-grid">' +
        detailCell("Email", trim(row.email) || "—") +
        detailCell("User ID", trim(row.user_id) || "—", true) +
        detailCell("Deletion type", deletionSourceLabel(row.deletion_source)) +
        detailCell("Deleted", formatDisplayDate(row.deleted_at)) +
        detailCell("Profile created", formatDisplayDate(row.profile_created_at)) +
        detailCell("Last seen", formatDisplayDate(row.last_seen_at)) +
        detailCell(
          "Routes built",
          row.routes_built_count == null ? "—" : String(row.routes_built_count)
        ) +
        detailCell("Was subscribed", isTruthyFlag(row.subscription_is_active) ? "Yes" : "No") +
        "</div>" +
        detailFull("Subscription product ID", trim(row.subscription_product_id) || "—") +
        "</details>";
    });
    html += "</div>";
    return html;
  }

  function renderBodyOnly() {
    var body = el("body");
    if (!body) return;
    if (loading && !profiles.length && !deletedAccounts.length) {
      body.innerHTML = '<div class="ops-empty">Loading Permit Path accounts…</div>';
      return;
    }
    if (tab === "direct" || tab === "fleet") {
      var which = tab === "fleet" ? "fleet" : "direct";
      var apiName = tab === "fleet" ? "STLFleetManagement" : "STLDirectAnalytics";
      if (body.getAttribute("data-panel") !== which && window[apiName]) {
        if (body.getAttribute("data-panel") === "direct" && window.STLDirectAnalytics) window.STLDirectAnalytics.unmount();
        if (body.getAttribute("data-panel") === "fleet" && window.STLFleetManagement) window.STLFleetManagement.unmount();
        body.setAttribute("data-panel", which);
        body.removeAttribute("data-direct");
        window[apiName].mount(body);
      }
      return;
    }
    if (body.getAttribute("data-panel")) {
      if (window.STLDirectAnalytics && window.STLDirectAnalytics.unmount) window.STLDirectAnalytics.unmount();
      if (window.STLFleetManagement && window.STLFleetManagement.unmount) window.STLFleetManagement.unmount();
      body.removeAttribute("data-panel");
      body.removeAttribute("data-direct");
    }
    if (tab === "users") body.innerHTML = usersHtml();
    else if (tab === "deleted") body.innerHTML = deletedHtml();
    else body.innerHTML = overviewHtml();
    bindBody();
  }

  function render() {
    syncTabPills();
    renderBodyOnly();
  }

  function bindBody() {
    if (!root) return;
    root.querySelectorAll("[data-user-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setUserFilter(btn.getAttribute("data-user-filter"));
      });
    });
    root.querySelectorAll("[data-tab-jump]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTab(btn.getAttribute("data-tab-jump") || "overview");
      });
    });
    root.querySelectorAll("[data-deletion-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        deletionFilter = btn.getAttribute("data-deletion-filter") || "all";
        render();
      });
    });
    var search = el("user-search");
    if (search) {
      search.addEventListener("input", function () {
        userSearch = search.value || "";
        renderBodyOnly();
        var again = el("user-search");
        if (again) {
          again.focus();
          var len = again.value.length;
          try {
            again.setSelectionRange(len, len);
          } catch (_e) {}
        }
      });
    }
    var clear = el("clear-filter");
    if (clear) {
      clear.addEventListener("click", function () {
        userFilter = null;
        render();
      });
    }
    root.querySelectorAll("[data-user-sort]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        userSort = btn.getAttribute("data-user-sort") || "seen";
        renderBodyOnly();
      });
    });
    root.querySelectorAll("[data-open-profile]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-open-profile");
        var profile = profiles.filter(function (p) {
          return profileListKey(p) === key;
        })[0];
        if (profile) openDrawer(profile);
      });
    });
    root.querySelectorAll("tr[data-profile-key]").forEach(function (row) {
      row.addEventListener("click", function () {
        var key = row.getAttribute("data-profile-key");
        var profile = profiles.filter(function (p) {
          return profileListKey(p) === key;
        })[0];
        if (profile) openDrawer(profile);
      });
    });
  }

  function bindDrawer() {
    var del = el("drawer-delete");
    if (del) {
      del.addEventListener("click", function () {
        if (selectedProfile) openDeleteModal(selectedProfile);
      });
    }
    var copy = el("copy-email");
    if (copy && selectedProfile && trim(selectedProfile.email)) {
      copy.addEventListener("click", function () {
        copyText(trim(selectedProfile.email)).then(function () {
          showMsg("Copied " + trim(selectedProfile.email), true);
        }).catch(function () {
          showMsg("Could not copy that email.", false);
        });
      });
    }
  }

  function bindShell() {
    if (!root) return;
    root.querySelectorAll(".pp-admin-tabs [data-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTab(btn.getAttribute("data-tab"));
      });
    });
    var sub = el("account-subtabs");
    if (sub) {
      sub.querySelectorAll("[data-subtab]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          setTab(btn.getAttribute("data-subtab") || "overview");
        });
      });
    }
    var refresh = el("refresh");
    if (refresh) {
      refresh.addEventListener("click", function () {
        if (tab === "direct" && window.STLDirectAnalytics && window.STLDirectAnalytics.shown) {
          window.STLDirectAnalytics.shown();
          return;
        }
        if (tab === "fleet" && window.STLFleetManagement && window.STLFleetManagement.shown) {
          window.STLFleetManagement.shown();
          return;
        }
        load(true);
      });
    }
    var close = el("drawer-close");
    if (close) close.addEventListener("click", closeDrawer);
    var backdrop = el("drawer-backdrop");
    if (backdrop) backdrop.addEventListener("click", closeDrawer);
    var cancel = el("delete-cancel");
    if (cancel) cancel.addEventListener("click", closeDeleteModal);
    var confirm = el("delete-confirm");
    if (confirm) {
      confirm.addEventListener("click", function () {
        if (pendingDelete) handleDelete(pendingDelete);
      });
    }
  }

  function loadFleetTrialRequests() {
    if (!window.STLLocalApi || typeof window.STLLocalApi.get !== "function") return;
    window.STLLocalApi.get("/api/permitpath-fleets").then(function (res) {
      var data = (res && res.data) || {};
      var fleets = data.fleets || [];
      var seats = data.seats || [];
      fleetTrialRequests = fleets.filter(function (fleet) {
        var asked = Number(fleet.trial_request_seats) || 0;
        if (!asked) return false;
        var have = seats.filter(function (seat) {
          return seat.fleet_id === fleet.id && String(seat.billing || "paid") === "trial" && seat.active !== false;
        }).length;
        return asked > have;
      });
      if (tab === "overview") renderBodyOnly();
    }).catch(function () {});
  }

  function load(force) {
    if (loading && !force) return;
    if (!window.STLLocalApi || typeof window.STLLocalApi.get !== "function") {
      showMsg(KEYS_HINT, false);
      return;
    }
    loading = true;
    showMsg("", true);
    syncTabPills();
    if (!profiles.length) renderBodyOnly();
    window.STLLocalApi.get("/api/permitpath-admin/snapshot")
      .then(function (res) {
        loading = false;
        syncTabPills();
        if (!res || !res.ok) {
          var err = (res && res.data && res.data.error) || "Could not load Permit Path admin data.";
          showMsg(errorMessage({ message: err }), false);
          render();
          return;
        }
        var data = res.data || {};
        profiles = Array.isArray(data.profiles) ? data.profiles : [];
        deletedAccounts = Array.isArray(data.deleted_accounts) ? data.deleted_accounts : [];
        usageEvents = Array.isArray(data.usage_events) ? data.usage_events : [];
        subscriptionPeriods = Array.isArray(data.subscription_periods) ? data.subscription_periods : [];
        indexPeriods(subscriptionPeriods);
        generatedAt = (data.stats && data.stats.generated_at) || new Date().toISOString();
        showMsg("");
        render();
        loadFleetTrialRequests();
      })
      .catch(function (err) {
        loading = false;
        syncTabPills();
        showMsg(errorMessage(err), false);
        render();
      });
  }

  function handleDelete(profile) {
    var uid = trim(profile && profile.user_id);
    if (!uid) {
      showMsg("Cannot delete: this profile has no user id.", false);
      return;
    }
    if (uid === PP_ADMIN_USER_ID) {
      showMsg("Cannot delete the admin account.", false);
      return;
    }
    if (!window.STLLocalApi || typeof window.STLLocalApi.post !== "function") {
      showMsg(KEYS_HINT, false);
      return;
    }
    if (deleting) return;
    deleting = true;
    var confirmBtn = el("delete-confirm");
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Deleting…";
    }
    showMsg("Deleting user…", true);
    window.STLLocalApi.post("/api/permitpath-admin/delete-user", { user_id: uid })
      .then(function (res) {
        deleting = false;
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Delete account";
        }
        if (!res || !res.ok) {
          var err = (res && res.data && res.data.error) || "Delete failed.";
          showMsg(errorMessage({ message: err }), false);
          return;
        }
        profiles = profiles.filter(function (p) {
          return String(p.user_id || "") !== uid;
        });
        usageEvents = usageEvents.filter(function (ev) {
          return String(ev.user_id || "") !== uid;
        });
        closeDeleteModal();
        closeDrawer();
        showMsg("Account deleted.", true);
        load(true);
      })
      .catch(function (err) {
        deleting = false;
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Delete account";
        }
        showMsg(errorMessage(err), false);
      });
  }

  window.STLPermitPathAdmin = {
    mount: function (host) {
      root = host;
      var panel = host && host.closest ? host.closest(".panel") : null;
      if (panel) panel.classList.add("ops-wide");
      root.innerHTML = shell();
      hideSave();
      bindShell();
      render();
      load(false);
    },
    unmount: function () {
      closeDeleteModal();
      closeDrawer();
      if (window.STLDirectAnalytics && window.STLDirectAnalytics.unmount) window.STLDirectAnalytics.unmount();
      if (window.STLFleetManagement && window.STLFleetManagement.unmount) window.STLFleetManagement.unmount();
      var panel = root && root.closest ? root.closest(".panel") : null;
      if (panel) panel.classList.remove("ops-wide");
      root = null;
    }
  };
})();

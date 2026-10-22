(function () {
  "use strict";

  var KEYS_HINT =
    "Add Pilot Car 4 Hire URL + service_role key to secrets/pilotcar4hire_*.txt on this Mac, run sql/024_pilotcar4hire_announce.sql, then open Studio once while signed in.";
  var PROTECTED_EMAIL = "seantylerlee@outlook.com";

  var LISTING_SERVICES = [
    { value: "Lead", label: "Lead" },
    { value: "Chase", label: "Chase" },
    { value: "HiPole", label: "Hi-Pole" },
    { value: "Steereman", label: "Steereman" },
    { value: "RouteSurvey", label: "Route Survey" },
    { value: "MultipleCars", label: "Multiple Cars" },
    { value: "Flagger", label: "Flagger" }
  ];

  var US_STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
  ];

  var CERTIFICATION_REQUIRED_STATES = [
    "AZ", "CO", "FL", "GA", "KS", "MN", "NY", "NC", "OK", "PA",
    "TX", "UT", "VA", "WA", "LA", "NM", "NV", "WI"
  ];

  var STATE_NAMES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
    FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
    IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
    ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
    MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
    NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
    NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
    OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
    SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
    VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"
  };

  var root = null;
  var view = "home";
  var pilots = [];
  var handoffs = [];
  var reviews = [];
  var reviewsError = "";
  var reviewFilter = "pending";
  var reviewsBanner = "";
  var reviewsBannerBad = false;
  var openReviewsOnLoad = false;
  var stats = null;
  var loading = false;
  var saving = false;
  var formMode = "create";
  var editingPilot = null;
  var incompleteOnly = false;
  var listingOnly = false;
  var pilotSearch = "";
  var pilotSort = "new";
  var formBanner = "";
  var formBannerBad = false;
  var pilotsBanner = "";
  var pilotsBannerBad = false;
  var emailsBanner = "";
  var emailsBannerBad = false;
  var successWarning = "";
  var successPassword = "";
  var formDraft = emptyDraft();

  function emptyDraft() {
    return {
      contactName: "",
      loginEmail: "",
      loginPassword: "",
      businessName: "",
      yearsExperience: "",
      phone: "",
      email: "",
      services: [],
      statesCertified: [],
      homeCity: "",
      homeState: "",
      description: "",
      lastSyncedEmail: ""
    };
  }

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
  function getStateName(code) {
    return STATE_NAMES[String(code || "").toUpperCase()] || code || "";
  }
  function formatHomeLocation(city, stateCode) {
    var parts = [];
    if (trim(city)) parts.push(trim(city));
    if (stateCode) parts.push(getStateName(stateCode));
    return parts.join(", ");
  }
  function formatSignedUp(value) {
    if (!value) return "—";
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  function hideSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }
  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!msg && !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }
  function errorMessage(err) {
    var msg = (err && err.message) || String(err || "Request failed.");
    if (/pilotcar4hire_|service_role|keys missing|pilotcar4hire_supabase/i.test(msg)) return KEYS_HINT;
    return msg;
  }
  function apiGet(path) {
    if (!window.STLLocalApi || typeof window.STLLocalApi.get !== "function") {
      return Promise.reject(new Error("Studio API unavailable."));
    }
    return window.STLLocalApi.get(path).then(function (res) {
      if (!res.ok) throw new Error((res.data && res.data.error) || "Request failed.");
      return res.data || {};
    });
  }
  function apiPost(path, body) {
    if (!window.STLLocalApi || typeof window.STLLocalApi.post !== "function") {
      return Promise.reject(new Error("Studio API unavailable."));
    }
    return window.STLLocalApi.post(path, body || {}).then(function (res) {
      if (!res.ok) throw new Error((res.data && res.data.error) || "Request failed.");
      return res.data || {};
    });
  }
  function generatePilotPassword(name) {
    var trimmed = trim(name);
    var base = trimmed ? trimmed.split(/\s+/)[0] : "";
    var bytes = new Uint8Array(1);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else bytes[0] = Math.floor(Math.random() * 256);
    var suffix = String((bytes[0] % 900) + 100);
    return base ? base + suffix : suffix;
  }
  function refreshPassword() {
    var name = trim(formDraft.contactName);
    formDraft.loginPassword = name ? generatePilotPassword(name) : "";
  }
  function copyText(text, button) {
    var value = String(text || "");
    if (!value) return Promise.resolve();
    var done = function () {
      if (!button) return;
      var original = button.textContent;
      button.textContent = "Copied!";
      window.setTimeout(function () { button.textContent = original; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value).then(done).catch(function () {
        window.prompt("Copy this text:", value);
      });
    }
    window.prompt("Copy this text:", value);
    done();
    return Promise.resolve();
  }
  function formatHandoffMessage(handoff) {
    return [
      "Hi " + (handoff.contactName || "") + ",",
      "",
      "Your pilot car listing is live on Pilot Car 4 Hire. Use these details to log in and manage your listing:",
      "",
      "Email: " + (handoff.loginEmail || ""),
      "Password: " + (handoff.tempPassword || ""),
      "Phone: " + (handoff.phone || ""),
      "",
      "Log in at pilotcar4hire.com"
    ].join("\n");
  }
  function handoffByUserId() {
    var map = {};
    (handoffs || []).forEach(function (row) {
      if (row && row.userId) map[row.userId] = row;
    });
    return map;
  }
  function registeredEmails() {
    return uniqueEmails((pilots || []).map(function (p) { return trim(p.email); }));
  }
  function publicEmails() {
    return uniqueEmails((pilots || []).map(function (p) {
      return trim(p.listing && p.listing.email);
    }));
  }
  function uniqueEmails(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (email) {
      var value = trim(email);
      var key = value.toLowerCase();
      if (!value || seen[key]) return;
      seen[key] = true;
      out.push(value);
    });
    out.sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: "base" }); });
    return out;
  }
  function isProtectedPilot(pilot) {
    return trim(pilot && pilot.email).toLowerCase() === PROTECTED_EMAIL;
  }
  function serviceLabel(value) {
    var hit = LISTING_SERVICES.filter(function (service) { return service.value === value; })[0];
    return hit ? hit.label : (value || "");
  }
  function formatAgo(value) {
    if (!value) return "";
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    var mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + " min ago";
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours === 1 ? "1 hour ago" : hours + " hours ago";
    var days = Math.floor(hours / 24);
    if (days < 45) return days === 1 ? "1 day ago" : days + " days ago";
    return formatSignedUp(value);
  }
  function clip(text, max) {
    var value = trim(text);
    if (value.length <= max) return value;
    return value.slice(0, Math.max(0, max - 1)) + "…";
  }
  function starLabel(stars) {
    var n = Number(stars) || 0;
    return n + " star" + (n === 1 ? "" : "s");
  }
  function starGlyphs(stars) {
    var n = Math.max(0, Math.min(5, Math.round(Number(stars) || 0)));
    var html = "";
    var i;
    for (i = 1; i <= 5; i += 1) html += i <= n ? "★" : "☆";
    return html;
  }
  function sourceLabel(source) {
    if (source === "ios") return "Apple app";
    if (source === "android") return "Android app";
    return "Website";
  }
  function boardCounts() {
    var live = (pilots || []).filter(function (pilot) { return !!pilot.listing; }).length;
    var pendingReviews = (reviews || []).filter(function (row) { return row.status === "pending"; }).length;
    return {
      total: (pilots || []).length,
      live: live,
      incomplete: Math.max(0, (pilots || []).length - live),
      waiting: (handoffs || []).length,
      pendingReviews: pendingReviews
    };
  }
  function stateCoverage() {
    var map = {};
    (pilots || []).forEach(function (pilot) {
      var listing = pilot.listing;
      if (!listing) return;
      var states = listing.statesCertified && listing.statesCertified.length
        ? listing.statesCertified
        : (listing.homeState ? [listing.homeState] : []);
      states.forEach(function (code) {
        var key = String(code || "").toUpperCase();
        if (!key) return;
        map[key] = (map[key] || 0) + 1;
      });
    });
    return map;
  }
  function serviceCoverage() {
    var map = {};
    LISTING_SERVICES.forEach(function (service) { map[service.value] = 0; });
    (pilots || []).forEach(function (pilot) {
      var listing = pilot.listing;
      if (!listing || !listing.services) return;
      listing.services.forEach(function (value) {
        if (map[value] == null) map[value] = 0;
        map[value] += 1;
      });
    });
    return map;
  }
  function sortedPilots(list) {
    var rows = (list || []).slice();
    rows.sort(function (a, b) {
      if (pilotSort === "name") {
        return (a.name || a.email || "").localeCompare(b.name || b.email || "", undefined, { sensitivity: "base" });
      }
      if (pilotSort === "incomplete") {
        var ai = a.listing ? 1 : 0;
        var bi = b.listing ? 1 : 0;
        if (ai !== bi) return ai - bi;
      }
      var at = new Date(a.createdAt || 0).getTime() || 0;
      var bt = new Date(b.createdAt || 0).getTime() || 0;
      return bt - at;
    });
    return rows;
  }
  function filteredPilots() {
    var q = trim(pilotSearch).toLowerCase();
    var rows = (pilots || []).filter(function (pilot) {
      if (incompleteOnly && pilot.listing) return false;
      if (listingOnly && !pilot.listing) return false;
      if (!q) return true;
      var listing = pilot.listing || {};
      var hay = (
        (pilot.name || "") + " " +
        (pilot.email || "") + " " +
        (listing.businessName || "") + " " +
        (listing.homeCity || "") + " " +
        (listing.homeState || "")
      ).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    return sortedPilots(rows);
  }

  function shell() {
    return (
      '<div class="ops-workspace pc4h-admin">' +
        '<div class="ops-header">' +
          "<h1>PC4H Admin</h1>" +
          "<p>Pilot accounts, live listings, and logins you still need to send.</p>" +
        "</div>" +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="ops-filters pc4h-tabs">' +
          '<button type="button" class="ops-pill" data-nav="home">Overview</button>' +
          '<button type="button" class="ops-pill" data-nav="pilots" data-pilot-mode="all">Pilots</button>' +
          '<button type="button" class="ops-pill" data-nav="reviews">Reviews</button>' +
          '<button type="button" class="ops-pill" data-nav="listings">To email</button>' +
          '<button type="button" class="ops-pill" data-nav="emails">Emails</button>' +
          '<button type="button" class="btn btn-primary" data-nav="form">Add listing</button>' +
          '<button type="button" class="btn btn-ghost" data-el="refresh" style="margin-left:auto">Refresh</button>' +
        "</div>" +
        '<div class="ops-body pc4h-admin-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function homeHtml() {
    var counts = boardCounts();
    var updated = formatAgo(stats && stats.generatedAt);
    var incomplete = (pilots || []).filter(function (pilot) { return !pilot.listing; }).slice(0, 5);
    var waiting = (handoffs || []).slice(0, 5);
    var coverage = stateCoverage();
    var services = serviceCoverage();
    var covered = Object.keys(coverage).length;
    var gaps = CERTIFICATION_REQUIRED_STATES.filter(function (code) { return !coverage[code]; });
    var newest = (pilots || []).slice().sort(function (a, b) {
      return (new Date(b.createdAt || 0).getTime() || 0) - (new Date(a.createdAt || 0).getTime() || 0);
    }).slice(0, 6);
    var html = '<div class="pc4h-home">';
    if (updated) html += '<p class="sub pc4h-updated">Updated ' + esc(updated) + ".</p>";
    html += '<div class="ops-chips">';
    html += '<button type="button" class="ops-chip" data-nav="pilots" data-pilot-mode="all"><span class="k">Pilots</span><span class="v">' + counts.total + "</span></button>";
    html += '<button type="button" class="ops-chip ok" data-nav="pilots" data-pilot-mode="live"><span class="k">Live listings</span><span class="v">' + counts.live + "</span></button>";
    html += '<button type="button" class="ops-chip warn" data-nav="pilots" data-pilot-mode="incomplete"><span class="k">No listing yet</span><span class="v">' + counts.incomplete + "</span></button>";
    html += '<button type="button" class="ops-chip' + (counts.waiting ? " danger" : "") + '" data-nav="listings"><span class="k">To email</span><span class="v">' + counts.waiting + "</span></button>";
    html += '<button type="button" class="ops-chip' + (counts.pendingReviews ? " danger" : "") + '" data-nav="reviews"><span class="k">Reviews waiting</span><span class="v">' + counts.pendingReviews + "</span></button>";
    html += "</div>";

    html += '<div class="ops-card"><h3>Needs a look</h3><div class="pc4h-watch">';
    html += '<section><div class="pc4h-watch-head"><h4>No listing yet</h4>';
    if (counts.incomplete) {
      html += '<button type="button" class="btn btn-ghost" data-nav="pilots" data-pilot-mode="incomplete">See all ' + counts.incomplete + "</button>";
    }
    html += "</div>";
    if (!incomplete.length) html += '<p class="sub">Every account has a live listing.</p>';
    incomplete.forEach(function (pilot) {
      html += '<button type="button" class="pc4h-person" data-edit-pilot="' + esc(pilot.id) + '"><span>' +
        esc(pilot.name || pilot.email || "Pilot") + "</span><span class=\"muted\">" +
        esc(pilot.email || "Signed up " + formatSignedUp(pilot.createdAt)) + "</span></button>";
    });
    html += "</section>";
    html += '<section><div class="pc4h-watch-head"><h4>Login not sent</h4>';
    if (counts.waiting) html += '<button type="button" class="btn btn-ghost" data-nav="listings">See all ' + counts.waiting + "</button>";
    html += "</div>";
    if (!waiting.length) html += '<p class="sub">No logins waiting to be copied and sent.</p>';
    waiting.forEach(function (handoff) {
      html += '<div class="pc4h-person pc4h-person-static"><span>' + esc(handoff.contactName || handoff.loginEmail || "Pilot") +
        "</span><span class=\"muted\">" + esc(handoff.loginEmail || "") +
        (handoff.createdAt ? " · " + esc(formatAgo(handoff.createdAt)) : "") + "</span></div>";
    });
    html += "</section>";
    var pendingReviewRows = (reviews || []).filter(function (row) { return row.status === "pending"; }).slice(0, 5);
    html += '<section><div class="pc4h-watch-head"><h4>Reviews waiting</h4>';
    if (counts.pendingReviews) {
      html += '<button type="button" class="btn btn-ghost" data-nav="reviews">See all ' + counts.pendingReviews + "</button>";
    }
    html += "</div>";
    if (!pendingReviewRows.length) html += '<p class="sub">No reviews waiting to be accepted.</p>';
    pendingReviewRows.forEach(function (row) {
      html += '<button type="button" class="pc4h-person" data-nav="reviews"><span>' +
        esc(starLabel(row.stars) + " · " + (row.businessName || "Listing")) +
        "</span><span class=\"muted\">" +
        esc((row.comment ? clip(row.comment, 80) : "No comment") + (row.createdAt ? " · " + formatAgo(row.createdAt) : "")) +
        "</span></button>";
    });
    html += "</section></div></div>";

    html += '<div class="ops-card"><h3>Coverage</h3><p class="sub">' + covered + " state" + (covered === 1 ? "" : "s") + " with a certified pilot.</p>";
    html += '<div class="pc4h-service-row">';
    LISTING_SERVICES.forEach(function (service) {
      html += '<span class="pc4h-service-chip"><b>' + (services[service.value] || 0) + "</b> " + esc(service.label) + "</span>";
    });
    html += "</div>";
    if (gaps.length) {
      html += '<p class="sub pc4h-gaps">No certified pilot yet in ' + esc(gaps.map(getStateName).join(", ")) + ".</p>";
    } else {
      html += '<p class="sub">Every state that requires certification has at least one pilot.</p>';
    }
    html += "</div>";

    html += '<div class="ops-card"><div class="pc4h-watch-head"><h3>Newest accounts</h3></div>';
    if (!newest.length) html += '<p class="sub">No pilots yet.</p>';
    newest.forEach(function (pilot) {
      var listing = pilot.listing;
      var where = listing ? formatHomeLocation(listing.homeCity, listing.homeState) : "No listing yet";
      html += '<button type="button" class="pc4h-person" data-edit-pilot="' + esc(pilot.id) + '"><span>' +
        esc(pilot.name || pilot.email || "Pilot") + "</span><span class=\"muted\">" +
        esc((formatAgo(pilot.createdAt) || formatSignedUp(pilot.createdAt)) + " · " + where) +
        "</span></button>";
    });
    html += "</div></div>";
    return html;
  }

  function successHtml() {
    return (
      '<div class="ops-card pc4h-success">' +
        "<h3>Successfully added</h3>" +
        "<p class=\"sub\">Their listing is live. Send login details from Listings added by admin.</p>" +
        (successWarning ? '<p class="status ops-banner is-on is-bad">' + esc(successWarning) + "</p>" : "") +
        (successPassword ? '<p class="sub">Temporary password: <strong>' + esc(successPassword) + "</strong></p><p class=\"sub\">Copy it now. It was not saved on the admin list.</p>" : "") +
        '<button type="button" class="btn" data-nav="home">Back</button>' +
      "</div>"
    );
  }

  function serviceChecksHtml() {
    return LISTING_SERVICES.map(function (service) {
      var on = formDraft.services.indexOf(service.value) !== -1;
      return (
        '<label class="pc4h-check">' +
          '<input type="checkbox" data-service="' + esc(service.value) + '"' + (on ? " checked" : "") + " />" +
          "<span>" + esc(service.label) + "</span>" +
        "</label>"
      );
    }).join("");
  }

  function stateChecksHtml(codes) {
    return codes.map(function (code) {
      var on = formDraft.statesCertified.indexOf(code) !== -1;
      return (
        '<label class="pc4h-check pc4h-check-state">' +
          '<input type="checkbox" data-state="' + esc(code) + '"' + (on ? " checked" : "") + " />" +
          "<span>" + esc(getStateName(code)) + "</span>" +
        "</label>"
      );
    }).join("");
  }

  function homeStateOptionsHtml() {
    return '<option value="">State</option>' + US_STATES.map(function (code) {
      return '<option value="' + esc(code) + '"' + (formDraft.homeState === code ? " selected" : "") + ">" +
        esc(code + " — " + getStateName(code)) + "</option>";
    }).join("");
  }

  function formHtml() {
    var isEdit = formMode === "edit";
    var hasListing = !!(editingPilot && editingPilot.listing);
    var title = isEdit
      ? (hasListing ? ("Edit " + (editingPilot.name || "listing")) : ("Complete listing for " + (editingPilot.name || "pilot")))
      : "Pilot car intake";
    var subtitle = isEdit
      ? ("Account: " + ((editingPilot && editingPilot.email) || "—") + ". Fill in what carriers should see, then save.")
      : "Enter what they give you on the call. A login is created automatically when you save.";
    var submitLabel = saving
      ? "Saving…"
      : (isEdit ? (hasListing ? "Save listing" : "Save & publish listing") : "Save listing & create account");

    return (
      '<div class="pc4h-form-wrap">' +
        '<div class="pc4h-form-top">' +
          '<button type="button" class="btn btn-ghost" data-el="form-back">Back</button>' +
          "<div>" +
            '<p class="pc4h-kicker">' + esc(isEdit ? (hasListing ? "Edit listing" : "Complete listing") : "New listing") + "</p>" +
            "<h2>" + esc(title) + "</h2>" +
            "<p>" + esc(subtitle) + "</p>" +
          "</div>" +
        "</div>" +
        (formBanner
          ? '<p class="status ops-banner is-on ' + (formBannerBad ? "is-bad" : "is-ok") + '">' + esc(formBanner) + "</p>"
          : "") +
        '<form class="ops-card pc4h-form" data-el="form">' +
          (isEdit
            ? ""
            : '<div class="pc4h-section">' +
                "<h3>Account (for later login)</h3>" +
                '<div class="ops-field"><label>Contact name</label><input data-key="contactName" type="text" required value="' + esc(formDraft.contactName) + '" placeholder="Name they go by" /></div>' +
                '<div class="ops-field"><label>Login email</label><input data-key="loginEmail" type="email" required autocomplete="off" value="' + esc(formDraft.loginEmail) + '" placeholder="email they want to use" /></div>' +
                '<div class="ops-field"><label>Temporary password</label>' +
                  '<div class="pc4h-password-row">' +
                    '<input data-key="loginPassword" type="text" required autocomplete="new-password" readonly value="' + esc(formDraft.loginPassword) + '" />' +
                    '<button type="button" class="btn" data-el="regen-password">New password</button>' +
                  "</div>" +
                "</div>" +
              "</div>") +
          '<div class="pc4h-section">' +
            "<h3>Listing (what carriers see)</h3>" +
            '<div class="ops-field"><label>Name or business name</label><input data-key="businessName" type="text" required value="' + esc(formDraft.businessName) + '" /></div>' +
            '<div class="ops-field"><label>Years of experience</label><input data-key="yearsExperience" type="number" required min="0" max="60" value="' + esc(formDraft.yearsExperience) + '" /></div>' +
            '<div class="ops-field"><label>Phone number</label><input data-key="phone" type="tel" required value="' + esc(formDraft.phone) + '" placeholder="(555) 123-4567" /></div>' +
            '<div class="ops-field"><label>Public email</label><input data-key="email" type="email" required value="' + esc(formDraft.email) + '" /></div>' +
            '<div class="ops-field"><label>Services offered</label><div class="pc4h-checks">' + serviceChecksHtml() + "</div></div>" +
            '<div class="ops-field"><label>States certified in</label>' +
              '<div class="pc4h-state-actions">' +
                '<button type="button" class="btn btn-ghost" data-el="states-all">Select all</button>' +
                '<button type="button" class="btn btn-ghost" data-el="states-clear">Clear all</button>' +
              "</div>" +
              '<p class="pc4h-state-label">States requiring certification</p>' +
              '<div class="pc4h-checks pc4h-checks-states">' + stateChecksHtml(CERTIFICATION_REQUIRED_STATES) + "</div>" +
              '<p class="pc4h-state-label">All other states</p>' +
              '<div class="pc4h-checks pc4h-checks-states">' + stateChecksHtml(US_STATES.filter(function (c) { return CERTIFICATION_REQUIRED_STATES.indexOf(c) === -1; })) + "</div>" +
            "</div>" +
            '<div class="ops-field"><label>Based out of</label>' +
              '<div class="pc4h-home-row">' +
                '<input data-key="homeCity" type="text" required placeholder="City" value="' + esc(formDraft.homeCity) + '" />' +
                '<select data-key="homeState" required>' + homeStateOptionsHtml() + "</select>" +
              "</div>" +
            "</div>" +
            '<div class="ops-field"><label>Brief description</label><textarea data-key="description" rows="4">' + esc(formDraft.description) + "</textarea></div>" +
          "</div>" +
          '<div class="pc4h-form-actions">' +
            '<button type="button" class="btn" data-el="form-cancel">Cancel</button>' +
            '<button type="submit" class="btn btn-primary" data-el="form-submit"' + (saving ? " disabled" : "") + ">" + esc(submitLabel) + "</button>" +
          "</div>" +
        "</form>" +
      "</div>"
    );
  }

  function pilotsHtml() {
    var list = filteredPilots();
    var map = handoffByUserId();
    var cards = list.map(function (pilot) {
      var listing = pilot.listing;
      var handoff = map[pilot.id];
      var statusClass = listing ? "is-complete" : "is-incomplete";
      var statusLabel = listing ? "Listing live" : "No listing yet";
      var listingHtml = listing
        ? '<dl class="pc4h-pilot-listing">' +
            "<div><dt>Business</dt><dd>" + esc(listing.businessName || "—") + "</dd></div>" +
            "<div><dt>Phone</dt><dd>" + esc(listing.phone || "—") + "</dd></div>" +
            "<div><dt>Public email</dt><dd>" + esc(listing.email || "—") + "</dd></div>" +
            "<div><dt>Based in</dt><dd>" + esc(formatHomeLocation(listing.homeCity, listing.homeState) || "—") + "</dd></div>" +
          "</dl>"
        : '<p class="pc4h-missing">Signed up but never finished a listing. Use Complete listing to fill it in for them.</p>';
      var place = listing ? formatHomeLocation(listing.homeCity, listing.homeState) : "";
      var services = listing && listing.services && listing.services.length
        ? listing.services.map(serviceLabel).join(", ")
        : "";
      var meta = [place, services, "Signed up " + formatSignedUp(pilot.createdAt)].filter(Boolean).join(" · ");
      return (
        '<article class="ops-card pc4h-pilot-card">' +
          '<div class="pc4h-pilot-head">' +
            "<div>" +
              "<h3>" + esc(pilot.name || listing && listing.businessName || "—") + "</h3>" +
              '<p class="sub">' + esc(pilot.email || "—") + "</p>" +
              '<p class="sub">' + esc(meta) + "</p>" +
            "</div>" +
            '<span class="pc4h-status ' + statusClass + '">' + statusLabel + "</span>" +
          "</div>" +
          (listing ? "" : listingHtml) +
          '<div class="pc4h-actions">' +
            '<button type="button" class="btn btn-primary" data-edit-pilot="' + esc(pilot.id) + '">' + (listing ? "Edit listing" : "Complete listing") + "</button>" +
            '<button type="button" class="btn" data-copy-pilot-email="' + esc(pilot.email || "") + '">Copy email</button>' +
            '<button type="button" class="btn" data-reset-pilot="' + esc(pilot.email || "") + '">Send reset email</button>' +
            (handoff && handoff.tempPassword
              ? '<button type="button" class="btn" data-copy-pilot-password="' + esc(handoff.tempPassword) + '">Copy temp password</button>'
              : "") +
            (isProtectedPilot(pilot)
              ? ""
              : '<button type="button" class="btn btn-danger" data-delete-pilot="' + esc(pilot.id) + '">Delete user</button>') +
          "</div>" +
        "</article>"
      );
    }).join("");

    return (
      '<div class="pc4h-view">' +
        '<div class="pc4h-view-top">' +
          "<div><h2>Pilots</h2><p>Who has a live listing, and who still needs one.</p></div>" +
        "</div>" +
        '<div class="pc4h-toolbar">' +
          '<label class="pc4h-toggle"><input type="checkbox" data-el="incomplete-only"' + (incompleteOnly ? " checked" : "") + " /> No listing yet</label>" +
          '<input type="search" data-el="pilot-search" class="pc4h-search" placeholder="Search name, email, or city…" value="' + esc(pilotSearch) + '" autocomplete="off" />' +
          '<div class="ops-filters pc4h-sort">' +
            '<button type="button" class="ops-pill' + (pilotSort === "new" ? " is-on" : "") + '" data-pilot-sort="new">Newest</button>' +
            '<button type="button" class="ops-pill' + (pilotSort === "name" ? " is-on" : "") + '" data-pilot-sort="name">Name</button>' +
            '<button type="button" class="ops-pill' + (pilotSort === "incomplete" ? " is-on" : "") + '" data-pilot-sort="incomplete">Needs listing</button>' +
          "</div>" +
        "</div>" +
        (pilotsBanner
          ? '<p class="status ops-banner is-on ' + (pilotsBannerBad ? "is-bad" : "is-ok") + '">' + esc(pilotsBanner) + "</p>"
          : "") +
        (loading
          ? '<p class="ops-empty">Loading…</p>'
          : (list.length
              ? '<div class="pc4h-pilot-list">' + cards + "</div>"
              : '<p class="ops-empty">No pilots match.</p>')) +
      "</div>"
    );
  }

  function listingsHtml() {
    var cards = (handoffs || []).map(function (handoff) {
      return (
        '<article class="ops-card pc4h-handoff-card" data-handoff-id="' + esc(handoff.id) + '">' +
          "<div>" +
            '<span class="pc4h-handoff-name">' + esc(handoff.contactName || "—") + "</span>" +
            '<p class="sub">' + esc(handoff.loginEmail || "—") +
              (handoff.phone ? " · " + esc(handoff.phone) : "") +
              (handoff.createdAt ? " · added " + esc(formatAgo(handoff.createdAt)) : "") +
            "</p>" +
          "</div>" +
          '<div class="pc4h-actions">' +
            '<button type="button" class="btn btn-primary" data-copy-handoff="' + esc(handoff.id) + '">Copy login message</button>' +
            '<button type="button" class="btn" data-remove-handoff="' + esc(handoff.id) + '">Remove</button>' +
          "</div>" +
        "</article>"
      );
    }).join("");

    return (
      '<div class="pc4h-view">' +
        '<div class="pc4h-view-top">' +
          "<div><h2>To email</h2><p>Copy the login message, send it, then remove the row so you know it is done.</p></div>" +
        "</div>" +
        (loading
          ? '<p class="ops-empty">Loading…</p>'
          : (handoffs.length
              ? '<div class="pc4h-handoff-list">' + cards + "</div>"
              : '<p class="ops-empty">Nothing waiting. Every login you created has been cleared from this list.</p>')) +
      "</div>"
    );
  }

  function emailBlock(title, note, emails, copyAllName) {
    if (!emails.length) return '<div class="ops-card"><h3>' + esc(title) + '</h3><p class="sub">' + esc(note) + '</p><p class="sub">None yet.</p></div>';
    var rows = emails.map(function (email) {
      return (
        '<li class="ops-card pc4h-email-row">' +
          '<span>' + esc(email) + "</span>" +
          '<button type="button" class="btn" data-copy-registered-email="' + esc(email) + '">Copy</button>' +
        "</li>"
      );
    }).join("");
    return (
      '<div class="ops-card">' +
        "<h3>" + esc(title) + "</h3>" +
        '<p class="sub">' + esc(note) + "</p>" +
        '<div class="pc4h-emails-toolbar">' +
          "<p>" + emails.length + "</p>" +
          '<button type="button" class="btn btn-primary" data-el="' + copyAllName + '">Copy all</button>' +
        "</div>" +
        '<textarea class="pc4h-emails-bulk" readonly rows="6">' + esc(emails.join("\n")) + "</textarea>" +
        '<ul class="pc4h-email-list">' + rows + "</ul>" +
      "</div>"
    );
  }

  function emailsHtml() {
    var emails = registeredEmails();
    var publics = publicEmails();
    return (
      '<div class="pc4h-view">' +
        '<div class="pc4h-view-top">' +
          "<div><h2>Emails</h2><p>Account logins, and the public emails carriers see on listings.</p></div>" +
        "</div>" +
        (emailsBanner
          ? '<p class="status ops-banner is-on ' + (emailsBannerBad ? "is-bad" : "is-ok") + '">' + esc(emailsBanner) + "</p>"
          : "") +
        (loading
          ? '<p class="ops-empty">Loading…</p>'
          : emailBlock("Account emails", "The email they use to sign in.", emails, "copy-all-emails") +
            emailBlock("Public listing emails", "The email printed on the listing.", publics, "copy-all-public")) +
      "</div>"
    );
  }

  function bodyHtml() {
    if (view === "form") return formHtml();
    if (view === "success") return successHtml();
    if (view === "pilots") return pilotsHtml();
    if (view === "reviews") return reviewsHtml();
    if (view === "listings") return listingsHtml();
    if (view === "emails") return emailsHtml();
    return homeHtml();
  }

  function filteredReviews() {
    return (reviews || []).filter(function (row) {
      if (reviewFilter === "all") return true;
      return row.status === reviewFilter;
    });
  }

  function reviewsHtml() {
    var list = filteredReviews();
    var cards = list.map(function (row) {
      var place = formatHomeLocation(row.homeCity, row.homeState);
      var meta = [
        sourceLabel(row.source),
        formatAgo(row.createdAt) || formatSignedUp(row.createdAt),
        place
      ].filter(Boolean).join(" · ");
      var actions = "";
      if (row.status === "pending") {
        actions =
          '<button type="button" class="btn btn-primary" data-review-action="accept" data-review-id="' + esc(row.id) + '">Accept</button>' +
          '<button type="button" class="btn btn-danger" data-review-action="reject" data-review-id="' + esc(row.id) + '">Reject</button>';
      } else if (row.status === "published") {
        actions =
          '<button type="button" class="btn btn-danger" data-review-action="reject" data-review-id="' + esc(row.id) + '">Unpublish</button>';
      } else {
        actions =
          '<button type="button" class="btn btn-primary" data-review-action="accept" data-review-id="' + esc(row.id) + '">Accept</button>';
      }
      return (
        '<article class="ops-card pc4h-review-card">' +
          '<div class="pc4h-review-head">' +
            "<div>" +
              "<h3>" + esc(row.businessName || "Listing") + "</h3>" +
              '<p class="sub">' + esc(meta) + "</p>" +
            "</div>" +
            '<span class="pc4h-status ' +
              (row.status === "published" ? "is-complete" : (row.status === "rejected" ? "is-incomplete" : "")) +
            '">' + esc(row.status) + "</span>" +
          "</div>" +
          '<p class="pc4h-review-stars" aria-label="' + esc(starLabel(row.stars)) + '">' + starGlyphs(row.stars) + "</p>" +
          (row.comment ? '<p class="pc4h-review-comment">' + esc(row.comment) + "</p>" : '<p class="sub">No comment.</p>') +
          '<div class="pc4h-actions">' + actions + "</div>" +
        "</article>"
      );
    }).join("");

    return (
      '<div class="pc4h-view">' +
        '<div class="pc4h-view-top">' +
          "<div><h2>Reviews</h2><p>Accept a review to publish it on the website. Rejected reviews stay hidden.</p></div>" +
        "</div>" +
        '<div class="ops-filters pc4h-sort">' +
          '<button type="button" class="ops-pill' + (reviewFilter === "pending" ? " is-on" : "") + '" data-review-filter="pending">Waiting</button>' +
          '<button type="button" class="ops-pill' + (reviewFilter === "published" ? " is-on" : "") + '" data-review-filter="published">Published</button>' +
          '<button type="button" class="ops-pill' + (reviewFilter === "rejected" ? " is-on" : "") + '" data-review-filter="rejected">Rejected</button>' +
          '<button type="button" class="ops-pill' + (reviewFilter === "all" ? " is-on" : "") + '" data-review-filter="all">All</button>' +
        "</div>" +
        (reviewsError
          ? '<p class="status ops-banner is-on is-bad">' + esc(reviewsError) + "</p>"
          : "") +
        (reviewsBanner
          ? '<p class="status ops-banner is-on ' + (reviewsBannerBad ? "is-bad" : "is-ok") + '">' + esc(reviewsBanner) + "</p>"
          : "") +
        (loading
          ? '<p class="ops-empty">Loading…</p>'
          : (list.length
              ? '<div class="pc4h-review-list">' + cards + "</div>"
              : '<p class="ops-empty">' +
                (reviewFilter === "pending"
                  ? "No reviews waiting."
                  : "No reviews in this list.") +
                "</p>")) +
      "</div>"
    );
  }

  function syncTabs() {
    if (!root) return;
    root.querySelectorAll(".pc4h-tabs [data-nav]").forEach(function (btn) {
      var next = btn.getAttribute("data-nav");
      btn.classList.toggle("is-on", next !== "form" && next === view);
    });
    var refresh = el("refresh");
    if (refresh) {
      refresh.disabled = !!loading;
      refresh.textContent = loading ? "Loading…" : "Refresh";
    }
  }

  function goNav(btn) {
    var next = btn.getAttribute("data-nav");
    var mode = btn.getAttribute("data-pilot-mode");
    if (mode === "incomplete") {
      incompleteOnly = true;
      listingOnly = false;
    } else if (mode === "live") {
      listingOnly = true;
      incompleteOnly = false;
    } else if (mode === "all" || next === "pilots") {
      incompleteOnly = false;
      listingOnly = false;
    }
    if (next === "form") {
      setCreateFormMode();
      refreshPassword();
      setView("form");
      return;
    }
    if (next === "reviews") {
      reviewFilter = "pending";
      setView("reviews");
      loadSnapshot(true);
      return;
    }
    if (next === "pilots" || next === "listings" || next === "emails" || next === "home") {
      setView(next);
      if (next !== "home") loadSnapshot(true);
      return;
    }
    setView(next);
  }

  function render() {
    var body = el("body");
    if (!body) return;
    body.innerHTML = bodyHtml();
    syncTabs();
    bindBody();
  }

  function setView(next) {
    view = next;
    formBanner = "";
    pilotsBanner = "";
    emailsBanner = "";
    reviewsBanner = "";
    render();
  }

  function resetForm() {
    formDraft = emptyDraft();
    formBanner = "";
    formBannerBad = false;
  }

  function setCreateFormMode() {
    formMode = "create";
    editingPilot = null;
    resetForm();
  }

  function setEditFormMode(pilot) {
    formMode = "edit";
    editingPilot = pilot;
    var listing = (pilot && pilot.listing) || {};
    formDraft = {
      contactName: "",
      loginEmail: "",
      loginPassword: "",
      businessName: listing.businessName || (pilot && pilot.name) || "",
      yearsExperience: listing.yearsExperience != null ? String(listing.yearsExperience) : "",
      phone: listing.phone || "",
      email: listing.email || (pilot && pilot.email) || "",
      services: Array.isArray(listing.services) ? listing.services.slice() : [],
      statesCertified: Array.isArray(listing.statesCertified) ? listing.statesCertified.slice() : [],
      homeCity: listing.homeCity || "",
      homeState: listing.homeState || "",
      description: listing.description || "",
      lastSyncedEmail: ""
    };
    formBanner = "";
  }

  function harvestForm() {
    var form = el("form");
    if (!form) return;
    form.querySelectorAll("[data-key]").forEach(function (input) {
      var key = input.getAttribute("data-key");
      formDraft[key] = input.value;
    });
    formDraft.services = Array.prototype.map.call(form.querySelectorAll("[data-service]:checked"), function (n) {
      return n.getAttribute("data-service");
    });
    formDraft.statesCertified = Array.prototype.map.call(form.querySelectorAll("[data-state]:checked"), function (n) {
      return n.getAttribute("data-state");
    });
  }

  function listingPayloadFromDraft() {
    return {
      businessName: trim(formDraft.businessName),
      yearsExperience: Number(formDraft.yearsExperience),
      phone: trim(formDraft.phone),
      email: trim(formDraft.email),
      services: formDraft.services.slice(),
      statesCertified: formDraft.statesCertified.slice(),
      homeState: formDraft.homeState,
      homeCity: trim(formDraft.homeCity),
      description: trim(formDraft.description)
    };
  }

  function validateListing(payload) {
    if (!payload.services.length) return "Select at least one service.";
    if (!payload.statesCertified.length) return "Select at least one certified state.";
    if (!Number.isFinite(payload.yearsExperience) || payload.yearsExperience < 0) {
      return "Enter a valid years of experience.";
    }
    return "";
  }

  function loadSnapshot(quiet) {
    if (!quiet) loading = true;
    if (!quiet) render();
    return apiGet("/api/pc4h-admin/snapshot")
      .then(function (data) {
        pilots = Array.isArray(data.pilots) ? data.pilots : [];
        handoffs = Array.isArray(data.handoffs) ? data.handoffs : [];
        reviews = Array.isArray(data.reviews) ? data.reviews : [];
        reviewsError = data.reviewsError || "";
        stats = data.stats || null;
        loading = false;
        showMsg("", true);
        render();
      })
      .catch(function (err) {
        loading = false;
        showMsg(errorMessage(err), false);
        render();
      });
  }

  function submitForm(event) {
    event.preventDefault();
    harvestForm();
    var payload = listingPayloadFromDraft();
    var invalid = validateListing(payload);
    if (invalid) {
      formBanner = invalid;
      formBannerBad = true;
      render();
      return;
    }

    saving = true;
    formBanner = "";
    render();

    var request;
    if (formMode === "edit") {
      if (!editingPilot || !editingPilot.id) {
        saving = false;
        formBanner = "Missing pilot account.";
        formBannerBad = true;
        render();
        return;
      }
      request = apiPost("/api/pc4h-admin/upsert-listing", {
        userId: editingPilot.id,
        listingId: editingPilot.listing && editingPilot.listing.id,
        listing: payload,
        addedByAdmin: editingPilot.listing && editingPilot.listing.addedByAdmin != null
          ? editingPilot.listing.addedByAdmin
          : true
      }).then(function () {
        pilotsBanner = editingPilot.listing
          ? ("Updated listing for " + (editingPilot.name || editingPilot.email) + ".")
          : ("Published listing for " + (editingPilot.name || editingPilot.email) + ".");
        pilotsBannerBad = false;
        setCreateFormMode();
        view = "pilots";
        return loadSnapshot(true);
      });
    } else {
      var contactName = trim(formDraft.contactName);
      var password = formDraft.loginPassword;
      var loginEmail = trim(formDraft.loginEmail);
      if (!contactName) {
        saving = false;
        formBanner = "Enter a contact name.";
        formBannerBad = true;
        render();
        return;
      }
      if (!password) {
        saving = false;
        formBanner = "Enter a contact name to generate a password.";
        formBannerBad = true;
        render();
        return;
      }
      request = apiPost("/api/pc4h-admin/create-pilot", {
        name: contactName,
        email: loginEmail,
        password: password,
        listing: payload
      }).then(function (result) {
        successWarning = result.handoffWarning || "";
        successPassword = successWarning ? (result.password || password) : "";
        setCreateFormMode();
        view = "success";
        return loadSnapshot(true);
      });
    }

    request
      .catch(function (err) {
        formBanner = errorMessage(err);
        formBannerBad = true;
      })
      .then(function () {
        saving = false;
        render();
      });
  }

  function bindBody() {
    var body = el("body");
    if (!body) return;

    body.querySelectorAll("[data-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () { goNav(btn); });
    });
    body.querySelectorAll("[data-pilot-sort]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        pilotSort = btn.getAttribute("data-pilot-sort") || "new";
        render();
      });
    });
    body.querySelectorAll("[data-review-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        reviewFilter = btn.getAttribute("data-review-filter") || "pending";
        render();
      });
    });
    body.querySelectorAll("[data-review-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-review-id") || "";
        var action = btn.getAttribute("data-review-action") || "";
        if (!id || (action !== "accept" && action !== "reject")) return;
        var row = (reviews || []).filter(function (item) { return item.id === id; })[0];
        var label = row ? ((row.businessName || "this listing") + " · " + starLabel(row.stars)) : "this review";
        var confirmCopy = action === "accept"
          ? "Publish this review for " + label + "?"
          : "Hide this review for " + label + "? It will not show on the website.";
        if (!window.confirm(confirmCopy)) return;
        btn.disabled = true;
        apiPost("/api/pc4h-admin/review-action", { id: id, action: action })
          .then(function () {
            reviewsBanner = action === "accept"
              ? "Accepted the review for " + label + ". It is live on the listing."
              : "Hidden the review for " + label + ".";
            reviewsBannerBad = false;
            return loadSnapshot(true);
          })
          .catch(function (err) {
            reviewsBanner = errorMessage(err);
            reviewsBannerBad = true;
            btn.disabled = false;
            render();
          });
      });
    });

    var formBack = el("form-back");
    var formCancel = el("form-cancel");
    function leaveForm() {
      if (formMode === "edit") {
        setCreateFormMode();
        setView("pilots");
        loadSnapshot(false);
        return;
      }
      setCreateFormMode();
      setView("home");
    }
    if (formBack) formBack.addEventListener("click", leaveForm);
    if (formCancel) formCancel.addEventListener("click", leaveForm);

    var regen = el("regen-password");
    if (regen) {
      regen.addEventListener("click", function () {
        harvestForm();
        if (!trim(formDraft.contactName)) {
          var nameInput = body.querySelector('[data-key="contactName"]');
          if (nameInput) nameInput.focus();
          return;
        }
        refreshPassword();
        render();
      });
    }

    var statesAll = el("states-all");
    var statesClear = el("states-clear");
    if (statesAll) {
      statesAll.addEventListener("click", function () {
        harvestForm();
        formDraft.statesCertified = US_STATES.slice();
        render();
      });
    }
    if (statesClear) {
      statesClear.addEventListener("click", function () {
        harvestForm();
        formDraft.statesCertified = [];
        render();
      });
    }

    var form = el("form");
    if (form) {
      form.addEventListener("submit", submitForm);
      form.addEventListener("input", function (event) {
        var target = event.target;
        if (!target) return;
        if (target.getAttribute("data-key") === "contactName" && formMode === "create") {
          formDraft.contactName = target.value;
          refreshPassword();
          var pass = form.querySelector('[data-key="loginPassword"]');
          if (pass) pass.value = formDraft.loginPassword;
        }
        if (target.getAttribute("data-key") === "loginEmail" && formMode === "create") {
          var publicEmail = form.querySelector('[data-key="email"]');
          if (publicEmail && (!publicEmail.value || publicEmail.value === formDraft.lastSyncedEmail)) {
            publicEmail.value = target.value;
            formDraft.lastSyncedEmail = target.value;
          }
        }
      });
      form.addEventListener("change", function () {
        harvestForm();
      });
    }

    var incomplete = el("incomplete-only");
    if (incomplete) {
      incomplete.addEventListener("change", function () {
        incompleteOnly = !!incomplete.checked;
        if (incompleteOnly) listingOnly = false;
        render();
      });
    }
    var search = el("pilot-search");
    if (search) {
      search.addEventListener("input", function () {
        pilotSearch = search.value;
        render();
        var again = el("pilot-search");
        if (again) {
          again.focus();
          var len = again.value.length;
          try { again.setSelectionRange(len, len); } catch (e) { /* ignore */ }
        }
      });
    }

    body.querySelectorAll("[data-edit-pilot]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-edit-pilot");
        var pilot = pilots.filter(function (p) { return p.id === id; })[0];
        if (!pilot) {
          pilotsBanner = "Could not find that pilot.";
          pilotsBannerBad = true;
          render();
          return;
        }
        setEditFormMode(pilot);
        setView("form");
      });
    });

    body.querySelectorAll("[data-copy-pilot-email]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var email = btn.getAttribute("data-copy-pilot-email") || "";
        copyText(email, btn).then(function () {
          if (email) showMsg("Copied " + email, true);
        });
      });
    });

    body.querySelectorAll("[data-copy-pilot-password]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        copyText(btn.getAttribute("data-copy-pilot-password") || "", btn).then(function () {
          showMsg("Copied temp password.", true);
        });
      });
    });

    body.querySelectorAll("[data-reset-pilot]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var email = btn.getAttribute("data-reset-pilot") || "";
        if (!email) return;
        if (!window.confirm("Send a password reset email to " + email + "?")) return;
        btn.disabled = true;
        apiPost("/api/pc4h-admin/reset-password", { email: email })
          .then(function () {
            pilotsBanner = "Reset email sent to " + email + ".";
            pilotsBannerBad = false;
            render();
          })
          .catch(function (err) {
            pilotsBanner = errorMessage(err);
            pilotsBannerBad = true;
            render();
          });
      });
    });

    body.querySelectorAll("[data-delete-pilot]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-delete-pilot") || "";
        var pilot = pilots.filter(function (p) { return p.id === id; })[0];
        if (!pilot || !pilot.id) return;
        var label = (pilot.name || "this pilot") + (pilot.email ? " (" + pilot.email + ")" : "");
        if (!window.confirm(
          "Delete " + label + "?\n\nThis permanently removes their login, profile, and listing from Pilot Car 4 Hire. This cannot be undone."
        )) return;
        btn.disabled = true;
        btn.textContent = "Deleting…";
        apiPost("/api/pc4h-admin/delete-user", { userId: pilot.id, email: pilot.email || "" })
          .then(function () {
            pilotsBanner = "Deleted " + label + ".";
            pilotsBannerBad = false;
            return loadSnapshot(false);
          })
          .catch(function (err) {
            pilotsBanner = errorMessage(err);
            pilotsBannerBad = true;
            btn.disabled = false;
            btn.textContent = "Delete user";
            render();
          });
      });
    });

    body.querySelectorAll("[data-copy-handoff]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-copy-handoff");
        var handoff = handoffs.filter(function (h) { return h.id === id; })[0];
        if (handoff) copyText(formatHandoffMessage(handoff), btn);
      });
    });

    body.querySelectorAll("[data-remove-handoff]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-remove-handoff");
        if (!window.confirm("Remove this pilot from your list? Their listing stays live on the site.")) return;
        btn.disabled = true;
        apiPost("/api/pc4h-admin/remove-handoff", { id: id })
          .then(function () { return loadSnapshot(false); })
          .catch(function (err) {
            showMsg(errorMessage(err), false);
            btn.disabled = false;
          });
      });
    });

    var copyAll = el("copy-all-emails");
    if (copyAll) {
      copyAll.addEventListener("click", function () {
        var emails = registeredEmails();
        copyText(emails.join("\n"), copyAll).then(function () {
          emailsBanner = "Copied " + emails.length + " account email" + (emails.length === 1 ? "" : "s") + ".";
          emailsBannerBad = false;
          render();
        });
      });
    }
    var copyPublic = el("copy-all-public");
    if (copyPublic) {
      copyPublic.addEventListener("click", function () {
        var emails = publicEmails();
        copyText(emails.join("\n"), copyPublic).then(function () {
          emailsBanner = "Copied " + emails.length + " public email" + (emails.length === 1 ? "" : "s") + ".";
          emailsBannerBad = false;
          render();
        });
      });
    }
    body.querySelectorAll("[data-copy-registered-email]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        copyText(btn.getAttribute("data-copy-registered-email") || "", btn);
      });
    });
    var bulk = el("emails-bulk");
    if (bulk) {
      bulk.addEventListener("focus", function () { bulk.select(); });
    }
  }

  window.STLPc4hAdmin = {
    mount: function (host) {
      root = host;
      var panel = host && host.closest ? host.closest(".panel") : null;
      if (panel) panel.classList.add("ops-wide");
      root.innerHTML = shell();
      hideSave();
      root.querySelectorAll(".pc4h-tabs [data-nav]").forEach(function (btn) {
        btn.addEventListener("click", function () { goNav(btn); });
      });
      var refresh = el("refresh");
      if (refresh) refresh.addEventListener("click", function () { loadSnapshot(false); });
      view = openReviewsOnLoad ? "reviews" : "home";
      if (openReviewsOnLoad) reviewFilter = "pending";
      openReviewsOnLoad = false;
      setCreateFormMode();
      render();
      loadSnapshot(false);
    },
    shown: function () {
      hideSave();
      if (openReviewsOnLoad) {
        openReviewsOnLoad = false;
        reviewFilter = "pending";
        view = "reviews";
        render();
      }
      if (view === "home" || view === "pilots" || view === "reviews" || view === "listings" || view === "emails") {
        loadSnapshot(true);
      }
    },
    focusReviews: function () {
      reviewFilter = "pending";
      if (root) {
        view = "reviews";
        render();
        loadSnapshot(true);
        return;
      }
      openReviewsOnLoad = true;
    },
    unmount: function () {
      var panel = root && root.closest ? root.closest(".panel") : null;
      if (panel) panel.classList.remove("ops-wide");
      root = null;
    }
  };
})();

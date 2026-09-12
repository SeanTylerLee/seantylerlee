(function () {
  "use strict";

  // Same order and grouping as the Mac app sidebar.
  var NAV_GROUPS = [
    [
      { id: "overview", title: "Overview", icon: "square-grid-2x2", tint: "#1A70EB", body: "Profit, needs-you board, and studio snapshot." },
      { id: "bank", title: "Bank", icon: "building-columns-fill", tint: "#1F6B52", body: "Mercury cash, accounts, and activity." },
      { id: "business", title: "Business Info", icon: "building-2-fill", tint: "#12213D", body: "Company details will live here." },
      { id: "loginVault", title: "Login Vault", icon: "key-fill", tint: "#D98C2E", body: "Saved passwords will live here." },
      { id: "renewals", title: "Renewals", icon: "calendar-badge-clock", tint: "#8C59D9", body: "LLC filings, Apple Developer, domains, insurance." },
      { id: "calendar", title: "Calendar", icon: "calendar", tint: "#5973CC", body: "Month grid, day notes, and studio due dates." }
    ],
    [
      { id: "taxes", title: "Taxes", icon: "percent", tint: "#2E5C7A", body: "Year P&L from income, expenses, and draws." },
      { id: "expenses", title: "Expenses", icon: "creditcard-fill", tint: "#26856B", body: "Business costs by year." },
      { id: "income", title: "Income", icon: "checkmark-seal-fill", tint: "#38B375", body: "LLC revenue by year." },
      { id: "ownerDraws", title: "Owner Draw", icon: "banknote-fill", tint: "#B87A38", body: "Money you pulled from the LLC." },
      { id: "inventory", title: "Inventory", icon: "shippingbox-fill", tint: "#7361D9", body: "Gear list: purchase date, cost, purpose, serial." }
    ],
    [
      { id: "apps", title: "Apps", icon: "square-stack-3d-up-fill", tint: "#2E9E7A", body: "Products, versions, issues, and store logins." },
      { id: "sop", title: "SOP", icon: "list-clipboard-fill", tint: "#336BB3", body: "How-to guides with checkable steps." },
      { id: "appleAnalytics", title: "Analytics", icon: "chart-bar-xaxis", tint: "#337AC7", body: "App Store Connect and Google Play vitals." },
      { id: "support", title: "Support", icon: "questionmark-circle-fill", tint: "#BF5261", body: "Customer tickets by app." },
      { id: "emails", title: "Emails", icon: "envelope-fill", tint: "#738094", body: "Mailing lists and templates." }
    ],
    [
      { id: "clients", title: "Clients", icon: "person-2-fill", tint: "#338CBF", body: "People and companies you bill." },
      { id: "leads", title: "Leads", icon: "flame-fill", tint: "#D96640", body: "Incoming work and follow-ups." },
      { id: "projects", title: "Projects", icon: "hammer-fill", tint: "#7361D9", body: "Client jobs, logins, costs, hours, issues, and handoff." }
    ],
    [
      { id: "billing", title: "Billing", icon: "doc-text-fill", tint: "#F29E2E", body: "Quotes and invoices. Mark paid to generate a receipt." }
    ],
    [
      { id: "notes", title: "Notes", icon: "note-text", tint: "#F29E2E", body: "Your private notepad." }
    ]
  ];

  var SECTIONS = NAV_GROUPS.reduce(function (all, group) {
    return all.concat(group);
  }, []);

  var gate = document.getElementById("gate");
  var app = document.getElementById("app");
  var statusEl = document.getElementById("status");
  var lede = document.getElementById("gate-lede");
  var form = document.getElementById("auth-form");
  var emailEl = document.getElementById("email");
  var passwordEl = document.getElementById("password");
  var signInBtn = document.getElementById("sign-in");
  var signUpBtn = document.getElementById("sign-up");
  var signOutBtn = document.getElementById("sign-out");
  var globalSaveBtn = document.getElementById("global-save");
  var whoEl = document.getElementById("who");
  var sidebar = document.getElementById("sidebar");
  var pagesEl = document.getElementById("pages");
  var pageHosts = {};
  var appReady = false;

  var PAGE_MODE = {
    overview: "is-overview",
    billing: "is-billing",
    notes: "is-notes",
    projects: "is-projects",
    clients: "is-clients",
    bank: "is-bank",
    business: "is-business",
    loginVault: "is-vault",
    calendar: "is-calendar",
    renewals: "is-renewals",
    expenses: "is-expenses",
    income: "is-income",
    ownerDraws: "is-ownerDraws",
    taxes: "is-taxes",
    appleAnalytics: "is-analytics",
    sop: "is-sop",
    apps: "is-apps",
    support: "is-support",
    emails: "is-emails",
    leads: "is-leads",
    inventory: "is-inventory"
  };

  var PAGE_MODULE = {
    overview: "STLOverview",
    billing: "STLBilling",
    notes: "STLNotes",
    projects: "STLProjects",
    clients: "STLClients",
    bank: "STLBank",
    business: "STLBusiness",
    loginVault: "STLVault",
    calendar: "STLCalendar",
    renewals: "STLRenewals",
    expenses: "STLExpenses",
    income: "STLIncome",
    ownerDraws: "STLOwnerDraws",
    taxes: "STLTaxes",
    appleAnalytics: "STLAnalytics",
    sop: "STLSOP",
    apps: "STLApps",
    support: "STLSupport",
    emails: "STLEmails",
    leads: "STLLeads",
    inventory: "STLInventory"
  };

  function moduleFor(id) {
    var name = PAGE_MODULE[id];
    return name ? window[name] : null;
  }

  function saversMap() {
    return {
      billing: window.STLBilling,
      projects: window.STLProjects,
      clients: window.STLClients,
      business: window.STLBusiness,
      loginVault: window.STLVault,
      renewals: window.STLRenewals,
      notes: window.STLNotes,
      expenses: window.STLExpenses,
      income: window.STLIncome,
      ownerDraws: window.STLOwnerDraws,
      taxes: window.STLTaxes,
      sop: window.STLSOP,
      apps: window.STLApps,
      support: window.STLSupport,
      emails: window.STLEmails,
      leads: window.STLLeads,
      inventory: window.STLInventory
    };
  }

  function refreshSave() {
    if (!globalSaveBtn) return;
    var mod = saversMap()[currentSection];
    if (!mod || !mod.saveAll) {
      globalSaveBtn.classList.add("hidden");
      globalSaveBtn.disabled = true;
      return;
    }
    globalSaveBtn.classList.remove("hidden");
    if (typeof mod.isDirty === "function") globalSaveBtn.disabled = !mod.isDirty();
    else globalSaveBtn.disabled = false;
  }

  function destroyPages() {
    Object.keys(pageHosts).forEach(function (id) {
      var el = pageHosts[id];
      var mod = moduleFor(id);
      if (mod && mod.unmount) {
        try { mod.unmount(el); } catch (err) {}
      }
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    pageHosts = {};
  }

  var cfg = window.STL_STUDIO || {};
  var supabaseUrl = String(cfg.supabaseUrl || "").trim();
  var supabaseKey = String(cfg.supabaseKey || "").trim();
  var client = null;
  var currentSection = "overview";
  var busy = false;

  function showStatus(msg, ok) {
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("is-on", !!msg);
    statusEl.classList.toggle("is-ok", !!ok);
    statusEl.classList.toggle("is-bad", !!msg && !ok);
  }

  function setBusy(on) {
    busy = on;
    signInBtn.disabled = on;
    signUpBtn.disabled = on;
  }

  function showGate(message) {
    appReady = false;
    destroyPages();
    app.classList.add("hidden");
    gate.classList.remove("hidden");
    if (message) showStatus(message, false);
  }

  function showApp(session) {
    var alreadyOpen = appReady && !app.classList.contains("hidden");
    gate.classList.add("hidden");
    app.classList.remove("hidden");
    showStatus("");
    var email = session && session.user && session.user.email;
    whoEl.textContent = email || "";
    if (alreadyOpen) {
      refreshSave();
      return;
    }
    appReady = true;
    if (window.STLPricing && window.STLPricing.init) window.STLPricing.init(client);
    if (window.STLLocalApi && window.STLLocalApi.init) window.STLLocalApi.init(client);
    if (window.STLLocalApi && window.STLLocalApi.syncSecretsFromMac) {
      window.STLLocalApi.syncSecretsFromMac();
    }
    renderNav();
    renderPanel();
  }

  function renderNav() {
    sidebar.innerHTML = "";
    NAV_GROUPS.forEach(function (group, groupIndex) {
      if (groupIndex > 0) {
        var sep = document.createElement("div");
        sep.className = "sidebar-sep";
        sep.setAttribute("aria-hidden", "true");
        sidebar.appendChild(sep);
      }
      var wrap = document.createElement("div");
      wrap.className = "sidebar-group";
      group.forEach(function (section) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sidebar-item" + (section.id === currentSection ? " is-on" : "");
        btn.innerHTML =
          '<span class="sidebar-icon" style="background:linear-gradient(135deg,' + section.tint + ',' + section.tint + "bf)\">" +
          '<img src="images/sidebar/' + section.icon + '.png" alt="" />' +
          "</span>" +
          "<span class=\"sidebar-label\">" + section.title + "</span>";
        btn.addEventListener("click", function () {
          currentSection = section.id;
          renderNav();
          renderPanel();
        });
        wrap.appendChild(btn);
      });
      sidebar.appendChild(wrap);
    });

    var pricingWrap = document.createElement("div");
    pricingWrap.className = "sidebar-group sidebar-pricing";
    var pricingBtn = document.createElement("button");
    pricingBtn.type = "button";
    pricingBtn.className = "sidebar-item";
    pricingBtn.innerHTML =
      '<span class="sidebar-icon" style="background:linear-gradient(135deg,#F29E2E,#F29E2Ebf)">' +
      '<img src="images/sidebar/dollarsign-circle-fill.png" alt="" />' +
      "</span>" +
      '<span class="sidebar-label">Pricing</span>';
    pricingBtn.addEventListener("click", function () {
      if (window.STLPricing) window.STLPricing.toggle();
    });
    pricingWrap.appendChild(pricingBtn);
    sidebar.appendChild(pricingWrap);

    var titleEl = document.querySelector(".topbar-title");
    var current = SECTIONS.filter(function (s) { return s.id === currentSection; })[0];
    if (titleEl && current) titleEl.textContent = current.title;

  }

  function renderPanel() {
    var section = SECTIONS.filter(function (s) { return s.id === currentSection; })[0] || SECTIONS[0];
    Object.keys(PAGE_MODE).forEach(function (id) {
      app.classList.remove(PAGE_MODE[id]);
    });
    if (PAGE_MODE[section.id]) app.classList.add(PAGE_MODE[section.id]);

    Object.keys(pageHosts).forEach(function (id) {
      pageHosts[id].classList.toggle("hidden", id !== section.id);
    });

    if (!pageHosts[section.id] && pagesEl) {
      var el = document.createElement("section");
      el.className = "panel";
      el.setAttribute("data-page", section.id);
      pagesEl.appendChild(el);
      pageHosts[section.id] = el;
      var mod = moduleFor(section.id);
      if (mod && mod.mount) mod.mount(el, client);
      else {
        el.innerHTML = "<h1>" + section.title + "</h1><p>" + section.body + "</p>";
      }
    }
    refreshSave();
  }

  function missingConfig() {
    return !supabaseUrl || !supabaseKey ||
      supabaseUrl.indexOf("YOUR-PROJECT") !== -1 ||
      supabaseKey.indexOf("YOUR-ANON") !== -1;
  }

  if (missingConfig()) {
    lede.textContent = "The website is ready. Next you paste two values from Supabase into js/config.js, then refresh this page.";
    form.classList.add("hidden");
    showStatus("Open js/config.js and paste your Project URL and anon key.", false);
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    showStatus("Could not load the sign-in library. Check your internet and refresh.", false);
    form.classList.add("hidden");
    return;
  }

  client = window.supabase.createClient(supabaseUrl, supabaseKey);

  client.auth.onAuthStateChange(function (event, session) {
    if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
      if (session && session.user && whoEl) whoEl.textContent = session.user.email || "";
      return;
    }
    if (session) showApp(session);
    else showGate("");
  });

  client.auth.getSession().then(function (res) {
    if (res.data && res.data.session) showApp(res.data.session);
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (busy || !client) return;
    setBusy(true);
    showStatus("");
    client.auth.signInWithPassword({
      email: emailEl.value.trim(),
      password: passwordEl.value
    }).then(function (res) {
      setBusy(false);
      if (res.error) showStatus(res.error.message, false);
    });
  });

  signUpBtn.addEventListener("click", function () {
    if (busy || !client) return;
    setBusy(true);
    showStatus("");
    client.auth.signUp({
      email: emailEl.value.trim(),
      password: passwordEl.value
    }).then(function (res) {
      setBusy(false);
      if (res.error) {
        showStatus(res.error.message, false);
        return;
      }
      if (res.data && res.data.session) return;
      showStatus("Account created. If it asked you to confirm, check your email, then sign in.", true);
    });
  });

  signOutBtn.addEventListener("click", function () {
    if (!client) return;
    client.auth.signOut();
  });

  if (globalSaveBtn) {
    globalSaveBtn.addEventListener("click", function () {
      var savers = {
        billing: window.STLBilling,
        projects: window.STLProjects,
        clients: window.STLClients,
        business: window.STLBusiness,
        loginVault: window.STLVault,
        renewals: window.STLRenewals,
        notes: window.STLNotes,
        expenses: window.STLExpenses,
        income: window.STLIncome,
        ownerDraws: window.STLOwnerDraws,
        taxes: window.STLTaxes,
        sop: window.STLSOP,
        apps: window.STLApps,
        support: window.STLSupport,
        emails: window.STLEmails,
        leads: window.STLLeads,
        inventory: window.STLInventory
      };
      var mod = saversMap()[currentSection];
      if (mod && mod.saveAll) mod.saveAll();
    });
  }

  var lastScrollY = 0;
  document.addEventListener("scroll", function (event) {
    if (!window.matchMedia || !window.matchMedia("(max-width: 800px), (orientation: landscape) and (max-height: 520px)").matches) {
      app.classList.remove("is-mobile-scrolled");
      return;
    }
    var node = event.target;
    if (!node || node === document) node = document.scrollingElement;
    var y = (node && node.scrollTop) || 0;
    if (y > lastScrollY + 6 && y > 20) app.classList.add("is-mobile-scrolled");
    else if (y < lastScrollY - 6 || y < 12) app.classList.remove("is-mobile-scrolled");
    lastScrollY = y;
  }, true);

  window.STLApp = {
    navigate: function (sectionId) {
      if (!SECTIONS.some(function (s) { return s.id === sectionId; })) return;
      currentSection = sectionId;
      if (app.classList.contains("hidden")) return;
      renderNav();
      renderPanel();
    }
  };
})();

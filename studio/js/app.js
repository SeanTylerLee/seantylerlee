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
  var panel = document.getElementById("panel");

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
    app.classList.add("hidden");
    gate.classList.remove("hidden");
    if (message) showStatus(message, false);
  }

  function showApp(session) {
    gate.classList.add("hidden");
    app.classList.remove("hidden");
    showStatus("");
    var email = session && session.user && session.user.email;
    whoEl.textContent = email || "";
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
    if (window.STLBilling) window.STLBilling.unmount(panel);
    if (window.STLNotes) window.STLNotes.unmount(panel);
    if (window.STLProjects) window.STLProjects.unmount(panel);
    if (window.STLClients) window.STLClients.unmount(panel);
    if (window.STLBank) window.STLBank.unmount(panel);
    if (window.STLBusiness) window.STLBusiness.unmount(panel);
    if (window.STLVault) window.STLVault.unmount(panel);
    if (window.STLCalendar) window.STLCalendar.unmount(panel);
    if (window.STLRenewals) window.STLRenewals.unmount(panel);
    if (window.STLExpenses) window.STLExpenses.unmount(panel);
    if (window.STLIncome) window.STLIncome.unmount(panel);
    if (window.STLOwnerDraws) window.STLOwnerDraws.unmount(panel);
    if (window.STLTaxes) window.STLTaxes.unmount(panel);
    if (window.STLAnalytics) window.STLAnalytics.unmount(panel);
    if (window.STLOverview) window.STLOverview.unmount(panel);
    if (window.STLSOP) window.STLSOP.unmount(panel);
    if (window.STLApps) window.STLApps.unmount(panel);
    if (window.STLSupport) window.STLSupport.unmount(panel);
    if (window.STLEmails) window.STLEmails.unmount(panel);
    if (window.STLLeads) window.STLLeads.unmount(panel);
    if (window.STLInventory) window.STLInventory.unmount(panel);
    app.classList.remove("is-billing");
    app.classList.remove("is-notes");
    app.classList.remove("is-projects");
    app.classList.remove("is-clients");
    app.classList.remove("is-bank");
    app.classList.remove("is-business");
    app.classList.remove("is-vault");
    app.classList.remove("is-calendar");
    app.classList.remove("is-renewals");
    app.classList.remove("is-expenses");
    app.classList.remove("is-income");
    app.classList.remove("is-ownerDraws");
    app.classList.remove("is-taxes");
    app.classList.remove("is-analytics");
    app.classList.remove("is-overview");
    app.classList.remove("is-sop");
    app.classList.remove("is-apps");
    app.classList.remove("is-support");
    app.classList.remove("is-emails");
    app.classList.remove("is-leads");
    app.classList.remove("is-inventory");
    var section = SECTIONS.filter(function (s) { return s.id === currentSection; })[0] || SECTIONS[0];
    if (section.id === "overview" && window.STLOverview) {
      app.classList.add("is-overview");
      window.STLOverview.mount(panel, client);
      return;
    }
    if (section.id === "billing" && window.STLBilling) {
      app.classList.add("is-billing");
      window.STLBilling.mount(panel, client);
      return;
    }
    if (section.id === "notes" && window.STLNotes) {
      app.classList.add("is-notes");
      window.STLNotes.mount(panel, client);
      return;
    }
    if (section.id === "projects" && window.STLProjects) {
      app.classList.add("is-projects");
      window.STLProjects.mount(panel, client);
      return;
    }
    if (section.id === "clients" && window.STLClients) {
      app.classList.add("is-clients");
      window.STLClients.mount(panel, client);
      return;
    }
    if (section.id === "bank" && window.STLBank) {
      app.classList.add("is-bank");
      window.STLBank.mount(panel, client);
      return;
    }
    if (section.id === "business" && window.STLBusiness) {
      app.classList.add("is-business");
      window.STLBusiness.mount(panel, client);
      return;
    }
    if (section.id === "loginVault" && window.STLVault) {
      app.classList.add("is-vault");
      window.STLVault.mount(panel, client);
      return;
    }
    if (section.id === "calendar" && window.STLCalendar) {
      app.classList.add("is-calendar");
      window.STLCalendar.mount(panel, client);
      return;
    }
    if (section.id === "renewals" && window.STLRenewals) {
      app.classList.add("is-renewals");
      window.STLRenewals.mount(panel, client);
      return;
    }
    if (section.id === "expenses" && window.STLExpenses) {
      app.classList.add("is-expenses");
      window.STLExpenses.mount(panel, client);
      return;
    }
    if (section.id === "income" && window.STLIncome) {
      app.classList.add("is-income");
      window.STLIncome.mount(panel, client);
      return;
    }
    if (section.id === "ownerDraws" && window.STLOwnerDraws) {
      app.classList.add("is-ownerDraws");
      window.STLOwnerDraws.mount(panel, client);
      return;
    }
    if (section.id === "taxes" && window.STLTaxes) {
      app.classList.add("is-taxes");
      window.STLTaxes.mount(panel, client);
      return;
    }
    if (section.id === "appleAnalytics" && window.STLAnalytics) {
      app.classList.add("is-analytics");
      window.STLAnalytics.mount(panel, client);
      return;
    }
    if (section.id === "sop" && window.STLSOP) {
      app.classList.add("is-sop");
      window.STLSOP.mount(panel, client);
      return;
    }
    if (section.id === "apps" && window.STLApps) {
      app.classList.add("is-apps");
      window.STLApps.mount(panel, client);
      return;
    }
    if (section.id === "support" && window.STLSupport) {
      app.classList.add("is-support");
      window.STLSupport.mount(panel, client);
      return;
    }
    if (section.id === "emails" && window.STLEmails) {
      app.classList.add("is-emails");
      window.STLEmails.mount(panel, client);
      return;
    }
    if (section.id === "leads" && window.STLLeads) {
      app.classList.add("is-leads");
      window.STLLeads.mount(panel, client);
      return;
    }
    if (section.id === "inventory" && window.STLInventory) {
      app.classList.add("is-inventory");
      window.STLInventory.mount(panel, client);
      return;
    }
    panel.classList.remove("wide");
    panel.classList.remove("notes-wide");
    panel.classList.remove("projects-wide");
    panel.classList.remove("clients-wide");
    panel.classList.remove("bank-wide");
    panel.classList.remove("business-wide");
    panel.classList.remove("vault-wide");
    panel.classList.remove("calendar-wide");
    panel.classList.remove("renewals-wide");
    panel.classList.remove("money-wide");
    panel.classList.remove("analytics-wide");
    panel.classList.remove("overview-wide");
    panel.classList.remove("sop-wide");
    panel.classList.remove("apps-wide");
    panel.classList.remove("ops-wide");
    panel.innerHTML =
      "<h1>" + section.title + "</h1>" +
      "<p>" + section.body + "</p>";
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

  client.auth.onAuthStateChange(function (_event, session) {
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
      var mod = savers[currentSection];
      if (mod && mod.saveAll) mod.saveAll();
    });
  }

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

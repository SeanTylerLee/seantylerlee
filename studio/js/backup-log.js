(function () {
  "use strict";

  var TABLES = [
    "business_profile",
    "business_documents",
    "vault_logins",
    "renewal_items",
    "calendar_day_notes",
    "studio_settings",
    "business_expenses",
    "business_expense_skips",
    "business_incomes",
    "business_income_skips",
    "owner_draws",
    "inventory_items",
    "mileage_trips",
    "managed_apps",
    "app_logins",
    "app_issues",
    "app_promos",
    "sop_guides",
    "support_tickets",
    "email_lists",
    "email_contacts",
    "email_templates",
    "app_notifications",
    "studio_clients",
    "studio_leads",
    "client_projects",
    "project_logins",
    "project_costs",
    "project_hour_entries",
    "project_issues",
    "project_handoff_items",
    "meeting_logs",
    "billing_documents",
    "studio_notes",
    "studio_pricing_items",
    "studio_pricing_settings"
  ];

  var MENUS = [
    "Overview",
    "Bank",
    "Business Info",
    "Login Vault",
    "Renewals",
    "Calendar",
    "Taxes",
    "Expenses",
    "Income",
    "Owner Draw",
    "Inventory",
    "Mileage",
    "Apps",
    "Promos",
    "SOP",
    "Analytics",
    "Subscribed",
    "Support",
    "Emails",
    "Notifications",
    "Clients",
    "Leads",
    "Projects",
    "Billing",
    "Notes",
    "Pricing",
    "Settings"
  ];

  function money(n) {
    return window.STLStudioPdf ? window.STLStudioPdf.money(n) : String(n || 0);
  }

  function dash(v) {
    if (v == null || v === "") return "—";
    return String(v);
  }

  function day(iso) {
    if (!iso) return "—";
    return String(iso).slice(0, 10);
  }

  function yesNo(v) {
    return v ? "Yes" : "No";
  }

  function platforms(v) {
    if (Array.isArray(v)) return v.filter(Boolean).join(", ") || "—";
    if (typeof v === "string") {
      try {
        var parsed = JSON.parse(v);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).join(", ") || "—";
      } catch (err) {}
      return v || "—";
    }
    return "—";
  }

  function stepsOf(guide) {
    var raw = guide && guide.steps;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch (err) {}
      return raw.split(/\n/);
    }
    return [];
  }

  function cellsOf(row) {
    var raw = row && row.cells;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch (err) {}
    }
    return [];
  }

  function payloadOf(doc) {
    var raw = doc && doc.payload;
    if (raw && typeof raw === "object") return raw;
    if (typeof raw === "string") {
      try { return JSON.parse(raw) || {}; } catch (err) { return {}; }
    }
    return {};
  }

  function blocksOf(row) {
    var raw = row && row.message_blocks;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch (err) {}
    }
    return [];
  }

  function yearTotal(item) {
    if (window.STLMoney && typeof window.STLMoney.yearTotal === "function") {
      return window.STLMoney.yearTotal(item);
    }
    return Number(item && item.amount) || 0;
  }

  function recTitle(item) {
    if (window.STLMoney && typeof window.STLMoney.recurrenceTitle === "function") {
      return window.STLMoney.recurrenceTitle(item);
    }
    return item && item.is_recurring ? (item.recurrence || "recurring") : "one-time";
  }

  function groupBy(rows, key) {
    var map = {};
    (rows || []).forEach(function (row) {
      var id = row && row[key];
      if (!id) return;
      if (!map[id]) map[id] = [];
      map[id].push(row);
    });
    return map;
  }

  function empty(pdf, msg) {
    pdf.note(msg || "Nothing saved on this menu.");
  }

  function table(pdf, headers, rows, widths, rightFrom) {
    if (!rows.length) return;
    pdf.tableHeader(headers, widths, rightFrom);
    rows.forEach(function (cells, i) {
      pdf.tableRow(cells, widths, { stripe: i % 2 === 1 });
    });
  }

  function longText(pdf, str) {
    var text = String(str == null ? "" : str);
    if (!text.trim()) {
      empty(pdf, "Empty.");
      return;
    }
    text.split(/\n/).forEach(function (line) {
      var chunk = line === "" ? " " : line;
      var h = pdf.measure(chunk, pdf.maxW, 9) + 4;
      pdf.ensure(h);
      pdf.y += pdf.wrap(chunk, pdf.mL, pdf.y, pdf.maxW, { size: 9 }) + 3;
    });
  }

  function fetchTable(db, table) {
    var page = 1000;
    var all = [];
    function next(from) {
      return db.from(table).select("*").range(from, from + page - 1).then(function (res) {
        if (res.error) return [];
        var rows = res.data || [];
        all = all.concat(rows);
        if (rows.length < page) return all;
        return next(from + page);
      });
    }
    return next(0).catch(function () { return []; });
  }

  function apiGet(path) {
    if (!window.STLLocalApi || !window.STLLocalApi.available()) {
      return Promise.resolve(null);
    }
    return window.STLLocalApi.get(path).then(function (res) {
      if (!res || !res.ok) return { error: (res && res.data && res.data.error) || "Could not load." };
      return res.data || null;
    }).catch(function (err) {
      return { error: (err && err.message) || "Could not reach the studio server." };
    });
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve({ error: "Timed out." });
      }, ms);
      promise.then(function (value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      }, function (err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ error: (err && err.message) || "Failed." });
      });
    });
  }

  function loadSecretsMeta(db) {
    if (!db) return Promise.resolve({});
    return db.from("studio_secrets").select(
      "asc_issuer_id,asc_key_id,asc_vendor_number,play_gcs_bucket,permitpath_supabase_url,pilotcar4hire_supabase_url,mercury_token,asc_private_key,play_service_account_json,permitpath_service_role_key,pilotcar4hire_service_role_key"
    ).limit(1).maybeSingle().then(function (res) {
      var d = (res && res.data) || {};
      return {
        asc_issuer_id: d.asc_issuer_id || "",
        asc_key_id: d.asc_key_id || "",
        asc_vendor_number: d.asc_vendor_number || "",
        play_gcs_bucket: d.play_gcs_bucket || "",
        permitpath_supabase_url: d.permitpath_supabase_url || "",
        pilotcar4hire_supabase_url: d.pilotcar4hire_supabase_url || "",
        mercury: !!d.mercury_token,
        asc: !!d.asc_private_key,
        play: !!d.play_service_account_json,
        permitpath: !!d.permitpath_service_role_key,
        pc4h: !!d.pilotcar4hire_service_role_key
      };
    }).catch(function () { return {}; });
  }

  function loadUserEmail(db) {
    if (!db || !db.auth) return Promise.resolve("");
    return db.auth.getUser().then(function (auth) {
      var user = auth.data && auth.data.user;
      return (user && user.email) || "";
    }).catch(function () { return ""; });
  }

  function loadLive(apps, onStatus) {
    onStatus("Loading Bank, Analytics, and Subscribed snapshots…");
    var jobs = [
      withTimeout(apiGet("/api/mercury/snapshot"), 20000),
      withTimeout(apiGet("/api/asc/snapshot?metrics=0"), 25000),
      withTimeout(apiGet("/api/play/snapshot"), 20000)
    ];
    var subJobs = (apps || []).map(function (app) {
      var params = new URLSearchParams();
      if (app.name) params.set("name", app.name);
      if (app.apple_app_id) params.set("appleAppId", app.apple_app_id);
      if (app.bundle_identifier) params.set("bundleId", app.bundle_identifier);
      if (app.google_package_name) params.set("googlePackage", app.google_package_name);
      return withTimeout(apiGet("/api/subscriptions?" + params.toString()), 20000).then(function (data) {
        return { app: app, data: data };
      });
    });
    return Promise.all(jobs.concat(subJobs)).then(function (parts) {
      return {
        bank: parts[0],
        apple: parts[1],
        play: parts[2],
        subscribed: parts.slice(3)
      };
    });
  }

  function loadAll(db, onStatus) {
    onStatus("Loading every Studio menu…");
    var tables = {};
    return Promise.all(TABLES.map(function (name) {
      return fetchTable(db, name).then(function (rows) {
        tables[name] = rows || [];
      });
    })).then(function () {
      return Promise.all([
        loadLive(tables.managed_apps || [], onStatus),
        loadSecretsMeta(db),
        loadUserEmail(db)
      ]);
    }).then(function (extra) {
      return {
        tables: tables,
        live: extra[0] || {},
        secrets: extra[1] || {},
        email: extra[2] || ""
      };
    });
  }

  function setting(rows, key, fallback) {
    var found = (rows || []).filter(function (r) { return r.key === key; })[0];
    return found ? found.value : fallback;
  }

  function cover(pdf, pack) {
    var t = pack.tables;
    pdf.heading("Studio Backup Log", 18);
    pdf.note("Prepared " + window.STLStudioPdf.prepared() + ". Print or keep this PDF somewhere safe. If Studio is ever empty, open each sidebar menu and type the matching pages back in.");
    pdf.note("This file includes Login Vault, Apps, Projects, and Business Info passwords. Keep it private.");
    pdf.chips([
      ["Signed in", pack.email || "—"],
      ["Menus", String(MENUS.length)]
    ]);
    pdf.heading("Pages in this file", 12);
    var counts = [
      ["Overview", "snapshot"],
      ["Bank", ((pack.live.bank && pack.live.bank.accounts) || []).length + " accounts"],
      ["Business Info", (t.business_profile || []).length ? "profile" : "empty"],
      ["Login Vault", (t.vault_logins || []).length + " logins"],
      ["Renewals", (t.renewal_items || []).length],
      ["Calendar", (t.calendar_day_notes || []).length + " day notes"],
      ["Taxes", "P&L from books"],
      ["Expenses", (t.business_expenses || []).length],
      ["Income", (t.business_incomes || []).length],
      ["Owner Draw", (t.owner_draws || []).length],
      ["Inventory", (t.inventory_items || []).length],
      ["Mileage", (t.mileage_trips || []).length],
      ["Apps", (t.managed_apps || []).length],
      ["Promos", (t.app_promos || []).length],
      ["SOP", (t.sop_guides || []).length],
      ["Analytics", "store snapshot"],
      ["Subscribed", (t.managed_apps || []).length + " apps"],
      ["Support", (t.support_tickets || []).length],
      ["Emails", (t.email_contacts || []).length + " contacts"],
      ["Notifications", (t.app_notifications || []).length],
      ["Clients", (t.studio_clients || []).length],
      ["Leads", (t.studio_leads || []).length],
      ["Projects", (t.client_projects || []).length],
      ["Billing", (t.billing_documents || []).length],
      ["Notes", (t.studio_notes || []).length ? "notepad" : "empty"],
      ["Pricing", (t.studio_pricing_items || []).length + " items"],
      ["Settings", (t.studio_settings || []).length + " prefs"]
    ];
    table(
      pdf,
      ["Menu", "What is here"],
      counts.map(function (row) { return [row[0], String(row[1])]; }),
      [180, pdf.maxW - 180],
      1
    );
  }

  function overview(pdf, pack) {
    pdf.newSection("Overview", "Year snapshot from Income, Expenses, Owner Draw, Mileage, and what still needs you.");
    var year = new Date().getFullYear();
    var incomes = pack.tables.business_incomes || [];
    var expenses = pack.tables.business_expenses || [];
    var draws = pack.tables.owner_draws || [];
    var trips = pack.tables.mileage_trips || [];
    var rate = Number(setting(pack.tables.studio_settings, "mileage_rate", 0.70)) || 0.70;
    var inc = incomes.filter(function (r) { return Number(r.year) === year; }).reduce(function (s, r) { return s + yearTotal(r); }, 0);
    var exp = expenses.filter(function (r) { return Number(r.year) === year; }).reduce(function (s, r) { return s + yearTotal(r); }, 0);
    var draw = draws.filter(function (r) { return Number(r.year) === year; }).reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
    var miles = trips.filter(function (r) { return String(r.trip_date || "").slice(0, 4) === String(year); }).reduce(function (s, r) { return s + (Number(r.miles) || 0); }, 0);
    pdf.chips([
      [year + " income", money(inc)],
      [year + " expenses", money(exp)],
      [year + " profit", money(inc - exp)],
      [year + " owner draw", money(draw)],
      [year + " miles", String(Math.round(miles * 10) / 10)],
      ["Mileage $", money(miles * rate)]
    ]);
    var today = new Date();
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var due = (pack.tables.renewal_items || []).filter(function (item) {
      var dueDate = String(item.due_date || "").slice(0, 10).split("-");
      if (dueDate.length !== 3) return false;
      var d = new Date(Number(dueDate[0]), Number(dueDate[1]) - 1, Number(dueDate[2]));
      var days = Math.round((d - today) / 86400000);
      var remind = Math.max(0, Number(item.remind_days_before) || 0);
      return days < 0 || days <= remind;
    });
    pdf.heading("Needs you — renewals", 12);
    if (!due.length) empty(pdf, "No renewals in the reminder window.");
    else {
      table(
        pdf,
        ["Title", "Due", "Amount"],
        due.map(function (r) { return [r.title || "Untitled", day(r.due_date), money(r.amount)]; }),
        [pdf.maxW - 160, 80, 80],
        1
      );
    }
    var openIssues = (pack.tables.project_issues || []).concat(pack.tables.app_issues || []).filter(function (i) {
      return i.status !== "fixed" && i.status !== "wontFix";
    });
    pdf.heading("Open issues", 12);
    if (!openIssues.length) empty(pdf, "No open issues.");
    else {
      table(
        pdf,
        ["Title", "Status", "Priority"],
        openIssues.slice(0, 40).map(function (i) { return [i.title || "Untitled", i.status || "", i.priority || ""]; }),
        [pdf.maxW - 180, 90, 90],
        1
      );
    }
  }

  function bank(pdf, pack) {
    pdf.newSection("Bank", "Live Mercury snapshot. Type account nicknames into Bank only if you keep notes there; cash itself lives at Mercury.");
    var snap = pack.live.bank;
    if (!snap || snap.error || !snap.accounts) {
      empty(pdf, (snap && snap.error) || "Bank snapshot was not available. Open Bank on this Mac while signed in, then run Backup Log again.");
      return;
    }
    var accounts = snap.accounts || [];
    pdf.chips([
      ["Accounts", String(accounts.length)],
      ["Fetched", dash(snap.fetchedAt)]
    ]);
    table(
      pdf,
      ["Account", "Status", "Last 4", "Balance"],
      accounts.map(function (a) {
        var digits = String(a.accountNumber || "").replace(/\D/g, "");
        return [a.nickname || a.name || "Account", a.status || "", digits.slice(-4) || "—", money(a.currentBalance)];
      }),
      [pdf.maxW - 220, 70, 60, 90],
      2
    );
    var txs = (snap.transactions || []).slice(0, 200);
    pdf.heading("Recent activity", 12);
    if (!txs.length) empty(pdf, "No transactions in the snapshot.");
    else {
      table(
        pdf,
        ["Date", "Name", "Amount"],
        txs.map(function (row) {
          var name = row.counterpartyName || row.note || row.bankDescription || row.kind || "Transfer";
          var amt = row.amount != null ? row.amount : row.mercuryAmount;
          return [day(row.createdAt || row.postedAt), name, money(amt)];
        }),
        [80, pdf.maxW - 170, 90],
        2
      );
    }
  }

  function business(pdf, pack) {
    pdf.newSection("Business Info", "Company profile, bank details for invoices, and the document list.");
    var profile = (pack.tables.business_profile || [])[0];
    if (!profile) empty(pdf, "No company profile saved.");
    else {
      pdf.fields([
        ["Name", profile.name],
        ["Contact", profile.contact],
        ["Signer title", profile.signer_title],
        ["Email", profile.email],
        ["Phone", profile.phone],
        ["Website", profile.website],
        ["EIN / tax ID", profile.tax_id],
        ["D-U-N-S", profile.duns_number],
        ["Address", profile.address],
        ["Formation state", profile.formation_state],
        ["Governing state", profile.governing_state],
        ["Bank name", profile.bank_name],
        ["Routing", profile.bank_routing],
        ["Account", profile.bank_account],
        ["Bank address", profile.bank_address],
        ["Portal URL", profile.portal_url],
        ["Portal username", profile.portal_username],
        ["Portal password", profile.portal_password],
        ["Payment notes", profile.payment_notes]
      ]);
    }
    pdf.heading("Company documents", 12);
    var docs = pack.tables.business_documents || [];
    if (!docs.length) empty(pdf, "No files listed. Original files live in Studio storage, not in this PDF.");
    else {
      table(
        pdf,
        ["Name", "File"],
        docs.map(function (d) { return [d.name || "Untitled", d.file_name || d.storage_path || "—"]; }),
        [240, pdf.maxW - 240],
        1
      );
    }
  }

  function vault(pdf, pack) {
    pdf.newSection("Login Vault", "Every saved login. Type these back into Login Vault.");
    var rows = pack.tables.vault_logins || [];
    if (!rows.length) { empty(pdf); return; }
    rows.forEach(function (row) {
      pdf.heading(row.topic || "Untitled login", 12);
      pdf.fields([
        ["URL", row.url],
        ["Username", row.username],
        ["Password", row.password]
      ]);
    });
  }

  function renewals(pdf, pack) {
    pdf.newSection("Renewals", "Filings, domains, Apple Developer, insurance, and other due dates.");
    var rows = pack.tables.renewal_items || [];
    if (!rows.length) { empty(pdf); return; }
    table(
      pdf,
      ["Title", "Category", "Due", "Remind", "Amount", "Notes"],
      rows.map(function (r) {
        return [
          r.title || "Untitled",
          r.category || "",
          day(r.due_date),
          String(r.remind_days_before == null ? "" : r.remind_days_before),
          money(r.amount),
          r.notes || ""
        ];
      }),
      [120, 70, 70, 50, 70, pdf.maxW - 380],
      4
    );
  }

  function calendar(pdf, pack) {
    pdf.newSection("Calendar", "Day notes you typed. Invoice, project, meeting, renewal, and lead dates already appear on those other menus.");
    var rows = (pack.tables.calendar_day_notes || []).slice().sort(function (a, b) {
      return String(a.day || "").localeCompare(String(b.day || ""));
    });
    if (!rows.length) { empty(pdf, "No day notes."); return; }
    rows.forEach(function (row) {
      pdf.heading(day(row.day), 12);
      longText(pdf, row.body || "");
    });
  }

  function yearsFrom(pack) {
    var set = {};
    function add(y) {
      var n = Number(y);
      if (n) set[n] = true;
    }
    (pack.tables.business_incomes || []).forEach(function (r) { add(r.year); });
    (pack.tables.business_expenses || []).forEach(function (r) { add(r.year); });
    (pack.tables.owner_draws || []).forEach(function (r) { add(r.year); });
    add(new Date().getFullYear());
    return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
  }

  function taxes(pdf, pack) {
    pdf.newSection("Taxes", "Profit and loss by year from Income minus Expenses. Owner draws are listed and are not expenses.");
    var reserve = setting(pack.tables.studio_settings, "tax_reserve_percent", "30");
    pdf.note("Tax reserve setting: " + reserve + "%.");
    var years = yearsFrom(pack);
    table(
      pdf,
      ["Year", "Income", "Expenses", "Profit", "Owner draw"],
      years.map(function (year) {
        var inc = (pack.tables.business_incomes || []).filter(function (r) { return Number(r.year) === year; }).reduce(function (s, r) { return s + yearTotal(r); }, 0);
        var exp = (pack.tables.business_expenses || []).filter(function (r) { return Number(r.year) === year; }).reduce(function (s, r) { return s + yearTotal(r); }, 0);
        var draw = (pack.tables.owner_draws || []).filter(function (r) { return Number(r.year) === year; }).reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
        return [String(year), money(inc), money(exp), money(inc - exp), money(draw)];
      }),
      [70, (pdf.maxW - 70) / 4, (pdf.maxW - 70) / 4, (pdf.maxW - 70) / 4, (pdf.maxW - 70) / 4],
      1
    );
  }

  function ledgerSection(pdf, title, blurb, rows, kind) {
    pdf.newSection(title, blurb);
    if (!rows.length) { empty(pdf); return; }
    table(
      pdf,
      ["Date", "Title", "Year", "Type", "Amount", "Notes / receipt"],
      rows.map(function (r) {
        var extra = [r.notes, r.receipt_file_name, r.source_invoice_number].filter(Boolean).join(" · ");
        return [
          day(r.date),
          r.title || (kind === "draw" ? (r.reason || "Draw") : "Untitled"),
          String(r.year || ""),
          kind === "draw" ? (r.reason || "") : recTitle(r),
          money(r.amount),
          extra
        ];
      }),
      [70, 130, 40, 80, 70, pdf.maxW - 390],
      4
    );
  }

  function inventory(pdf, pack) {
    pdf.newSection("Inventory", "Gear list: purchase date, cost, purpose, serial.");
    var rows = pack.tables.inventory_items || [];
    if (!rows.length) { empty(pdf); return; }
    table(
      pdf,
      ["Name", "Purchased", "Cost", "Serial", "Purpose"],
      rows.map(function (r) {
        return [r.name || "Untitled", day(r.purchased_on), money(r.amount), r.serial_number || "", r.purpose || ""];
      }),
      [120, 70, 70, 90, pdf.maxW - 350],
      2
    );
  }

  function mileage(pdf, pack) {
    pdf.newSection("Mileage", "Business trips. Rate is also in Settings.");
    var rate = Number(setting(pack.tables.studio_settings, "mileage_rate", 0.70)) || 0.70;
    var rows = pack.tables.mileage_trips || [];
    pdf.note("Mileage rate: " + money(rate) + " per mile.");
    if (!rows.length) { empty(pdf); return; }
    table(
      pdf,
      ["Date", "Purpose", "Route", "Miles", "Amount"],
      rows.map(function (r) {
        var route = [r.start_place, r.end_place].filter(Boolean).join(" to ");
        var miles = Number(r.miles) || 0;
        return [day(r.trip_date), r.purpose || "", route || (r.notes || ""), String(miles), money(miles * rate)];
      }),
      [70, 110, pdf.maxW - 70 - 110 - 55 - 70, 55, 70],
      3
    );
  }

  function apps(pdf, pack) {
    pdf.newSection("Apps", "Products, store IDs, versions, logins, and issues.");
    var list = pack.tables.managed_apps || [];
    var logins = groupBy(pack.tables.app_logins, "app_id");
    var issues = groupBy(pack.tables.app_issues, "app_id");
    if (!list.length) { empty(pdf); return; }
    list.forEach(function (app) {
      pdf.heading(app.name || "Untitled app", 13);
      pdf.fields([
        ["Summary", app.summary],
        ["Status", app.status],
        ["Platforms", platforms(app.platforms)],
        ["Bundle ID", app.bundle_identifier],
        ["Apple App ID", app.apple_app_id],
        ["Google package", app.google_package_name],
        ["Apple version", app.apple_version],
        ["Apple build", app.apple_build_number],
        ["Play version", app.google_play_version],
        ["Website", app.website_url],
        ["Accent hex", app.accent_hex],
        ["Notes", app.notes]
      ]);
      var appLogins = logins[app.id] || [];
      if (appLogins.length) {
        pdf.heading("Logins", 12);
        appLogins.forEach(function (row) {
          pdf.fields([
            ["Site", row.site_name],
            ["URL", row.url],
            ["Username", row.username],
            ["Password", row.password],
            ["Notes", row.notes]
          ]);
        });
      }
      var appIssues = issues[app.id] || [];
      if (appIssues.length) {
        pdf.heading("Issues", 12);
        table(
          pdf,
          ["Title", "Status", "Priority", "Platform", "Details"],
          appIssues.map(function (i) {
            return [i.title || "Untitled", i.status || "", i.priority || "", i.platform || "", i.details || ""];
          }),
          [110, 70, 60, 60, pdf.maxW - 300],
          1
        );
      }
    });
  }

  function promos(pdf, pack) {
    pdf.newSection("Promos", "Free trials, intro prices, and promo codes per app.");
    var rows = pack.tables.app_promos || [];
    if (!rows.length) { empty(pdf); return; }
    table(
      pdf,
      ["App", "Platform", "Kind", "Title", "Duration", "Status", "Dates"],
      rows.map(function (r) {
        return [
          r.app_name || "",
          r.platform || "",
          r.kind || "",
          r.title || "",
          r.duration || "",
          r.status || "",
          [day(r.start_date), day(r.end_date)].join(" to ")
        ];
      }),
      [90, 55, 70, 90, 60, 55, pdf.maxW - 420],
      1
    );
    rows.forEach(function (r) {
      if (!r.store_ref && !r.notes && !r.eligibility) return;
      pdf.heading((r.title || "Promo") + " — extra", 12);
      pdf.fields([
        ["Eligibility", r.eligibility],
        ["Store ref", r.store_ref],
        ["Notes", r.notes]
      ]);
    });
  }

  function sop(pdf, pack) {
    pdf.newSection("SOP", "How-to guides with steps.");
    var rows = pack.tables.sop_guides || [];
    if (!rows.length) { empty(pdf); return; }
    rows.forEach(function (g) {
      pdf.heading(g.title || "Untitled SOP", 13);
      pdf.fields([
        ["Category", g.category],
        ["Summary", g.summary],
        ["Link", [g.link_title, g.link_url].filter(Boolean).join(" — ")]
      ]);
      pdf.heading("Steps", 12);
      var steps = stepsOf(g);
      if (!steps.length) empty(pdf, "No steps.");
      else pdf.bullets(steps);
    });
  }

  function analytics(pdf, pack) {
    pdf.newSection("Analytics", "App Store Connect and Google Play snapshot. Live numbers; store IDs to type back are also on Apps.");
    var apple = pack.live.apple;
    if (!apple || apple.error) {
      pdf.note((apple && apple.error) || "Apple snapshot was not available.");
    } else {
      var list = apple.apps || [];
      pdf.heading("App Store Connect", 12);
      if (!list.length) empty(pdf, "No apps on this App Store Connect key.");
      else {
        table(
          pdf,
          ["Name", "Apple ID", "Bundle", "Version", "State", "Reviews"],
          list.map(function (a) {
            return [
              a.name || "",
              a.id || "",
              a.bundleID || "",
              a.version || "",
              a.versionState || "",
              String(a.reviewCount || 0)
            ];
          }),
          [110, 80, 130, 50, 80, pdf.maxW - 450],
          5
        );
      }
    }
    var play = pack.live.play;
    pdf.heading("Google Play", 12);
    if (!play || play.error) {
      pdf.note((play && play.error) || "Play snapshot was not available.");
      return;
    }
    var pkgs = play.apps || [];
    if (play.note) pdf.note(play.note);
    if (!pkgs.length) empty(pdf, "No Play packages in the snapshot.");
    else {
      table(
        pdf,
        ["Package", "Crash rate", "ANR rate"],
        pkgs.map(function (p) {
          var crash = p.crash && p.crash.latest && p.crash.latest.rate;
          var anr = p.anr && p.anr.latest && p.anr.latest.rate;
          return [
            p.packageName || p.name || "App",
            crash == null ? "—" : String(crash),
            anr == null ? "—" : String(anr)
          ];
        }),
        [pdf.maxW - 180, 90, 90],
        1
      );
    }
  }

  function subscribed(pdf, pack) {
    pdf.newSection("Subscribed", "Apple and Google subscriber totals per app at the time of this backup.");
    var rows = pack.live.subscribed || [];
    if (!rows.length) { empty(pdf, "No apps to count."); return; }
    table(
      pdf,
      ["App", "Apple", "Google", "Total", "Note"],
      rows.map(function (row) {
        var d = row.data || {};
        var apple = d.apple || {};
        var google = d.google || {};
        var note = d.error || apple.error || google.error || [apple.reportDate, google.reportDate].filter(Boolean).join(" · ");
        return [
          (row.app && row.app.name) || "App",
          apple.total != null ? String(apple.total) : "—",
          google.total != null ? String(google.total) : "—",
          d.total != null ? String(d.total) : "—",
          note || ""
        ];
      }),
      [120, 60, 60, 60, pdf.maxW - 300],
      1
    );
  }

  function support(pdf, pack) {
    pdf.newSection("Support", "Customer tickets by app.");
    var rows = pack.tables.support_tickets || [];
    if (!rows.length) { empty(pdf); return; }
    rows.forEach(function (t) {
      pdf.heading((t.ticket_number || "") + "  " + (t.title || "Untitled ticket"), 12);
      pdf.fields([
        ["Status", t.status],
        ["Priority", t.priority],
        ["Category", t.category],
        ["Platform", t.platform],
        ["App version", t.app_version],
        ["OS / device", [t.os_version, t.device].filter(Boolean).join(" · ")],
        ["Source", t.source],
        ["Customer", t.customer_name],
        ["Email", t.customer_email],
        ["Phone", t.customer_phone],
        ["Details", t.details],
        ["Next step", t.next_step],
        ["Resolution", t.resolution],
        ["Internal notes", t.internal_notes]
      ]);
    });
  }

  function emails(pdf, pack) {
    pdf.newSection("Emails", "Mailing lists, contacts, and templates.");
    var lists = pack.tables.email_lists || [];
    var contacts = groupBy(pack.tables.email_contacts, "list_id");
    var templates = pack.tables.email_templates || [];
    if (!lists.length && !templates.length) { empty(pdf); return; }
    lists.forEach(function (list) {
      pdf.heading(list.name || "Untitled list", 13);
      pdf.note(list.source_file_name ? "Imported from " + list.source_file_name : "Studio list.");
      var people = contacts[list.id] || [];
      if (!people.length) empty(pdf, "No contacts on this list.");
      else {
        table(
          pdf,
          ["Name", "Email", "Company", "Phone", "Sent", "Notes"],
          people.map(function (c) {
            var extra = cellsOf(c);
            return [
              c.name || extra[1] || "",
              c.email || extra[0] || "",
              c.company || extra[2] || "",
              c.phone || extra[3] || "",
              yesNo(c.is_sent),
              c.notes || extra[4] || ""
            ];
          }),
          [90, 130, 90, 80, 40, pdf.maxW - 430],
          1
        );
      }
    });
    if (templates.length) {
      pdf.heading("Templates", 13);
      templates.forEach(function (tpl) {
        pdf.heading(tpl.title || "Untitled template", 12);
        longText(pdf, tpl.body || "");
      });
    }
  }

  function notifications(pdf, pack) {
    pdf.newSection("Notifications", "Messages sent to apps. Photos stay in Studio storage.");
    var rows = pack.tables.app_notifications || [];
    if (!rows.length) { empty(pdf); return; }
    rows.forEach(function (n) {
      pdf.heading((n.app_name || "App") + " — " + (n.subject || "No subject"), 12);
      pdf.fields([
        ["Sent", day(n.created_at)],
        ["Font / size / color", [n.message_font, n.message_size, n.message_color].filter(Boolean).join(" · ")],
        ["Image URL", n.image_url],
        ["Message", n.message]
      ]);
      var blocks = blocksOf(n);
      if (blocks.length) {
        pdf.heading("Lines", 12);
        pdf.bullets(blocks.map(function (b) {
          if (typeof b === "string") return b;
          return (b && (b.text || b.body || b.line)) || JSON.stringify(b);
        }));
      }
    });
  }

  function clients(pdf, pack) {
    pdf.newSection("Clients", "People and companies you bill.");
    var rows = pack.tables.studio_clients || [];
    if (!rows.length) { empty(pdf); return; }
    rows.forEach(function (c) {
      pdf.heading((c.company_name || c.name || "Untitled client"), 12);
      pdf.fields([
        ["Name", c.name],
        ["Company", c.company_name],
        ["Email", c.email],
        ["Phone", c.phone],
        ["Address", c.address],
        ["Channel", c.comms_channel],
        ["Best time", c.comms_best_time],
        ["Comms notes", c.comms_notes],
        ["Notes", c.notes]
      ]);
    });
  }

  function leads(pdf, pack) {
    pdf.newSection("Leads", "Incoming work and follow-ups.");
    var rows = pack.tables.studio_leads || [];
    if (!rows.length) { empty(pdf); return; }
    table(
      pdf,
      ["Name", "Company", "Status", "Follow-up", "Email", "Phone"],
      rows.map(function (r) {
        return [r.name || "", r.company_name || "", r.status || "", day(r.follow_up), r.email || "", r.phone || ""];
      }),
      [90, 90, 60, 70, 120, pdf.maxW - 430],
      1
    );
    rows.forEach(function (r) {
      if (!r.notes && !r.source) return;
      pdf.heading((r.name || r.company_name || "Lead") + " — extra", 12);
      pdf.fields([
        ["Source", r.source],
        ["Last touch", day(r.last_touch)],
        ["Notes", r.notes]
      ]);
    });
  }

  function projects(pdf, pack) {
    pdf.newSection("Projects", "Client jobs, logins, costs, hours, issues, meetings, and handoff.");
    var list = pack.tables.client_projects || [];
    if (!list.length) { empty(pdf); return; }
    var logins = groupBy(pack.tables.project_logins, "project_id");
    var costs = groupBy(pack.tables.project_costs, "project_id");
    var hours = groupBy(pack.tables.project_hour_entries, "project_id");
    var issues = groupBy(pack.tables.project_issues, "project_id");
    var handoff = groupBy(pack.tables.project_handoff_items, "project_id");
    var meetings = groupBy(pack.tables.meeting_logs, "linked_project_id");
    var clientsMap = {};
    (pack.tables.studio_clients || []).forEach(function (c) {
      if (c.id) clientsMap[c.id] = c;
      if (c.link_id) clientsMap[c.link_id] = c;
    });
    list.forEach(function (p) {
      var linked = clientsMap[p.linked_client_id];
      var linkedLabel = linked ? (linked.company_name || linked.name) : p.linked_client_id;
      pdf.heading(p.name || "Untitled project", 13);
      pdf.fields([
        ["Company", p.company_name],
        ["Linked client", linkedLabel],
        ["Due", day(p.due_date)],
        ["Information", p.information],
        ["Discovery", p.discovery_json]
      ]);
      var pLogins = logins[p.id] || [];
      if (pLogins.length) {
        pdf.heading("Logins", 12);
        pLogins.forEach(function (row) {
          pdf.fields([
            ["Site", row.site_name],
            ["URL", row.url],
            ["Username", row.username],
            ["Password", row.password],
            ["Notes", row.notes]
          ]);
        });
      }
      var pCosts = costs[p.id] || [];
      if (pCosts.length) {
        pdf.heading("Costs", 12);
        table(
          pdf,
          ["Date", "Title", "Amount", "Notes"],
          pCosts.map(function (c) { return [day(c.date), c.title || "", money(c.amount), c.notes || ""]; }),
          [70, 140, 70, pdf.maxW - 280],
          2
        );
      }
      var pHours = hours[p.id] || [];
      if (pHours.length) {
        pdf.heading("Hours", 12);
        table(
          pdf,
          ["Date", "Hours", "Billed", "Notes"],
          pHours.map(function (h) { return [day(h.date), String(h.hours || 0), yesNo(h.is_billed), h.notes || ""]; }),
          [70, 50, 50, pdf.maxW - 170],
          1
        );
      }
      var pIssues = issues[p.id] || [];
      if (pIssues.length) {
        pdf.heading("Issues", 12);
        table(
          pdf,
          ["Title", "Status", "Priority", "Details"],
          pIssues.map(function (i) { return [i.title || "", i.status || "", i.priority || "", i.details || ""]; }),
          [120, 70, 60, pdf.maxW - 250],
          1
        );
      }
      var pMeet = meetings[p.link_id] || [];
      if (pMeet.length) {
        pdf.heading("Meetings", 12);
        pMeet.forEach(function (m) {
          pdf.fields([
            ["Date", day(m.meeting_date)],
            ["Topic", m.topic],
            ["Attendees", m.attendees],
            ["Notes", m.notes]
          ]);
        });
      }
      var pHand = handoff[p.id] || [];
      if (pHand.length) {
        pdf.heading("Handoff", 12);
        table(
          pdf,
          ["Done", "Item", "Notes"],
          pHand.map(function (h) { return [yesNo(h.is_done), h.title || "", h.notes || ""]; }),
          [40, 180, pdf.maxW - 220],
          1
        );
      }
    });
  }

  function billing(pdf, pack) {
    pdf.newSection("Billing", "Quotes and invoices, including line items and amounts paid.");
    var rows = pack.tables.billing_documents || [];
    if (!rows.length) { empty(pdf); return; }
    rows.forEach(function (doc) {
      var p = payloadOf(doc);
      pdf.heading((doc.kind || "doc").toUpperCase() + " " + (doc.number || ""), 13);
      pdf.fields([
        ["Status", doc.status],
        ["Client", doc.client_name || p.clientName],
        ["Email", doc.client_email || p.clientEmail],
        ["Phone", p.clientPhone],
        ["Address", p.clientAddress],
        ["Project", doc.project_name || p.projectName],
        ["Issued", day(doc.issued_on || p.documentDate)],
        ["Due", day(doc.due_on || p.dueDate)],
        ["Paid on", day(doc.paid_on || p.paidDate)],
        ["Amount", money(doc.amount)],
        ["Amount paid", money(p.amountPaid)],
        ["PO", p.poNumber],
        ["Terms", p.terms],
        ["Tax %", p.taxPercent],
        ["Discount", [p.discountType, p.discountValue].filter(Boolean).join(" ")],
        ["Deposit %", p.depositPercent],
        ["Notes", doc.notes || p.notes],
        ["Payment notes", p.paymentNotes]
      ]);
      var items = p.items || [];
      if (items.length) {
        pdf.heading("Line items", 12);
        table(
          pdf,
          ["Description", "Qty", "Rate", "Line"],
          items.map(function (it) {
            var qty = Number(it.qty) || 0;
            var rate = Number(it.rate) || 0;
            return [it.desc || "", String(qty), money(rate), money(qty * rate)];
          }),
          [pdf.maxW - 180, 50, 65, 65],
          1
        );
      }
    });
  }

  function notes(pdf, pack) {
    pdf.newSection("Notes", "Private notepad.");
    var row = (pack.tables.studio_notes || [])[0];
    if (!row || !String(row.body || "").trim()) empty(pdf, "Notepad is empty.");
    else longText(pdf, row.body);
  }

  function pricing(pdf, pack) {
    pdf.newSection("Pricing", "Price book used on quotes and invoices.");
    var settings = (pack.tables.studio_pricing_settings || [])[0] || {};
    pdf.fields([
      ["Deposit %", settings.deposit_percent],
      ["Quote valid days", settings.valid_days]
    ]);
    var items = pack.tables.studio_pricing_items || [];
    if (!items.length) empty(pdf, "No price book items.");
    else {
      table(
        pdf,
        ["Name", "Detail", "Rate"],
        items.map(function (i) { return [i.name || "", i.detail || "", money(i.rate)]; }),
        [160, pdf.maxW - 240, 80],
        2
      );
    }
  }

  function settings(pdf, pack) {
    pdf.newSection("Settings", "Studio defaults and connection IDs. API keys live in the Mac secrets folder and are not printed here.");
    var rows = pack.tables.studio_settings || [];
    pdf.fields([
      ["Signed in as", pack.email],
      ["Default page", setting(rows, "default_section", "overview")],
      ["Mileage rate", setting(rows, "mileage_rate", "0.70")],
      ["Tax reserve %", setting(rows, "tax_reserve_percent", "30")]
    ]);
    var bill = (pack.tables.studio_pricing_settings || [])[0] || {};
    pdf.heading("Billing defaults", 12);
    pdf.fields([
      ["Deposit %", bill.deposit_percent],
      ["Quote valid days", bill.valid_days]
    ]);
    var s = pack.secrets || {};
    pdf.heading("Store report IDs", 12);
    pdf.fields([
      ["Apple vendor number", s.asc_vendor_number],
      ["Play report bucket", s.play_gcs_bucket],
      ["ASC issuer ID", s.asc_issuer_id],
      ["ASC key ID", s.asc_key_id],
      ["Permit Path Supabase URL", s.permitpath_supabase_url],
      ["Pilot Car 4 Hire Supabase URL", s.pilotcar4hire_supabase_url]
    ]);
    pdf.heading("Connections on file", 12);
    pdf.fields([
      ["Mercury token", s.mercury ? "Saved" : "Missing"],
      ["App Store Connect key", s.asc ? "Saved" : "Missing"],
      ["Play service account", s.play ? "Saved" : "Missing"],
      ["Permit Path announcements", s.permitpath ? "Saved" : "Missing"],
      ["Pilot Car 4 Hire announcements", s.pc4h ? "Saved" : "Missing"]
    ]);
    if (rows.length) {
      pdf.heading("All setting keys", 12);
      table(
        pdf,
        ["Key", "Value"],
        rows.map(function (r) { return [r.key || "", r.value || ""]; }),
        [180, pdf.maxW - 180],
        1
      );
    }
  }

  function build(pdf, pack) {
    cover(pdf, pack);
    overview(pdf, pack);
    bank(pdf, pack);
    business(pdf, pack);
    vault(pdf, pack);
    renewals(pdf, pack);
    calendar(pdf, pack);
    taxes(pdf, pack);
    ledgerSection(
      pdf,
      "Expenses",
      "Business costs. Receipt photos stay in Studio; file names are listed so you know what was attached.",
      pack.tables.business_expenses || [],
      "expense"
    );
    ledgerSection(
      pdf,
      "Income",
      "LLC revenue. Receipt photos stay in Studio; file names are listed so you know what was attached.",
      pack.tables.business_incomes || [],
      "income"
    );
    ledgerSection(
      pdf,
      "Owner Draw",
      "Money pulled from the LLC.",
      pack.tables.owner_draws || [],
      "draw"
    );
    inventory(pdf, pack);
    mileage(pdf, pack);
    apps(pdf, pack);
    promos(pdf, pack);
    sop(pdf, pack);
    analytics(pdf, pack);
    subscribed(pdf, pack);
    support(pdf, pack);
    emails(pdf, pack);
    notifications(pdf, pack);
    clients(pdf, pack);
    leads(pdf, pack);
    projects(pdf, pack);
    billing(pdf, pack);
    notes(pdf, pack);
    pricing(pdf, pack);
    settings(pdf, pack);
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function download(db, opts) {
    opts = opts || {};
    var onStatus = opts.onStatus || function () {};
    if (!window.STLStudioPdf) return Promise.reject(new Error("PDF library missing."));
    if (!db) return Promise.reject(new Error("Sign in first."));
    return loadAll(db, onStatus).then(function (pack) {
      onStatus("Writing PDF pages…");
      return window.STLStudioPdf.open({
        db: db,
        word: "BACKUP LOG",
        yearLabel: window.STLStudioPdf.prepared()
      }).then(function (pdf) {
        build(pdf, pack);
        pdf.save("STL-Apps-LLC_Backup-Log_" + stamp() + ".pdf");
      });
    });
  }

  window.STLBackupLog = {
    download: download,
    build: build,
    loadAll: loadAll
  };
})();

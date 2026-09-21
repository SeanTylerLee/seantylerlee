(function () {
  "use strict";

  var TABLES = [
    "business_profile", "business_documents", "vault_logins", "renewal_items",
    "calendar_day_notes", "studio_settings", "business_expenses", "business_expense_skips",
    "business_incomes", "business_income_skips", "owner_draws", "inventory_items",
    "mileage_trips", "managed_apps", "app_logins", "app_issues", "app_promos",
    "sop_guides", "support_tickets", "email_lists", "email_contacts", "email_templates",
    "app_notifications", "studio_clients", "studio_leads", "client_projects",
    "project_logins", "project_costs", "project_hour_entries", "project_issues",
    "project_handoff_items", "meeting_logs", "billing_documents", "studio_notes",
    "studio_pricing_items", "studio_pricing_settings"
  ];

  function money(n) {
    return window.STLStudioPdf ? window.STLStudioPdf.money(n) : String(n || 0);
  }

  function day(iso) {
    if (!iso) return "";
    return String(iso).slice(0, 10);
  }

  function yesNo(v) {
    return v ? "Yes" : "No";
  }

  function platforms(v) {
    if (Array.isArray(v)) return v.filter(Boolean).join(", ");
    if (typeof v === "string") {
      try {
        var parsed = JSON.parse(v);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).join(", ");
      } catch (err) {}
      return v;
    }
    return "";
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

  function proofsOf(item) {
    var list = [];
    var raw = item && item.proofs;
    if (Array.isArray(raw)) list = raw.slice();
    else if (typeof raw === "string") {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch (err) {}
    }
    if (!list.length && item && item.receipt_path) {
      list = [{ path: item.receipt_path, file_name: item.receipt_file_name || "receipt" }];
    }
    return list.filter(function (p) { return p && p.path; });
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

  function setting(rows, key, fallback) {
    var found = (rows || []).filter(function (r) { return r.key === key; })[0];
    return found ? found.value : fallback;
  }

  function empty(pdf, msg) {
    pdf.note(msg || "Nothing to type on this menu.");
  }

  function filled(pdf, pairs) {
    return pdf.fields(pairs, { skipEmpty: true });
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
      empty(pdf);
      return;
    }
    text.split(/\n/).forEach(function (line) {
      var chunk = line === "" ? " " : line;
      var h = pdf.measure(chunk, pdf.maxW, 10) + 4;
      pdf.ensure(h);
      pdf.y += pdf.wrap(chunk, pdf.mL, pdf.y, pdf.maxW, { size: 10 }) + 3;
    });
  }

  function openMenu(pdf, title, how) {
    pdf.newSection(title, how);
  }

  function fetchTable(db, tableName) {
    var page = 1000;
    var all = [];
    function next(from) {
      return db.from(tableName).select("*").range(from, from + page - 1).then(function (res) {
        if (res.error) return [];
        var rows = res.data || [];
        all = all.concat(rows);
        if (rows.length < page) return all;
        return next(from + page);
      });
    }
    return next(0).catch(function () { return []; });
  }

  function loadUserEmail(db) {
    if (!db || !db.auth) return Promise.resolve("");
    return db.auth.getUser().then(function (auth) {
      var user = auth.data && auth.data.user;
      return (user && user.email) || "";
    }).catch(function () { return ""; });
  }

  function loadSecretsRow(db) {
    var api = window.STLLocalApi;
    if (api && api.isLocal && api.isLocal()) {
      return api.get("/api/export-secrets").then(function (res) {
        return (res && res.ok && res.data) || {};
      }).catch(function () { return {}; });
    }
    if (!db) return Promise.resolve({});
    return db.from("studio_secrets").select(
      "mercury_token,asc_issuer_id,asc_key_id,asc_private_key,asc_vendor_number,play_gcs_bucket,play_service_account_json,permitpath_supabase_url,permitpath_service_role_key,pilotcar4hire_supabase_url,pilotcar4hire_service_role_key"
    ).limit(1).maybeSingle().then(function (res) {
      return (res && res.data) || {};
    }).catch(function () { return {}; });
  }

  function loadAll(db, onStatus) {
    onStatus("Loading every Studio menu…");
    var tables = {};
    return Promise.all(TABLES.map(function (name) {
      return fetchTable(db, name).then(function (rows) {
        tables[name] = rows || [];
      });
    })).then(function () {
      return Promise.all([loadSecretsRow(db), loadUserEmail(db)]);
    }).then(function (extra) {
      return { tables: tables, secrets: extra[0] || {}, email: extra[1] || "" };
    });
  }

  function cover(pdf, pack) {
    var t = pack.tables;
    pdf.heading("Restore guide", 18);
    pdf.note("Prepared " + window.STLStudioPdf.prepared() + ". Keep this zip private. It has passwords, receipts, company files, and API keys.");
    pdf.heading("How to restore", 13);
    pdf.bullets([
      "Sign in to Studio with " + (pack.email || "your usual email") + ".",
      "Copy every file from Secrets/ into the Mac folder stl-studio/secrets/, then open Studio signed in so the keys sync.",
      "Open each sidebar menu named on the following pages. Type each record exactly as printed.",
      "Re-upload files from Company-Documents/, Receipts/, App-Icons/, and Notification-Images/ onto the matching records.",
      "Bank, Analytics, and Subscribed fill themselves once the keys in Secrets/ are in place."
    ]);
    pdf.heading("What is in this zip", 13);
    table(
      pdf,
      ["Folder / file", "Put it back here"],
      [
        ["01-Restore-Guide.pdf", "This booklet. Type from it."],
        ["Secrets/", "stl-studio/secrets/ on this Mac"],
        ["Company-Documents/", "Business Info documents"],
        ["Receipts/Expenses/", "Expense proofs"],
        ["Receipts/Income/", "Income proofs"],
        ["App-Icons/", "App icons"],
        ["Notification-Images/", "Notification photos"]
      ],
      [200, pdf.maxW - 200],
      1
    );
    pdf.heading("Records to type", 13);
    table(
      pdf,
      ["Menu", "Records"],
      [
        ["Business Info", (t.business_profile || []).length ? "1 profile" : "empty"],
        ["Login Vault", String((t.vault_logins || []).length)],
        ["Renewals", String((t.renewal_items || []).length)],
        ["Calendar", String((t.calendar_day_notes || []).length) + " day notes"],
        ["Expenses", String((t.business_expenses || []).length)],
        ["Income", String((t.business_incomes || []).length)],
        ["Owner Draw", String((t.owner_draws || []).length)],
        ["Inventory", String((t.inventory_items || []).length)],
        ["Mileage", String((t.mileage_trips || []).length)],
        ["Apps", String((t.managed_apps || []).length)],
        ["Promos", String((t.app_promos || []).length)],
        ["SOP", String((t.sop_guides || []).length)],
        ["Support", String((t.support_tickets || []).length)],
        ["Emails", String((t.email_contacts || []).length) + " contacts"],
        ["Notifications", String((t.app_notifications || []).length)],
        ["Clients", String((t.studio_clients || []).length)],
        ["Leads", String((t.studio_leads || []).length)],
        ["Projects", String((t.client_projects || []).length)],
        ["Billing", String((t.billing_documents || []).length)],
        ["Notes", (t.studio_notes || []).length ? "notepad" : "empty"],
        ["Pricing", String((t.studio_pricing_items || []).length)],
        ["Settings", "defaults + store IDs"]
      ],
      [180, pdf.maxW - 180],
      1
    );
  }

  function skipPage(pdf, title, why) {
    openMenu(pdf, title, why);
  }

  function business(pdf, pack) {
    openMenu(pdf, "Business Info", "Open Business Info. Type the company fields, then upload each file from Company-Documents/.");
    var profile = (pack.tables.business_profile || [])[0];
    if (!profile) empty(pdf);
    else {
      filled(pdf, [
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
    var docs = pack.tables.business_documents || [];
    pdf.heading("Documents to re-upload", 12);
    if (!docs.length) empty(pdf, "No company files.");
    else {
      table(
        pdf,
        ["Name in Studio", "File in zip"],
        docs.map(function (d) {
          return [d.name || "Untitled", d.file_name || d.storage_path || "-"];
        }),
        [240, pdf.maxW - 240],
        1
      );
    }
  }

  function vault(pdf, pack) {
    openMenu(pdf, "Login Vault", "Open Login Vault. Add a login for each record and type these fields.");
    var rows = pack.tables.vault_logins || [];
    if (!rows.length) { empty(pdf); return; }
    rows.forEach(function (row, i) {
      pdf.recordHead(row.topic || "Untitled login", i + 1, rows.length);
      filled(pdf, [
        ["Topic", row.topic],
        ["URL", row.url],
        ["Username", row.username],
        ["Password", row.password]
      ]);
    });
  }

  function renewals(pdf, pack) {
    openMenu(pdf, "Renewals", "Open Renewals. Add each item.");
    var rows = pack.tables.renewal_items || [];
    if (!rows.length) { empty(pdf); return; }
    table(
      pdf,
      ["Title", "Category", "Due", "Remind days", "Amount", "Notes"],
      rows.map(function (r) {
        return [r.title || "Untitled", r.category || "", day(r.due_date), String(r.remind_days_before == null ? "" : r.remind_days_before), money(r.amount), r.notes || ""];
      }),
      [110, 70, 72, 70, 70, pdf.maxW - 392],
      4
    );
  }

  function calendar(pdf, pack) {
    openMenu(pdf, "Calendar", "Open Calendar. Click each date and paste the note.");
    var rows = (pack.tables.calendar_day_notes || []).slice().sort(function (a, b) {
      return String(a.day || "").localeCompare(String(b.day || ""));
    });
    if (!rows.length) { empty(pdf, "No day notes."); return; }
    rows.forEach(function (row, i) {
      pdf.recordHead(day(row.day), i + 1, rows.length);
      longText(pdf, row.body || "");
    });
  }

  function ledgerPage(pdf, title, how, rows, kind, skips) {
    openMenu(pdf, title, how);
    if (!rows.length) { empty(pdf); return; }
    table(
      pdf,
      ["Date", "Title", "Year", "Type", "Amount", "Proof / notes"],
      rows.map(function (r) {
        var proofs = proofsOf(r).map(function (p) { return p.file_name || p.path; }).join(", ");
        var extra = [r.notes, proofs, r.source_invoice_number].filter(Boolean).join(" · ");
        return [
          day(r.date),
          r.title || (kind === "draw" ? (r.reason || "Draw") : "Untitled"),
          String(r.year || ""),
          kind === "draw" ? (r.reason || "") : recTitle(r),
          money(r.amount),
          extra
        ];
      }),
      [70, 120, 40, 78, 70, pdf.maxW - 378],
      4
    );
    if (skips && skips.length) {
      pdf.heading("Skipped recurring years", 12);
      table(
        pdf,
        ["Series", "Year skipped"],
        skips.map(function (s) { return [String(s.series_id || "").slice(0, 8), String(s.year || "")]; }),
        [pdf.maxW - 120, 120],
        1
      );
    }
  }

  function inventory(pdf, pack) {
    openMenu(pdf, "Inventory", "Open Inventory. Add each piece of gear.");
    var rows = pack.tables.inventory_items || [];
    if (!rows.length) { empty(pdf); return; }
    table(
      pdf,
      ["Name", "Purchased", "Cost", "Serial", "Purpose"],
      rows.map(function (r) {
        return [r.name || "Untitled", day(r.purchased_on), money(r.amount), r.serial_number || "", r.purpose || ""];
      }),
      [120, 78, 70, 90, pdf.maxW - 358],
      2
    );
  }

  function mileage(pdf, pack) {
    openMenu(pdf, "Mileage", "Open Mileage. Add each trip. Rate is also in Settings.");
    var rate = Number(setting(pack.tables.studio_settings, "mileage_rate", 0.70)) || 0.70;
    pdf.note("Mileage rate: " + money(rate) + " per mile.");
    var rows = pack.tables.mileage_trips || [];
    if (!rows.length) { empty(pdf); return; }
    table(
      pdf,
      ["Date", "Purpose", "From", "To", "Miles", "Notes"],
      rows.map(function (r) {
        return [day(r.trip_date), r.purpose || "", r.start_place || "", r.end_place || "", String(Number(r.miles) || 0), r.notes || ""];
      }),
      [70, 100, 90, 90, 50, pdf.maxW - 400],
      4
    );
  }

  function apps(pdf, pack) {
    openMenu(pdf, "Apps", "Open Apps. Add each app, then its logins and issues. Re-upload the icon from App-Icons/.");
    var list = pack.tables.managed_apps || [];
    var logins = groupBy(pack.tables.app_logins, "app_id");
    var issues = groupBy(pack.tables.app_issues, "app_id");
    if (!list.length) { empty(pdf); return; }
    list.forEach(function (app, i) {
      pdf.recordHead(app.name || "Untitled app", i + 1, list.length);
      filled(pdf, [
        ["Name", app.name],
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
        ["Icon file", app.icon_path],
        ["Notes", app.notes]
      ]);
      var appLogins = logins[app.id] || [];
      appLogins.forEach(function (row) {
        pdf.heading("Login: " + (row.site_name || "untitled"), 12);
        filled(pdf, [
          ["Site", row.site_name],
          ["URL", row.url],
          ["Username", row.username],
          ["Password", row.password],
          ["Notes", row.notes]
        ]);
      });
      var appIssues = issues[app.id] || [];
      if (appIssues.length) {
        pdf.heading("Issues", 12);
        table(
          pdf,
          ["Title", "Status", "Priority", "Platform", "Details"],
          appIssues.map(function (issue) {
            return [issue.title || "Untitled", issue.status || "", issue.priority || "", issue.platform || "", issue.details || ""];
          }),
          [110, 70, 60, 60, pdf.maxW - 300],
          1
        );
      }
    });
  }

  function promos(pdf, pack) {
    openMenu(pdf, "Promos", "Open Promos. Add each offer.");
    var rows = pack.tables.app_promos || [];
    if (!rows.length) { empty(pdf); return; }
    rows.forEach(function (r, i) {
      pdf.recordHead(r.title || "Promo", i + 1, rows.length);
      filled(pdf, [
        ["App", r.app_name],
        ["Platform", r.platform],
        ["Kind", r.kind],
        ["Duration", r.duration],
        ["Eligibility", r.eligibility],
        ["Status", r.status],
        ["Start", day(r.start_date)],
        ["End", day(r.end_date)],
        ["Store ref", r.store_ref],
        ["Notes", r.notes]
      ]);
    });
  }

  function sop(pdf, pack) {
    openMenu(pdf, "SOP", "Open SOP. Add each guide and paste the steps, one per line.");
    var rows = pack.tables.sop_guides || [];
    if (!rows.length) { empty(pdf); return; }
    rows.forEach(function (g, i) {
      pdf.recordHead(g.title || "Untitled SOP", i + 1, rows.length);
      filled(pdf, [
        ["Category", g.category],
        ["Summary", g.summary],
        ["Link title", g.link_title],
        ["Link URL", g.link_url]
      ]);
      pdf.heading("Steps", 12);
      var steps = stepsOf(g);
      if (!steps.length) empty(pdf, "No steps.");
      else pdf.bullets(steps);
    });
  }

  function support(pdf, pack) {
    openMenu(pdf, "Support", "Open Support. Add each ticket.");
    var rows = pack.tables.support_tickets || [];
    if (!rows.length) { empty(pdf); return; }
    rows.forEach(function (t, i) {
      pdf.recordHead((t.ticket_number || "") + "  " + (t.title || "Untitled ticket"), i + 1, rows.length);
      filled(pdf, [
        ["Status", t.status],
        ["Priority", t.priority],
        ["Category", t.category],
        ["Platform", t.platform],
        ["App version", t.app_version],
        ["OS", t.os_version],
        ["Device", t.device],
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
    openMenu(pdf, "Emails", "Open Emails. Recreate each list, then add contacts, then templates.");
    var lists = pack.tables.email_lists || [];
    var contacts = groupBy(pack.tables.email_contacts, "list_id");
    var templates = pack.tables.email_templates || [];
    if (!lists.length && !templates.length) { empty(pdf); return; }
    lists.forEach(function (list, i) {
      pdf.recordHead(list.name || "Untitled list", i + 1, lists.length);
      filled(pdf, [["Imported from", list.source_file_name]]);
      var people = contacts[list.id] || [];
      if (!people.length) empty(pdf, "No contacts on this list.");
      else {
        table(
          pdf,
          ["Name", "Email", "Company", "Phone", "Sent", "Notes"],
          people.map(function (c) {
            return [c.name || "", c.email || "", c.company || "", c.phone || "", yesNo(c.is_sent), c.notes || ""];
          }),
          [90, 130, 90, 80, 40, pdf.maxW - 430],
          1
        );
      }
    });
    templates.forEach(function (tpl, i) {
      pdf.recordHead(tpl.title || "Untitled template", i + 1, templates.length);
      longText(pdf, tpl.body || "");
    });
  }

  function notifications(pdf, pack) {
    openMenu(pdf, "Notifications", "Open Notifications. These are already-sent messages. Re-upload photos from Notification-Images/ if you need the same card again.");
    var rows = pack.tables.app_notifications || [];
    if (!rows.length) { empty(pdf); return; }
    rows.forEach(function (n, i) {
      pdf.recordHead((n.app_name || "App") + ": " + (n.subject || "No subject"), i + 1, rows.length);
      filled(pdf, [
        ["Sent", day(n.created_at)],
        ["Font", n.message_font],
        ["Size", n.message_size],
        ["Color", n.message_color],
        ["Image", n.image_url],
        ["Message", n.message]
      ]);
      var blocks = blocksOf(n);
      if (blocks.length) {
        pdf.heading("Lines", 12);
        pdf.bullets(blocks.map(function (b) {
          if (typeof b === "string") return b;
          return (b && (b.text || b.body || b.line)) || "";
        }));
      }
    });
  }

  function clients(pdf, pack) {
    openMenu(pdf, "Clients", "Open Clients. Add each person or company.");
    var rows = pack.tables.studio_clients || [];
    if (!rows.length) { empty(pdf); return; }
    rows.forEach(function (c, i) {
      pdf.recordHead(c.company_name || c.name || "Untitled client", i + 1, rows.length);
      filled(pdf, [
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
    openMenu(pdf, "Leads", "Open Leads. Add each lead.");
    var rows = pack.tables.studio_leads || [];
    if (!rows.length) { empty(pdf); return; }
    rows.forEach(function (r, i) {
      pdf.recordHead(r.name || r.company_name || "Lead", i + 1, rows.length);
      filled(pdf, [
        ["Name", r.name],
        ["Company", r.company_name],
        ["Email", r.email],
        ["Phone", r.phone],
        ["Status", r.status],
        ["Source", r.source],
        ["Follow-up", day(r.follow_up)],
        ["Last touch", day(r.last_touch)],
        ["Notes", r.notes]
      ]);
    });
  }

  function projects(pdf, pack) {
    openMenu(pdf, "Projects", "Open Projects. Add each job, then fill Logins, Costs, Hours, Issues, Meetings, and Handoff.");
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
    list.forEach(function (p, i) {
      var linked = clientsMap[p.linked_client_id];
      var linkedLabel = linked ? (linked.company_name || linked.name) : p.linked_client_id;
      pdf.recordHead(p.name || "Untitled project", i + 1, list.length);
      filled(pdf, [
        ["Name", p.name],
        ["Company", p.company_name],
        ["Linked client", linkedLabel],
        ["Due", day(p.due_date)],
        ["Information", p.information],
        ["Discovery", p.discovery_json]
      ]);
      (logins[p.id] || []).forEach(function (row) {
        pdf.heading("Login: " + (row.site_name || "untitled"), 12);
        filled(pdf, [
          ["Site", row.site_name],
          ["URL", row.url],
          ["Username", row.username],
          ["Password", row.password],
          ["Notes", row.notes]
        ]);
      });
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
          pIssues.map(function (issue) { return [issue.title || "", issue.status || "", issue.priority || "", issue.details || ""]; }),
          [120, 70, 60, pdf.maxW - 250],
          1
        );
      }
      (meetings[p.link_id] || []).forEach(function (m) {
        pdf.heading("Meeting: " + day(m.meeting_date), 12);
        filled(pdf, [
          ["Topic", m.topic],
          ["Attendees", m.attendees],
          ["Notes", m.notes]
        ]);
      });
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
    openMenu(pdf, "Billing", "Open Billing. Recreate each quote or invoice, including line items.");
    var rows = pack.tables.billing_documents || [];
    if (!rows.length) { empty(pdf); return; }
    rows.forEach(function (doc, i) {
      var p = payloadOf(doc);
      pdf.recordHead((doc.kind || "doc").toUpperCase() + " " + (doc.number || ""), i + 1, rows.length);
      filled(pdf, [
        ["Kind", doc.kind],
        ["Number", doc.number],
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
        ["Amount paid", p.amountPaid == null ? "" : money(p.amountPaid)],
        ["PO", p.poNumber],
        ["Terms", p.terms],
        ["Tax %", p.taxPercent],
        ["Discount type", p.discountType],
        ["Discount value", p.discountValue],
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
    openMenu(pdf, "Notes", "Open Notes. Paste the notepad.");
    var row = (pack.tables.studio_notes || [])[0];
    if (!row || !String(row.body || "").trim()) empty(pdf, "Notepad is empty.");
    else longText(pdf, row.body);
  }

  function pricing(pdf, pack) {
    openMenu(pdf, "Pricing", "Open Pricing. Set deposit and quote days, then add each price.");
    var settings = (pack.tables.studio_pricing_settings || [])[0] || {};
    filled(pdf, [
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

  function settingsPage(pdf, pack) {
    openMenu(pdf, "Settings", "Open Settings. Type these defaults. Put API key files from Secrets/ on the Mac. Do not type those keys here.");
    var rows = pack.tables.studio_settings || [];
    var s = pack.secrets || {};
    var bill = (pack.tables.studio_pricing_settings || [])[0] || {};
    filled(pdf, [
      ["Signed in as", pack.email],
      ["Default page", setting(rows, "default_section", "")],
      ["Mileage rate", setting(rows, "mileage_rate", "")],
      ["Tax reserve %", setting(rows, "tax_reserve_percent", "")],
      ["Deposit %", bill.deposit_percent],
      ["Quote valid days", bill.valid_days],
      ["Apple vendor number", s.asc_vendor_number],
      ["Play report bucket", s.play_gcs_bucket]
    ]);
    pdf.heading("Keys on file (use the Secrets folder)", 12);
    filled(pdf, [
      ["Mercury token", s.mercury_token ? "In Secrets/mercury.token" : "Missing"],
      ["App Store Connect key", s.asc_private_key ? "In Secrets/asc_private_key.p8" : "Missing"],
      ["ASC issuer ID", s.asc_issuer_id ? "In Secrets/asc_issuer_id.txt" : "Missing"],
      ["ASC key ID", s.asc_key_id ? "In Secrets/asc_key_id.txt" : "Missing"],
      ["Play service account", s.play_service_account_json ? "In Secrets/play_service_account.json" : "Missing"],
      ["Permit Path announcements", s.permitpath_service_role_key ? "In Secrets/" : "Missing"],
      ["Pilot Car 4 Hire announcements", s.pilotcar4hire_service_role_key ? "In Secrets/" : "Missing"]
    ]);
  }

  function buildPdf(pdf, pack) {
    cover(pdf, pack);
    skipPage(pdf, "Overview", "Overview rebuilds itself from Income, Expenses, Mileage, and Renewals. Nothing to type.");
    skipPage(pdf, "Bank", "Bank loads from Mercury. Put mercury.token in Secrets/ and open Studio on this Mac.");
    business(pdf, pack);
    vault(pdf, pack);
    renewals(pdf, pack);
    calendar(pdf, pack);
    skipPage(pdf, "Taxes", "Taxes rebuilds from Expenses, Income, and Owner Draw. Type the tax reserve percent in Settings.");
    ledgerPage(
      pdf,
      "Expenses",
      "Open Expenses. Add each row, then attach the matching file from Receipts/Expenses/.",
      pack.tables.business_expenses || [],
      "expense",
      pack.tables.business_expense_skips || []
    );
    ledgerPage(
      pdf,
      "Income",
      "Open Income. Add each row, then attach the matching file from Receipts/Income/.",
      pack.tables.business_incomes || [],
      "income",
      pack.tables.business_income_skips || []
    );
    ledgerPage(
      pdf,
      "Owner Draw",
      "Open Owner Draw. Add each draw.",
      pack.tables.owner_draws || [],
      "draw",
      []
    );
    inventory(pdf, pack);
    mileage(pdf, pack);
    apps(pdf, pack);
    promos(pdf, pack);
    sop(pdf, pack);
    skipPage(pdf, "Analytics", "Analytics loads from App Store Connect and Google Play once the Secrets/ keys are in place.");
    skipPage(pdf, "Subscribed", "Subscribed loads from Apple and Google once vendor number, Play bucket, and Secrets/ keys are in place.");
    support(pdf, pack);
    emails(pdf, pack);
    notifications(pdf, pack);
    clients(pdf, pack);
    leads(pdf, pack);
    projects(pdf, pack);
    billing(pdf, pack);
    notes(pdf, pack);
    pricing(pdf, pack);
    settingsPage(pdf, pack);
  }

  function safeFile(name, fallback) {
    var base = String(name || fallback || "file")
      .replace(/[\/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
    return base || fallback || "file";
  }

  function uniqueName(used, name) {
    var n = name;
    var i = 2;
    while (used[n]) {
      var dot = name.lastIndexOf(".");
      if (dot > 0) n = name.slice(0, dot) + "-" + i + name.slice(dot);
      else n = name + "-" + i;
      i += 1;
    }
    used[n] = true;
    return n;
  }

  function storageBlob(db, bucket, path) {
    if (!db || !path) return Promise.resolve(null);
    return db.storage.from(bucket).download(path).then(function (res) {
      if (res.error || !res.data) return null;
      return res.data;
    }).catch(function () { return null; });
  }

  function urlBlob(url) {
    if (!url) return Promise.resolve(null);
    return fetch(url).then(function (r) {
      if (!r.ok) return null;
      return r.blob();
    }).catch(function () { return null; });
  }

  function addSecret(folder, filename, value) {
    if (value == null || value === "") return;
    folder.file(filename, String(value));
  }

  function collectFiles(db, pack, onStatus) {
    onStatus("Collecting receipts and documents…");
    var jobs = [];
    var files = [];

    function push(folder, name, blob) {
      if (!blob) return;
      files.push({ folder: folder, name: name, blob: blob });
    }

    var usedCo = {};
    (pack.tables.business_documents || []).forEach(function (doc) {
      if (!doc.storage_path) return;
      jobs.push(storageBlob(db, "business-docs", doc.storage_path).then(function (blob) {
        var ext = String(doc.file_name || doc.storage_path || "pdf").split(".").pop() || "pdf";
        var name = uniqueName(usedCo, safeFile(doc.name || doc.file_name || "Document") + "." + ext.replace(/^\./, ""));
        push("Company-Documents", name, blob);
      }));
    });

    function ledgerFiles(rows, folder) {
      var used = {};
      (rows || []).forEach(function (row) {
        proofsOf(row).forEach(function (proof) {
          jobs.push(storageBlob(db, "ledger-receipts", proof.path).then(function (blob) {
            var name = uniqueName(used, safeFile(proof.file_name || proof.path.split("/").pop() || "receipt"));
            push(folder, name, blob);
          }));
        });
      });
    }
    ledgerFiles(pack.tables.business_expenses, "Receipts/Expenses");
    ledgerFiles(pack.tables.business_incomes, "Receipts/Income");

    var usedIcons = {};
    (pack.tables.managed_apps || []).forEach(function (app) {
      if (!app.icon_path) return;
      jobs.push(storageBlob(db, "app-icons", app.icon_path).then(function (blob) {
        var ext = String(app.icon_path).split(".").pop() || "png";
        var name = uniqueName(usedIcons, safeFile(app.name || "app") + "." + ext);
        push("App-Icons", name, blob);
      }));
    });

    var usedNote = {};
    (pack.tables.app_notifications || []).forEach(function (n) {
      var url = n.image_url || "";
      if (!url) return;
      var job = /^https?:/i.test(url) ? urlBlob(url) : storageBlob(db, "announcement-images", url);
      jobs.push(job.then(function (blob) {
        var ext = String(url).split(".").pop() || "jpg";
        if (ext.length > 5) ext = "jpg";
        var name = uniqueName(usedNote, safeFile(n.subject || n.app_name || "notice") + "." + ext);
        push("Notification-Images", name, blob);
      }));
    });

    return Promise.all(jobs).then(function () { return files; });
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function readme(pack) {
    return [
      "STL Studio Backup Log - " + stamp(),
      "Signed in as: " + (pack.email || ""),
      "",
      "KEEP THIS ZIP PRIVATE. It has passwords and API keys.",
      "",
      "How to restore",
      "1. Sign in to Studio.",
      "2. Copy files from Secrets/ into stl-studio/secrets/ on this Mac.",
      "3. Open Studio signed in so the keys sync.",
      "4. Type every record from 01-Restore-Guide.pdf, menu by menu.",
      "5. Re-upload Company-Documents, Receipts, App-Icons, and Notification-Images."
    ].join("\n");
  }

  function download(db, opts) {
    opts = opts || {};
    var onStatus = opts.onStatus || function () {};
    if (!window.STLStudioPdf) return Promise.reject(new Error("PDF library missing."));
    if (!window.JSZip) return Promise.reject(new Error("Zip library missing. Refresh the page."));
    if (!db) return Promise.reject(new Error("Sign in first."));
    return loadAll(db, onStatus).then(function (pack) {
      onStatus("Writing restore guide…");
      return window.STLStudioPdf.open({
        db: db,
        word: "RESTORE GUIDE",
        yearLabel: window.STLStudioPdf.prepared()
      }).then(function (pdf) {
        buildPdf(pdf, pack);
        return collectFiles(db, pack, onStatus).then(function (files) {
          onStatus("Zipping backup…");
          var zip = new window.JSZip();
          var root = zip.folder("STL-Apps-LLC_Backup-Log_" + stamp());
          root.file("00-READ-ME.txt", readme(pack));
          root.file("01-Restore-Guide.pdf", pdf.blob());
          var secrets = root.folder("Secrets");
          var s = pack.secrets || {};
          addSecret(secrets, "mercury.token", s.mercury_token);
          addSecret(secrets, "asc_issuer_id.txt", s.asc_issuer_id);
          addSecret(secrets, "asc_key_id.txt", s.asc_key_id);
          addSecret(secrets, "asc_private_key.p8", s.asc_private_key);
          addSecret(secrets, "asc_vendor_number.txt", s.asc_vendor_number);
          addSecret(secrets, "play_gcs_bucket.txt", s.play_gcs_bucket);
          addSecret(secrets, "play_service_account.json", s.play_service_account_json);
          addSecret(secrets, "permitpath_supabase_url.txt", s.permitpath_supabase_url);
          addSecret(secrets, "permitpath_service_role_key.txt", s.permitpath_service_role_key);
          addSecret(secrets, "pilotcar4hire_supabase_url.txt", s.pilotcar4hire_supabase_url);
          addSecret(secrets, "pilotcar4hire_service_role_key.txt", s.pilotcar4hire_service_role_key);
          secrets.file(
            "README.txt",
            "Copy these files into stl-studio/secrets/ on your Mac, then open Studio signed in."
          );
          files.forEach(function (file) {
            root.folder(file.folder).file(file.name, file.blob);
          });
          return zip.generateAsync({ type: "blob" });
        });
      }).then(function (blob) {
        downloadBlob(blob, "STL-Apps-LLC_Backup-Log_" + stamp() + ".zip");
      });
    });
  }

  window.STLBackupLog = {
    download: download,
    build: buildPdf
  };
})();

(function () {
  "use strict";

  var TABLES = [
    "business_profile", "business_documents", "vault_logins", "renewal_items",
    "calendar_day_notes", "studio_settings", "business_expenses", "business_expense_skips",
    "business_incomes", "business_income_skips", "owner_draws", "inventory_items",
    "mileage_trips", "managed_apps", "app_logins", "app_issues", "app_promos",
    "sop_guides", "support_tickets", "studio_inbox", "email_lists", "email_contacts", "email_templates", "email_page_notes",
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

  function tableError(pack, name) {
    var hit = (pack.failed || []).filter(function (f) { return f.table === name; })[0];
    return hit ? hit.error : "";
  }

  function noRows(pdf, pack, tableName, msg) {
    var err = tableError(pack, tableName);
    if (err) pdf.note("Could not read " + tableName + ". " + err);
    else empty(pdf, msg);
  }

  function clock(iso) {
    if (!iso) return "";
    return String(iso).replace("T", " ").slice(0, 16);
  }

  function inboxFilesOf(row) {
    var files = payloadOf(row).files;
    if (!Array.isArray(files)) return [];
    return files.filter(function (file) { return file && file.path; });
  }

  function quoteDraft(row) {
    var payload = payloadOf(row);
    if (payload.billing && typeof payload.billing === "object") return payload.billing;
    if (Array.isArray(payload.items)) return payload;
    return null;
  }

  function appName(pack, id) {
    if (!id) return "";
    var hit = (pack.tables.managed_apps || []).filter(function (app) { return app.id === id; })[0];
    return hit ? (hit.name || "") : "";
  }

  function rememberMiss(pack, label) {
    pack.missingFiles = pack.missingFiles || [];
    pack.missingFiles.push(label);
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
        if (res.error) throw new Error(res.error.message || ("Could not read " + tableName));
        var rows = res.data || [];
        all = all.concat(rows);
        if (rows.length < page) return all;
        return next(from + page);
      });
    }
    return next(0).then(function (rows) {
      return { rows: rows, error: "" };
    }).catch(function (err) {
      return { rows: [], error: (err && err.message) || ("Could not read " + tableName) };
    });
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
    return db.from("studio_secrets").select("*").limit(1).maybeSingle().then(function (res) {
      return (res && res.data) || {};
    }).catch(function () { return {}; });
  }

  function loadAll(db, onStatus) {
    onStatus("Loading every Studio menu…");
    var tables = {};
    var failed = [];
    return Promise.all(TABLES.map(function (name) {
      return fetchTable(db, name).then(function (result) {
        tables[name] = (result && result.rows) || [];
        if (result && result.error) failed.push({ table: name, error: result.error });
      });
    })).then(function () {
      return Promise.all([loadSecretsRow(db), loadUserEmail(db)]);
    }).then(function (extra) {
      return {
        tables: tables,
        secrets: extra[0] || {},
        email: extra[1] || "",
        failed: failed,
        missingFiles: []
      };
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
      "Re-upload files from Company-Documents/, Receipts/, App-Icons/, Notification-Images/, and Message-Files/ onto the matching records.",
      "02-Studio-Data.json is every saved row, including Notes formatting and any field this booklet shortens.",
      "Bank, Analytics, Subscribed, TOS Accepted, Permit Path Admin, and PC4H Admin load again once the keys in Secrets/ are in place. Those live records stay in their own databases."
    ]);
    pdf.heading("What is in this zip", 13);
    table(
      pdf,
      ["Folder / file", "Put it back here"],
      [
        ["01-Restore-Guide.pdf", "This booklet. Type from it."],
        ["02-Studio-Data.json", "Full copy of every Studio row"],
        ["Secrets/", "stl-studio/secrets/ on this Mac"],
        ["Company-Documents/", "Business Info documents"],
        ["Receipts/Expenses/", "Expense proofs"],
        ["Receipts/Income/", "Income proofs"],
        ["App-Icons/", "App icons"],
        ["Notification-Images/", "Notification photos"],
        ["Message-Files/", "Message attachments"]
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
        ["Apps", String((t.managed_apps || []).length) + " · " + String((t.app_promos || []).length) + " promos"],
        ["SOP", String((t.sop_guides || []).length)],
        ["Support", String((t.support_tickets || []).length)],
        ["Messages", String((t.studio_inbox || []).length)],
        ["Email Lists", String((t.email_contacts || []).length) + " emails"],
        ["Leads", String((t.studio_leads || []).length) + " (old menu)"],
        ["App Notices", String((t.app_notifications || []).length)],
        ["Clients", String((t.studio_clients || []).length)],
        ["Projects", String((t.client_projects || []).length)],
        ["Billing", String((t.billing_documents || []).length)],
        ["Notes", (t.studio_notes || []).length ? "notepad" : "empty"],
        ["Pricing", String((t.studio_pricing_items || []).length)],
        ["Settings", "defaults + store IDs"]
      ],
      [180, pdf.maxW - 180],
      1
    );
    if ((pack.failed || []).length) {
      pdf.heading("Menus that did not load", 13);
      pdf.note("These tables failed, so their pages are incomplete.");
      pdf.bullets((pack.failed || []).map(function (f) { return f.table + ": " + f.error; }));
    }
  }

  function skipPage(pdf, title, why) {
    openMenu(pdf, title, why);
  }

  function business(pdf, pack) {
    openMenu(pdf, "Business Info", "Open Business Info. Type the company fields, then upload each file from Company-Documents/.");
    var profile = (pack.tables.business_profile || [])[0];
    if (!profile) noRows(pdf, pack, "business_profile");
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
    if (!rows.length) { noRows(pdf, pack, "vault_logins"); return; }
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
    if (!rows.length) { noRows(pdf, pack, "renewal_items"); return; }
    table(
      pdf,
      ["Title", "Category", "Due", "Remind days", "Amount", "Notes"],
      rows.map(function (r) {
        var note = [r.notes || "", r.logged_expense_id ? "Logged as an expense" : ""].filter(Boolean).join(" · ");
        return [r.title || "Untitled", r.category || "", day(r.due_date), String(r.remind_days_before == null ? "" : r.remind_days_before), money(r.amount), note];
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
    if (!rows.length) { noRows(pdf, pack, "calendar_day_notes", "No day notes."); return; }
    rows.forEach(function (row, i) {
      pdf.recordHead(day(row.day), i + 1, rows.length);
      longText(pdf, row.body || "");
    });
  }

  function ledgerPage(pdf, title, how, rows, kind, skips, pack, tableName) {
    openMenu(pdf, title, how);
    if (!rows.length) { noRows(pdf, pack, tableName); return; }
    table(
      pdf,
      ["Date", "Title", "Year", "Type", "Amount", "Proof / notes"],
      rows.map(function (r) {
        var proofs = proofsOf(r).map(function (p) { return p.file_name || p.path; }).join(", ");
        var extra = [
          r.notes,
          proofs,
          r.source_invoice_number,
          r.source_payment_key ? ("Payment " + r.source_payment_key) : "",
          r.mercury_transaction_id ? ("Mercury " + r.mercury_transaction_id) : ""
        ].filter(Boolean).join(" · ");
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
    if (!rows.length) { noRows(pdf, pack, "inventory_items"); return; }
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
    if (!rows.length) { noRows(pdf, pack, "mileage_trips"); return; }
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
    if (!list.length) { noRows(pdf, pack, "managed_apps"); return; }
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
    openMenu(pdf, "Promos", "Open Apps, then Promos. Add each offer.");
    var rows = pack.tables.app_promos || [];
    if (!rows.length) { noRows(pdf, pack, "app_promos"); return; }
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
    if (!rows.length) { noRows(pdf, pack, "sop_guides"); return; }
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
    if (!rows.length) { noRows(pdf, pack, "support_tickets"); return; }
    rows.forEach(function (t, i) {
      pdf.recordHead((t.ticket_number || "") + "  " + (t.title || "Untitled ticket"), i + 1, rows.length);
      filled(pdf, [
        ["App", appName(pack, t.app_id)],
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
        ["Resolved", day(t.resolved_at)],
        ["Internal notes", t.internal_notes]
      ]);
    });
  }

  function inbox(pdf, pack) {
    openMenu(pdf, "Messages", "Open Messages. Type each message, then re-upload files from Message-Files/.");
    var rows = pack.tables.studio_inbox || [];
    if (!rows.length) { noRows(pdf, pack, "studio_inbox"); return; }
    rows.forEach(function (row, i) {
      var payload = payloadOf(row);
      var draft = quoteDraft(row);
      var files = inboxFilesOf(row);
      pdf.recordHead((row.name || row.email || "Message") + "  " + (row.source || ""), i + 1, rows.length);
      filled(pdf, [
        ["Status", row.status],
        ["Source", row.source],
        ["Site", row.site],
        ["Name", row.name],
        ["Email", row.email],
        ["Phone", payload.phone || payload.clientPhone || (draft && draft.clientPhone) || ""],
        ["Company", payload.company || ""],
        ["Best contact", payload.contactMethod || (draft && draft.contactMethod) || ""],
        ["Message", row.message],
        ["Staff notes", row.notes],
        ["Received", day(row.created_at)],
        ["Sent to billing", row.billing_id ? "Yes" : ""],
        ["Quote number", (draft && draft.number) || ""],
        ["Quote total", draft && draft.total != null ? money(draft.total) : (payload.total != null ? money(payload.total) : "")],
        ["Project", (draft && draft.projectName) || ""],
        ["Files in zip", files.map(function (file) { return file.name || file.path; }).join(", ")]
      ]);
      var items = draft && Array.isArray(draft.items) ? draft.items : [];
      if (items.length) {
        pdf.heading("Quote lines", 12);
        table(
          pdf,
          ["Description", "Qty", "Rate"],
          items.map(function (item) {
            var qty = Number(item.qty) || 1;
            var rate = Number(item.rate != null ? item.rate : item.amount) || 0;
            return [item.desc || item.label || "", String(qty), money(rate)];
          }),
          [pdf.maxW - 140, 50, 90],
          1
        );
      }
    });
  }

  function contactLine(c) {
    var email = c.email || "";
    var name = c.name || "";
    var company = c.company || "";
    var phone = c.phone || "";
    var notes = c.notes || "";
    if (!email && !name && !company && !phone && !notes && Array.isArray(c.cells)) {
      var cells = c.cells.map(function (cell) { return cell == null ? "" : String(cell); });
      return [cells[0] || "", cells[1] || "", cells[2] || "", cells[3] || "", cells.slice(4).filter(Boolean).join(" ")];
    }
    return [email, name, company, phone, notes];
  }

  function emails(pdf, pack) {
    openMenu(pdf, "Email Lists", "Open Email Lists. Recreate each list, then add every person. Paste the page notes into the Notes button at the top. Mail subject and notes are the message that opens when you click Mail.");
    if (tableError(pack, "email_lists") || tableError(pack, "email_contacts") || tableError(pack, "email_page_notes")) {
      pdf.note("Could not read every email table. See the cover for which one failed.");
    }
    var lists = pack.tables.email_lists || [];
    var contacts = groupBy(pack.tables.email_contacts, "list_id");
    var pageNote = notePlain(((pack.tables.email_page_notes || [])[0] || {}).body || "");
    if (String(pageNote).trim()) {
      pdf.heading("Page notes", 12);
      longText(pdf, pageNote);
    }
    var templates = pack.tables.email_templates || [];
    if (!lists.length && !templates.length && !String(pageNote).trim()) {
      noRows(pdf, pack, "email_lists");
      return;
    }
    lists.forEach(function (list, i) {
      pdf.recordHead(list.name || "Untitled list", i + 1, lists.length);
      filled(pdf, [
        ["Mail subject", list.subject],
        ["Mail notes", list.notes]
      ]);
      var people = (contacts[list.id] || []).slice().sort(function (a, b) {
        return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
      });
      if (!people.length) empty(pdf, "No emails on this list.");
      else {
        table(
          pdf,
          ["Email", "Name", "Company", "Phone", "Notes"],
          people.map(contactLine),
          [150, 90, 90, 80, pdf.maxW - 410],
          1
        );
      }
    });
    if (templates.length) {
      pdf.heading("Saved templates", 12);
      templates.forEach(function (tpl, i) {
        pdf.recordHead(tpl.title || "Template", i + 1, templates.length);
        longText(pdf, tpl.body || "");
      });
    }
  }

  function notifications(pdf, pack) {
    openMenu(pdf, "App Notices", "Open App Notices. These are already-sent cards. Re-upload photos from Notification-Images/ if you need the same card again.");
    var rows = pack.tables.app_notifications || [];
    if (!rows.length) { noRows(pdf, pack, "app_notifications"); return; }
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
          var text = (b && (b.text || b.body || b.line)) || "";
          var style = [b && b.font, b && b.size, b && b.color].filter(Boolean).join(", ");
          return style ? (text + "  [" + style + "]") : text;
        }));
      }
    });
  }

  function clients(pdf, pack) {
    openMenu(pdf, "Clients", "Open Clients. Add each person or company.");
    var rows = pack.tables.studio_clients || [];
    if (!rows.length) { noRows(pdf, pack, "studio_clients"); return; }
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
    openMenu(pdf, "Leads", "Leads is no longer its own menu. Recreate any row that is not already a Client.");
    var rows = pack.tables.studio_leads || [];
    if (!rows.length) { noRows(pdf, pack, "studio_leads", "No old leads."); return; }
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
    if (!list.length && !(pack.tables.meeting_logs || []).length) {
      noRows(pdf, pack, "client_projects");
      return;
    }
    if (!list.length) noRows(pdf, pack, "client_projects", "No projects.");
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
        ["Timer running since", p.timer_started_at ? clock(p.timer_started_at) : ""],
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
          ["Date", "Hours", "Billed", "Started", "Ended", "Notes"],
          pHours.map(function (h) {
            return [day(h.date), String(h.hours || 0), yesNo(h.is_billed), clock(h.started_at), clock(h.ended_at), h.notes || ""];
          }),
          [68, 44, 44, 78, 78, pdf.maxW - 312],
          1
        );
      }
      var pIssues = issues[p.id] || [];
      if (pIssues.length) {
        pdf.heading("Issues", 12);
        table(
          pdf,
          ["Title", "Status", "Priority", "Platform", "Details"],
          pIssues.map(function (issue) {
            return [issue.title || "", issue.status || "", issue.priority || "", issue.platform || "", issue.details || ""];
          }),
          [110, 58, 58, 58, pdf.maxW - 284],
          1
        );
      }
      projectMeetings(p, meetings).forEach(function (m) {
        pdf.heading("Meeting: " + day(m.meeting_date), 12);
        filled(pdf, [
          ["Topic", m.topic],
          ["Attendees", m.attendees],
          ["Notes", m.notes]
        ]);
      });
      var pHand = (handoff[p.id] || []).slice().sort(function (a, b) {
        return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
      });
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
      var bills = projectBills(p, pack.tables.billing_documents || []);
      if (bills.length) {
        pdf.heading("Billing on this job", 12);
        table(
          pdf,
          ["Kind", "Number", "Status", "Amount"],
          bills.map(function (doc) { return [doc.kind || "", doc.number || "", doc.status || "", money(doc.amount)]; }),
          [70, 120, 70, pdf.maxW - 260],
          3
        );
      }
    });
    var seenMeetings = {};
    list.forEach(function (p) {
      projectMeetings(p, meetings).forEach(function (m) { if (m.id) seenMeetings[m.id] = true; });
    });
    var loose = (pack.tables.meeting_logs || []).filter(function (m) { return !m.id || !seenMeetings[m.id]; });
    if (loose.length) {
      pdf.heading("Meetings not tied to a project", 12);
      loose.forEach(function (m) {
        pdf.heading("Meeting: " + day(m.meeting_date), 12);
        filled(pdf, [
          ["Topic", m.topic],
          ["Attendees", m.attendees],
          ["Notes", m.notes]
        ]);
      });
    }
  }

  function projectMeetings(project, meetings) {
    var rows = (meetings[project.link_id] || []).concat(meetings[project.id] || []);
    var seen = {};
    return rows.filter(function (row) {
      var id = row && (row.id || (day(row.meeting_date) + "|" + (row.topic || "")));
      if (seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  function projectBills(project, docs) {
    return (docs || []).filter(function (doc) {
      var payload = payloadOf(doc);
      if (payload.linkedProjectID && (payload.linkedProjectID === project.link_id || payload.linkedProjectID === project.id)) return true;
      return false;
    });
  }

  function billing(pdf, pack) {
    openMenu(pdf, "Billing", "Open Billing. Recreate each quote or invoice, including line items.");
    var rows = pack.tables.billing_documents || [];
    if (!rows.length) { noRows(pdf, pack, "billing_documents"); return; }
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
        ["Quote valid for", p.validDays],
        ["Valid until", day(p.validUntil)],
        ["Hourly rate", p.hourlyRate == null || p.hourlyRate === "" ? "" : money(p.hourlyRate)],
        ["From", [p.fromName, p.fromContact, p.fromEmail, p.fromPhone, p.fromWebsite, p.fromTaxId].filter(Boolean).join(" · ")],
        ["From address", p.fromAddress],
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

  function notePlain(html) {
    var s = String(html == null ? "" : html);
    if (!/<[a-z][\s\S]*>/i.test(s)) return s;
    return s
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');
  }

  function notes(pdf, pack) {
    openMenu(pdf, "Notes", "Open Notes. Paste the notepad. Bold, color, and size are kept in 02-Studio-Data.json under studio_notes.");
    var row = (pack.tables.studio_notes || [])[0];
    if (!row && tableError(pack, "studio_notes")) {
      noRows(pdf, pack, "studio_notes");
      return;
    }
    var body = row ? notePlain(row.body) : "";
    if (!String(body || "").trim()) empty(pdf, "Notepad is empty.");
    else longText(pdf, body);
  }

  function pricing(pdf, pack) {
    openMenu(pdf, "Pricing", "Open Billing, then Pricing. Set deposit and quote days, then add each price.");
    var settings = (pack.tables.studio_pricing_settings || [])[0] || {};
    filled(pdf, [
      ["Deposit %", settings.deposit_percent],
      ["Quote valid days", settings.valid_days]
    ]);
    var items = (pack.tables.studio_pricing_items || []).slice().sort(function (a, b) {
      return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
    });
    if (!items.length) {
      if (tableError(pack, "studio_pricing_items")) noRows(pdf, pack, "studio_pricing_items");
      else empty(pdf, "No price book items.");
    } else {
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
    var known = { default_section: true, mileage_rate: true, tax_reserve_percent: true };
    var extra = rows.filter(function (r) { return r && r.key && !known[r.key]; });
    if (extra.length) {
      pdf.heading("Other saved settings", 12);
      filled(pdf, extra.map(function (r) { return [r.key, r.value]; }));
    }
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
      pack.tables.business_expense_skips || [],
      pack,
      "business_expenses"
    );
    ledgerPage(
      pdf,
      "Income",
      "Open Income. Add each row, then attach the matching file from Receipts/Income/.",
      pack.tables.business_incomes || [],
      "income",
      pack.tables.business_income_skips || [],
      pack,
      "business_incomes"
    );
    ledgerPage(
      pdf,
      "Owner Draw",
      "Open Owner Draw. Add each draw.",
      pack.tables.owner_draws || [],
      "draw",
      [],
      pack,
      "owner_draws"
    );
    inventory(pdf, pack);
    mileage(pdf, pack);
    apps(pdf, pack);
    promos(pdf, pack);
    sop(pdf, pack);
    skipPage(pdf, "Analytics", "Open Apps, then Analytics. Loads from App Store Connect and Google Play once the Secrets/ keys are in place. Subscribed is a tab on that same screen.");
    skipPage(pdf, "TOS Accepted", "Open Apps, then TOS Accepted. Acceptances stay in the Permit Path database. Restore the Permit Path keys in Secrets/ and the list loads again.");
    support(pdf, pack);
    inbox(pdf, pack);
    emails(pdf, pack);
    notifications(pdf, pack);
    skipPage(pdf, "Permit Path Admin", "Users, subscriptions, and deletions stay in the Permit Path database. This zip keeps the keys that reconnect that screen. It does not copy those accounts.");
    skipPage(pdf, "PC4H Admin", "Pilots, listings, and handoffs stay in the Pilot Car 4 Hire database. This zip keeps the keys that reconnect that screen. It does not copy those accounts.");
    clients(pdf, pack);
    if ((pack.tables.studio_leads || []).length || tableError(pack, "studio_leads")) leads(pdf, pack);
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
    var text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (!String(text).trim()) return;
    folder.file(filename, text);
  }

  var SECRET_FILES = {
    mercury_token: "mercury.token",
    asc_issuer_id: "asc_issuer_id.txt",
    asc_key_id: "asc_key_id.txt",
    asc_private_key: "asc_private_key.p8",
    asc_vendor_number: "asc_vendor_number.txt",
    play_gcs_bucket: "play_gcs_bucket.txt",
    play_service_account_json: "play_service_account.json",
    permitpath_supabase_url: "permitpath_supabase_url.txt",
    permitpath_service_role_key: "permitpath_service_role_key.txt",
    pilotcar4hire_supabase_url: "pilotcar4hire_supabase_url.txt",
    pilotcar4hire_service_role_key: "pilotcar4hire_service_role_key.txt"
  };

  function writeSecrets(folder, secrets) {
    var row = secrets || {};
    Object.keys(row).forEach(function (key) {
      if (key === "user_id" || key === "updated_at" || key === "id") return;
      addSecret(folder, SECRET_FILES[key] || ("extra_" + key + ".txt"), row[key]);
    });
  }

  function announcementBlob(db, url) {
    if (!url) return Promise.resolve(null);
    if (!/^https?:/i.test(url)) return storageBlob(db, "announcement-images", url);
    return urlBlob(url).then(function (blob) {
      if (blob) return blob;
      var match = String(url).match(/announcement-images\/([^?]+)/);
      if (!match) return null;
      try {
        return storageBlob(db, "announcement-images", decodeURIComponent(match[1]));
      } catch (err) {
        return storageBlob(db, "announcement-images", match[1]);
      }
    });
  }

  function collectFiles(db, pack, onStatus) {
    onStatus("Collecting receipts and documents…");
    var jobs = [];
    var files = [];

    function push(folder, name, blob, label) {
      if (!blob) {
        rememberMiss(pack, label || (folder + "/" + name));
        return;
      }
      files.push({ folder: folder, name: name, blob: blob });
    }

    var usedCo = {};
    (pack.tables.business_documents || []).forEach(function (doc) {
      if (!doc.storage_path) return;
      jobs.push(storageBlob(db, "business-docs", doc.storage_path).then(function (blob) {
        var ext = String(doc.file_name || doc.storage_path || "pdf").split(".").pop() || "pdf";
        var name = uniqueName(usedCo, safeFile(doc.name || doc.file_name || "Document") + "." + ext.replace(/^\./, ""));
        push("Company-Documents", name, blob, "Company document: " + (doc.name || doc.file_name || doc.storage_path));
      }));
    });

    function ledgerFiles(rows, folder) {
      var used = {};
      (rows || []).forEach(function (row) {
        proofsOf(row).forEach(function (proof) {
          jobs.push(storageBlob(db, "ledger-receipts", proof.path).then(function (blob) {
            var name = uniqueName(used, safeFile(proof.file_name || proof.path.split("/").pop() || "receipt"));
            push(folder, name, blob, folder + ": " + (proof.file_name || proof.path));
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
        push("App-Icons", name, blob, "App icon: " + (app.name || app.icon_path));
      }));
    });

    var usedNote = {};
    (pack.tables.app_notifications || []).forEach(function (n) {
      var url = n.image_url || "";
      if (!url) return;
      jobs.push(announcementBlob(db, url).then(function (blob) {
        var ext = String(url).split(".").pop() || "jpg";
        if (ext.length > 5 || ext.indexOf("/") !== -1) ext = "jpg";
        var name = uniqueName(usedNote, safeFile(n.subject || n.app_name || "notice") + "." + ext);
        push("Notification-Images", name, blob, "Notification image: " + (n.subject || n.app_name || url));
      }));
    });

    var usedInbox = {};
    (pack.tables.studio_inbox || []).forEach(function (row) {
      inboxFilesOf(row).forEach(function (file) {
        jobs.push(storageBlob(db, "inbox-uploads", file.path).then(function (blob) {
          var name = uniqueName(usedInbox, safeFile(file.name || file.path.split("/").pop() || "attachment"));
          push("Message-Files", name, blob, "Message file: " + (file.name || file.path));
        }));
      });
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
      "5. 02-Studio-Data.json has every saved row, including Notes formatting.",
      "6. Re-upload Company-Documents, Receipts, App-Icons, Notification-Images, and Message-Files.",
      "",
      "Not copied (they stay in their own databases, and the keys are in Secrets/):",
      "- Bank activity (Mercury)",
      "- Analytics and Subscribed (App Store Connect and Google Play)",
      "- TOS Accepted, Permit Path Admin, and PC4H Admin",
      "",
      "Menus that did not load:",
      (pack.failed || []).length
        ? (pack.failed || []).map(function (f) { return "- " + f.table + ": " + f.error; }).join("\n")
        : "- None",
      "",
      "Files that could not be downloaded:",
      (pack.missingFiles || []).length
        ? (pack.missingFiles || []).map(function (name) { return "- " + name; }).join("\n")
        : "- None"
    ].join("\n");
  }

  function dataSnapshot(pack) {
    return JSON.stringify({
      exported_at: new Date().toISOString(),
      signed_in_as: pack.email || "",
      failed_tables: pack.failed || [],
      missing_files: pack.missingFiles || [],
      tables: pack.tables || {}
    }, null, 2);
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
          root.file("02-Studio-Data.json", dataSnapshot(pack));
          var secrets = root.folder("Secrets");
          writeSecrets(secrets, pack.secrets);
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

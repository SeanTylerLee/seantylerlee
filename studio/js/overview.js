(function () {
  "use strict";

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  var root = null;
  var db = null;
  var selectedYear = new Date().getFullYear();
  var selectedMonth = new Date().getMonth() + 1;
  var incomes = [];
  var expenses = [];
  var draws = [];
  var renewals = [];
  var documents = [];
  var projects = [];
  var hours = [];
  var issues = [];
  var apps = [];
  var appIssues = [];
  var companyDocs = [];
  var exporting = false;

  function M() { return window.STLMoney; }

  function el(name) {
    return root ? root.querySelector('[data-el="' + name + '"]') : null;
  }

  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }

  function go(section) {
    if (window.STLApp && window.STLApp.navigate) window.STLApp.navigate(section);
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function parseISO(iso) {
    if (!iso) return null;
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return null;
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function yearIncome() {
    return M().round2(incomes.filter(function (r) { return Number(r.year) === selectedYear; })
      .reduce(function (s, r) { return s + M().yearTotal(r); }, 0));
  }

  function yearExpense() {
    return M().round2(expenses.filter(function (r) { return Number(r.year) === selectedYear; })
      .reduce(function (s, r) { return s + M().yearTotal(r); }, 0));
  }

  function yearProfit() {
    return M().round2(yearIncome() - yearExpense());
  }

  function yearDraws() {
    return M().round2(draws.filter(function (r) { return Number(r.year) === selectedYear; })
      .reduce(function (s, r) { return s + Number(r.amount || 0); }, 0));
  }

  function daysUntil(iso) {
    var due = parseISO(iso);
    if (!due) return 0;
    var start = new Date();
    start = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    return Math.round((due - start) / 86400000);
  }

  function attentionRenewals() {
    return renewals.filter(function (item) {
      var days = daysUntil(item.due_date);
      var remind = Math.max(0, Number(item.remind_days_before) || 0);
      return days < 0 || (days >= 0 && days <= remind);
    }).sort(function (a, b) { return daysUntil(a.due_date) - daysUntil(b.due_date); });
  }

  function invoiceTotals(doc) {
    var payload = (doc && doc.payload) || {};
    var paid = payload.amountPaid;
    if (paid == null && doc && doc.status === "paid") paid = Number(doc.amount) || 0;
    if (!window.STLBillingDoc) {
      var amount = Number(doc.amount) || 0;
      var remaining = Math.max(0, amount - (Number(paid) || 0));
      return { total: amount, amountPaid: Number(paid) || 0, balance: remaining };
    }
    return window.STLBillingDoc.compute(Object.assign({}, payload, {
      kind: "invoice",
      amountPaid: paid || 0,
      items: payload.items && payload.items.length ? payload.items : [{ desc: "", qty: 1, rate: Number(doc.amount) || 0 }]
    }));
  }

  function followUpDocuments() {
    var today = todayISO();
    return documents.filter(function (doc) {
      if (doc.kind !== "invoice") return false;
      return invoiceTotals(doc).balance > 0;
    }).sort(function (a, b) {
      var aOver = a.due_on && a.due_on <= today;
      var bOver = b.due_on && b.due_on <= today;
      if (aOver !== bOver) return aOver ? -1 : 1;
      return String(a.due_on || "") < String(b.due_on || "") ? -1 : 1;
    });
  }

  function unbilledProjects() {
    var byProject = {};
    hours.forEach(function (h) {
      if (h.is_billed) return;
      byProject[h.project_id] = (byProject[h.project_id] || 0) + Number(h.hours || 0);
    });
    return projects
      .map(function (p) {
        return { project: p, hours: M().round2(byProject[p.id] || 0) };
      })
      .filter(function (row) { return row.hours > 0; })
      .sort(function (a, b) { return b.hours - a.hours; });
  }

  function overdueProjects() {
    var today = todayISO();
    return projects.filter(function (p) {
      return p.due_date && p.due_date < today;
    });
  }

  function openProjectIssues() {
    return issues.filter(function (i) {
      return i.status === "open" || i.status === "inProgress";
    });
  }

  function needsYouCount() {
    return followUpDocuments().length
      + unbilledProjects().length
      + overdueProjects().length
      + attentionRenewals().length
      + openProjectIssues().length;
  }

  function shell() {
    return (
      '<div class="overview-workspace">' +
        '<p class="status ov-banner" data-el="banner"></p>' +
        '<div data-el="body"></div>' +
      "</div>"
    );
  }

  function row(title, detail, tint, goTo, secondaryTitle, secondaryAction) {
    return (
      '<div class="ov-row" data-go="' + (goTo || "") + '">' +
        '<span class="dot" style="background:' + tint + '"></span>' +
        '<div><strong>' + M().esc(title) + '</strong><span class="detail">' + M().esc(detail) + "</span></div>" +
        (secondaryTitle
          ? '<div class="actions"><button class="btn btn-ghost" type="button" data-secondary="' + M().esc(secondaryAction || "") + '">' + M().esc(secondaryTitle) + "</button></div>"
          : "") +
      "</div>"
    );
  }

  function render() {
    var profit = yearProfit();
    var count = needsYouCount();
    var html = "";

    html +=
      '<div class="ov-card">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          "<h2>" + selectedYear + " profit</h2>" +
          '<div class="ov-year-nav" style="margin-left:auto">' +
            '<button type="button" data-el="year-prev">‹</button>' +
            '<button type="button" data-el="year-next"' + (selectedYear >= M().currentYear() ? " disabled" : "") + ">›</button>" +
          "</div>" +
        "</div>" +
        '<div class="ov-profit ' + (profit >= 0 ? "ok" : "bad") + '">' + M().money(profit) + "</div>" +
        '<div class="ov-chips">' +
          '<button type="button" class="ov-chip ok" data-go="income"><span class="k">Income</span><span class="v">' + M().money(yearIncome()) + "</span></button>" +
          '<button type="button" class="ov-chip warn" data-go="expenses"><span class="k">Expenses</span><span class="v">' + M().money(yearExpense()) + "</span></button>" +
          '<button type="button" class="ov-chip draw" data-go="ownerDraws"><span class="k">Owner draws</span><span class="v">' + M().money(yearDraws()) + "</span></button>" +
        "</div>" +
        '<p class="ov-note">Draws are not expenses. Profit is still income minus expenses.</p>' +
        '<div class="ov-toolbar">' +
          '<span class="ov-note" style="margin:0">Month report</span>' +
          '<select data-el="month">' +
            MONTHS.map(function (name, i) {
              return '<option value="' + (i + 1) + '"' + (selectedMonth === i + 1 ? " selected" : "") + ">" + name + "</option>";
            }).join("") +
          "</select>" +
          '<button class="btn btn-ghost" type="button" data-el="export-month"' + (exporting ? " disabled" : "") + ">Export " + MONTHS[selectedMonth - 1] + " report</button>" +
          '<button class="btn btn-primary" type="button" data-el="export-tax"' + (exporting ? " disabled" : "") + ">Export " + selectedYear + " tax packet</button>" +
        "</div>" +
      "</div>";

    html +=
      '<div class="ov-card">' +
        '<div style="display:flex;align-items:baseline;gap:10px">' +
          "<h2>Needs you today</h2>" +
          '<span class="ov-count ' + (count === 0 ? "clear" : "busy") + '" style="margin-left:auto">' +
            (count === 0 ? "Clear" : String(count)) +
          "</span>" +
        "</div>";

    if (count === 0) {
      html += '<p class="ov-note" style="margin-top:10px">Nothing overdue, waiting, or unbilled. Enjoy it.</p>';
    } else {
      var followUps = followUpDocuments();
      if (followUps.length) {
        html += '<div class="ov-section"><h3>Billing</h3>';
        followUps.slice(0, 8).forEach(function (doc) {
          var t = invoiceTotals(doc);
          var overdue = doc.due_on && doc.due_on <= todayISO();
          var label = overdue ? "Overdue" : (t.amountPaid > 0 ? "Partial" : "Unpaid");
          html += row(
            (doc.client_name || "Client") + (doc.number ? " · " + doc.number : ""),
            label + " · " + M().money(t.balance) + " remaining" + (doc.due_on ? " · due " + doc.due_on : ""),
            overdue ? "#e64747" : "#f29e2e",
            "billing"
          );
        });
        html += "</div>";
      }

      var unbilled = unbilledProjects();
      if (unbilled.length) {
        html += '<div class="ov-section"><h3>Unbilled hours</h3>';
        unbilled.forEach(function (rowItem) {
          html += row(
            rowItem.project.name || "Project",
            rowItem.hours + " hours not invoiced yet",
            "#f29e2e",
            "projects",
            "Bill",
            "bill:" + rowItem.project.id
          );
        });
        html += "</div>";
      }

      var overdue = overdueProjects();
      if (overdue.length) {
        html += '<div class="ov-section"><h3>Project due dates</h3>';
        overdue.forEach(function (p) {
          html += row(p.name || "Project", "Due " + p.due_date, "#e64747", "projects");
        });
        html += "</div>";
      }

      var projectIssues = openProjectIssues();
      if (projectIssues.length) {
        html += '<div class="ov-section"><h3>Project issues</h3>';
        projectIssues.slice(0, 8).forEach(function (issue) {
          var project = projects.filter(function (p) { return p.id === issue.project_id; })[0];
          html += row(
            issue.title || "Issue",
            (project && project.name) || "Project",
            issue.priority === "high" ? "#e64747" : "#1a70eb",
            "projects",
            "Fix",
            "fixIssue:" + issue.id
          );
        });
        html += "</div>";
      }

      var renew = attentionRenewals();
      if (renew.length) {
        html += '<div class="ov-section"><h3>Renewals</h3>';
        renew.forEach(function (item) {
          var days = daysUntil(item.due_date);
          html += row(
            item.title || "Renewal",
            days < 0 ? "Overdue" : "Due soon",
            days < 0 ? "#e64747" : "#f29e2e",
            "renewals"
          );
        });
        html += "</div>";
      }
    }
    html += "</div>";

    var ranked = apps.slice().sort(function (a, b) {
      var rank = { "In Development": 0, Live: 1, Paused: 2, Idea: 3, Archived: 4 };
      var ra = rank[a.status] != null ? rank[a.status] : 9;
      var rb = rank[b.status] != null ? rank[b.status] : 9;
      if (ra !== rb) return ra - rb;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    if (ranked.length) {
      html += '<div class="ov-apps">';
      ranked.forEach(function (app) {
        var openCount = appIssues.filter(function (i) {
          return i.app_id === app.id && (i.status === "open" || i.status === "inProgress");
        }).length;
        var hex = String(app.accent_hex || "1A70EB").replace(/^#/, "");
        var platforms = Array.isArray(app.platforms) ? app.platforms.join(" · ") : "";
        var mark = app._iconUrl
          ? '<img class="ov-app-mark" src="' + M().esc(app._iconUrl) + '" alt="" />'
          : '<span class="ov-app-mark" style="background:#' + M().esc(hex) + '">' +
            M().esc((app.name || "?").charAt(0).toUpperCase()) +
            "</span>";
        html +=
          '<button type="button" class="ov-app" data-go="apps">' +
            '<div class="ov-app-head">' +
              mark +
              "<div>" +
                "<h3>" + M().esc(app.name || "Untitled app") + "</h3>" +
                '<span class="apps-badge">' + M().esc(app.status || "Idea") + "</span>" +
              "</div>" +
            "</div>" +
            (app.summary ? '<p class="sum">' + M().esc(app.summary) + "</p>" : "") +
            '<div class="ov-app-foot">' +
              (platforms ? "<span>" + M().esc(platforms) + "</span>" : "") +
              (openCount ? '<span class="issue">' + openCount + " open</span>" : "") +
            "</div>" +
          "</button>";
      });
      html += "</div>";
    }

    var liveCount = apps.filter(function (a) { return a.status === "Live"; }).length;
    var devCount = apps.filter(function (a) { return a.status === "In Development"; }).length;
    html +=
      '<div class="ov-card">' +
        '<div class="ov-totals">' +
          '<div class="ov-total"><span class="k">Apps</span><span class="v">' + apps.length + "</span></div>" +
          '<div class="ov-total"><span class="k">Live</span><span class="v">' + liveCount + "</span></div>" +
          '<div class="ov-total"><span class="k">In Development</span><span class="v">' + devCount + "</span></div>" +
        "</div>" +
      "</div>";

    el("body").innerHTML = html;
    bind();
  }

  function bind() {
    var prev = el("year-prev");
    var next = el("year-next");
    if (prev) prev.onclick = function () {
      selectedYear -= 1;
      render();
    };
    if (next) next.onclick = function () {
      if (selectedYear >= M().currentYear()) return;
      selectedYear += 1;
      render();
    };
    var month = el("month");
    if (month) month.onchange = function () {
      selectedMonth = Number(month.value);
      render();
    };
    var exportMonth = el("export-month");
    if (exportMonth) exportMonth.onclick = exportMonthReport;
    var exportTax = el("export-tax");
    if (exportTax) exportTax.onclick = exportTaxPacket;

    root.querySelectorAll("[data-go]").forEach(function (node) {
      node.addEventListener("click", function (event) {
        if (event.target.closest("[data-secondary]")) return;
        var target = node.getAttribute("data-go");
        if (target) go(target);
      });
    });

    root.querySelectorAll("[data-secondary]").forEach(function (btn) {
      btn.addEventListener("click", function (event) {
        event.stopPropagation();
        var action = btn.getAttribute("data-secondary") || "";
        if (action.indexOf("fixIssue:") === 0) {
          fixIssue(action.slice(10));
        } else if (action.indexOf("bill:") === 0) {
          go("projects");
        }
      });
    });
  }

  function fixIssue(id) {
    db.from("project_issues").update({ status: "fixed" }).eq("id", id).then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      issues = issues.map(function (i) {
        if (i.id === id) i.status = "fixed";
        return i;
      });
      render();
      showMsg("Issue marked fixed.", true);
    });
  }

  function exportMonthReport() {
    if (!window.STLStudioPdf) return showMsg("PDF library missing.", false);
    exporting = true;
    render();
    var slices = M().monthSlices(selectedYear, incomes.filter(function (r) { return Number(r.year) === selectedYear; }), expenses.filter(function (r) { return Number(r.year) === selectedYear; }));
    var slice = slices[selectedMonth - 1] || { income: 0, expense: 0, profit: 0 };
    var paid = documents.filter(function (doc) {
      if (doc.kind !== "invoice" || doc.status !== "paid") return false;
      var payload = doc.payload || {};
      var date = String(doc.paid_on || payload.paidDate || doc.issued_on || "");
      return date.slice(0, 7) === selectedYear + "-" + String(selectedMonth).padStart(2, "0");
    });
    var monthName = MONTHS[selectedMonth - 1];
    showMsg("Building PDF…", true);
    window.STLStudioPdf.open({
      db: db,
      word: "MONTHLY REPORT",
      yearLabel: monthName + " " + selectedYear
    }).then(function (pdf) {
      pdf.heading(monthName + " " + selectedYear, 13);
      pdf.note("Prepared " + window.STLStudioPdf.prepared() + " from studio books for this month.");
      pdf.chips([
        ["Income", window.STLStudioPdf.money(slice.income)],
        ["Expenses", window.STLStudioPdf.money(slice.expense)],
        ["Profit", window.STLStudioPdf.money(slice.profit)],
        ["Paid invoices", String(paid.length)]
      ]);
      pdf.heading("Paid invoices", 12);
      if (!paid.length) {
        pdf.note("None this month.");
      } else {
        var colW = [90, pdf.maxW - 90 - 90, 90];
        pdf.tableHeader(["Number", "Client", "Amount"], colW, 2);
        paid.forEach(function (inv, i) {
          pdf.tableRow(
            [inv.number || "Invoice", inv.client_name || "—", window.STLStudioPdf.money(inv.amount)],
            colW,
            {
              sizes: [9, 9, 9],
              aligns: ["left", "left", "right"],
              stripe: i % 2 === 1
            }
          );
        });
      }
      pdf.totalLine("Profit " + monthName, window.STLStudioPdf.money(slice.profit));
      pdf.save("STL-Apps-LLC_Month_" + selectedYear + "-" + String(selectedMonth).padStart(2, "0") + ".pdf");
      exporting = false;
      showMsg("Month report downloaded.", true);
      render();
    }).catch(function (err) {
      exporting = false;
      showMsg((err && err.message) || "Could not build the PDF.", false);
      render();
    });
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

  function paidInvoicesForYear() {
    return documents.filter(function (doc) {
      if (doc.kind !== "invoice") return false;
      var t = invoiceTotals(doc);
      if (t.balance > 0) return false;
      var date = String(doc.paid_on || (doc.payload && doc.payload.paidDate) || doc.issued_on || "");
      return date.slice(0, 4) === String(selectedYear) || Number(doc.year) === selectedYear;
    });
  }

  function exportTaxPacket() {
    if (!window.STLStudioPdf) return showMsg("PDF library missing.", false);
    if (!window.JSZip) return showMsg("Zip library missing. Refresh the page.", false);
    exporting = true;
    render();
    var yearIn = incomes.filter(function (r) { return Number(r.year) === selectedYear; });
    var yearEx = expenses.filter(function (r) { return Number(r.year) === selectedYear; });
    var slices = M().monthSlices(selectedYear, yearIn, yearEx);
    var paid = paidInvoicesForYear();
    showMsg("Building tax packet zip…", true);

    var pl = window.STLStudioPdf.open({
      db: db,
      word: "TAX PACKET",
      yearLabel: "Tax year " + selectedYear
    }).then(function (pdf) {
      pdf.heading("Profit & Loss — " + selectedYear, 13);
      pdf.note("Prepared " + window.STLStudioPdf.prepared() + " for tax records. This is a record packet for your accountant. It is not tax advice.");
      pdf.chips([
        ["Income", window.STLStudioPdf.money(yearIncome())],
        ["Expenses", window.STLStudioPdf.money(yearExpense())],
        ["Profit", window.STLStudioPdf.money(yearProfit())],
        ["Owner draws", window.STLStudioPdf.money(yearDraws())]
      ]);
      pdf.heading("What’s in this zip", 12);
      pdf.note("00-Profit-and-Loss.pdf · 01-Monthly-Summary.pdf · Paid-Invoices · Company-Documents. Income and expense receipt reports can also be exported from Income and Expenses.");
      pdf.heading("Summary", 12);
      var sumW = [pdf.maxW - 120, 120];
      pdf.tableHeader(["Line", "Amount"], sumW, 1);
      [
        ["Income", yearIncome()],
        ["Expenses", yearExpense()],
        ["Profit", yearProfit()],
        ["Owner draws (not expenses)", yearDraws()]
      ].forEach(function (row, i) {
        pdf.tableRow(
          [row[0], window.STLStudioPdf.money(row[1])],
          sumW,
          { sizes: [10, 10], bolds: [i === 2, i === 2], aligns: ["left", "right"], stripe: i % 2 === 1 }
        );
      });
      pdf.totalLine("Profit " + selectedYear, window.STLStudioPdf.money(yearProfit()));
      return pdf.blob();
    });

    var monthly = window.STLStudioPdf.open({
      db: db,
      word: "MONTHLY SUMMARY",
      yearLabel: "Tax year " + selectedYear
    }).then(function (pdf) {
      pdf.heading("Month-by-month — " + selectedYear, 13);
      pdf.note("Prepared " + window.STLStudioPdf.prepared() + " from studio books.");
      var colW = [120, (pdf.maxW - 120) / 3, (pdf.maxW - 120) / 3, (pdf.maxW - 120) / 3];
      pdf.tableHeader(["Month", "Income", "Expenses", "Profit"], colW, 1);
      slices.forEach(function (m, i) {
        pdf.tableRow(
          [
            MONTHS[m.month - 1] + " " + selectedYear,
            window.STLStudioPdf.money(m.income),
            window.STLStudioPdf.money(m.expense),
            window.STLStudioPdf.money(m.profit)
          ],
          colW,
          { sizes: [9, 9, 9, 9], bolds: [false, false, false, true], aligns: ["left", "right", "right", "right"], stripe: i % 2 === 1 }
        );
      });
      pdf.totalLine("Year profit", window.STLStudioPdf.money(yearProfit()));
      return pdf.blob();
    });

    var invoicePdfs = Promise.all(paid.map(function (doc) {
      if (!window.STLBillingDoc || !window.STLBillingDoc.buildPdf) return null;
      var payload = Object.assign({}, doc.payload || {}, {
        kind: "receipt",
        number: doc.number,
        clientName: doc.client_name,
        amountPaid: (doc.payload && doc.payload.amountPaid) != null ? doc.payload.amountPaid : doc.amount
      });
      return window.STLBillingDoc.buildPdf(payload).then(function (out) {
        var name = (doc.number || "Invoice") + "-" + (doc.client_name || "Client") + ".pdf";
        name = name.replace(/[\/\\?%*:|"<>]/g, "-");
        return { name: name, blob: out.blob };
      }).catch(function () { return null; });
    })).then(function (list) {
      return list.filter(Boolean);
    });

    var companyFiles = Promise.all((companyDocs || []).filter(function (d) { return d.storage_path; }).map(function (doc) {
      return db.storage.from("business-docs").download(doc.storage_path).then(function (res) {
        if (res.error) return null;
        var ext = String(doc.file_name || doc.storage_path || "pdf").split(".").pop() || "pdf";
        var name = (doc.name || "Document") + "." + ext;
        name = name.replace(/[\/\\?%*:|"<>]/g, "-");
        return { name: name, blob: res.data };
      }).catch(function () { return null; });
    })).then(function (list) {
      return list.filter(Boolean);
    });

    Promise.all([pl, monthly, invoicePdfs, companyFiles]).then(function (parts) {
      var zip = new window.JSZip();
      var folder = zip.folder("STL-Apps-LLC-Tax-Packet-" + selectedYear);
      folder.file("00-Profit-and-Loss.pdf", parts[0]);
      folder.file("01-Monthly-Summary.pdf", parts[1]);
      var inv = folder.folder("Paid-Invoices");
      (parts[2] || []).forEach(function (file) { inv.file(file.name, file.blob); });
      var co = folder.folder("Company-Documents");
      (parts[3] || []).forEach(function (file) { co.file(file.name, file.blob); });
      return zip.generateAsync({ type: "blob" });
    }).then(function (blob) {
      downloadBlob(blob, "STL-Apps-LLC_Tax-Packet_" + selectedYear + ".zip");
      exporting = false;
      showMsg("Tax packet zip downloaded.", true);
      render();
    }).catch(function (err) {
      exporting = false;
      showMsg((err && err.message) || "Could not build the packet.", false);
      render();
    });
  }

  function safe(table, cols) {
    return db.from(table).select(cols || "*").then(function (res) {
      return res.error ? [] : (res.data || []);
    }).catch(function () { return []; });
  }

  function load() {
    showMsg("Loading overview…", true);
    Promise.all([
      safe("business_incomes"),
      safe("business_expenses"),
      safe("owner_draws"),
      safe("renewal_items"),
      safe("billing_documents"),
      safe("client_projects"),
      safe("project_hour_entries"),
      safe("project_issues"),
      safe("managed_apps"),
      safe("app_issues"),
      safe("business_documents")
    ]).then(function (pair) {
      incomes = pair[0];
      expenses = pair[1];
      draws = pair[2];
      renewals = pair[3];
      documents = pair[4];
      projects = pair[5];
      hours = pair[6];
      issues = pair[7];
      apps = pair[8];
      appIssues = pair[9];
      companyDocs = pair[10] || [];
      var paths = [];
      apps.forEach(function (app) {
        if (app.icon_path && paths.indexOf(app.icon_path) < 0) paths.push(app.icon_path);
      });
      if (!paths.length) {
        showMsg("");
        render();
        return;
      }
      return db.storage.from("app-icons").createSignedUrls(paths, 3600).then(function (res) {
        var map = {};
        (res.data || []).forEach(function (row) {
          if (row && row.path && row.signedUrl) map[row.path] = row.signedUrl;
        });
        apps.forEach(function (app) {
          app._iconUrl = map[app.icon_path] || "";
        });
        showMsg("");
        render();
      }).catch(function () {
        showMsg("");
        render();
      });
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not load overview.", false);
      render();
    });
  }

  window.STLOverview = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      selectedYear = M().currentYear();
      selectedMonth = new Date().getMonth() + 1;
      panel.classList.add("overview-wide");
      panel.innerHTML = shell();
      load();
    },
    unmount: function (panel) {
      if (panel) panel.classList.remove("overview-wide");
      root = null;
    }
  };
})();

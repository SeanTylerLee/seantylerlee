(function () {
  "use strict";

  var M = function () { return window.STLMoney; };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var root = null;
  var db = null;
  var selectedYear = new Date().getFullYear();
  var incomes = [];
  var expenses = [];
  var draws = [];
  var invoices = [];
  var profile = null;
  var docs = [];
  var reservePercent = 30;
  var dirty = false;
  var saving = false;

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

  function yearIncomes() {
    return incomes.filter(function (r) { return Number(r.year) === selectedYear; });
  }
  function yearExpenses() {
    return expenses.filter(function (r) { return Number(r.year) === selectedYear; });
  }
  function yearDraws() {
    return draws.filter(function (r) { return Number(r.year) === selectedYear; });
  }

  function incomeTotal() {
    return M().round2(yearIncomes().reduce(function (s, r) { return s + M().yearTotal(r); }, 0));
  }
  function expenseTotal() {
    return M().round2(yearExpenses().reduce(function (s, r) { return s + M().yearTotal(r); }, 0));
  }
  function profit() {
    return M().round2(incomeTotal() - expenseTotal());
  }
  function drawTotal() {
    return M().round2(yearDraws().reduce(function (s, r) { return s + Number(r.amount || 0); }, 0));
  }

  function paidInvoices() {
    return invoices.filter(function (doc) {
      if (doc.kind !== "invoice" && doc.kind !== "receipt") return false;
      if (doc.status !== "paid") return false;
      var payload = doc.payload || {};
      var date = doc.paid_on || payload.paidDate || doc.issued_on || "";
      return M().yearFromISO(date) === selectedYear;
    });
  }

  function reserveAmount() {
    var p = profit();
    if (p <= 0) return 0;
    return M().round2(p * (Math.min(100, Math.max(0, reservePercent)) / 100));
  }

  function syncSave() {
    M().syncSaveButton(dirty, saving);
  }

  function shell() {
    return (
      '<div class="money-workspace">' +
        '<div data-el="yearbar"></div>' +
        '<div class="money-header"><h1>Taxes</h1>' +
        "<p>Year snapshot from Income, Expenses, and Owner Draws. Set aside a percent of profit, then export a packet for your accountant.</p></div>" +
        '<p class="status money-banner" data-el="banner"></p>' +
        '<div class="money-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function renderYearBar() {
    var years = {};
    years[M().currentYear()] = true;
    years[selectedYear] = true;
    incomes.concat(expenses).concat(draws).forEach(function (r) { if (r.year) years[r.year] = true; });
    var list = Object.keys(years).map(Number).sort(function (a, b) { return a - b; });
    el("yearbar").innerHTML = M().yearBarHTML(selectedYear, list).replace(">Add</button>", ' style="visibility:hidden">Add</button>');
    el("yearbar").querySelector('[data-el="year-prev"]').onclick = function () {
      if (selectedYear <= M().currentYear() - 25) return;
      selectedYear -= 1;
      render();
    };
    el("yearbar").querySelector('[data-el="year-next"]').onclick = function () {
      if (selectedYear >= M().currentYear() + 1) return;
      selectedYear += 1;
      render();
    };
    el("yearbar").querySelectorAll("[data-year]").forEach(function (btn) {
      btn.onclick = function () {
        selectedYear = Number(btn.getAttribute("data-year"));
        render();
      };
    });
  }

  function go(section) {
    if (window.STLApp && window.STLApp.navigate) window.STLApp.navigate(section);
  }

  function render() {
    renderYearBar();
    var slices = M().monthSlices(selectedYear, yearIncomes(), yearExpenses());
    var quarters = M().quarterTotals(slices);
    var paid = paidInvoices();
    var receipts = yearExpenses().filter(function (e) { return !!e.receipt_path; }).length;
    var hasEin = !!(profile && M().trim(profile.tax_id));
    var hasDocs = !!(docs && docs.length);
    var reserve = reserveAmount();

    var html =
      '<div class="money-chips">' +
        '<div class="money-chip ok"><span class="k">Income</span><span class="v">' + M().money(incomeTotal()) + "</span></div>" +
        '<div class="money-chip danger"><span class="k">Expenses</span><span class="v">' + M().money(expenseTotal()) + "</span></div>" +
        '<div class="money-chip' + (profit() >= 0 ? " ok" : " danger") + '"><span class="k">Profit</span><span class="v">' + M().money(profit()) + "</span></div>" +
        '<div class="money-chip"><span class="k">Paid invoices</span><span class="v">' + paid.length + "</span></div>" +
      "</div>";

    html +=
      '<div class="money-card"><h3>' + selectedYear + " totals</h3>" +
      '<div class="money-month-row"><span>Income</span><strong>' + M().money(incomeTotal()) + "</strong></div>" +
      '<div class="money-month-row"><span>Expenses</span><strong>' + M().money(expenseTotal()) + "</strong></div>" +
      '<div class="money-month-row"><span>Profit</span><strong>' + M().money(profit()) + "</strong></div>" +
      '<div class="money-month-row"><span>Owner draws <em style="color:#6b7388;font-style:normal;font-weight:600">(not an expense)</em></span><strong>' + M().money(drawTotal()) + "</strong></div>" +
      '<div class="money-link-row" style="margin-top:10px">' +
        '<button class="btn btn-ghost" type="button" data-go="income">Open Income</button>' +
        '<button class="btn btn-ghost" type="button" data-go="expenses">Open Expenses</button>' +
        '<button class="btn btn-ghost" type="button" data-go="ownerDraws">Open Owner Draws</button>' +
      "</div></div>";

    html +=
      '<div class="money-card"><h3>Quarters</h3>' +
      '<table class="money-table">' +
        "<thead><tr><th>Quarter</th><th>Income</th><th>Expenses</th><th>Profit</th></tr></thead><tbody>";
    quarters.forEach(function (q, i) {
      html +=
        "<tr>" +
          "<td>Q" + (i + 1) + "</td>" +
          '<td class="num">' + M().money(q.income) + "</td>" +
          '<td class="num">' + M().money(q.expense) + "</td>" +
          '<td class="num">' + M().money(q.profit) + "</td>" +
        "</tr>";
    });
    html +=
      "</tbody><tfoot><tr>" +
        "<td>Year</td>" +
        '<td class="num">' + M().money(incomeTotal()) + "</td>" +
        '<td class="num">' + M().money(expenseTotal()) + "</td>" +
        '<td class="num">' + M().money(profit()) + "</td>" +
      "</tr></tfoot></table></div>";

    html +=
      '<div class="money-card"><h3>Months</h3>' +
      '<table class="money-table">' +
        "<thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Profit</th></tr></thead><tbody>";
    slices.forEach(function (m) {
      html +=
        "<tr>" +
          "<td>" + MONTHS[m.month - 1] + "</td>" +
          '<td class="num">' + M().money(m.income) + "</td>" +
          '<td class="num">' + M().money(m.expense) + "</td>" +
          '<td class="num">' + M().money(m.profit) + "</td>" +
        "</tr>";
    });
    html += "</tbody></table></div>";

    html +=
      '<div class="money-card"><h3>Set-aside reminder</h3>' +
      '<p class="sub">Not tax advice — just a reserve target from profit.</p>' +
      '<div class="money-grid">' +
        '<div class="money-field"><label>Percent of profit</label>' +
          '<input data-el="reserve" type="number" min="0" max="100" step="1" value="' + reservePercent + '" /></div>' +
        '<div class="money-field"><label>Reserve amount</label>' +
          '<input type="text" value="' + M().esc(M().money(reserve)) + '" disabled /></div>' +
      "</div>" +
      '<p class="sub">About ' + M().money(M().round2(reserve / 4)) + " per quarter if you split it evenly.</p></div>";

    html +=
      '<div class="money-card"><h3>Packet readiness</h3>' +
      readyRow("EIN on Business Info", hasEin, "business") +
      readyRow("Company documents uploaded", hasDocs, "business") +
      readyRow("Income logged", yearIncomes().length > 0, "income") +
      readyRow("Expenses logged", yearExpenses().length > 0, "expenses") +
      readyRow("Expense receipts", receipts > 0, "expenses") +
      readyRow("Paid invoices on file", paid.length > 0, "billing") +
      readyRow("Bank connected (optional)", true, "bank") +
      "</div>";

    html +=
      '<div class="money-card"><h3>Exports</h3>' +
      '<p class="sub">Letterhead PDFs matching the Mac reports — P&L and month-by-month for this tax year.</p>' +
      '<div class="money-actions">' +
        '<button class="btn btn-primary" type="button" data-el="export-pl">Export P&L PDF</button>' +
        '<button class="btn btn-ghost" type="button" data-el="export-months">Export monthly PDF</button>' +
      "</div></div>";

    el("body").innerHTML = html;
    bind();
    syncSave();
  }

  function readyRow(label, ok, section) {
    return (
      '<div class="money-ready"><span>' + M().esc(label) + '</span>' +
      '<span><span class="' + (ok ? "ok" : "bad") + '">' + (ok ? "Ready" : "Missing") + "</span> " +
      '<button class="btn btn-ghost" type="button" data-go="' + section + '" style="min-height:26px;margin-left:8px">Open</button></span></div>'
    );
  }

  function bind() {
    root.querySelectorAll("[data-go]").forEach(function (btn) {
      btn.onclick = function () { go(btn.getAttribute("data-go")); };
    });
    var reserve = el("reserve");
    if (reserve) {
      reserve.onchange = function () {
        reservePercent = Math.min(100, Math.max(0, Number(reserve.value) || 0));
        dirty = true;
        syncSave();
        render();
        showMsg("Unsaved changes", true);
      };
    }
    var pl = el("export-pl");
    if (pl) pl.onclick = exportPL;
    var months = el("export-months");
    if (months) months.onclick = exportMonths;
  }

  function exportPL() {
    if (!window.STLStudioPdf) return showMsg("PDF library missing.", false);
    showMsg("Building PDF…", true);
    window.STLStudioPdf.open({
      db: db,
      word: "PROFIT & LOSS",
      yearLabel: "Tax year " + selectedYear
    }).then(function (pdf) {
      pdf.heading("Yearly profit and loss", 13);
      pdf.note("Prepared " + window.STLStudioPdf.prepared() + " for tax records. Owner draws are not expenses.");
      pdf.chips([
        ["Income", window.STLStudioPdf.money(incomeTotal())],
        ["Expenses", window.STLStudioPdf.money(expenseTotal())],
        ["Profit", window.STLStudioPdf.money(profit())],
        ["Owner draws", window.STLStudioPdf.money(drawTotal())]
      ]);
      pdf.heading("Summary", 12);
      var colW = [pdf.maxW - 120, 120];
      pdf.tableHeader(["Line", "Amount"], colW, 1);
      [
        ["Income", incomeTotal()],
        ["Expenses", expenseTotal()],
        ["Profit", profit()],
        ["Owner draws (not expenses)", drawTotal()],
        ["Tax reserve (" + reservePercent + "%)", reserveAmount()]
      ].forEach(function (row, i) {
        pdf.tableRow(
          [row[0], window.STLStudioPdf.money(row[1])],
          colW,
          {
            sizes: [10, 10],
            bolds: [i === 2, i === 2],
            aligns: ["left", "right"],
            stripe: i % 2 === 1
          }
        );
      });
      pdf.totalLine("Profit " + selectedYear, window.STLStudioPdf.money(profit()));
      pdf.note("This is a record for your accountant. It is not tax advice.");
      pdf.save("STL-Apps-LLC_PL_" + selectedYear + ".pdf");
      showMsg("P&L PDF downloaded.", true);
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not build the PDF.", false);
    });
  }

  function exportMonths() {
    if (!window.STLStudioPdf) return showMsg("PDF library missing.", false);
    var slices = M().monthSlices(selectedYear, yearIncomes(), yearExpenses());
    showMsg("Building PDF…", true);
    window.STLStudioPdf.open({
      db: db,
      word: "MONTHLY SUMMARY",
      yearLabel: "Tax year " + selectedYear
    }).then(function (pdf) {
      pdf.heading("Month-by-month", 13);
      pdf.note("Prepared " + window.STLStudioPdf.prepared() + " from income and expenses logged in the studio.");
      pdf.chips([
        ["Income", window.STLStudioPdf.money(incomeTotal())],
        ["Expenses", window.STLStudioPdf.money(expenseTotal())],
        ["Profit", window.STLStudioPdf.money(profit())],
        ["Owner draws", window.STLStudioPdf.money(drawTotal())]
      ]);
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
          {
            sizes: [9, 9, 9, 9],
            bolds: [false, false, false, true],
            aligns: ["left", "right", "right", "right"],
            stripe: i % 2 === 1
          }
        );
      });
      pdf.totalLine("Year profit", window.STLStudioPdf.money(profit()));
      pdf.save("STL-Apps-LLC_Monthly_" + selectedYear + ".pdf");
      showMsg("Monthly PDF downloaded.", true);
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not build the PDF.", false);
    });
  }

  function saveAll() {
    if (saving || !dirty) return;
    saving = true;
    syncSave();
    showMsg("Saving…", true);
    db.from("studio_settings").upsert({
      key: "tax_reserve_percent",
      value: String(reservePercent)
    }, { onConflict: "user_id,key" }).then(function (res) {
      saving = false;
      if (res.error) {
        showMsg(res.error.message || "Save failed.", false);
        syncSave();
        return;
      }
      dirty = false;
      syncSave();
      showMsg("Saved", true);
      setTimeout(function () { showMsg(""); }, 1000);
    });
  }

  function safe(table, cols) {
    return db.from(table).select(cols || "*").then(function (res) {
      return res.error ? [] : (res.data || []);
    }).catch(function () { return []; });
  }

  function load() {
    showMsg("Loading…", true);
    Promise.all([
      safe("business_incomes"),
      safe("business_expenses"),
      safe("owner_draws"),
      safe("billing_documents", "id,kind,number,client_name,amount,status,paid_on,issued_on,payload"),
      safe("business_profile"),
      safe("business_documents", "id,name,storage_path"),
      db.from("studio_settings").select("key,value").eq("key", "tax_reserve_percent").maybeSingle()
    ]).then(function (pair) {
      incomes = pair[0];
      expenses = pair[1];
      draws = pair[2];
      invoices = pair[3];
      profile = pair[4][0] || null;
      docs = (pair[5] || []).filter(function (d) { return d.storage_path; });
      if (pair[6] && pair[6].data && pair[6].data.value != null) {
        reservePercent = Number(pair[6].data.value) || 30;
      }
      dirty = false;
      showMsg("");
      render();
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not load taxes.", false);
      render();
    });
  }

  window.STLTaxes = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      selectedYear = M().currentYear();
      dirty = false;
      saving = false;
      panel.classList.add("money-wide");
      panel.innerHTML = shell();
      syncSave();
      load();
    },
    unmount: function (panel) {
      M().hideSaveButton();
      if (panel) panel.classList.remove("money-wide");
      root = null;
    },
    saveAll: saveAll,
    isDirty: function () { return dirty; }
  };
})();

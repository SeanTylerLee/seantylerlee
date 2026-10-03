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
  var selectedMonth = new Date().getMonth() + 1;
  var mileageTrips = [];
  var mileageRate = 0.70;
  var exporting = false;
  var FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
      '<p class="sub">Letterhead PDFs for this tax year, plus the month report and the full tax-packet zip.</p>' +
      '<div class="money-actions">' +
        '<button class="btn btn-primary" type="button" data-el="export-pl"' + (exporting ? " disabled" : "") + ">Export P&L PDF</button>" +
        '<button class="btn btn-ghost" type="button" data-el="export-months"' + (exporting ? " disabled" : "") + ">Export monthly PDF</button>" +
      "</div>" +
      '<div class="money-actions" style="margin-top:10px">' +
        '<select data-el="month">' +
          FULL_MONTHS.map(function (name, i) {
            return '<option value="' + (i + 1) + '"' + (selectedMonth === i + 1 ? " selected" : "") + ">" + name + "</option>";
          }).join("") +
        "</select>" +
        '<button class="btn btn-ghost" type="button" data-el="export-month"' + (exporting ? " disabled" : "") + ">Export " + FULL_MONTHS[selectedMonth - 1] + " report</button>" +
        '<button class="btn btn-primary" type="button" data-el="export-tax"' + (exporting ? " disabled" : "") + ">Export " + selectedYear + " tax packet</button>" +
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
    var month = el("month");
    if (month) month.onchange = function () {
      selectedMonth = Number(month.value);
      render();
    };
    var exportMonth = el("export-month");
    if (exportMonth) exportMonth.onclick = exportMonthReport;
    var exportTax = el("export-tax");
    if (exportTax) exportTax.onclick = exportTaxPacket;
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

  function exportMonthReport() {
    if (!window.STLStudioPdf) return showMsg("PDF library missing.", false);
    exporting = true;
    render();
    var slices = M().monthSlices(selectedYear, incomes.filter(function (r) { return Number(r.year) === selectedYear; }), expenses.filter(function (r) { return Number(r.year) === selectedYear; }));
    var slice = slices[selectedMonth - 1] || { income: 0, expense: 0, profit: 0 };
    var paid = invoices.filter(function (doc) {
      if (doc.kind !== "invoice" || doc.status !== "paid") return false;
      var payload = doc.payload || {};
      var date = String(doc.paid_on || payload.paidDate || doc.issued_on || "");
      return date.slice(0, 7) === selectedYear + "-" + String(selectedMonth).padStart(2, "0");
    });
    var monthName = FULL_MONTHS[selectedMonth - 1];
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
    return invoices.filter(function (doc) {
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
        ["Income", window.STLStudioPdf.money(incomeTotal())],
        ["Expenses", window.STLStudioPdf.money(expenseTotal())],
        ["Profit", window.STLStudioPdf.money(profit())],
        ["Owner draws", window.STLStudioPdf.money(drawTotal())]
      ]);
      pdf.heading("What’s in this zip", 12);
      pdf.note("00-Profit-and-Loss.pdf · 01-Monthly-Summary.pdf · 02-Mileage.pdf · 03-Expenses.pdf · 04-Income.pdf · Receipts · Paid-Invoices · Company-Documents. Expense and income reports include labeled exhibit pages for every attached receipt.");
      pdf.heading("Summary", 12);
      var sumW = [pdf.maxW - 120, 120];
      pdf.tableHeader(["Line", "Amount"], sumW, 1);
      [
        ["Income", incomeTotal()],
        ["Expenses", expenseTotal()],
        ["Profit", profit()],
        ["Owner draws (not expenses)", drawTotal()]
      ].forEach(function (row, i) {
        pdf.tableRow(
          [row[0], window.STLStudioPdf.money(row[1])],
          sumW,
          { sizes: [10, 10], bolds: [i === 2, i === 2], aligns: ["left", "right"], stripe: i % 2 === 1 }
        );
      });
      pdf.totalLine("Profit " + selectedYear, window.STLStudioPdf.money(profit()));
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
            FULL_MONTHS[m.month - 1] + " " + selectedYear,
            window.STLStudioPdf.money(m.income),
            window.STLStudioPdf.money(m.expense),
            window.STLStudioPdf.money(m.profit)
          ],
          colW,
          { sizes: [9, 9, 9, 9], bolds: [false, false, false, true], aligns: ["left", "right", "right", "right"], stripe: i % 2 === 1 }
        );
      });
      pdf.totalLine("Year profit", window.STLStudioPdf.money(profit()));
      return pdf.blob();
    });

    var yearMiles = mileageTrips.filter(function (t) {
      return Number(String(t.trip_date || "").slice(0, 4)) === selectedYear;
    });
    var milesTotal = M().round2(yearMiles.reduce(function (s, t) { return s + (Number(t.miles) || 0); }, 0));
    var milesDeduction = M().round2(milesTotal * mileageRate);
    var mileagePdf = window.STLStudioPdf.open({
      db: db,
      word: "MILEAGE LOG",
      yearLabel: "Tax year " + selectedYear
    }).then(function (pdf) {
      pdf.heading("Business mileage — " + selectedYear, 13);
      pdf.note("Prepared " + window.STLStudioPdf.prepared() + ". Rate " + window.STLStudioPdf.money(mileageRate) + " per mile.");
      pdf.chips([
        ["Trips", String(yearMiles.length)],
        ["Miles", milesTotal.toLocaleString("en-US")],
        ["Rate", window.STLStudioPdf.money(mileageRate) + "/mi"],
        ["Deduction", window.STLStudioPdf.money(milesDeduction)]
      ]);
      var colW = [70, 120, pdf.maxW - 70 - 120 - 55 - 70, 55, 70];
      pdf.tableHeader(["Date", "Purpose", "Route", "Miles", "Amount"], colW, 1);
      if (!yearMiles.length) {
        pdf.note("No trips logged for this year.");
      } else {
        yearMiles.slice().sort(function (a, b) {
          return String(b.trip_date || "") < String(a.trip_date || "") ? -1 : 1;
        }).forEach(function (trip, i) {
          var miles = Number(trip.miles) || 0;
          var start = String(trip.start_place || "").trim();
          var end = String(trip.end_place || "").trim();
          var route = start && end ? start + " → " + end : (start || end || "—");
          pdf.tableRow(
            [
              String(trip.trip_date || "").slice(0, 10),
              trip.purpose || "Trip",
              route,
              miles.toLocaleString("en-US"),
              window.STLStudioPdf.money(M().round2(miles * mileageRate))
            ],
            colW,
            { sizes: [8, 8, 8, 8, 8], aligns: ["left", "left", "left", "right", "right"], stripe: i % 2 === 1 }
          );
        });
      }
      pdf.totalLine(selectedYear + " mileage deduction", window.STLStudioPdf.money(milesDeduction));
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

    var companyFiles = Promise.all((docs || []).filter(function (d) { return d.storage_path; }).map(function (doc) {
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

    function ledgerReport(kind, rows) {
      if (!window.STLLedgerPdf) return Promise.resolve(null);
      var has = (rows || []).some(function (r) { return Number(r.year) === selectedYear; });
      if (!has) return Promise.resolve(null);
      return window.STLLedgerPdf.buildYear({
        db: db,
        rows: rows,
        year: selectedYear,
        kind: kind
      }).catch(function () { return null; });
    }

    Promise.all([
      pl,
      monthly,
      mileagePdf,
      invoicePdfs,
      companyFiles,
      ledgerReport("expenses", expenses),
      ledgerReport("income", incomes)
    ]).then(function (parts) {
      var zip = new window.JSZip();
      var folder = zip.folder("STL-Apps-LLC-Tax-Packet-" + selectedYear);
      folder.file("00-Profit-and-Loss.pdf", parts[0]);
      folder.file("01-Monthly-Summary.pdf", parts[1]);
      folder.file("02-Mileage.pdf", parts[2]);
      if (parts[5] && parts[5].blob) folder.file("03-Expenses.pdf", parts[5].blob);
      if (parts[6] && parts[6].blob) folder.file("04-Income.pdf", parts[6].blob);
      var recEx = folder.folder("Receipts/Expenses");
      ((parts[5] && parts[5].receipts) || []).forEach(function (file) { recEx.file(file.name, file.blob); });
      var recIn = folder.folder("Receipts/Income");
      ((parts[6] && parts[6].receipts) || []).forEach(function (file) { recIn.file(file.name, file.blob); });
      var inv = folder.folder("Paid-Invoices");
      (parts[3] || []).forEach(function (file) { inv.file(file.name, file.blob); });
      var co = folder.folder("Company-Documents");
      (parts[4] || []).forEach(function (file) { co.file(file.name, file.blob); });
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
      safe("billing_documents", "id,kind,number,client_name,amount,status,paid_on,issued_on,year,payload"),
      safe("business_profile"),
      safe("business_documents", "id,name,file_name,storage_path"),
      db.from("studio_settings").select("key,value").in("key", ["tax_reserve_percent", "mileage_rate"])
        .then(function (res) { return res.error ? [] : (res.data || []); }),
      safe("mileage_trips")
    ]).then(function (pair) {
      incomes = pair[0];
      expenses = pair[1];
      draws = pair[2];
      invoices = pair[3];
      profile = pair[4][0] || null;
      docs = (pair[5] || []).filter(function (d) { return d.storage_path; });
      (pair[6] || []).forEach(function (row) {
        if (row.key === "tax_reserve_percent" && row.value != null) reservePercent = Number(row.value) || 30;
        if (row.key === "mileage_rate" && row.value != null) {
          var n = Number(row.value);
          if (Number.isFinite(n) && n >= 0) mileageRate = n;
        }
      });
      mileageTrips = pair[7] || [];
      dirty = false;
      showMsg("");
      render();
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not load taxes.", false);
      render();
    });
  }

  window.STLTaxes = {
    applyReserve: function (n) {
      var v = Number(n);
      if (!Number.isFinite(v)) return;
      reservePercent = Math.min(100, Math.max(0, v));
      dirty = false;
      if (root) render();
    },
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

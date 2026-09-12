(function () {
  "use strict";

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function money(n) {
    return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function yearFromISO(iso) {
    return Number(String(iso || "").slice(0, 4)) || new Date().getFullYear();
  }

  function currentYear() {
    return new Date().getFullYear();
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

  function formatDate(iso) {
    if (!iso) return "—";
    var parts = String(iso).slice(0, 10).split("-");
    if (parts.length !== 3) return iso;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function monthlyMonths(year, dateISO) {
    var parts = String(dateISO || "").slice(0, 10).split("-");
    if (parts.length !== 3) return 12;
    var itemYear = Number(parts[0]);
    var month = Number(parts[1]);
    if (itemYear < year) return 12;
    if (itemYear > year) return 0;
    return Math.max(1, 13 - month);
  }

  function resolvedRecurrence(item) {
    if (!item.is_recurring) return "none";
    return item.recurrence && item.recurrence !== "none" ? item.recurrence : "yearly";
  }

  function resolvedMonthCount(item) {
    if (resolvedRecurrence(item) !== "monthly") return 1;
    var count = Number(item.recurring_month_count) || 0;
    if (count >= 1) return Math.min(12, count);
    return monthlyMonths(item.year, item.date);
  }

  function yearTotal(item) {
    if (resolvedRecurrence(item) === "monthly") {
      return round2(Number(item.amount || 0) * resolvedMonthCount(item));
    }
    return round2(Number(item.amount || 0));
  }

  function recurrenceTitle(item) {
    var r = resolvedRecurrence(item);
    if (r === "monthly") return "Monthly × " + resolvedMonthCount(item);
    if (r === "yearly") return "Yearly";
    return "One-time";
  }

  function visibleYears(rows, selectedYear) {
    var years = {};
    var cy = currentYear();
    years[cy] = true;
    years[selectedYear] = true;
    (rows || []).forEach(function (row) {
      if (row.year) years[row.year] = true;
    });
    return Object.keys(years).map(Number).sort(function (a, b) { return a - b; });
  }

  function yearBarHTML(selectedYear, years) {
    var cy = currentYear();
    var pills = years.map(function (year) {
      return (
        '<button type="button" class="money-year-pill' + (year === selectedYear ? " is-on" : "") + '" data-year="' + year + '">' +
        (year === cy ? year + " · Now" : String(year)) +
        "</button>"
      );
    }).join("");
    return (
      '<div class="money-yearbar">' +
        '<button type="button" class="money-year-nav" data-el="year-prev" aria-label="Previous year">‹</button>' +
        '<div class="money-year-pills">' + pills + "</div>" +
        '<button type="button" class="money-year-nav" data-el="year-next" aria-label="Next year">›</button>' +
        '<button type="button" class="btn btn-ghost money-year-add" data-el="add">Add</button>' +
      "</div>"
    );
  }

  function syncSaveButton(dirty, saving) {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.disabled = !dirty || saving;
    btn.textContent = saving ? "Saving…" : "Save";
  }

  function hideSaveButton() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }

  function missingTable(err) {
    var msg = (err && err.message) || "";
    return /does not exist|schema cache|not find|bucket/i.test(msg);
  }

  // Allocate ledger item across months for tax/monthly views.
  function monthSlices(year, incomes, expenses) {
    var months = [];
    var i;
    for (i = 1; i <= 12; i += 1) {
      months.push({ month: i, income: 0, expense: 0, profit: 0 });
    }

    function place(item, kind) {
      var amount = Number(item.amount || 0);
      var rec = resolvedRecurrence(item);
      var parts = String(item.date || "").slice(0, 10).split("-");
      var startMonth = parts.length === 3 ? Number(parts[1]) : 1;
      if (item.year !== year) return;
      if (rec === "monthly") {
        var count = resolvedMonthCount(item);
        var m;
        for (m = 0; m < count; m += 1) {
          var idx = startMonth - 1 + m;
          if (idx >= 0 && idx < 12) {
            if (kind === "income") months[idx].income = round2(months[idx].income + amount);
            else months[idx].expense = round2(months[idx].expense + amount);
          }
        }
      } else {
        var mi = Math.max(0, Math.min(11, startMonth - 1));
        if (kind === "income") months[mi].income = round2(months[mi].income + amount);
        else months[mi].expense = round2(months[mi].expense + amount);
      }
    }

    (incomes || []).forEach(function (row) { place(row, "income"); });
    (expenses || []).forEach(function (row) { place(row, "expense"); });
    months.forEach(function (m) { m.profit = round2(m.income - m.expense); });
    return months;
  }

  function quarterTotals(slices) {
    function sum(from, to) {
      var income = 0;
      var expense = 0;
      var i;
      for (i = from; i <= to; i += 1) {
        income += slices[i].income;
        expense += slices[i].expense;
      }
      return { income: round2(income), expense: round2(expense), profit: round2(income - expense) };
    }
    return [sum(0, 2), sum(3, 5), sum(6, 8), sum(9, 11)];
  }

  window.STLMoney = {
    pad: pad,
    money: money,
    round2: round2,
    todayISO: todayISO,
    yearFromISO: yearFromISO,
    currentYear: currentYear,
    esc: esc,
    trim: trim,
    formatDate: formatDate,
    resolvedRecurrence: resolvedRecurrence,
    resolvedMonthCount: resolvedMonthCount,
    yearTotal: yearTotal,
    recurrenceTitle: recurrenceTitle,
    visibleYears: visibleYears,
    yearBarHTML: yearBarHTML,
    syncSaveButton: syncSaveButton,
    hideSaveButton: hideSaveButton,
    missingTable: missingTable,
    monthSlices: monthSlices,
    quarterTotals: quarterTotals
  };
})();

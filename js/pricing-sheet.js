(function () {
  "use strict";

  var pricing = window.STLPricing;
  if (!pricing) return;
  var rates = pricing.RATES;

  function byId(id) {
    return document.getElementById(id);
  }

  function table(headers, rows) {
    var html = '<table class="sheet-table"><thead><tr>';
    headers.forEach(function (h) { html += "<th>" + h + "</th>"; });
    html += "</tr></thead><tbody>";
    rows.forEach(function (row) {
      html += "<tr>";
      row.forEach(function (cell, i) {
        html += (i === row.length - 1 ? '<td class="num">' : "<td>") + cell + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    return html;
  }

  function fillProducts() {
    var el = byId("sheet-products");
    if (!el) return;
    el.innerHTML = table(
      ["Item", "Notes", "Base rate"],
      [
        ["Basic website page (1 page)", "First page of a website", pricing.money(rates.website.firstPage)],
        ["Add pages to website", "Each extra page", pricing.money(rates.website.extraPage) + " / page"],
        ["Web app", rates.products.webapp.blurb, pricing.money(rates.products.webapp.base)],
        ["Build an Apple app", rates.products.ios.blurb, pricing.money(rates.products.ios.base)],
        ["Build an Android app", rates.products.android.blurb, pricing.money(rates.products.android.base)]
      ]
    );
  }

  function fillAddons() {
    var el = byId("sheet-addons");
    if (!el) return;
    var rows = Object.keys(rates.addons).map(function (id) {
      var a = rates.addons[id];
      var note = a.blurb || "";
      if (a.needs) note = "Only with " + rates.products[a.needs].label;
      if (a.replaces) note = a.blurb || ("Replaces " + rates.addons[a.replaces].label);
      return [a.label, note, pricing.money(a.price)];
    });
    el.innerHTML = table(["Item", "Rule", "Base rate"], rows);
  }

  function fillTerms() {
    var el = byId("sheet-terms");
    if (!el) return;
    el.innerHTML = table(
      ["Term", "Value"],
      [
        ["Deposit to start", (rates.deposit * 100) + "%"],
        ["Quote good for", rates.validDays + " days"]
      ]
    );
  }

  function fillExamples() {
    var el = byId("sheet-examples");
    if (!el) return;
    var html = "";
    rates.examples.forEach(function (ex) {
      var quote = pricing.calculate(ex);
      html += '<article class="sheet-example">';
      html += "<h3>" + ex.name + "</h3>";
      html += '<p class="sheet-example-price">' + pricing.money(quote.total);
      html += " <span>deposit " + pricing.money(quote.deposit) + "</span></p>";
      html += "<ul>";
      quote.lines.forEach(function (line) {
        html += "<li>" + line.label + " — " + pricing.money(line.amount) + "</li>";
      });
      html += "</ul></article>";
    });
    el.innerHTML = html;
  }

  function fillLists() {
    var inc = byId("sheet-included");
    var exc = byId("sheet-excluded");
    if (inc) inc.innerHTML = rates.included.map(function (s) { return "<li>" + s + "</li>"; }).join("");
    if (exc) exc.innerHTML = rates.excluded.map(function (s) { return "<li>" + s + "</li>"; }).join("");
  }

  fillProducts();
  fillAddons();
  fillTerms();
  fillExamples();
  fillLists();

  var printBtn = document.querySelector("[data-print]");
  if (printBtn) printBtn.addEventListener("click", function () { window.print(); });
})();

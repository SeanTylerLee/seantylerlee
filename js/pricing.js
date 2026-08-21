/**
 * STL Apps LLC rate card.
 * Source: Desktop "STLAppsLLC Pricing Sheet.numbers"
 * The public quote page and the internal pricing sheet both read this file.
 */
(function (root) {
  "use strict";

  var RATES = {
    email: "seantylerlee@icloud.com",
    source: "STLAppsLLC Pricing Sheet",
    deposit: 0.5,
    validDays: 14,
    website: {
      firstPage: 150,
      extraPage: 25
    },
    products: {
      website: {
        id: "website",
        label: "Website",
        blurb: "First page $150, then $25 per extra page.",
        kind: "site"
      },
      webapp: {
        id: "webapp",
        label: "Web app",
        blurb: "A product in the browser.",
        base: 200,
        kind: "web"
      },
      ios: {
        id: "ios",
        label: "iOS app",
        blurb: "Build an Apple app.",
        base: 3000,
        kind: "mobile"
      },
      android: {
        id: "android",
        label: "Android app",
        blurb: "Build an Android app.",
        base: 3000,
        kind: "mobile"
      }
    },
    addons: {
      accounts: { id: "accounts", label: "Backend user login", price: 500 },
      payments: { id: "payments", label: "Payments", price: 500 },
      admin: { id: "admin", label: "Admin / back office", price: 200 },
      adminApi: {
        id: "adminApi",
        label: "Admin back office with APIs",
        price: 250,
        replaces: "admin",
        blurb: "Use this instead of Admin / back office when APIs are included. If both are selected, only this line is charged."
      },
      maps: { id: "maps", label: "Maps or GPS", price: 250 },
      push: { id: "push", label: "Push notifications", price: 100 },
      offline: { id: "offline", label: "Works offline", price: 250 },
      storeIos: { id: "storeIos", label: "List on Apple App Store", price: 200, needs: "ios" },
      storeAndroid: { id: "storeAndroid", label: "List on Google Play Store", price: 300, needs: "android" }
    },
    included: [
      "The line items you pick, at the rates on the STL Apps LLC pricing sheet",
      "Source code delivered to you — you own the finished product",
      "A staging build to review before launch"
    ],
    excluded: [
      "Apple Developer Program and Google Play Console fees",
      "Third-party APIs, SMS, maps, or payment processing fees",
      "Ongoing hosting after launch (can be quoted monthly)",
      "Work that is not on a selected line item"
    ],
    examples: [
      {
        name: "Five-page website",
        products: ["website"],
        pages: 5,
        addons: []
      },
      {
        name: "iOS + Android, listed on both stores",
        products: ["ios", "android"],
        addons: ["storeIos", "storeAndroid"]
      },
      {
        name: "Web app with login, payments, and admin APIs",
        products: ["webapp"],
        addons: ["accounts", "payments", "adminApi"]
      }
    ]
  };

  function money(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) x = 0;
    return x.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }

  function asList(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(Boolean);
    return [v];
  }

  function pageCount(input) {
    var n = parseInt(input && input.pages, 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > 200) n = 200;
    return n;
  }

  function calculate(input) {
    input = input || {};
    var selected = asList(input.products).filter(function (id) { return RATES.products[id]; });
    var addons = asList(input.addons);
    var pages = pageCount(input);
    var lines = [];
    var skip = {};

    if (addons.indexOf("adminApi") !== -1 && addons.indexOf("admin") !== -1) {
      skip.admin = true;
    }

    if (selected.indexOf("website") !== -1) {
      lines.push({
        kind: "product",
        id: "website",
        label: "Website · first page",
        note: "",
        amount: RATES.website.firstPage
      });
      if (pages > 1) {
        lines.push({
          kind: "product",
          id: "websitePages",
          label: "Additional website pages × " + (pages - 1),
          note: money(RATES.website.extraPage) + " per page",
          amount: RATES.website.extraPage * (pages - 1)
        });
      }
    }

    selected.forEach(function (id) {
      if (id === "website") return;
      var product = RATES.products[id];
      lines.push({
        kind: "product",
        id: id,
        label: product.label,
        note: "",
        amount: product.base
      });
    });

    addons.forEach(function (id) {
      var addon = RATES.addons[id];
      if (!addon) return;
      if (skip[id]) return;
      if (addon.needs && selected.indexOf(addon.needs) === -1) return;
      lines.push({
        kind: "addon",
        id: addon.id,
        label: addon.label,
        note: skip.admin && id === "adminApi" ? "Replaces Admin / back office" : "",
        amount: addon.price
      });
    });

    var total = lines.reduce(function (sum, line) { return sum + line.amount; }, 0);

    return {
      ok: selected.length > 0,
      products: selected,
      pages: pages,
      lines: lines,
      total: total,
      deposit: Math.round(total * RATES.deposit),
      validDays: RATES.validDays
    };
  }

  function summaryText(quote, extra) {
    extra = extra || {};
    var lines = [];
    lines.push("STL Apps LLC automatic quote");
    lines.push("");
    if (extra.name) lines.push("Name: " + extra.name);
    if (extra.company) lines.push("Company: " + extra.company);
    if (extra.email) lines.push("Email: " + extra.email);
    if (extra.about) {
      lines.push("");
      lines.push("What they want to build:");
      lines.push(extra.about);
    }
    if (quote.ok) {
      lines.push("");
      lines.push("Total: " + money(quote.total));
      lines.push("Deposit to start (50%): " + money(quote.deposit));
      lines.push("Good for " + quote.validDays + " days");
      lines.push("");
      lines.push("Line items:");
      quote.lines.forEach(function (line) {
        var row = "- " + line.label + ": " + money(line.amount);
        if (line.note) row += " (" + line.note + ")";
        lines.push(row);
      });
    }
    lines.push("");
    lines.push("This is an estimate from the STL Apps LLC pricing sheet, not a contract. Scope is confirmed in a written agreement before work starts.");
    return lines.join("\n");
  }

  var api = {
    RATES: RATES,
    calculate: calculate,
    money: money,
    summaryText: summaryText
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  root.STLPricing = api;
})(typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : this);

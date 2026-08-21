(function () {
  "use strict";

  var pricing = window.STLPricing;
  if (!pricing) return;

  var form = document.querySelector("[data-quote-form]");
  var estimateEl = document.querySelector("[data-quote-estimate]");
  var actionsEl = document.querySelector("[data-quote-actions]");
  var statusEl = document.querySelector("[data-quote-status]");
  var saveBtn = document.querySelector("[data-save-quote]");
  var interestedBtn = document.querySelector("[data-interested]");
  if (!form || !estimateEl) return;

  var rates = pricing.RATES;
  var pagesWrap = form.querySelector("[data-pages-wrap]");
  var busy = false;
  var TO = rates.email || "seantylerlee@icloud.com";
  var NOTES = "This quote is an estimate, not a contract. Prices are good through the valid-until date. Work starts after a signed agreement and the deposit clears. Anything not listed is out of scope.";

  function checkedValues(name) {
    return Array.prototype.map.call(form.querySelectorAll('input[name="' + name + '"]:checked'), function (el) {
      return el.value;
    });
  }

  function readInput() {
    return {
      products: checkedValues("product"),
      addons: checkedValues("addon"),
      pages: form.elements.pages ? form.elements.pages.value : 1,
      name: (form.elements.name && form.elements.name.value) || "",
      company: (form.elements.company && form.elements.company.value) || "",
      email: (form.elements.email && form.elements.email.value) || "",
      about: (form.elements.about && form.elements.about.value) || ""
    };
  }

  function nextQuoteNumber() {
    var now = new Date();
    var stamp =
      now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") +
      "-" +
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0");
    return "QTE-WEB-" + stamp;
  }

  function quoteDoc(input, quote, intent) {
    var pdf = window.STLQuotePdf;
    var date = pdf.todayISO();
    var days = quote.validDays || 14;
    var clientName = String(input.name || input.company || "").trim() || "Website visitor";
    var project = String(input.about || input.company || "").trim().replace(/\s+/g, " ").slice(0, 120);
    var items = quote.lines.map(function (line, i) {
      var desc = line.label;
      if (line.note) desc += " — " + line.note;
      return { n: i + 1, desc: desc, qty: 1, rate: line.amount, amount: line.amount };
    });
    return {
      quoteNumber: nextQuoteNumber(),
      quoteDate: date,
      validDays: String(days),
      validUntil: pdf.addDays(date, days),
      projectName: project,
      fromName: "STL Apps LLC",
      fromContact: "Sean Tyler Lee",
      fromEmail: TO,
      fromPhone: "",
      fromWebsite: "seantylerlee.com",
      clientName: clientName,
      clientEmail: String(input.email || "").trim(),
      clientPhone: "",
      clientAddress: "",
      items: items,
      subtotal: quote.total,
      discountType: "none",
      discountValue: 0,
      discount: 0,
      taxPercent: 0,
      tax: 0,
      total: quote.total,
      depositPercent: 50,
      deposit: quote.deposit,
      hourlyRate: 150,
      notes: NOTES,
      intent: intent
    };
  }

  function syncLocks() {
    var products = checkedValues("product");
    if (pagesWrap) pagesWrap.hidden = products.indexOf("website") === -1;

    Array.prototype.forEach.call(form.querySelectorAll('input[name="addon"]'), function (input) {
      var addon = rates.addons[input.value];
      if (!addon) return;
      var wrap = input.closest(".q-card");
      var locked = false;
      var reason = "";
      if (addon.needs && products.indexOf(addon.needs) === -1) {
        locked = true;
        reason = "Pick " + (rates.products[addon.needs] || {}).label + " first";
      }
      input.disabled = locked;
      if (locked) input.checked = false;
      if (wrap) {
        wrap.classList.toggle("is-locked", locked);
        wrap.title = locked ? reason : "";
      }
    });
    Array.prototype.forEach.call(form.querySelectorAll(".q-card"), function (card) {
      var input = card.querySelector("input");
      card.classList.toggle("is-on", !!(input && input.checked && !input.disabled));
    });
  }

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("is-error", kind === "error");
    statusEl.classList.toggle("is-ok", kind === "ok");
  }

  function renderEstimate() {
    if (busy) return;
    syncLocks();
    var input = readInput();
    var quote = pricing.calculate(input);
    var html = "";

    if (!quote.ok) {
      html += '<p class="q-est-empty">Pick what you want to build to see a price.</p>';
      estimateEl.innerHTML = html;
      if (actionsEl) actionsEl.hidden = true;
      return;
    }

    html += '<p class="q-est-label">Estimate</p>';
    html += '<p class="q-est-range">' + pricing.money(quote.total) + "</p>";
    html += '<ul class="q-est-meta">';
    html += "<li>" + pricing.money(quote.deposit) + " deposit to start</li>";
    html += "<li>Good for " + quote.validDays + " days</li>";
    html += "</ul>";
    html += '<ul class="q-est-lines">';
    quote.lines.forEach(function (line) {
      html += "<li><span>" + escapeHtml(line.label);
      if (line.note) html += "<small>" + escapeHtml(line.note) + "</small>";
      html += "</span><strong>" + pricing.money(line.amount) + "</strong></li>";
    });
    html += "</ul>";
    html += '<p class="q-est-note">This is an automatic estimate from the STL Apps LLC pricing sheet, not a contract. Scope is confirmed in a written agreement before work starts. You own the finished product.</p>';

    estimateEl.innerHTML = html;
    if (actionsEl) actionsEl.hidden = false;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function emailBody(d, intent) {
    var lines = [];
    lines.push(intent === "interested" ? "I'm interested in this quote." : "A quote was saved from seantylerlee.com/quote.html.");
    lines.push("");
    lines.push("Quote: " + d.quoteNumber);
    lines.push("Name: " + (d.clientName || "—"));
    lines.push("Email: " + (d.clientEmail || "—"));
    if (d.projectName) {
      lines.push("");
      lines.push("Project:");
      lines.push(d.projectName);
    }
    lines.push("");
    lines.push("Quoted total: " + window.STLQuotePdf.money(d.total));
    lines.push("Deposit to start: " + window.STLQuotePdf.money(d.deposit));
    lines.push("Valid until: " + d.validUntil);
    lines.push("");
    lines.push("Line items:");
    d.items.forEach(function (item) {
      lines.push("- " + item.desc + ": " + window.STLQuotePdf.money(item.amount));
    });
    return lines.join("\n");
  }

  function mailtoFallback(d, intent) {
    var subject = (intent === "interested" ? "I'm interested — " : "Quote saved — ") + d.quoteNumber;
    window.location.href = "mailto:" + encodeURIComponent(TO) +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(emailBody(d, intent).slice(0, 1800));
  }

  function sendEmail(d, blob, filename, intent) {
    var fd = new FormData();
    fd.append("_subject", (intent === "interested" ? "I'm interested — " : "Quote saved — ") + d.quoteNumber);
    fd.append("_template", "table");
    fd.append("_captcha", "false");
    fd.append("intent", intent === "interested" ? "I'm interested" : "Save quote");
    fd.append("quoteNumber", d.quoteNumber);
    fd.append("name", d.clientName);
    fd.append("email", d.clientEmail || TO);
    fd.append("company", readInput().company || "");
    fd.append("quotedTotal", window.STLQuotePdf.money(d.total));
    fd.append("deposit", window.STLQuotePdf.money(d.deposit));
    fd.append("validUntil", d.validUntil);
    fd.append("message", emailBody(d, intent));
    fd.append("attachment", blob, filename);

    return fetch("https://formsubmit.co/ajax/" + encodeURIComponent(TO), {
      method: "POST",
      body: fd,
      headers: { Accept: "application/json" }
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || data.success === "false" || data.success === false) {
          throw new Error(data.message || "send failed");
        }
        return data;
      }, function () {
        if (!res.ok) throw new Error("send failed");
        return {};
      });
    });
  }

  async function handleAction(intent) {
    if (busy) return;
    var input = readInput();
    var quote = pricing.calculate(input);
    if (!quote.ok) {
      setStatus("Pick what you want to build first.", "error");
      return;
    }
    if (intent === "interested") {
      if (!String(input.email || "").trim()) {
        setStatus("Add your email so we can reply.", "error");
        if (form.elements.email) form.elements.email.focus();
        return;
      }
      if (!String(input.name || input.company || "").trim()) {
        setStatus("Add your name or company.", "error");
        if (form.elements.name) form.elements.name.focus();
        return;
      }
    }
    if (!window.STLQuotePdf) {
      setStatus("PDF tools failed to load. Refresh and try again.", "error");
      return;
    }

    busy = true;
    if (saveBtn) saveBtn.disabled = true;
    if (interestedBtn) interestedBtn.disabled = true;
    setStatus("Building your quote PDF…", "");

    try {
      var d = quoteDoc(input, quote, intent);
      var built = await window.STLQuotePdf.build(d);
      window.STLQuotePdf.download(built.blob, built.filename);
      setStatus("Sending a copy to STL Apps LLC…", "");
      try {
        await sendEmail(d, built.blob, built.filename, intent);
        setStatus(
          intent === "interested"
            ? "Quote downloaded and sent. We’ll be in touch."
            : "Quote downloaded and a copy was sent to STL Apps LLC.",
          "ok"
        );
      } catch (sendErr) {
        mailtoFallback(d, intent);
        setStatus("Quote downloaded. Finish sending the email that just opened so we get a copy.", "ok");
      }
    } catch (e) {
      setStatus(e && e.message ? e.message : "Could not build the PDF. Try a current desktop browser.", "error");
    } finally {
      busy = false;
      if (saveBtn) saveBtn.disabled = false;
      if (interestedBtn) interestedBtn.disabled = false;
    }
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); });
  form.addEventListener("change", renderEstimate);
  form.addEventListener("input", function (e) {
    var name = e.target && e.target.name;
    if (name === "pages" || name === "about" || name === "name" || name === "company" || name === "email") {
      renderEstimate();
    }
  });

  if (saveBtn) saveBtn.addEventListener("click", function () { handleAction("save"); });
  if (interestedBtn) interestedBtn.addEventListener("click", function () { handleAction("interested"); });

  renderEstimate();
})();

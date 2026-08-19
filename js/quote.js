(function () {
  "use strict";

  var STORAGE_KEY = "stl-quote-draft-v1";
  var SEQ_KEY = "stl-quote-seq-v1";
  var LOGO_SRC = "images/stlapps-logo.jpg";

  var root = document.querySelector("[data-quote-root]");
  var chrome = document.querySelector("[data-quote-chrome]");
  if (!root) return;

  function el(name) {
    return root.querySelector('[data-el="' + name + '"]') ||
      (chrome && chrome.querySelector('[data-el="' + name + '"]'));
  }

  var form = el("form");
  var itemsEl = el("items");
  var totalsEl = el("totals");
  var previewEl = el("preview");
  var errorEl = el("error");
  var addItemBtn = el("add-item");
  var downloadBtn = el("download");
  var resetBtn = el("reset");
  var loadPdfBtn = el("load-pdf");
  var pdfFileInput = el("pdf-file");
  var okEl = el("ok");
  var validDaysSelect = form ? form.elements.validDays : null;
  var quoteDateInput = form ? form.elements.quoteDate : null;
  var validUntilInput = form ? form.elements.validUntil : null;

  if (!form || !itemsEl || !previewEl) return;

  var logoDataUrl = null;
  var keepStatus = false;

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function addDays(iso, days) {
    if (!iso) return "";
    var d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function money(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) x = 0;
    return x.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function text(v) {
    return String(v == null ? "" : v).trim();
  }

  function formatDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  function slug(s) {
    return text(s).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "client";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function nl2br(s) {
    return escapeHtml(s).replace(/\n/g, "<br />");
  }

  function nextNumber() {
    var y = new Date().getFullYear();
    var seq = 1;
    try {
      var raw = JSON.parse(localStorage.getItem(SEQ_KEY) || "null");
      if (raw && Number(raw.year) === y) seq = Number(raw.seq) || 1;
    } catch (e) {}
    return "QTE-" + y + "-" + String(seq).padStart(4, "0");
  }

  function rememberNumber(number) {
    var m = /^QTE-(\d{4})-(\d+)$/i.exec(text(number));
    if (!m) return;
    var year = Number(m[1]);
    var next = Number(m[2]) + 1;
    try {
      var raw = JSON.parse(localStorage.getItem(SEQ_KEY) || "null");
      if (raw && Number(raw.year) === year && Number(raw.seq) > next) next = Number(raw.seq);
      localStorage.setItem(SEQ_KEY, JSON.stringify({ year: year, seq: next }));
    } catch (e) {}
  }

  function validFromDays(quoteDate, days) {
    if (days === "custom") return "";
    var n = parseInt(days, 10);
    if (!n) n = 14;
    return addDays(quoteDate, n);
  }

  function addItemRow(desc, qty, rate) {
    var row = document.createElement("div");
    row.className = "invoice-item-row";
    row.innerHTML =
      '<input class="item-desc" type="text" placeholder="e.g., Custom website homepage" />' +
      '<input class="item-qty" type="number" min="0" step="0.01" placeholder="1" />' +
      '<input class="item-rate" type="number" min="0" step="0.01" placeholder="0.00" />' +
      '<span class="item-amount">$0.00</span>' +
      '<button class="item-remove" type="button" aria-label="Remove line item">&times;</button>';
    if (desc) row.querySelector(".item-desc").value = desc;
    if (qty != null && qty !== "") row.querySelector(".item-qty").value = qty;
    else row.querySelector(".item-qty").value = "1";
    if (rate != null && rate !== "") row.querySelector(".item-rate").value = rate;
    row.querySelector(".item-remove").addEventListener("click", function () {
      if (itemsEl.querySelectorAll(".invoice-item-row").length <= 1) {
        row.querySelector(".item-desc").value = "";
        row.querySelector(".item-qty").value = "1";
        row.querySelector(".item-rate").value = "";
      } else {
        row.remove();
      }
      refresh();
    });
    row.querySelector(".item-desc").addEventListener("input", refresh);
    row.querySelector(".item-qty").addEventListener("input", refresh);
    row.querySelector(".item-rate").addEventListener("input", refresh);
    itemsEl.appendChild(row);
  }

  function collectItems() {
    return Array.prototype.map.call(itemsEl.querySelectorAll(".invoice-item-row"), function (row) {
      var qty = Number(row.querySelector(".item-qty").value);
      if (!Number.isFinite(qty) || qty < 0) qty = 0;
      var rate = round2(row.querySelector(".item-rate").value);
      return {
        desc: text(row.querySelector(".item-desc").value),
        qty: qty,
        rate: rate,
        amount: round2(qty * rate)
      };
    }).filter(function (item) {
      return item.desc || item.rate;
    }).map(function (item, i) {
      item.n = i + 1;
      return item;
    });
  }

  function collect() {
    var items = collectItems();
    var subtotal = round2(items.reduce(function (sum, item) { return sum + item.amount; }, 0));
    var discountType = form.discountType.value || "none";
    var discountValue = round2(form.discountValue.value);
    if (discountValue < 0) discountValue = 0;
    var discount = 0;
    if (discountType === "percent") {
      if (discountValue > 100) discountValue = 100;
      discount = round2(subtotal * (discountValue / 100));
    } else if (discountType === "amount") {
      discount = Math.min(discountValue, subtotal);
    }
    var taxable = round2(Math.max(0, subtotal - discount));
    var taxPercent = Number(form.taxPercent.value);
    if (!Number.isFinite(taxPercent) || taxPercent < 0) taxPercent = 0;
    if (taxPercent > 100) taxPercent = 100;
    var tax = round2(taxable * (taxPercent / 100));
    var total = round2(taxable + tax);
    var depositPercent = Number(form.depositPercent.value);
    if (!Number.isFinite(depositPercent) || depositPercent < 0) depositPercent = 0;
    if (depositPercent > 100) depositPercent = 100;
    var deposit = round2(total * (depositPercent / 100));
    var validDays = form.validDays.value || "14";
    var quoteDate = form.quoteDate.value;
    var validUntil = form.validUntil.value;
    if (validDays !== "custom") validUntil = validFromDays(quoteDate, validDays) || validUntil;

    return {
      quoteNumber: text(form.quoteNumber.value) || nextNumber(),
      quoteDate: quoteDate,
      validDays: validDays,
      validUntil: validUntil,
      projectName: text(form.projectName.value),
      fromName: text(form.fromName.value) || "STL Apps LLC",
      fromContact: text(form.fromContact.value) || "Sean Tyler Lee",
      fromEmail: text(form.fromEmail.value) || "seantylerlee@icloud.com",
      fromPhone: text(form.fromPhone.value),
      fromWebsite: text(form.fromWebsite.value) || "seantylerlee.com",
      clientName: text(form.clientName.value),
      clientEmail: text(form.clientEmail.value),
      clientPhone: text(form.clientPhone.value),
      clientAddress: text(form.clientAddress.value),
      items: items,
      subtotal: subtotal,
      discountType: discountType,
      discountValue: discountValue,
      discount: discount,
      taxPercent: taxPercent,
      tax: tax,
      total: total,
      depositPercent: depositPercent,
      deposit: deposit,
      hourlyRate: round2(form.hourlyRate.value || 150),
      notes: text(form.notes.value)
    };
  }

  function validate(d) {
    if (!d.quoteNumber) return "Enter a quote number.";
    if (!d.quoteDate) return "Set a quote date.";
    if (!d.clientName) return "Enter the client name.";
    if (!d.items.length) return "Add at least one line item.";
    if (d.items.some(function (item) { return !item.desc; })) return "Every line item needs a description.";
    if (d.total <= 0) return "Add a quantity and rate to at least one line item.";
    return "";
  }

  function fromLines(d) {
    var lines = [d.fromName];
    if (d.fromContact) lines.push(d.fromContact);
    if (d.fromEmail) lines.push(d.fromEmail);
    if (d.fromPhone) lines.push(d.fromPhone);
    if (d.fromWebsite) lines.push(d.fromWebsite);
    return lines;
  }

  function clientLines(d) {
    var lines = [d.clientName || "[Client name]"];
    if (d.clientAddress) {
      d.clientAddress.split(/\n+/).forEach(function (line) {
        if (text(line)) lines.push(text(line));
      });
    }
    if (d.clientEmail) lines.push(d.clientEmail);
    if (d.clientPhone) lines.push(d.clientPhone);
    return lines;
  }

  function discountLabel(d) {
    if (d.discountType === "percent") return "Discount (" + d.discountValue + "%)";
    return "Discount";
  }

  function validDaysLabel(days) {
    if (days === "7") return "7 days";
    if (days === "30") return "30 days";
    if (days === "custom") return "Custom";
    return "14 days";
  }

  function snapshotDraft() {
    var raw = { values: {}, items: collectItems() };
    Array.prototype.forEach.call(form.elements, function (field) {
      if (field.name) raw.values[field.name] = field.value;
    });
    return raw;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotDraft()));
    } catch (e) {}
  }

  function applyDefaults() {
    form.fromName.value = "STL Apps LLC";
    form.fromContact.value = "Sean Tyler Lee";
    form.fromEmail.value = "seantylerlee@icloud.com";
    form.fromWebsite.value = "seantylerlee.com";
    form.validDays.value = "14";
    form.discountType.value = "none";
    form.discountValue.value = "0";
    form.taxPercent.value = "0";
    form.depositPercent.value = "50";
    form.hourlyRate.value = "150";
    form.quoteDate.value = todayISO();
    form.validUntil.value = addDays(form.quoteDate.value, 14);
    form.quoteNumber.value = nextNumber();
    form.notes.value = "This quote is an estimate, not a contract. Prices are good through the valid-until date. Work starts after a signed agreement and the deposit clears. Anything not listed is out of scope.";
  }

  function applyDraft(raw) {
    if (!raw || !raw.values) return;
    Object.keys(raw.values).forEach(function (name) {
      if (form.elements[name]) form.elements[name].value = raw.values[name];
    });
    itemsEl.innerHTML = "";
    if (raw.items && raw.items.length) {
      raw.items.forEach(function (item) {
        addItemRow(item.desc, item.qty, item.rate);
      });
    } else {
      addItemRow();
      addItemRow();
    }
    if (!form.quoteDate.value) form.quoteDate.value = todayISO();
    if (!form.quoteNumber.value) form.quoteNumber.value = nextNumber();
    if (form.validDays.value !== "custom") {
      var due = validFromDays(form.quoteDate.value, form.validDays.value);
      if (due) form.validUntil.value = due;
    }
  }

  function restore() {
    var raw;
    try {
      raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (e) {
      raw = null;
    }
    if (!raw || !raw.values) {
      addItemRow();
      addItemRow();
      applyDefaults();
      return;
    }
    applyDraft(raw);
  }

  function renderItemAmounts() {
    Array.prototype.forEach.call(itemsEl.querySelectorAll(".invoice-item-row"), function (row) {
      var elAmt = row.querySelector(".item-amount");
      if (!elAmt) return;
      var qty = Number(row.querySelector(".item-qty").value);
      if (!Number.isFinite(qty) || qty < 0) qty = 0;
      elAmt.textContent = money(round2(qty * round2(row.querySelector(".item-rate").value)));
    });
  }

  function renderTotals(d) {
    var html =
      "<div><span>Subtotal</span><span>" + money(d.subtotal) + "</span></div>";
    if (d.discount > 0) html += "<div><span>" + escapeHtml(discountLabel(d)) + "</span><span>−" + money(d.discount) + "</span></div>";
    if (d.tax > 0) html += "<div><span>Tax (" + d.taxPercent + "%)</span><span>" + money(d.tax) + "</span></div>";
    html += "<div class=\"grand\"><span>Quoted total</span><span>" + money(d.total) + "</span></div>";
    if (d.deposit > 0) html += "<div><span>Deposit if they accept (" + d.depositPercent + "%)</span><span>" + money(d.deposit) + "</span></div>";
    totalsEl.innerHTML = html;
  }

  function renderPreview(d) {
    var items = d.items.length ? d.items : [{ n: 1, desc: "[Add a line item]", qty: 0, rate: 0, amount: 0 }];
    var html = "";
    html += '<div class="invoice-top">';
    html += '<div class="invoice-from-brand">';
    html += '<img src="' + LOGO_SRC + '" alt="STL Apps LLC" width="180" height="41" />';
    html += fromLines(d).map(function (line) { return "<p>" + nl2br(line) + "</p>"; }).join("");
    html += "</div>";
    html += '<div class="invoice-wordmark">';
    html += "<strong>QUOTE</strong>";
    html += '<span class="invoice-status invoice-status-partial">Estimate</span>';
    html += '<table class="invoice-meta"><tbody>';
    html += "<tr><th>Quote</th><td>" + escapeHtml(d.quoteNumber) + "</td></tr>";
    html += "<tr><th>Date</th><td>" + escapeHtml(formatDate(d.quoteDate)) + "</td></tr>";
    html += "<tr><th>Valid</th><td>" + escapeHtml(validDaysLabel(d.validDays)) + "</td></tr>";
    html += "<tr><th>Until</th><td>" + escapeHtml(formatDate(d.validUntil)) + "</td></tr>";
    html += "</tbody></table></div></div>";

    html += '<div class="invoice-billto"><div><h3>Prepared for</h3>';
    html += clientLines(d).map(function (line) { return "<p>" + nl2br(line) + "</p>"; }).join("");
    html += "</div></div>";

    if (d.projectName) {
      html += '<p class="invoice-project">Project: ' + escapeHtml(d.projectName) + "</p>";
    }

    html += '<table class="invoice-lines"><thead><tr>' +
      '<th class="num">#</th><th>Description</th><th class="qty">Qty</th>' +
      '<th class="rate">Rate</th><th class="amt">Amount</th>' +
      "</tr></thead><tbody>";
    items.forEach(function (item) {
      html += "<tr><td class=\"num\">" + item.n + "</td><td>" + escapeHtml(item.desc || "") +
        "</td><td class=\"qty\">" + item.qty + "</td><td class=\"rate\">" + money(item.rate) +
        "</td><td class=\"amt\">" + money(item.amount) + "</td></tr>";
    });
    html += "</tbody></table>";

    html += '<div class="invoice-bottom"><div class="invoice-notes">';
    if (d.notes) html += "<h3>Terms</h3><p>" + nl2br(d.notes) + "</p>";
    if (d.hourlyRate > 0) {
      html += "<p>Out-of-scope work, if accepted later, is billed at " + money(d.hourlyRate) + " per hour.</p>";
    }
    html += "</div>";
    html += '<table class="invoice-sum"><tbody>';
    html += "<tr><th>Subtotal</th><td>" + money(d.subtotal) + "</td></tr>";
    if (d.discount > 0) html += "<tr><th>" + escapeHtml(discountLabel(d)) + "</th><td>−" + money(d.discount) + "</td></tr>";
    if (d.tax > 0) html += "<tr><th>Tax (" + d.taxPercent + "%)</th><td>" + money(d.tax) + "</td></tr>";
    if (d.deposit > 0) html += "<tr><th>Deposit to start</th><td>" + money(d.deposit) + "</td></tr>";
    html += '<tr class="grand"><th>Quoted total</th><td>' + money(d.total) + "</td></tr>";
    html += "</tbody></table>";
    html += '<div class="invoice-due"><span>Quoted total</span><strong>' + money(d.total) + "</strong></div></div>";
    previewEl.innerHTML = html;
  }

  function refresh() {
    var d = collect();
    if (validDaysSelect && validDaysSelect.value !== "custom") {
      var until = validFromDays(d.quoteDate, d.validDays);
      if (until && validUntilInput.value !== until) validUntilInput.value = until;
    }
    renderItemAmounts();
    renderTotals(d);
    renderPreview(d);
    persist();
    if (!keepStatus) {
      errorEl.classList.remove("is-on");
      errorEl.textContent = "";
      if (okEl) {
        okEl.classList.remove("is-on");
        okEl.textContent = "";
      }
    }
  }

  function showError(msg) {
    if (okEl) {
      okEl.classList.remove("is-on");
      okEl.textContent = "";
    }
    errorEl.textContent = msg;
    errorEl.classList.add("is-on");
    errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function showOk(msg) {
    errorEl.classList.remove("is-on");
    errorEl.textContent = "";
    if (!okEl) return;
    okEl.textContent = msg;
    okEl.classList.add("is-on");
  }

  function loadLogo() {
    return new Promise(function (resolve) {
      if (logoDataUrl) {
        resolve(logoDataUrl);
        return;
      }
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        logoDataUrl = canvas.toDataURL("image/jpeg", 0.92);
        resolve(logoDataUrl);
      };
      img.onerror = function () { resolve(null); };
      img.src = LOGO_SRC;
    });
  }

  function latin1FromBytes(bytes) {
    var out = "";
    var i;
    for (i = 0; i < bytes.length; i += 16384) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + 16384)));
    }
    return out;
  }

  function b64ToUtf8(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    var i;
    for (i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    var i;
    for (i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function extractPayload(bytes, marker) {
    var s = latin1FromBytes(bytes);
    var re = new RegExp("%%" + marker + "%%([A-Za-z0-9+/=]+)%%END-" + marker + "%%");
    var m = re.exec(s);
    if (!m) return null;
    try {
      return JSON.parse(b64ToUtf8(m[1]));
    } catch (e) {
      return null;
    }
  }

  function appendPayload(arrayBuffer, marker, b64) {
    var extra = new TextEncoder().encode("\n%%" + marker + "%%" + b64 + "%%END-" + marker + "%%\n");
    var src = new Uint8Array(arrayBuffer);
    var out = new Uint8Array(src.length + extra.length);
    out.set(src, 0);
    out.set(extra, src.length);
    return out;
  }

  function savePdfBytes(bytes, filename) {
    var blob = new Blob([bytes], { type: "application/pdf" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function draftFromInvoice(data) {
    var values = data.values || {};
    return {
      values: {
        quoteNumber: nextNumber(),
        quoteDate: todayISO(),
        validDays: "14",
        validUntil: addDays(todayISO(), 14),
        projectName: values.projectName || "",
        fromName: values.fromName || "STL Apps LLC",
        fromContact: values.fromContact || "Sean Tyler Lee",
        fromEmail: values.fromEmail || "seantylerlee@icloud.com",
        fromPhone: values.fromPhone || "",
        fromWebsite: values.fromWebsite || "seantylerlee.com",
        clientName: values.clientName || "",
        clientEmail: values.clientEmail || "",
        clientPhone: values.clientPhone || "",
        clientAddress: values.clientAddress || "",
        discountType: values.discountType || "none",
        discountValue: values.discountValue || "0",
        taxPercent: values.taxPercent || "0",
        depositPercent: "50",
        hourlyRate: values.hourlyRate || "150",
        notes: form.notes.defaultValue || ""
      },
      items: data.items || []
    };
  }

  async function handlePdfFile(file) {
    if (!file) return;
    try {
      var buf = await file.arrayBuffer();
      var bytes = new Uint8Array(buf);
      var quote = extractPayload(bytes, "STL-QTE-1");
      var invoice = extractPayload(bytes, "STL-INV-1");
      var draft = null;
      if (quote && quote.v === 1 && quote.values) draft = { values: quote.values, items: quote.items || [] };
      else if (invoice && invoice.v === 1 && invoice.values) draft = draftFromInvoice(invoice);
      if (!draft) {
        showError("Couldn't read this PDF. Load a quote or invoice downloaded from this page.");
        return;
      }
      keepStatus = true;
      applyDraft(draft);
      refresh();
      keepStatus = false;
      showOk("Loaded " + (form.quoteNumber.value || "the PDF") + ". Review the numbers, then download the quote.");
    } catch (e) {
      showError("Couldn't read that PDF.");
    } finally {
      if (pdfFileInput) pdfFileInput.value = "";
    }
  }

  function PdfWriter(doc, logo) {
    this.doc = doc;
    this.logo = logo;
    this.pageW = 612;
    this.pageH = 792;
    this.mL = 50;
    this.mR = 50;
    this.mB = 50;
    this.top = 88;
    this.y = this.top;
    this.maxW = this.pageW - this.mL - this.mR;
    this.navy = [0, 24, 72];
    this.blue = [0, 112, 248];
    this.ink = [26, 35, 54];
    this.muted = [80, 92, 118];
    this.line = [213, 227, 251];
    this.ice = [244, 248, 255];
  }

  PdfWriter.prototype.drawChrome = function (d) {
    var doc = this.doc;
    var pages = doc.getNumberOfPages();
    var i;
    for (i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      doc.setFillColor(this.navy[0], this.navy[1], this.navy[2]);
      doc.rect(0, 0, this.pageW, 10, "F");
      if (this.logo) doc.addImage(this.logo, "JPEG", this.mL, 18, 118, 27);
      else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(this.navy[0], this.navy[1], this.navy[2]);
        doc.text(d.fromName, this.mL, 36);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(this.blue[0], this.blue[1], this.blue[2]);
      doc.text("QUOTE", this.pageW - this.mR, 28, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
      doc.text(d.quoteNumber, this.pageW - this.mR, 40, { align: "right" });
      doc.setDrawColor(this.navy[0], this.navy[1], this.navy[2]);
      doc.setLineWidth(1.15);
      doc.line(this.mL, 54, this.pageW - this.mR, 54);
      doc.setLineWidth(0.6);
      doc.line(this.mL, this.pageH - 36, this.pageW - this.mR, this.pageH - 36);
      doc.setFontSize(8);
      doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
      doc.text(d.fromName + "  ·  " + d.fromWebsite + "  ·  " + d.fromEmail, this.mL, this.pageH - 22);
      doc.text("Page " + i + " of " + pages, this.pageW - this.mR, this.pageH - 22, { align: "right" });
    }
  };

  PdfWriter.prototype.body = function (d) {
    var from = fromLines(d);
    var i;
    var y = this.y;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8.6);
    this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
    for (i = 0; i < from.length; i += 1) {
      var wrapped = this.doc.splitTextToSize(from[i], 260);
      this.doc.text(wrapped, this.mL, y);
      y += wrapped.length * 11;
    }

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9);
    this.doc.setTextColor(this.blue[0], this.blue[1], this.blue[2]);
    this.doc.text("ESTIMATE", this.pageW - this.mR, this.y + 2, { align: "right" });

    var meta = [
      ["Quote", d.quoteNumber],
      ["Date", formatDate(d.quoteDate)],
      ["Valid", validDaysLabel(d.validDays)],
      ["Until", formatDate(d.validUntil)]
    ];
    var metaY = this.y + 18;
    for (i = 0; i < meta.length; i += 1) {
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(8.4);
      this.doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
      this.doc.text(meta[i][0], this.pageW - this.mR - 168, metaY);
      this.doc.setFont("helvetica", "normal");
      this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
      this.doc.text(meta[i][1], this.pageW - this.mR, metaY, { align: "right" });
      metaY += 13;
    }
    this.y = Math.max(y, metaY) + 16;

    var client = clientLines(d);
    var boxH = 22 + client.length * 12 + 10;
    var w = this.maxW * 0.52;
    this.doc.setFillColor(this.ice[0], this.ice[1], this.ice[2]);
    this.doc.setDrawColor(this.line[0], this.line[1], this.line[2]);
    this.doc.roundedRect(this.mL, this.y, w, boxH, 3, 3, "FD");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(7.4);
    this.doc.setTextColor(this.blue[0], this.blue[1], this.blue[2]);
    this.doc.text("PREPARED FOR", this.mL + 8, this.y + 13);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8.6);
    this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
    var yy = this.y + 26;
    for (i = 0; i < client.length; i += 1) {
      this.doc.text(this.doc.splitTextToSize(client[i], w - 16), this.mL + 8, yy);
      yy += 12;
    }
    this.y += boxH + 14;

    if (d.projectName) {
      this.doc.setFont("helvetica", "italic");
      this.doc.setFontSize(9);
      this.doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
      this.doc.text("Project: " + d.projectName, this.mL, this.y);
      this.y += 14;
    }

    var body = (d.items.length ? d.items : [{ n: 1, desc: "[Add a line item]", qty: 0, rate: 0, amount: 0 }]).map(function (item) {
      return [String(item.n), item.desc || "", String(item.qty), money(item.rate), money(item.amount)];
    });
    this.doc.autoTable({
      startY: this.y,
      head: [["#", "Description", "Qty", "Rate", "Amount"]],
      body: body,
      theme: "grid",
      tableWidth: this.maxW,
      margin: { left: this.mL, right: this.mR, top: this.top, bottom: this.mB },
      styles: { font: "helvetica", fontSize: 8.6, cellPadding: 5, lineColor: [207, 220, 240], textColor: [26, 35, 54] },
      headStyles: { fillColor: this.navy, textColor: 255, fontStyle: "bold", fontSize: 8.2 },
      columnStyles: {
        0: { cellWidth: 28, halign: "center" },
        2: { cellWidth: 48, halign: "right" },
        3: { cellWidth: 78, halign: "right" },
        4: { cellWidth: 78, halign: "right" }
      }
    });
    this.y = this.doc.lastAutoTable.finalY + 16;

    var note = d.notes || "";
    if (d.hourlyRate > 0) {
      note += (note ? "\n\n" : "") + "Out-of-scope work, if accepted later, is billed at " + money(d.hourlyRate) + " per hour.";
    }
    if (note) {
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(7.4);
      this.doc.setTextColor(this.blue[0], this.blue[1], this.blue[2]);
      this.doc.text("TERMS", this.mL, this.y);
      this.y += 12;
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8.8);
      this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
      var lines = this.doc.splitTextToSize(note, this.maxW - 230);
      this.doc.text(lines, this.mL, this.y);
    }

    var rows = [["Subtotal", money(d.subtotal)]];
    if (d.discount > 0) rows.push([discountLabel(d), "−" + money(d.discount)]);
    if (d.tax > 0) rows.push(["Tax (" + d.taxPercent + "%)", money(d.tax)]);
    if (d.deposit > 0) rows.push(["Deposit to start", money(d.deposit)]);
    rows.push(["Quoted total", money(d.total)]);
    var boxW = 220;
    var x = this.mL + this.maxW - boxW;
    var rowY = this.y;
    var r;
    for (r = 0; r < rows.length; r += 1) {
      var last = r === rows.length - 1;
      if (last) {
        this.doc.setFillColor(this.navy[0], this.navy[1], this.navy[2]);
        this.doc.roundedRect(x, rowY - 2, boxW, 22, 3, 3, "F");
        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(9.2);
        this.doc.setTextColor(255, 255, 255);
        this.doc.text("QUOTED TOTAL", x + 8, rowY + 12);
        this.doc.text(rows[r][1], x + boxW - 8, rowY + 12, { align: "right" });
      } else {
        this.doc.setFont("helvetica", "normal");
        this.doc.setFontSize(8.6);
        this.doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
        this.doc.text(rows[r][0], x + 4, rowY + 8);
        this.doc.setFont("helvetica", "bold");
        this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
        this.doc.text(rows[r][1], x + boxW - 4, rowY + 8, { align: "right" });
        rowY += 15;
      }
    }
  };

  async function downloadPdf() {
    var d = collect();
    var err = validate(d);
    if (err) {
      showError(err);
      return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showError("PDF library failed to load. Refresh and try again.");
      return;
    }
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Building PDF…";
    try {
      var logo = await loadLogo();
      var doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter", compress: true });
      doc.setProperties({
        title: "Quote " + d.quoteNumber + (d.clientName ? " — " + d.clientName : ""),
        author: d.fromName,
        subject: "Quote for " + d.clientName,
        creator: "STL Apps LLC quote"
      });
      var w = new PdfWriter(doc, logo);
      w.body(d);
      w.drawChrome(d);
      rememberNumber(d.quoteNumber);
      var payload = utf8ToB64(JSON.stringify({
        v: 1,
        values: snapshotDraft().values,
        items: d.items.map(function (item) {
          return { desc: item.desc, qty: item.qty, rate: item.rate };
        })
      }));
      savePdfBytes(
        appendPayload(doc.output("arraybuffer"), "STL-QTE-1", payload),
        "STL-Apps-LLC_Quote_" + slug(d.quoteNumber) + "_" + slug(d.clientName) + ".pdf"
      );
    } catch (e) {
      showError("Could not build the PDF. Try a current desktop browser.");
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = "Download PDF";
    }
  }

  addItemBtn.addEventListener("click", function () {
    addItemRow();
    refresh();
    var rows = itemsEl.querySelectorAll(".item-desc");
    rows[rows.length - 1].focus();
  });

  if (validDaysSelect) {
    validDaysSelect.addEventListener("change", function () {
      if (validDaysSelect.value !== "custom" && quoteDateInput) {
        var until = validFromDays(quoteDateInput.value, validDaysSelect.value);
        if (until) validUntilInput.value = until;
      }
      refresh();
    });
  }
  if (quoteDateInput) {
    quoteDateInput.addEventListener("change", function () {
      if (validDaysSelect && validDaysSelect.value !== "custom") {
        var until = validFromDays(quoteDateInput.value, validDaysSelect.value);
        if (until) validUntilInput.value = until;
      }
      refresh();
    });
  }
  if (validUntilInput) {
    validUntilInput.addEventListener("input", function () {
      form.validDays.value = "custom";
      refresh();
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    downloadPdf();
  });
  form.addEventListener("input", function (e) {
    if (e.target === validUntilInput) return;
    refresh();
  });
  downloadBtn.addEventListener("click", downloadPdf);

  resetBtn.addEventListener("click", function () {
    if (!window.confirm("Clear this quote and start over?")) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    form.reset();
    itemsEl.innerHTML = "";
    addItemRow();
    addItemRow();
    applyDefaults();
    refresh();
  });

  if (loadPdfBtn && pdfFileInput) {
    loadPdfBtn.addEventListener("click", function () { pdfFileInput.click(); });
    pdfFileInput.addEventListener("change", function () {
      if (pdfFileInput.files && pdfFileInput.files[0]) handlePdfFile(pdfFileInput.files[0]);
    });
  }

  restore();
  refresh();
})();

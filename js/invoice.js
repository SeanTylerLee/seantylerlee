(function () {
  "use strict";

  var STORAGE_KEY = "stl-invoice-draft-v1";
  var SEQ_KEY = "stl-invoice-seq-v1";
  var LOGO_SRC = "images/stlapps-logo.jpg";

  var root = document.querySelector("[data-invoice-root]") || document;
  var chrome = document.querySelector("[data-invoice-chrome]") || root;

  function invEl(name, fallbackId) {
    var found = root.querySelector('[data-el="' + name + '"]');
    if (found) return found;
    if (chrome && chrome !== root) {
      found = chrome.querySelector('[data-el="' + name + '"]');
      if (found) return found;
    }
    return document.getElementById(fallbackId || name);
  }

  var form = invEl("form", "invoice-form");
  var itemsEl = invEl("items", "items");
  var totalsEl = invEl("totals", "totals");
  var previewEl = invEl("preview", "preview");
  var errorEl = invEl("error", "form-error");
  var addItemBtn = invEl("add-item", "add-item");
  var downloadBtn = invEl("download", "download-pdf");
  var resetBtn = invEl("reset", "reset-form");
  var markPaidBtn = invEl("mark-paid", "mark-paid");
  var loadPdfBtn = invEl("load-pdf", "load-pdf");
  var pdfFileInput = invEl("pdf-file", "pdf-file");
  var okEl = invEl("ok", "form-ok");
  var termsSelect = form ? form.elements.terms : null;
  var invoiceDateInput = form ? form.elements.invoiceDate : null;
  var dueDateInput = form ? form.elements.dueDate : null;
  var appEl = root !== document ? root : document.querySelector(".contract-app");

  if (!form || !itemsEl || !previewEl) return;

  var logoDataUrl = null;
  var keepStatus = false;

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function addDays(iso, days) {
    if (!iso) return "";
    var d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + days);
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
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
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  function slug(s) {
    return text(s)
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "client";
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

  function termsLabel(value) {
    if (value === "receipt") return "Due on receipt";
    if (value === "7") return "Net 7";
    if (value === "14") return "Net 14";
    if (value === "30") return "Net 30";
    return "Custom";
  }

  function dueFromTerms(invoiceDate, terms) {
    if (terms === "receipt") return invoiceDate;
    if (terms === "7") return addDays(invoiceDate, 7);
    if (terms === "14") return addDays(invoiceDate, 14);
    if (terms === "30") return addDays(invoiceDate, 30);
    return "";
  }

  function nextInvoiceNumber() {
    var y = new Date().getFullYear();
    var seq = 1;
    try {
      var raw = JSON.parse(localStorage.getItem(SEQ_KEY) || "null");
      if (raw && Number(raw.year) === y) seq = Number(raw.seq) || 1;
    } catch (e) {}
    return "INV-" + y + "-" + String(seq).padStart(4, "0");
  }

  function rememberInvoiceNumber(number) {
    var m = /^INV-(\d{4})-(\d+)$/i.exec(text(number));
    if (!m) return;
    var year = Number(m[1]);
    var used = Number(m[2]);
    var next = used + 1;
    try {
      var raw = JSON.parse(localStorage.getItem(SEQ_KEY) || "null");
      if (raw && Number(raw.year) === year && Number(raw.seq) > next) {
        next = Number(raw.seq);
      }
      localStorage.setItem(SEQ_KEY, JSON.stringify({ year: year, seq: next }));
    } catch (e) {}
  }

  function snapshotDraft() {
    var raw = { values: {}, items: collectItems() };
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      raw.values[el.name] = el.value;
    });
    return raw;
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
    okEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    var i;
    for (i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b64ToUtf8(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    var i;
    for (i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function latin1FromBytes(bytes) {
    var out = "";
    var i;
    var n = bytes.length;
    for (i = 0; i < n; i += 16384) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(n, i + 16384)));
    }
    return out;
  }

  function extractEmbeddedDraft(bytes) {
    var s = latin1FromBytes(bytes);
    var m = /%%STL-INV-1%%([A-Za-z0-9+/=]+)%%END-STL-INV%%/.exec(s);
    if (!m) return null;
    try {
      var data = JSON.parse(b64ToUtf8(m[1]));
      if (!data || data.v !== 1 || !data.values) return null;
      return { values: data.values, items: data.items || [] };
    } catch (e) {
      return null;
    }
  }

  function appendPayload(arrayBuffer, b64) {
    var marker = "\n%%STL-INV-1%%" + b64 + "%%END-STL-INV%%\n";
    var extra = new TextEncoder().encode(marker);
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
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
  }

  function unescapePdfLiteral(s) {
    return s
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\([0-7]{1,3})/g, function (_, oct) {
        return String.fromCharCode(parseInt(oct, 8));
      })
      .replace(/\\(.)/g, "$1");
  }

  function extractLiterals(src) {
    var out = [];
    var re = /\((?:\\.|[^\\)])*\)/g;
    var m;
    while ((m = re.exec(src))) {
      var v = unescapePdfLiteral(m[0].slice(1, -1)).trim();
      if (v) out.push(v);
    }
    return out;
  }

  function findFlateStreams(bytes) {
    var s = latin1FromBytes(bytes);
    var re = /<<([\s\S]{0,800}?)>>\s*stream\r?\n/g;
    var out = [];
    var m;
    while ((m = re.exec(s))) {
      if (!/FlateDecode/.test(m[1])) continue;
      var lenM = /\/Length\s+(\d+)/.exec(m[1]);
      if (!lenM) continue;
      var start = m.index + m[0].length;
      var len = Number(lenM[1]);
      if (start + len > bytes.length) continue;
      out.push(bytes.subarray(start, start + len));
    }
    return out;
  }

  function inflateBytes(bytes) {
    if (typeof DecompressionStream === "undefined") {
      return Promise.resolve(null);
    }
    function tryFmt(fmt) {
      var ds = new DecompressionStream(fmt);
      var stream = new Blob([bytes]).stream().pipeThrough(ds);
      return new Response(stream).arrayBuffer().then(function (buf) {
        return new Uint8Array(buf);
      });
    }
    return tryFmt("deflate").catch(function () {
      return tryFmt("deflate-raw");
    }).catch(function () {
      return null;
    });
  }

  function isMoneyStr(s) {
    return /^[−–—-]?\$[\d,]+(?:\.\d{2})$/.test(s);
  }

  function parseMoneyStr(s) {
    var t = String(s).replace(/[$,\s]/g, "").replace(/^[−–—-]/, "-");
    var n = Number(t);
    return Number.isFinite(n) ? round2(n) : null;
  }

  function parseEnglishDate(s) {
    var m = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(text(s));
    var months = {
      january: "01", february: "02", march: "03", april: "04",
      may: "05", june: "06", july: "07", august: "08",
      september: "09", october: "10", november: "11", december: "12"
    };
    if (!m) return "";
    var mo = months[m[1].toLowerCase()];
    if (!mo) return "";
    return m[3] + "-" + mo + "-" + String(m[2]).padStart(2, "0");
  }

  function termsFromLabel(label) {
    if (label === "Due on receipt") return "receipt";
    if (label === "Net 7") return "7";
    if (label === "Net 14") return "14";
    if (label === "Net 30") return "30";
    return "custom";
  }

  function isPhoneLine(s) {
    return /^[+()0-9.\-\s]{7,}$/.test(s) && /\d{3}/.test(s);
  }

  function draftFromLiterals(strings) {
    var i;
    var metaAt = -1;
    for (i = 0; i < strings.length - 2; i += 1) {
      if (strings[i] === "Invoice" && strings[i + 2] === "Date") {
        metaAt = i;
        break;
      }
    }
    if (metaAt < 0) return null;

    var invoiceNumber = strings[metaAt + 1] || "";
    var invoiceDate = parseEnglishDate(strings[metaAt + 3] || "");
    var terms = termsFromLabel(strings[metaAt + 5] || "");
    var dueDate = parseEnglishDate(strings[metaAt + 7] || "");
    var cursor = metaAt + 8;
    var poNumber = "";
    if (strings[cursor] === "PO") {
      poNumber = strings[cursor + 1] || "";
      cursor += 2;
    }

    var badges = { UNPAID: 1, PAID: 1, PARTIAL: 1, OVERDUE: 1 };
    var fromRaw = strings.slice(0, metaAt).filter(function (line) {
      return !badges[line] && line !== "INVOICE";
    });
    var from = {
      fromName: "",
      fromContact: "",
      fromAddress: [],
      fromEmail: "",
      fromPhone: "",
      fromWebsite: "",
      fromTaxId: ""
    };
    fromRaw.forEach(function (line, idx) {
      if (/@/.test(line)) from.fromEmail = line;
      else if (/^EIN\s+/i.test(line)) from.fromTaxId = line.replace(/^EIN\s+/i, "");
      else if (/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(line)) from.fromWebsite = line;
      else if (isPhoneLine(line)) from.fromPhone = line;
      else if (!from.fromName) from.fromName = line;
      else if (idx === 1 && !from.fromContact) from.fromContact = line;
      else from.fromAddress.push(line);
    });

    var billAt = strings.indexOf("BILL TO", cursor);
    var tableAt = -1;
    for (i = Math.max(0, billAt); i < strings.length - 4; i += 1) {
      if (strings[i] === "#" && strings[i + 1] === "Description" && strings[i + 2] === "Qty") {
        tableAt = i;
        break;
      }
    }
    if (tableAt < 0) return null;

    var clientRaw = [];
    var projectName = "";
    if (billAt >= 0) {
      for (i = billAt + 1; i < tableAt; i += 1) {
        if (/^Project:\s*/.test(strings[i])) {
          projectName = strings[i].replace(/^Project:\s*/, "");
        } else {
          clientRaw.push(strings[i]);
        }
      }
    }
    var client = {
      clientName: "",
      clientAddress: [],
      clientEmail: "",
      clientPhone: ""
    };
    clientRaw.forEach(function (line) {
      if (/@/.test(line)) client.clientEmail = line;
      else if (isPhoneLine(line)) client.clientPhone = line;
      else if (!client.clientName) client.clientName = line;
      else client.clientAddress.push(line);
    });

    var stopAt = strings.length;
    for (i = tableAt + 5; i < strings.length; i += 1) {
      if (strings[i] === "NOTES" || strings[i] === "PAYMENT" || strings[i] === "Subtotal") {
        stopAt = i;
        break;
      }
    }

    var items = [];
    i = tableAt + 5;
    while (i < stopAt) {
      if (!/^\d+$/.test(strings[i])) {
        i += 1;
        continue;
      }
      i += 1;
      var descParts = [];
      while (i < stopAt) {
        if (
          i + 2 < stopAt &&
          /^\d+(?:\.\d+)?$/.test(strings[i]) &&
          isMoneyStr(strings[i + 1]) &&
          isMoneyStr(strings[i + 2])
        ) {
          break;
        }
        descParts.push(strings[i]);
        i += 1;
      }
      if (i + 2 >= stopAt) break;
      items.push({
        desc: descParts.join(" "),
        qty: Number(strings[i]),
        rate: parseMoneyStr(strings[i + 1])
      });
      i += 3;
    }

    var notes = "";
    var paymentNotes = "";
    var notesAt = strings.indexOf("NOTES", stopAt > tableAt ? stopAt : tableAt);
    var payAt = strings.indexOf("PAYMENT", stopAt > tableAt ? stopAt : tableAt);
    var subAt = strings.indexOf("Subtotal", tableAt);
    if (notesAt >= 0) {
      var notesEnd = strings.length;
      if (payAt > notesAt) notesEnd = payAt;
      else if (subAt > notesAt) notesEnd = subAt;
      notes = strings.slice(notesAt + 1, notesEnd).join(" ");
    }
    if (payAt >= 0) {
      var payEnd = subAt > payAt ? subAt : strings.length;
      paymentNotes = strings.slice(payAt + 1, payEnd).join(" ");
    }

    var discountType = "none";
    var discountValue = "0";
    var taxPercent = "0";
    for (i = 0; i < strings.length; i += 1) {
      var disc = /^Discount\s*\(([\d.]+)%\)$/.exec(strings[i]);
      if (disc) {
        discountType = "percent";
        discountValue = disc[1];
      } else if (strings[i] === "Discount" && isMoneyStr(strings[i + 1] || "")) {
        discountType = "amount";
        discountValue = String(Math.abs(parseMoneyStr(strings[i + 1])));
      }
      var tax = /^Tax\s*\(([\d.]+)%\)$/.exec(strings[i]);
      if (tax) taxPercent = tax[1];
    }

    if (!invoiceNumber || !items.length) return null;

    return {
      values: {
        invoiceNumber: invoiceNumber,
        poNumber: poNumber,
        invoiceDate: invoiceDate,
        terms: terms,
        dueDate: dueDate,
        projectName: projectName,
        fromName: from.fromName || "STL Apps LLC",
        fromContact: from.fromContact,
        fromEmail: from.fromEmail,
        fromPhone: from.fromPhone,
        fromWebsite: from.fromWebsite || "seantylerlee.com",
        fromTaxId: from.fromTaxId,
        fromAddress: from.fromAddress.join("\n"),
        clientName: client.clientName,
        clientEmail: client.clientEmail,
        clientPhone: client.clientPhone,
        clientAddress: client.clientAddress.join("\n"),
        discountType: discountType,
        discountValue: discountValue,
        taxPercent: taxPercent,
        amountPaid: "0",
        paymentNotes: paymentNotes,
        notes: notes
      },
      items: items
    };
  }

  function applyDraft(raw, markPaid) {
    if (!raw || !raw.values) return false;
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
    }
    if (!form.invoiceDate.value) form.invoiceDate.value = todayISO();
    keepStatus = true;
    var d = collect();
    if (markPaid && d.total > 0) {
      form.amountPaid.value = String(d.total);
    }
    refresh();
    keepStatus = false;
    return true;
  }

  async function readInvoicePdf(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer);
    var head = latin1FromBytes(bytes.subarray(0, 5));
    if (head !== "%PDF-") return null;

    var embedded = extractEmbeddedDraft(bytes);
    if (embedded) return embedded;

    var literals = extractLiterals(latin1FromBytes(bytes));
    var parsed = draftFromLiterals(literals);
    if (parsed) return parsed;

    var streams = findFlateStreams(bytes);
    var i;
    var all = [];
    for (i = 0; i < streams.length; i += 1) {
      var inflated = await inflateBytes(streams[i]);
      if (!inflated) continue;
      all = all.concat(extractLiterals(latin1FromBytes(inflated)));
    }
    return draftFromLiterals(all);
  }

  async function handlePdfFile(file) {
    if (!file) return;
    var typeOk = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!typeOk) {
      showError("Choose a PDF invoice downloaded from this page.");
      return;
    }
    if (loadPdfBtn) {
      loadPdfBtn.disabled = true;
      loadPdfBtn.textContent = "Reading PDF…";
    }
    try {
      var buf = await file.arrayBuffer();
      var draft = await readInvoicePdf(buf);
      if (!draft || !draft.values || !draft.values.invoiceNumber) {
        showError("Couldn't read this PDF. It needs to be an invoice downloaded from this page.");
        return;
      }
      applyDraft(draft, true);
      var number = form.invoiceNumber.value || "invoice";
      showOk("Loaded " + number + " and marked it paid in full. Download PDF to save the paid copy.");
    } catch (e) {
      showError("Couldn't read that PDF. Try a file downloaded from this page.");
    } finally {
      if (loadPdfBtn) {
        loadPdfBtn.disabled = false;
        loadPdfBtn.textContent = "Load PDF";
      }
      if (pdfFileInput) pdfFileInput.value = "";
    }
  }

  function addItemRow(desc, qty, rate) {
    var row = document.createElement("div");
    row.className = "invoice-item-row";
    row.innerHTML =
      '<input class="item-desc" type="text" placeholder="e.g., Homepage build" />' +
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

  function invoiceStatus(d) {
    if (d.total > 0 && d.amountPaid >= d.total) return "paid";
    if (d.amountPaid > 0) return "partial";
    if (d.dueDate && d.dueDate < todayISO() && d.balance > 0) return "overdue";
    return "unpaid";
  }

  function statusLabel(status) {
    if (status === "paid") return "Paid";
    if (status === "partial") return "Partial";
    if (status === "overdue") return "Overdue";
    return "Unpaid";
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
      discount = discountValue;
    }
    if (discount > subtotal) discount = subtotal;
    var taxable = round2(Math.max(0, subtotal - discount));
    var taxPercent = Number(form.taxPercent.value);
    if (!Number.isFinite(taxPercent) || taxPercent < 0) taxPercent = 0;
    if (taxPercent > 100) taxPercent = 100;
    var tax = round2(taxable * (taxPercent / 100));
    var total = round2(taxable + tax);
    var amountPaid = round2(form.amountPaid.value);
    if (amountPaid < 0) amountPaid = 0;
    if (amountPaid > total) amountPaid = total;
    var balance = round2(Math.max(0, total - amountPaid));

    var terms = form.terms.value || "14";
    var invoiceDate = form.invoiceDate.value;
    var dueDate = form.dueDate.value;
    if (terms !== "custom") {
      dueDate = dueFromTerms(invoiceDate, terms) || dueDate;
    }

    return {
      invoiceNumber: text(form.invoiceNumber.value) || nextInvoiceNumber(),
      poNumber: text(form.poNumber.value),
      invoiceDate: invoiceDate,
      dueDate: dueDate,
      terms: terms,
      projectName: text(form.projectName.value),
      fromName: text(form.fromName.value) || "STL Apps LLC",
      fromContact: text(form.fromContact.value) || "Sean Tyler Lee",
      fromEmail: text(form.fromEmail.value) || "seantylerlee@icloud.com",
      fromPhone: text(form.fromPhone.value),
      fromWebsite: text(form.fromWebsite.value) || "seantylerlee.com",
      fromTaxId: text(form.fromTaxId.value),
      fromAddress: text(form.fromAddress.value),
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
      amountPaid: amountPaid,
      balance: balance,
      paymentNotes: text(form.paymentNotes.value),
      notes: text(form.notes.value)
    };
  }

  function validate(d) {
    if (!d.invoiceNumber) return "Enter an invoice number.";
    if (!d.invoiceDate) return "Set an invoice date.";
    if (!d.clientName) return "Enter the client name.";
    if (!d.items.length) return "Add at least one line item.";
    var missingDesc = d.items.some(function (item) { return !item.desc; });
    if (missingDesc) return "Every line item needs a description.";
    if (d.total <= 0 && d.subtotal <= 0) return "Add a quantity and rate to at least one line item.";
    return "";
  }

  function addressLines(block) {
    if (!block) return [];
    return block.split(/\n+/).map(text).filter(Boolean);
  }

  function fromLines(d) {
    var lines = [d.fromName];
    if (d.fromContact) lines.push(d.fromContact);
    addressLines(d.fromAddress).forEach(function (line) { lines.push(line); });
    if (d.fromEmail) lines.push(d.fromEmail);
    if (d.fromPhone) lines.push(d.fromPhone);
    if (d.fromWebsite) lines.push(d.fromWebsite);
    if (d.fromTaxId) lines.push("EIN " + d.fromTaxId);
    return lines;
  }

  function clientLines(d) {
    var lines = [d.clientName || "[Client name]"];
    addressLines(d.clientAddress).forEach(function (line) { lines.push(line); });
    if (d.clientEmail) lines.push(d.clientEmail);
    if (d.clientPhone) lines.push(d.clientPhone);
    return lines;
  }

  function renderItemAmounts() {
    Array.prototype.forEach.call(itemsEl.querySelectorAll(".invoice-item-row"), function (row) {
      var el = row.querySelector(".item-amount");
      if (!el) return;
      var qty = Number(row.querySelector(".item-qty").value);
      if (!Number.isFinite(qty) || qty < 0) qty = 0;
      var rate = round2(row.querySelector(".item-rate").value);
      el.textContent = money(round2(qty * rate));
    });
  }

  function discountLabel(d) {
    if (d.discountType === "percent") return "Discount (" + d.discountValue + "%)";
    return "Discount";
  }

  function renderTotals(d) {
    var html =
      "<div><span>Subtotal</span><span>" + money(d.subtotal) + "</span></div>";
    if (d.discount > 0) {
      html += "<div><span>" + escapeHtml(discountLabel(d)) + "</span><span>−" + money(d.discount) + "</span></div>";
    }
    if (d.tax > 0) {
      html += "<div><span>Tax (" + d.taxPercent + "%)</span><span>" + money(d.tax) + "</span></div>";
    }
    html +=
      "<div><span>Total</span><strong>" + money(d.total) + "</strong></div>" +
      "<div><span>Amount paid</span><span>" + money(d.amountPaid) + "</span></div>" +
      "<div class=\"grand\"><span>Balance due</span><span>" + money(d.balance) + "</span></div>";
    totalsEl.innerHTML = html;
  }

  function renderPreview(d) {
    var status = invoiceStatus(d);
    var items = d.items.length ? d.items : [{ n: 1, desc: "[Add a line item]", qty: 0, rate: 0, amount: 0 }];
    var rows = items.map(function (item) {
      return (
        "<tr>" +
        "<td class=\"num\">" + item.n + "</td>" +
        "<td>" + escapeHtml(item.desc || "") + "</td>" +
        "<td class=\"qty\">" + item.qty + "</td>" +
        "<td class=\"rate\">" + money(item.rate) + "</td>" +
        "<td class=\"amt\">" + money(item.amount) + "</td>" +
        "</tr>"
      );
    }).join("");

    var html = "";
    html += '<div class="invoice-top">';
    html += '<div class="invoice-from-brand">';
    html += '<img src="' + LOGO_SRC + '" alt="STL Apps LLC" width="180" height="41" />';
    html += fromLines(d).map(function (line) {
      return "<p>" + nl2br(line) + "</p>";
    }).join("");
    html += "</div>";
    html += '<div class="invoice-wordmark">';
    html += "<strong>INVOICE</strong>";
    html += '<span class="invoice-status invoice-status-' + status + '">' + statusLabel(status) + "</span>";
    html += '<table class="invoice-meta"><tbody>';
    html += "<tr><th>Invoice</th><td>" + escapeHtml(d.invoiceNumber) + "</td></tr>";
    html += "<tr><th>Date</th><td>" + escapeHtml(formatDate(d.invoiceDate)) + "</td></tr>";
    html += "<tr><th>Terms</th><td>" + escapeHtml(termsLabel(d.terms)) + "</td></tr>";
    html += "<tr><th>Due</th><td>" + escapeHtml(formatDate(d.dueDate)) + "</td></tr>";
    if (d.poNumber) {
      html += "<tr><th>PO</th><td>" + escapeHtml(d.poNumber) + "</td></tr>";
    }
    html += "</tbody></table></div></div>";

    html += '<div class="invoice-billto">';
    html += "<div><h3>Bill to</h3>" + clientLines(d).map(function (line) {
      return "<p>" + nl2br(line) + "</p>";
    }).join("") + "</div></div>";

    if (d.projectName) {
      html += '<p class="invoice-project">Project: ' + escapeHtml(d.projectName) + "</p>";
    }

    html += '<table class="invoice-lines"><thead><tr>' +
      '<th class="num">#</th><th>Description</th><th class="qty">Qty</th>' +
      '<th class="rate">Rate</th><th class="amt">Amount</th>' +
      "</tr></thead><tbody>" + rows + "</tbody></table>";

    html += '<div class="invoice-bottom">';
    html += '<div class="invoice-notes">';
    if (d.notes) {
      html += "<h3>Notes</h3><p>" + nl2br(d.notes) + "</p>";
    }
    if (d.paymentNotes) {
      html += '<div class="invoice-pay"><h3>Payment</h3><p>' + nl2br(d.paymentNotes) + "</p></div>";
    }
    html += "</div>";
    html += '<table class="invoice-sum"><tbody>';
    html += "<tr><th>Subtotal</th><td>" + money(d.subtotal) + "</td></tr>";
    if (d.discount > 0) {
      html += "<tr><th>" + escapeHtml(discountLabel(d)) + "</th><td>−" + money(d.discount) + "</td></tr>";
    }
    if (d.tax > 0) {
      html += "<tr><th>Tax (" + d.taxPercent + "%)</th><td>" + money(d.tax) + "</td></tr>";
    }
    html += "<tr><th>Total</th><td>" + money(d.total) + "</td></tr>";
    if (d.amountPaid > 0) {
      html += "<tr><th>Amount paid</th><td>" + money(d.amountPaid) + "</td></tr>";
    }
    html += '<tr class="grand"><th>Balance due</th><td>' + money(d.balance) + "</td></tr>";
    html += "</tbody></table>";
    html += '<div class="invoice-due' + (status === "paid" ? " is-paid" : "") + '">';
    html += "<span>" + (status === "paid" ? "Paid in full" : "Amount due") + "</span>";
    html += "<strong>" + money(d.balance) + "</strong>";
    html += "</div></div>";

    previewEl.innerHTML = html;
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
    form.terms.value = "14";
    form.discountType.value = "none";
    form.discountValue.value = "0";
    form.taxPercent.value = "0";
    form.amountPaid.value = "0";
    form.notes.value = "Thank you for your business.";
    form.invoiceDate.value = todayISO();
    form.dueDate.value = dueFromTerms(form.invoiceDate.value, "14");
    form.invoiceNumber.value = nextInvoiceNumber();
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
    Object.keys(raw.values).forEach(function (name) {
      if (form.elements[name]) form.elements[name].value = raw.values[name];
    });
    if (raw.items && raw.items.length) {
      raw.items.forEach(function (item) {
        addItemRow(item.desc, item.qty, item.rate);
      });
    } else {
      addItemRow();
    }
    if (!form.invoiceDate.value) form.invoiceDate.value = todayISO();
    if (!form.invoiceNumber.value) form.invoiceNumber.value = nextInvoiceNumber();
    if (form.terms.value !== "custom" || !form.dueDate.value) {
      var due = dueFromTerms(form.invoiceDate.value, form.terms.value);
      if (due) form.dueDate.value = due;
    }
  }

  function syncDueDate() {
    if (termsSelect.value === "custom") return;
    var due = dueFromTerms(invoiceDateInput.value, termsSelect.value);
    if (due) dueDateInput.value = due;
  }

  function refresh() {
    var d = collect();
    if (termsSelect.value !== "custom") {
      var due = dueFromTerms(d.invoiceDate, d.terms);
      if (due && dueDateInput.value !== due) dueDateInput.value = due;
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
      img.onerror = function () {
        resolve(null);
      };
      img.src = LOGO_SRC;
    });
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

  PdfWriter.prototype.ensure = function (h) {
    if (this.y + h > this.pageH - this.mB) {
      this.doc.addPage();
      this.y = this.top;
    }
  };

  PdfWriter.prototype.drawHeaderFooter = function (d) {
    var doc = this.doc;
    var pages = doc.getNumberOfPages();
    var i;
    for (i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      doc.setFillColor(this.navy[0], this.navy[1], this.navy[2]);
      doc.rect(0, 0, this.pageW, 10, "F");
      if (this.logo) {
        doc.addImage(this.logo, "JPEG", this.mL, 18, 118, 27);
      } else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(this.navy[0], this.navy[1], this.navy[2]);
        doc.text(d.fromName, this.mL, 36);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(this.blue[0], this.blue[1], this.blue[2]);
      doc.text("INVOICE", this.pageW - this.mR, 28, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
      doc.text(d.invoiceNumber, this.pageW - this.mR, 40, { align: "right" });
      doc.setDrawColor(this.navy[0], this.navy[1], this.navy[2]);
      doc.setLineWidth(1.15);
      doc.line(this.mL, 54, this.pageW - this.mR, 54);

      doc.setDrawColor(this.navy[0], this.navy[1], this.navy[2]);
      doc.setLineWidth(0.6);
      doc.line(this.mL, this.pageH - 36, this.pageW - this.mR, this.pageH - 36);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
      doc.text(d.fromName + "  ·  " + d.fromWebsite + "  ·  " + d.fromEmail, this.mL, this.pageH - 22);
      doc.text("Page " + i + " of " + pages, this.pageW - this.mR, this.pageH - 22, { align: "right" });
    }
  };

  PdfWriter.prototype.headerBlock = function (d) {
    var from = fromLines(d);
    var leftX = this.mL;
    var y = this.y;
    var i;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8.6);
    this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
    for (i = 0; i < from.length; i += 1) {
      var wrapped = this.doc.splitTextToSize(from[i], 260);
      this.doc.text(wrapped, leftX, y);
      y += wrapped.length * 11;
    }

    var rightX = this.pageW - this.mR;
    var status = invoiceStatus(d);
    var badge = statusLabel(status).toUpperCase();
    var colors = {
      paid: [27, 107, 50],
      partial: [0, 71, 179],
      overdue: [155, 28, 28],
      unpaid: [138, 90, 0]
    };
    var c = colors[status] || colors.unpaid;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9);
    this.doc.setTextColor(c[0], c[1], c[2]);
    this.doc.text(badge, rightX, this.y + 2, { align: "right" });

    var meta = [
      ["Invoice", d.invoiceNumber],
      ["Date", formatDate(d.invoiceDate)],
      ["Terms", termsLabel(d.terms)],
      ["Due", formatDate(d.dueDate)]
    ];
    if (d.poNumber) meta.push(["PO", d.poNumber]);
    var metaY = this.y + 18;
    for (i = 0; i < meta.length; i += 1) {
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(8.4);
      this.doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
      this.doc.text(meta[i][0], rightX - 168, metaY);
      this.doc.setFont("helvetica", "normal");
      this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
      this.doc.text(meta[i][1], rightX, metaY, { align: "right" });
      metaY += 13;
    }

    this.y = Math.max(y, metaY) + 16;
  };

  PdfWriter.prototype.billTo = function (d) {
    var lines = clientLines(d);
    var boxH = 22 + lines.reduce(function (h, line) {
      return h + Math.max(1, this.doc.splitTextToSize(line, this.maxW * 0.48).length) * 11;
    }.bind(this), 0) + 10;
    this.ensure(boxH + 8);
    var w = this.maxW * 0.52;
    this.doc.setFillColor(this.ice[0], this.ice[1], this.ice[2]);
    this.doc.setDrawColor(this.line[0], this.line[1], this.line[2]);
    this.doc.setLineWidth(0.6);
    this.doc.roundedRect(this.mL, this.y, w, boxH, 3, 3, "FD");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(7.4);
    this.doc.setTextColor(this.blue[0], this.blue[1], this.blue[2]);
    this.doc.text("BILL TO", this.mL + 8, this.y + 13);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8.6);
    this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
    var yy = this.y + 26;
    var i;
    for (i = 0; i < lines.length; i += 1) {
      var wrapped = this.doc.splitTextToSize(lines[i], w - 16);
      this.doc.text(wrapped, this.mL + 8, yy);
      yy += wrapped.length * 11;
    }
    this.y += boxH + 12;
    if (d.projectName) {
      this.doc.setFont("helvetica", "italic");
      this.doc.setFontSize(9);
      this.doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
      this.doc.text("Project: " + d.projectName, this.mL, this.y);
      this.y += 14;
    }
  };

  PdfWriter.prototype.items = function (d) {
    var body = (d.items.length ? d.items : [{ n: 1, desc: "[Add a line item]", qty: 0, rate: 0, amount: 0 }]).map(function (item) {
      return [String(item.n), item.desc || "", String(item.qty), money(item.rate), money(item.amount)];
    });
    this.ensure(80);
    this.doc.autoTable({
      startY: this.y,
      head: [["#", "Description", "Qty", "Rate", "Amount"]],
      body: body,
      showHead: "everyPage",
      theme: "grid",
      tableWidth: this.maxW,
      margin: { left: this.mL, right: this.mR, top: this.top, bottom: this.mB },
      styles: {
        font: "helvetica",
        fontSize: 8.6,
        cellPadding: 5,
        lineColor: [207, 220, 240],
        lineWidth: 0.4,
        textColor: [26, 35, 54],
        valign: "middle"
      },
      headStyles: {
        fillColor: this.navy,
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8.2,
        cellPadding: 6
      },
      columnStyles: {
        0: { cellWidth: 28, halign: "center" },
        1: { cellWidth: "auto" },
        2: { cellWidth: 48, halign: "right" },
        3: { cellWidth: 78, halign: "right" },
        4: { cellWidth: 78, halign: "right" }
      }
    });
    this.y = this.doc.lastAutoTable.finalY + 14;
  };

  PdfWriter.prototype.totalsAndNotes = function (d) {
    var boxW = 220;
    var x = this.mL + this.maxW - boxW;
    var rows = [["Subtotal", money(d.subtotal)]];
    if (d.discount > 0) rows.push([discountLabel(d), "−" + money(d.discount)]);
    if (d.tax > 0) rows.push(["Tax (" + d.taxPercent + "%)", money(d.tax)]);
    rows.push(["Total", money(d.total)]);
    if (d.amountPaid > 0) rows.push(["Amount paid", money(d.amountPaid)]);
    rows.push(["Balance due", money(d.balance)]);

    var rowH = 15;
    var boxH = 16 + rows.length * rowH + 10;
    this.ensure(boxH + 70);

    var notesX = this.mL;
    var notesW = this.maxW - boxW - 18;
    var notesY = this.y;
    if (d.notes) {
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(7.4);
      this.doc.setTextColor(this.blue[0], this.blue[1], this.blue[2]);
      this.doc.text("NOTES", notesX, notesY);
      notesY += 12;
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8.6);
      this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
      var noteLines = this.doc.splitTextToSize(d.notes, notesW);
      this.doc.text(noteLines, notesX, notesY);
      notesY += noteLines.length * 11 + 10;
    }
    if (d.paymentNotes) {
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(7.4);
      this.doc.setTextColor(this.blue[0], this.blue[1], this.blue[2]);
      this.doc.text("PAYMENT", notesX, notesY);
      notesY += 12;
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8.6);
      this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
      var payLines = this.doc.splitTextToSize(d.paymentNotes, notesW);
      this.doc.text(payLines, notesX, notesY);
      notesY += payLines.length * 11;
    }

    var y = this.y;
    var i;
    for (i = 0; i < rows.length; i += 1) {
      var last = i === rows.length - 1;
      if (last) {
        this.doc.setFillColor(this.navy[0], this.navy[1], this.navy[2]);
        this.doc.roundedRect(x, y - 2, boxW, 22, 3, 3, "F");
        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(9.2);
        this.doc.setTextColor(255, 255, 255);
        this.doc.text(invoiceStatus(d) === "paid" ? "PAID IN FULL" : "AMOUNT DUE", x + 8, y + 12);
        this.doc.text(rows[i][1], x + boxW - 8, y + 12, { align: "right" });
        y += 24;
      } else {
        this.doc.setFont("helvetica", "normal");
        this.doc.setFontSize(8.6);
        this.doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
        this.doc.text(rows[i][0], x + 4, y + 8);
        this.doc.setFont("helvetica", "bold");
        this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
        this.doc.text(rows[i][1], x + boxW - 4, y + 8, { align: "right" });
        y += rowH;
      }
    }
    this.y = Math.max(notesY, y) + 8;
  };

  async function downloadPdf() {
    var d = collect();
    var err = validate(d);
    if (err) {
      errorEl.textContent = err;
      errorEl.classList.add("is-on");
      errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      errorEl.textContent = "PDF library failed to load. Check your connection and refresh.";
      errorEl.classList.add("is-on");
      return;
    }

    downloadBtn.disabled = true;
    downloadBtn.textContent = "Building PDF…";

    try {
      var logo = await loadLogo();
      var doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter", compress: true });
      doc.setProperties({
        title: "Invoice " + d.invoiceNumber + (d.clientName ? " — " + d.clientName : ""),
        author: d.fromName,
        subject: "STL-INV-1 Invoice for " + d.clientName,
        keywords: "stl-invoice",
        creator: "STL Apps LLC invoice"
      });
      var w = new PdfWriter(doc, logo);
      w.headerBlock(d);
      w.billTo(d);
      w.items(d);
      w.totalsAndNotes(d);
      w.drawHeaderFooter(d);

      rememberInvoiceNumber(d.invoiceNumber);
      var name = "STL-Apps-LLC_Invoice_" + slug(d.invoiceNumber) + "_" + slug(d.clientName) + ".pdf";
      var payload = utf8ToB64(JSON.stringify({
        v: 1,
        values: snapshotDraft().values,
        items: d.items.map(function (item) {
          return { desc: item.desc, qty: item.qty, rate: item.rate };
        })
      }));
      savePdfBytes(appendPayload(doc.output("arraybuffer"), payload), name);
    } catch (e) {
      errorEl.textContent = "Could not build the PDF. Try again, or use a current desktop browser.";
      errorEl.classList.add("is-on");
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

  termsSelect.addEventListener("change", function () {
    syncDueDate();
    refresh();
  });

  invoiceDateInput.addEventListener("change", function () {
    syncDueDate();
    refresh();
  });

  dueDateInput.addEventListener("input", function () {
    termsSelect.value = "custom";
    refresh();
  });

  markPaidBtn.addEventListener("click", function () {
    var d = collect();
    form.amountPaid.value = String(d.total);
    refresh();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    downloadPdf();
  });

  form.addEventListener("input", function (e) {
    if (e.target === dueDateInput) return;
    refresh();
  });

  downloadBtn.addEventListener("click", function () {
    downloadPdf();
  });

  if (loadPdfBtn && pdfFileInput) {
    loadPdfBtn.addEventListener("click", function () {
      pdfFileInput.click();
    });
    pdfFileInput.addEventListener("change", function () {
      if (pdfFileInput.files && pdfFileInput.files[0]) {
        handlePdfFile(pdfFileInput.files[0]);
      }
    });
  }

  function invoiceToolOpen() {
    var tool = document.documentElement.getAttribute("data-admin-tool");
    return !tool || tool === "invoice";
  }

  var dropTarget = document.querySelector("[data-invoice-root]") ? document.body : appEl;
  if (dropTarget) {
    dropTarget.addEventListener("dragover", function (e) {
      if (!invoiceToolOpen()) return;
      if (!e.dataTransfer || !e.dataTransfer.types) return;
      var hasFile = Array.prototype.indexOf.call(e.dataTransfer.types, "Files") !== -1;
      if (!hasFile) return;
      e.preventDefault();
      if (appEl) appEl.classList.add("is-drop");
    });
    dropTarget.addEventListener("dragleave", function (e) {
      if (appEl && e.relatedTarget && appEl.contains(e.relatedTarget)) return;
      if (appEl) appEl.classList.remove("is-drop");
    });
    dropTarget.addEventListener("drop", function (e) {
      if (!invoiceToolOpen()) return;
      e.preventDefault();
      if (appEl) appEl.classList.remove("is-drop");
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handlePdfFile(file);
    });
  }

  resetBtn.addEventListener("click", function () {
    if (!window.confirm("Clear this draft and start a new invoice?")) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    form.reset();
    itemsEl.innerHTML = "";
    addItemRow();
    addItemRow();
    applyDefaults();
    refresh();
  });

  restore();
  refresh();
})();

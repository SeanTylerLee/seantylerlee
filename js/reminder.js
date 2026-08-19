(function () {
  "use strict";

  var STORAGE_KEY = "stl-reminder-draft-v1";
  var LOGO_SRC = "images/stlapps-logo.jpg";

  var root = document.querySelector("[data-reminder-root]");
  var chrome = document.querySelector("[data-reminder-chrome]");
  if (!root) return;

  function el(name) {
    return root.querySelector('[data-el="' + name + '"]') ||
      (chrome && chrome.querySelector('[data-el="' + name + '"]'));
  }

  var form = el("form");
  var previewEl = el("preview");
  var errorEl = el("error");
  var downloadBtn = el("download");
  var resetBtn = el("reset");
  var loadPdfBtn = el("load-pdf");
  var pdfFileInput = el("pdf-file");
  var okEl = el("ok");
  var totalsEl = el("totals");

  if (!form || !previewEl) return;

  var logoDataUrl = null;
  var keepStatus = false;

  function todayISO() {
    var d = new Date();
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

  function daysBetween(fromIso, toIso) {
    if (!fromIso || !toIso) return 0;
    var a = new Date(fromIso + "T00:00:00");
    var b = new Date(toIso + "T00:00:00");
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  function stageLabel(stage) {
    if (stage === "second") return "Second notice";
    if (stage === "final") return "Final notice";
    return "Friendly reminder";
  }

  function collect() {
    var amountDue = round2(form.amountDue.value);
    var amountPaid = round2(form.amountPaid.value);
    if (amountPaid < 0) amountPaid = 0;
    if (amountPaid > amountDue) amountPaid = amountDue;
    var balance = round2(Math.max(0, amountDue - amountPaid));
    var reminderDate = form.reminderDate.value || todayISO();
    var dueDate = form.dueDate.value;
    var daysPastDue = dueDate ? Math.max(0, daysBetween(dueDate, reminderDate)) : 0;
    return {
      reminderDate: reminderDate,
      stage: form.stage.value || "first",
      invoiceNumber: text(form.invoiceNumber.value),
      invoiceDate: form.invoiceDate.value,
      dueDate: dueDate,
      daysPastDue: daysPastDue,
      amountDue: amountDue,
      amountPaid: amountPaid,
      balance: balance,
      fromName: text(form.fromName.value) || "STL Apps LLC",
      fromContact: text(form.fromContact.value) || "Sean Tyler Lee",
      fromEmail: text(form.fromEmail.value) || "seantylerlee@icloud.com",
      fromPhone: text(form.fromPhone.value),
      fromWebsite: text(form.fromWebsite.value) || "seantylerlee.com",
      clientName: text(form.clientName.value),
      clientEmail: text(form.clientEmail.value),
      clientAddress: text(form.clientAddress.value),
      projectName: text(form.projectName.value),
      paymentNotes: text(form.paymentNotes.value),
      notes: text(form.notes.value)
    };
  }

  function validate(d) {
    if (!d.invoiceNumber) return "Enter the invoice number.";
    if (!d.clientName) return "Enter the client name.";
    if (!(d.balance > 0) && !(d.amountDue > 0)) return "Enter the amount still due.";
    if (!(d.balance > 0)) return "Balance due is $0.00 — nothing to remind them about.";
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
    return lines;
  }

  function letterCopy(d) {
    var inv = d.invoiceNumber;
    var due = formatDate(d.dueDate);
    var amt = money(d.balance);
    var greeting = d.clientName ? ("Hello " + d.clientName + ",") : "Hello,";
    var paras = [];

    if (d.stage === "final") {
      paras = [
        greeting,
        "This is a final notice that invoice " + inv + " is still unpaid. The balance of " + amt + " was due " + due + (d.daysPastDue ? (" and is now " + d.daysPastDue + " day" + (d.daysPastDue === 1 ? "" : "s") + " past due") : "") + ".",
        "Please send payment immediately. If payment has already gone out, reply with the date and method so we can mark the invoice paid.",
        "Until this balance is cleared, work, delivery, or access related to this invoice may stay on hold, as stated in our agreement."
      ];
    } else if (d.stage === "second") {
      paras = [
        greeting,
        "A second reminder that invoice " + inv + " still has an open balance of " + amt + ". That amount was due " + due + (d.daysPastDue ? (" (" + d.daysPastDue + " day" + (d.daysPastDue === 1 ? "" : "s") + " ago)") : "") + ".",
        "Please remit payment as soon as you can. If something is wrong with the invoice or you already paid, just reply and we will sort it out."
      ];
    } else {
      paras = [
        greeting,
        "This is a friendly reminder that invoice " + inv + " has a remaining balance of " + amt + (d.dueDate ? (", due " + due) : "") + ".",
        "When you have a moment, please send payment using the details below. If you have already paid, thank you — reply with the confirmation and we will close it out."
      ];
    }

    if (d.projectName) {
      paras.splice(2, 0, "This relates to: " + d.projectName + ".");
    }
    if (d.notes) paras.push(d.notes);
    paras.push("Thank you,");
    paras.push(d.fromContact + "\n" + d.fromName);
    return paras;
  }

  function snapshotDraft() {
    var raw = { values: {} };
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
    form.stage.value = "first";
    form.reminderDate.value = todayISO();
    form.amountPaid.value = "0";
    form.paymentNotes.value = "";
    form.notes.value = "";
  }

  function applyDraft(raw) {
    if (!raw || !raw.values) return;
    Object.keys(raw.values).forEach(function (name) {
      if (form.elements[name]) form.elements[name].value = raw.values[name];
    });
    if (!form.reminderDate.value) form.reminderDate.value = todayISO();
  }

  function restore() {
    var raw;
    try {
      raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (e) {
      raw = null;
    }
    if (!raw || !raw.values) {
      applyDefaults();
      return;
    }
    applyDraft(raw);
  }

  function renderTotals(d) {
    if (!totalsEl) return;
    var overdue = d.daysPastDue > 0 ? (d.daysPastDue + " day" + (d.daysPastDue === 1 ? "" : "s") + " past due") : "Not yet due or due today";
    totalsEl.innerHTML =
      "<div><span>Invoice total</span><span>" + money(d.amountDue) + "</span></div>" +
      "<div><span>Amount paid</span><span>" + money(d.amountPaid) + "</span></div>" +
      "<div><span>Status</span><span>" + escapeHtml(overdue) + "</span></div>" +
      "<div class=\"grand\"><span>Balance due</span><span>" + money(d.balance) + "</span></div>";
  }

  function renderPreview(d) {
    var overdue = d.daysPastDue > 0;
    var paras = letterCopy(d);
    var html = "";
    html += '<div class="invoice-top">';
    html += '<div class="invoice-from-brand">';
    html += '<img src="' + LOGO_SRC + '" alt="STL Apps LLC" width="180" height="41" />';
    html += fromLines(d).map(function (line) { return "<p>" + nl2br(line) + "</p>"; }).join("");
    html += "</div>";
    html += '<div class="invoice-wordmark">';
    html += "<strong>REMINDER</strong>";
    html += '<span class="invoice-status ' + (overdue ? "invoice-status-overdue" : "invoice-status-unpaid") + '">' + escapeHtml(stageLabel(d.stage)) + "</span>";
    html += '<table class="invoice-meta"><tbody>';
    html += "<tr><th>Date</th><td>" + escapeHtml(formatDate(d.reminderDate)) + "</td></tr>";
    html += "<tr><th>Invoice</th><td>" + escapeHtml(d.invoiceNumber || "—") + "</td></tr>";
    html += "<tr><th>Invoice date</th><td>" + escapeHtml(formatDate(d.invoiceDate)) + "</td></tr>";
    html += "<tr><th>Due</th><td>" + escapeHtml(formatDate(d.dueDate)) + "</td></tr>";
    if (d.daysPastDue > 0) html += "<tr><th>Past due</th><td>" + d.daysPastDue + " days</td></tr>";
    html += "</tbody></table></div></div>";

    html += '<div class="invoice-billto"><div><h3>To</h3>';
    html += clientLines(d).map(function (line) { return "<p>" + nl2br(line) + "</p>"; }).join("");
    html += "</div></div>";

    html += '<div class="letter-body">';
    paras.forEach(function (p) {
      html += "<p>" + nl2br(p) + "</p>";
    });
    html += "</div>";

    html += '<table class="invoice-sum"><tbody>';
    html += "<tr><th>Invoice total</th><td>" + money(d.amountDue) + "</td></tr>";
    if (d.amountPaid > 0) html += "<tr><th>Amount paid</th><td>" + money(d.amountPaid) + "</td></tr>";
    html += '<tr class="grand"><th>Balance due</th><td>' + money(d.balance) + "</td></tr>";
    html += "</tbody></table>";

    html += '<div class="reminder-hero' + (overdue ? " is-overdue" : "") + '"><span>Please pay</span><strong>' + money(d.balance) + "</strong></div>";
    if (d.paymentNotes) {
      html += '<div class="invoice-pay"><h3>How to pay</h3><p>' + nl2br(d.paymentNotes) + "</p></div>";
    }
    previewEl.innerHTML = html;
  }

  function refresh() {
    var d = collect();
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

  function invoiceTotals(data) {
    var values = data.values || {};
    var items = data.items || [];
    var subtotal = items.reduce(function (sum, item) {
      if (item.amount != null) return sum + Number(item.amount) || 0;
      return sum + ((Number(item.qty) || 0) * (Number(item.rate) || 0));
    }, 0);
    var tax = 0;
    var discount = 0;
    var taxPercent = Number(values.taxPercent) || 0;
    if (values.discountType === "percent") discount = subtotal * ((Number(values.discountValue) || 0) / 100);
    else if (values.discountType === "amount") discount = Number(values.discountValue) || 0;
    var taxable = Math.max(0, subtotal - discount);
    tax = taxable * (taxPercent / 100);
    var total = round2(taxable + tax);
    var paid = round2(values.amountPaid);
    return { total: total, paid: paid, balance: round2(Math.max(0, total - paid)) };
  }

  function draftFromInvoice(data) {
    var values = data.values || {};
    var t = invoiceTotals(data);
    var stage = "first";
    if (values.dueDate && values.dueDate < todayISO()) stage = "second";
    return {
      values: {
        reminderDate: todayISO(),
        stage: stage,
        invoiceNumber: values.invoiceNumber || "",
        invoiceDate: values.invoiceDate || "",
        dueDate: values.dueDate || "",
        amountDue: String(t.total || ""),
        amountPaid: String(t.paid || 0),
        fromName: values.fromName || "STL Apps LLC",
        fromContact: values.fromContact || "Sean Tyler Lee",
        fromEmail: values.fromEmail || "seantylerlee@icloud.com",
        fromPhone: values.fromPhone || "",
        fromWebsite: values.fromWebsite || "seantylerlee.com",
        clientName: values.clientName || "",
        clientEmail: values.clientEmail || "",
        clientAddress: values.clientAddress || "",
        projectName: values.projectName || "",
        paymentNotes: values.paymentNotes || "",
        notes: ""
      }
    };
  }

  async function handlePdfFile(file) {
    if (!file) return;
    try {
      var buf = await file.arrayBuffer();
      var bytes = new Uint8Array(buf);
      var reminder = extractPayload(bytes, "STL-REM-1");
      var invoice = extractPayload(bytes, "STL-INV-1");
      var draft = null;
      if (reminder && reminder.v === 1 && reminder.values) draft = { values: reminder.values };
      else if (invoice && invoice.v === 1 && invoice.values) draft = draftFromInvoice(invoice);
      if (!draft) {
        showError("Couldn't read this PDF. Load an invoice or reminder downloaded from this page.");
        return;
      }
      keepStatus = true;
      applyDraft(draft);
      refresh();
      keepStatus = false;
      showOk("Loaded invoice " + (form.invoiceNumber.value || "") + ". Review the balance, then download the reminder.");
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
    this.red = [155, 28, 28];
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
      doc.text("PAYMENT REMINDER", this.pageW - this.mR, 28, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
      doc.text(d.invoiceNumber || "", this.pageW - this.mR, 40, { align: "right" });
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

    var overdue = d.daysPastDue > 0;
    var badgeColor = overdue ? this.red : [138, 90, 0];
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9);
    this.doc.setTextColor(badgeColor[0], badgeColor[1], badgeColor[2]);
    this.doc.text(stageLabel(d.stage).toUpperCase(), this.pageW - this.mR, this.y + 2, { align: "right" });

    var meta = [
      ["Date", formatDate(d.reminderDate)],
      ["Invoice", d.invoiceNumber],
      ["Invoice date", formatDate(d.invoiceDate)],
      ["Due", formatDate(d.dueDate)]
    ];
    if (d.daysPastDue > 0) meta.push(["Past due", d.daysPastDue + " days"]);
    var metaY = this.y + 18;
    for (i = 0; i < meta.length; i += 1) {
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(8.4);
      this.doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
      this.doc.text(meta[i][0], this.pageW - this.mR - 168, metaY);
      this.doc.setFont("helvetica", "normal");
      this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
      this.doc.text(String(meta[i][1]), this.pageW - this.mR, metaY, { align: "right" });
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
    this.doc.text("TO", this.mL + 8, this.y + 13);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8.6);
    this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
    var yy = this.y + 26;
    for (i = 0; i < client.length; i += 1) {
      this.doc.text(this.doc.splitTextToSize(client[i], w - 16), this.mL + 8, yy);
      yy += 12;
    }
    this.y += boxH + 16;

    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(10);
    this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
    var paras = letterCopy(d);
    for (i = 0; i < paras.length; i += 1) {
      var lines = this.doc.splitTextToSize(paras[i], this.maxW);
      if (this.y + lines.length * 13 > this.pageH - this.mB - 80) {
        this.doc.addPage();
        this.y = this.top;
      }
      this.doc.text(lines, this.mL, this.y);
      this.y += lines.length * 13 + 6;
    }

    this.y += 8;
    var banner = overdue ? this.red : this.navy;
    this.doc.setFillColor(banner[0], banner[1], banner[2]);
    this.doc.roundedRect(this.mL, this.y, this.maxW, 36, 4, 4, "F");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9);
    this.doc.setTextColor(255, 255, 255);
    this.doc.text("PLEASE PAY", this.mL + 12, this.y + 22);
    this.doc.setFontSize(14);
    this.doc.text(money(d.balance), this.pageW - this.mR - 12, this.y + 23, { align: "right" });
    this.y += 50;

    if (d.paymentNotes) {
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(7.4);
      this.doc.setTextColor(this.blue[0], this.blue[1], this.blue[2]);
      this.doc.text("HOW TO PAY", this.mL, this.y);
      this.y += 12;
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(9);
      this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
      var pay = this.doc.splitTextToSize(d.paymentNotes, this.maxW);
      this.doc.text(pay, this.mL, this.y);
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
        title: "Payment reminder " + d.invoiceNumber + (d.clientName ? " — " + d.clientName : ""),
        author: d.fromName,
        subject: "Payment reminder for " + d.clientName,
        creator: "STL Apps LLC reminder"
      });
      var w = new PdfWriter(doc, logo);
      w.body(d);
      w.drawChrome(d);
      var payload = utf8ToB64(JSON.stringify({ v: 1, values: snapshotDraft().values }));
      savePdfBytes(
        appendPayload(doc.output("arraybuffer"), "STL-REM-1", payload),
        "STL-Apps-LLC_Reminder_" + slug(d.invoiceNumber) + "_" + slug(d.clientName) + ".pdf"
      );
    } catch (e) {
      showError("Could not build the PDF. Try a current desktop browser.");
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = "Download PDF";
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    downloadPdf();
  });
  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);
  downloadBtn.addEventListener("click", downloadPdf);

  resetBtn.addEventListener("click", function () {
    if (!window.confirm("Clear this reminder and start over?")) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    form.reset();
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

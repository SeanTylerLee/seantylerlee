(function () {
  "use strict";

  var STORAGE_KEY = "stl-receipt-draft-v1";
  var SEQ_KEY = "stl-receipt-seq-v1";
  var LOGO_SRC = "images/stlapps-logo.jpg";

  var root = document.querySelector("[data-receipt-root]");
  var chrome = document.querySelector("[data-receipt-chrome]");
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

  if (!form || !itemsEl || !previewEl) return;

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

  function nextNumber() {
    var y = new Date().getFullYear();
    var seq = 1;
    try {
      var raw = JSON.parse(localStorage.getItem(SEQ_KEY) || "null");
      if (raw && Number(raw.year) === y) seq = Number(raw.seq) || 1;
    } catch (e) {}
    return "RCP-" + y + "-" + String(seq).padStart(4, "0");
  }

  function rememberNumber(number) {
    var m = /^RCP-(\d{4})-(\d+)$/i.exec(text(number));
    if (!m) return;
    var year = Number(m[1]);
    var next = Number(m[2]) + 1;
    try {
      var raw = JSON.parse(localStorage.getItem(SEQ_KEY) || "null");
      if (raw && Number(raw.year) === year && Number(raw.seq) > next) next = Number(raw.seq);
      localStorage.setItem(SEQ_KEY, JSON.stringify({ year: year, seq: next }));
    } catch (e) {}
  }

  function addItemRow(desc, amount) {
    var row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML =
      '<input class="item-desc" type="text" placeholder="e.g., Invoice INV-2026-0001" />' +
      '<input class="item-price" type="number" min="0" step="0.01" placeholder="0.00" />' +
      '<button class="item-remove" type="button" aria-label="Remove line item">&times;</button>';
    if (desc) row.querySelector(".item-desc").value = desc;
    if (amount != null && amount !== "") row.querySelector(".item-price").value = amount;
    row.querySelector(".item-remove").addEventListener("click", function () {
      if (itemsEl.querySelectorAll(".item-row").length <= 1) {
        row.querySelector(".item-desc").value = "";
        row.querySelector(".item-price").value = "";
      } else {
        row.remove();
      }
      refresh();
    });
    row.querySelector(".item-desc").addEventListener("input", refresh);
    row.querySelector(".item-price").addEventListener("input", refresh);
    itemsEl.appendChild(row);
  }

  function collectItems() {
    return Array.prototype.map.call(itemsEl.querySelectorAll(".item-row"), function (row, i) {
      return {
        n: i + 1,
        desc: text(row.querySelector(".item-desc").value),
        amount: round2(row.querySelector(".item-price").value)
      };
    }).filter(function (item) {
      return item.desc || item.amount;
    }).map(function (item, i) {
      item.n = i + 1;
      return item;
    });
  }

  function collect() {
    var items = collectItems();
    var itemTotal = round2(items.reduce(function (sum, item) { return sum + item.amount; }, 0));
    var amount = text(form.amount.value) === "" && itemTotal ? itemTotal : round2(form.amount.value);
    return {
      receiptNumber: text(form.receiptNumber.value) || nextNumber(),
      receiptDate: form.receiptDate.value,
      invoiceNumber: text(form.invoiceNumber.value),
      paymentMethod: text(form.paymentMethod.value) || "Other",
      amount: amount,
      fromName: text(form.fromName.value) || "STL Apps LLC",
      fromContact: text(form.fromContact.value) || "Sean Tyler Lee",
      fromEmail: text(form.fromEmail.value) || "seantylerlee@icloud.com",
      fromPhone: text(form.fromPhone.value),
      fromWebsite: text(form.fromWebsite.value) || "seantylerlee.com",
      clientName: text(form.clientName.value),
      clientEmail: text(form.clientEmail.value),
      clientAddress: text(form.clientAddress.value),
      projectName: text(form.projectName.value),
      notes: text(form.notes.value),
      items: items,
      itemTotal: itemTotal
    };
  }

  function validate(d) {
    if (!d.receiptNumber) return "Enter a receipt number.";
    if (!d.receiptDate) return "Set the payment date.";
    if (!d.clientName) return "Enter who paid.";
    if (!(d.amount > 0)) return "Enter the amount received.";
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
    form.paymentMethod.value = "Zelle";
    form.notes.value = "Thank you. This receipt confirms payment was received in full for the invoice or work listed above.";
    form.receiptDate.value = todayISO();
    form.receiptNumber.value = nextNumber();
    form.amount.value = "";
  }

  function applyDraft(raw) {
    if (!raw || !raw.values) return;
    Object.keys(raw.values).forEach(function (name) {
      if (form.elements[name]) form.elements[name].value = raw.values[name];
    });
    itemsEl.innerHTML = "";
    if (raw.items && raw.items.length) {
      raw.items.forEach(function (item) {
        addItemRow(item.desc, item.amount != null ? item.amount : item.price);
      });
    } else {
      addItemRow();
    }
    if (!form.receiptDate.value) form.receiptDate.value = todayISO();
    if (!form.receiptNumber.value) form.receiptNumber.value = nextNumber();
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
      applyDefaults();
      return;
    }
    applyDraft(raw);
  }

  function renderTotals(d) {
    totalsEl.innerHTML =
      "<div class=\"grand\"><span>Amount received</span><span>" + money(d.amount) + "</span></div>";
  }

  function renderPreview(d) {
    var html = "";
    html += '<div class="invoice-top">';
    html += '<div class="invoice-from-brand">';
    html += '<img src="' + LOGO_SRC + '" alt="STL Apps LLC" width="180" height="41" />';
    html += fromLines(d).map(function (line) { return "<p>" + nl2br(line) + "</p>"; }).join("");
    html += "</div>";
    html += '<div class="invoice-wordmark">';
    html += "<strong>RECEIPT</strong>";
    html += '<span class="invoice-status invoice-status-paid">Paid</span>';
    html += '<table class="invoice-meta"><tbody>';
    html += "<tr><th>Receipt</th><td>" + escapeHtml(d.receiptNumber) + "</td></tr>";
    html += "<tr><th>Paid</th><td>" + escapeHtml(formatDate(d.receiptDate)) + "</td></tr>";
    if (d.invoiceNumber) html += "<tr><th>Invoice</th><td>" + escapeHtml(d.invoiceNumber) + "</td></tr>";
    html += "<tr><th>Method</th><td>" + escapeHtml(d.paymentMethod) + "</td></tr>";
    html += "</tbody></table></div></div>";

    html += '<div class="invoice-billto"><div><h3>Received from</h3>';
    html += clientLines(d).map(function (line) { return "<p>" + nl2br(line) + "</p>"; }).join("");
    html += "</div></div>";

    if (d.projectName) {
      html += '<p class="invoice-project">Project: ' + escapeHtml(d.projectName) + "</p>";
    }

    if (d.items.length) {
      html += '<table class="invoice-lines"><thead><tr><th class="num">#</th><th>Description</th><th class="amt">Amount</th></tr></thead><tbody>';
      d.items.forEach(function (item) {
        html += "<tr><td class=\"num\">" + item.n + "</td><td>" + escapeHtml(item.desc || "") + "</td><td class=\"amt\">" + money(item.amount) + "</td></tr>";
      });
      html += "</tbody></table>";
    }

    html += '<div class="receipt-hero"><span>Amount received</span><strong>' + money(d.amount) + "</strong></div>";
    if (d.notes) html += '<div class="letter-body"><p>' + nl2br(d.notes) + "</p></div>";
    previewEl.innerHTML = html;
  }

  function refresh() {
    var d = collect();
    if (d.items.length && text(form.amount.value) === "") {
      form.amount.value = String(d.itemTotal);
      d.amount = d.itemTotal;
    }
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
    var items = (data.items || []).map(function (item) {
      var amount = item.amount;
      if (amount == null) amount = round2((Number(item.qty) || 0) * (Number(item.rate) || 0));
      return { desc: item.desc, amount: amount };
    });
    var total = items.reduce(function (sum, item) { return sum + (item.amount || 0); }, 0);
    if (values.amountPaid && Number(values.amountPaid) > 0) total = Number(values.amountPaid);
    else if (!total && values.discountValue) total = 0;
    return {
      values: {
        receiptNumber: nextNumber(),
        receiptDate: todayISO(),
        invoiceNumber: values.invoiceNumber || "",
        paymentMethod: "Zelle",
        amount: String(round2(total) || ""),
        fromName: values.fromName || "STL Apps LLC",
        fromContact: values.fromContact || "Sean Tyler Lee",
        fromEmail: values.fromEmail || "seantylerlee@icloud.com",
        fromPhone: values.fromPhone || "",
        fromWebsite: values.fromWebsite || "seantylerlee.com",
        clientName: values.clientName || "",
        clientEmail: values.clientEmail || "",
        clientAddress: values.clientAddress || "",
        projectName: values.projectName || "",
        notes: "Thank you. This receipt confirms payment was received in full for invoice " + (values.invoiceNumber || "listed above") + "."
      },
      items: items
    };
  }

  async function handlePdfFile(file) {
    if (!file) return;
    try {
      var buf = await file.arrayBuffer();
      var bytes = new Uint8Array(buf);
      var receipt = extractPayload(bytes, "STL-RCP-1");
      var invoice = extractPayload(bytes, "STL-INV-1");
      var draft = null;
      if (receipt && receipt.v === 1 && receipt.values) {
        draft = { values: receipt.values, items: receipt.items || [] };
      } else if (invoice && invoice.v === 1 && invoice.values) {
        draft = draftFromInvoice(invoice);
      }
      if (!draft) {
        showError("Couldn't read this PDF. Load an invoice or receipt downloaded from this page.");
        return;
      }
      keepStatus = true;
      applyDraft(draft);
      refresh();
      keepStatus = false;
      showOk("Loaded " + (form.invoiceNumber.value || "the PDF") + ". Check the amount, then download the receipt.");
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
    this.green = [27, 107, 50];
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
      doc.text("RECEIPT", this.pageW - this.mR, 28, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(this.muted[0], this.muted[1], this.muted[2]);
      doc.text(d.receiptNumber, this.pageW - this.mR, 40, { align: "right" });
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
    this.doc.setTextColor(this.green[0], this.green[1], this.green[2]);
    this.doc.text("PAID", this.pageW - this.mR, this.y + 2, { align: "right" });

    var meta = [
      ["Receipt", d.receiptNumber],
      ["Paid", formatDate(d.receiptDate)],
      ["Method", d.paymentMethod]
    ];
    if (d.invoiceNumber) meta.splice(2, 0, ["Invoice", d.invoiceNumber]);
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
    this.doc.setLineWidth(0.6);
    this.doc.roundedRect(this.mL, this.y, w, boxH, 3, 3, "FD");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(7.4);
    this.doc.setTextColor(this.blue[0], this.blue[1], this.blue[2]);
    this.doc.text("RECEIVED FROM", this.mL + 8, this.y + 13);
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

    if (d.items.length) {
      this.doc.autoTable({
        startY: this.y,
        head: [["#", "Description", "Amount"]],
        body: d.items.map(function (item) {
          return [String(item.n), item.desc || "", money(item.amount)];
        }),
        theme: "grid",
        tableWidth: this.maxW,
        margin: { left: this.mL, right: this.mR, top: this.top, bottom: this.mB },
        styles: { font: "helvetica", fontSize: 8.6, cellPadding: 5, lineColor: [207, 220, 240], textColor: [26, 35, 54] },
        headStyles: { fillColor: this.navy, textColor: 255, fontStyle: "bold", fontSize: 8.2 },
        columnStyles: { 0: { cellWidth: 28, halign: "center" }, 2: { cellWidth: 88, halign: "right" } }
      });
      this.y = this.doc.lastAutoTable.finalY + 16;
    }

    this.doc.setFillColor(this.green[0], this.green[1], this.green[2]);
    this.doc.roundedRect(this.mL, this.y, this.maxW, 36, 4, 4, "F");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9);
    this.doc.setTextColor(255, 255, 255);
    this.doc.text("AMOUNT RECEIVED", this.mL + 12, this.y + 22);
    this.doc.setFontSize(14);
    this.doc.text(money(d.amount), this.pageW - this.mR - 12, this.y + 23, { align: "right" });
    this.y += 50;

    if (d.notes) {
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(9.2);
      this.doc.setTextColor(this.ink[0], this.ink[1], this.ink[2]);
      var notes = this.doc.splitTextToSize(d.notes, this.maxW);
      this.doc.text(notes, this.mL, this.y);
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
        title: "Receipt " + d.receiptNumber + (d.clientName ? " — " + d.clientName : ""),
        author: d.fromName,
        subject: "Receipt for " + d.clientName,
        creator: "STL Apps LLC receipt"
      });
      var w = new PdfWriter(doc, logo);
      w.body(d);
      w.drawChrome(d);
      rememberNumber(d.receiptNumber);
      var payload = utf8ToB64(JSON.stringify({ v: 1, values: snapshotDraft().values, items: d.items }));
      savePdfBytes(
        appendPayload(doc.output("arraybuffer"), "STL-RCP-1", payload),
        "STL-Apps-LLC_Receipt_" + slug(d.receiptNumber) + "_" + slug(d.clientName) + ".pdf"
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
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    downloadPdf();
  });

  form.addEventListener("input", refresh);
  downloadBtn.addEventListener("click", downloadPdf);

  resetBtn.addEventListener("click", function () {
    if (!window.confirm("Clear this receipt and start over?")) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    form.reset();
    itemsEl.innerHTML = "";
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

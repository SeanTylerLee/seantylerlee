(function () {
  "use strict";

  var LOGO = "images/brand-logo.jpg";
  var NAVY = [0, 24, 72];
  var BLUE = [0, 112, 248];
  var INK = [26, 35, 54];
  var MUTED = [80, 92, 118];
  var LINE = [213, 227, 251];
  var ICE = [244, 248, 255];
  var GRID = [207, 220, 240];
  var PAID_RED = [200, 16, 46];

  var logoDataUrl = null;

  function text(v) {
    return String(v == null ? "" : v).trim();
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function money(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) x = 0;
    return x.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function trimmedPercent(n) {
    var x = Number(n) || 0;
    if (Math.floor(x) === x) return String(x);
    return String(parseFloat(x.toPrecision(12)));
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function addDays(iso, days) {
    if (!iso) return "";
    var d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + Number(days || 0));
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function formatDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
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

  function linesOf(s) {
    return text(s).split(/\n/).map(function (line) { return line.trim(); }).filter(Boolean);
  }

  function slug(s) {
    var v = text(s).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    return v || "client";
  }

  function termsTitle(terms) {
    return {
      receipt: "Due on receipt",
      "7": "Net 7",
      "14": "Net 14",
      "30": "Net 30",
      custom: "Custom due date"
    }[terms] || "Net 14";
  }

  function validLabel(days) {
    if (days === "7") return "7 days";
    if (days === "30") return "30 days";
    if (days === "custom") return "Custom";
    return "14 days";
  }

  function dueFromTerms(iso, terms) {
    if (terms === "custom") return "";
    if (terms === "receipt") return iso;
    var n = parseInt(terms, 10);
    if (!n) n = 14;
    return addDays(iso, n);
  }

  function fromLines(d) {
    var lines = [d.fromName || "STL Apps LLC"];
    if (text(d.fromContact)) lines.push(d.fromContact);
    lines = lines.concat(linesOf(d.fromAddress));
    if (text(d.fromEmail)) lines.push(d.fromEmail);
    if (text(d.fromPhone)) lines.push(d.fromPhone);
    if (text(d.fromWebsite)) lines.push(d.fromWebsite);
    if (text(d.fromTaxId)) lines.push("EIN " + d.fromTaxId);
    return lines.filter(Boolean);
  }

  function clientLines(d) {
    var lines = [text(d.clientName) || "[Client name]"];
    lines = lines.concat(linesOf(d.clientAddress));
    if (text(d.clientEmail)) lines.push(d.clientEmail);
    if (text(d.clientPhone)) lines.push(d.clientPhone);
    return lines.filter(Boolean);
  }

  function compute(d) {
    var items = (d.items || []).filter(function (item) {
      return text(item.desc) || Number(item.qty) || Number(item.rate);
    }).map(function (item, i) {
      var qty = Math.max(0, Number(item.qty) || 0);
      var rate = Number(item.rate) || 0;
      return {
        n: i + 1,
        desc: text(item.desc),
        qty: qty,
        rate: rate,
        amount: round2(qty * rate)
      };
    });
    var subtotal = round2(items.reduce(function (s, item) { return s + item.amount; }, 0));
    var discount = 0;
    if (d.discountType === "percent") {
      discount = round2(subtotal * (Math.min(100, Math.max(0, Number(d.discountValue) || 0)) / 100));
    } else if (d.discountType === "amount") {
      discount = round2(Math.max(0, Number(d.discountValue) || 0));
    }
    discount = Math.min(discount, subtotal);
    var taxable = round2(Math.max(0, subtotal - discount));
    var taxPercent = Math.min(100, Math.max(0, Number(d.taxPercent) || 0));
    var tax = round2(taxable * (taxPercent / 100));
    var total = round2(taxable + tax);
    var amountPaid = Math.min(total, round2(Math.max(0, Number(d.amountPaid) || 0)));
    var balance = round2(Math.max(0, total - amountPaid));
    var depositPercent = Math.min(100, Math.max(0, Number(d.depositPercent) || 0));
    var deposit = depositPercent > 0 ? round2(total * (depositPercent / 100)) : 0;
    var due = d.kind === "quote"
      ? (d.validDays === "custom" ? d.validUntil : addDays(d.documentDate, parseInt(d.validDays, 10) || 14))
      : (d.terms === "custom" ? d.dueDate : dueFromTerms(d.documentDate, d.terms || "14"));
    var today = todayISO();
    var status = "unpaid";
    if (d.kind === "quote") status = "estimate";
    else if (total > 0 && amountPaid >= total) status = "paid";
    else if (amountPaid > 0) status = "partial";
    else if (due && due < today && balance > 0) status = "overdue";
    return {
      items: items,
      numberedItems: items.length ? items : [{ n: 1, desc: "[Add a line item]", qty: 0, rate: 0, amount: 0 }],
      subtotal: subtotal,
      discount: discount,
      discountLabel: d.discountType === "percent"
        ? "Discount (" + trimmedPercent(d.discountValue) + "%)"
        : "Discount",
      taxPercent: taxPercent,
      tax: tax,
      total: total,
      amountPaid: amountPaid,
      balance: balance,
      deposit: deposit,
      resolvedDueDate: due,
      status: status
    };
  }

  function statusTitle(status) {
    return {
      unpaid: "Unpaid",
      partial: "Partial",
      paid: "Paid",
      overdue: "Overdue",
      estimate: "Estimate",
      draft: "Draft"
    }[status] || "Unpaid";
  }

  function statusColor(status) {
    return {
      paid: [27, 107, 50],
      partial: [0, 71, 179],
      estimate: [0, 71, 179],
      overdue: [155, 28, 28],
      unpaid: [138, 90, 0],
      draft: [138, 90, 0]
    }[status] || [138, 90, 0];
  }

  function documentWord(kind) {
    if (kind === "quote") return "QUOTE";
    if (kind === "receipt") return "RECEIPT";
    return "INVOICE";
  }

  function partyTitle(kind) {
    if (kind === "quote") return "PREPARED FOR";
    if (kind === "receipt") return "RECEIVED FROM";
    return "BILL TO";
  }

  function lastLabel(d, totals) {
    if (d.kind === "quote") return "QUOTED TOTAL";
    if (d.kind === "receipt") return totals.status === "paid" ? "PAID IN FULL" : "BALANCE DUE";
    if (totals.status === "paid") return "PAID IN FULL";
    return "AMOUNT DUE";
  }

  function lastAmount(d, totals) {
    if (d.kind === "quote") return totals.total;
    return totals.balance;
  }

  function filename(d, totals) {
    var client = slug(d.clientName);
    if (d.kind === "quote") return "STL-Apps-LLC_Quote_" + slug(d.number) + "_" + client + ".pdf";
    if (d.kind === "receipt") {
      return "STL-Apps-LLC_Receipt_" + slug(d.number) + "_" + client + (totals.status === "paid" ? "_PAID" : "_PARTIAL") + ".pdf";
    }
    return "STL-Apps-LLC_Invoice_" + slug(d.number) + "_" + client + (totals.status === "paid" ? "_PAID" : "") + ".pdf";
  }

  function cssRgb(c) {
    return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
  }

  function previewHtml(d) {
    var totals = compute(d);
    var word = documentWord(d.kind);
    var company = fromLines(d);
    var companyName = company[0] || "STL Apps LLC";
    var companyRest = company.slice(1);
    var clients = clientLines(d);
    var meta = [];
    if (d.kind === "quote") {
      meta = [
        ["Date", formatDate(d.documentDate)],
        ["Valid for", validLabel(d.validDays)],
        ["Valid until", formatDate(totals.resolvedDueDate)]
      ];
    } else if (d.kind === "receipt") {
      meta = [
        ["Invoice", d.number || "—"],
        ["Invoice date", formatDate(d.documentDate)],
        ["Payment", formatDate(d.paidDate || todayISO())]
      ];
      if (text(d.poNumber)) meta.push(["PO", d.poNumber]);
    } else {
      meta = [
        ["Date", formatDate(d.documentDate)],
        ["Terms", termsTitle(d.terms)],
        ["Due", formatDate(totals.resolvedDueDate)]
      ];
      if (text(d.poNumber)) meta.push(["PO", d.poNumber]);
      if (totals.status === "paid" && d.paidDate) meta.push(["Paid", formatDate(d.paidDate)]);
    }

    var rows = totals.numberedItems.map(function (item, i) {
      return (
        "<tr class=\"" + (i % 2 === 1 ? "alt" : "") + "\">" +
        "<td class=\"num\">" + item.n + "</td>" +
        "<td>" + escapeHtml(item.desc || "") + "</td>" +
        "<td class=\"qty\">" + trimmedPercent(item.qty) + "</td>" +
        "<td class=\"rate\">" + money(item.rate) + "</td>" +
        "<td class=\"amt\">" + money(item.amount) + "</td>" +
        "</tr>"
      );
    }).join("");

    var sum = [["Subtotal", money(totals.subtotal)]];
    if (totals.discount > 0) sum.push([totals.discountLabel, "−" + money(totals.discount)]);
    if (totals.tax > 0) sum.push(["Tax (" + trimmedPercent(totals.taxPercent) + "%)", money(totals.tax)]);
    if (d.kind === "quote") {
      if (totals.deposit > 0) sum.push(["Deposit to start", money(totals.deposit)]);
      sum.push(["Quoted total", money(totals.total)]);
    } else if (d.kind === "receipt") {
      sum.push(["Invoice total", money(totals.total)]);
      sum.push(["This payment", money(totals.amountPaid)]);
      sum.push(["Balance due", money(totals.balance)]);
    } else {
      sum.push(["Total", money(totals.total)]);
      if (totals.amountPaid > 0) sum.push(["Amount paid", money(totals.amountPaid)]);
      sum.push(["Balance due", money(totals.balance)]);
    }
    var last = sum.pop();
    var sumRows = sum.map(function (row) {
      return "<div><span>" + escapeHtml(row[0]) + "</span><strong>" + escapeHtml(row[1]) + "</strong></div>";
    }).join("");

    var notes = "";
    if (text(d.notes)) {
      notes += "<h4>" + (d.kind === "quote" ? "TERMS" : "NOTES") + "</h4><p>" + nl2br(d.notes) + "</p>";
    }
    if (d.kind === "quote" && Number(d.hourlyRate) > 0) {
      notes += "<p class=\"muted\">Out-of-scope work, if accepted later, is billed at " + money(d.hourlyRate) + " per hour.</p>";
    }
    if (d.kind !== "quote" && text(d.paymentNotes)) {
      notes += "<h4>PAYMENT</h4><p>" + nl2br(d.paymentNotes) + "</p>";
    }

    var stamp = "";
    if (totals.status === "paid") {
      stamp = '<div class="letter-stamp" aria-hidden="true">PAID IN FULL</div>';
    }

    var footer = [d.fromName, d.fromWebsite, d.fromEmail].filter(function (v) { return text(v); }).join("  ·  ");

    return (
      '<article class="letter">' +
        '<div class="letter-bar"></div>' +
        '<header class="letter-head">' +
          '<img class="letter-logo" src="' + LOGO + '" alt="" />' +
          '<div class="letter-company">' +
            "<strong>" + escapeHtml(companyName) + "</strong>" +
            companyRest.map(function (line) { return "<span>" + escapeHtml(line) + "</span>"; }).join("") +
          "</div>" +
          '<div class="letter-word">' +
            "<b>" + word + "</b>" +
            "<em>" + escapeHtml(d.number || "") + "</em>" +
            '<i style="color:' + cssRgb(statusColor(totals.status)) + '">' + statusTitle(totals.status).toUpperCase() + "</i>" +
          "</div>" +
        "</header>" +
        '<div class="letter-rule"></div>' +
        '<div class="letter-party">' +
          '<div class="letter-box">' +
            "<h3>" + partyTitle(d.kind) + "</h3>" +
            clients.map(function (line, i) {
              return "<p class=\"" + (i === 0 ? "name" : "") + "\">" + escapeHtml(line) + "</p>";
            }).join("") +
          "</div>" +
          '<dl class="letter-meta">' + meta.map(function (row) {
            return "<div><dt>" + escapeHtml(row[0]) + "</dt><dd>" + escapeHtml(row[1]) + "</dd></div>";
          }).join("") + "</dl>" +
        "</div>" +
        (text(d.projectName) ? '<p class="letter-project">Project: ' + escapeHtml(d.projectName) + "</p>" : "") +
        '<table class="letter-lines"><thead><tr><th class="num">#</th><th>Description</th><th class="qty">Qty</th><th class="rate">Rate</th><th class="amt">Amount</th></tr></thead><tbody>' +
          rows +
        "</tbody></table>" +
        '<div class="letter-bottom">' +
          '<div class="letter-notes">' + notes + "</div>" +
          '<div class="letter-sums">' +
            sumRows +
            '<div class="grand"><span>' + lastLabel(d, totals) + "</span><strong>" + escapeHtml(last[1]) + "</strong></div>" +
          "</div>" +
        "</div>" +
        stamp +
        '<footer class="letter-foot"><span>' + escapeHtml(footer) + "</span><span>Page 1</span></footer>" +
      "</article>"
    );
  }

  function loadLogo() {
    if (logoDataUrl) return Promise.resolve(logoDataUrl);
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        logoDataUrl = canvas.toDataURL("image/jpeg", 0.92);
        resolve(logoDataUrl);
      };
      img.onerror = function () { resolve(""); };
      img.src = LOGO;
    });
  }

  function rgb(doc, c) {
    doc.setTextColor(c[0], c[1], c[2]);
  }

  function fill(doc, c) {
    doc.setFillColor(c[0], c[1], c[2]);
  }

  function PdfWriter(doc, logo) {
    this.doc = doc;
    this.logo = logo;
    this.pageW = 612;
    this.pageH = 792;
    this.mL = 48;
    this.mR = 48;
    this.mB = 52;
    this.logoSize = 78;
    this.maxW = 612 - 48 - 48;
    this.y = 0;
    this.pageIndex = 0;
    this.draft = null;
    this.totals = null;
  }

  PdfWriter.prototype.baseline = function (top, size) {
    return top + size * 0.82;
  };

  PdfWriter.prototype.setFont = function (bold, size, italic) {
    this.doc.setFont("helvetica", italic ? "italic" : (bold ? "bold" : "normal"));
    this.doc.setFontSize(size);
  };

  PdfWriter.prototype.drawText = function (str, x, top, opts) {
    opts = opts || {};
    var size = opts.size || 10;
    var width = opts.width;
    var align = opts.align || "left";
    this.setFont(!!opts.bold, size, !!opts.italic);
    if (opts.color) rgb(this.doc, opts.color);
    var y = this.baseline(top, size);
    if (align === "right") this.doc.text(String(str || ""), x + (width || 0), y, { align: "right" });
    else if (align === "center") this.doc.text(String(str || ""), x + (width || 0) / 2, y, { align: "center" });
    else this.doc.text(String(str || ""), x, y);
  };

  PdfWriter.prototype.drawWrapped = function (str, x, top, width, opts) {
    opts = opts || {};
    var size = opts.size || 9;
    this.setFont(!!opts.bold, size, !!opts.italic);
    if (opts.color) rgb(this.doc, opts.color);
    var lines = this.doc.splitTextToSize(String(str || ""), width);
    var lineH = size + 2;
    var align = opts.align || "left";
    var i;
    for (i = 0; i < lines.length; i += 1) {
      var y = this.baseline(top + i * lineH, size);
      if (align === "right") this.doc.text(lines[i], x + width, y, { align: "right" });
      else if (align === "center") this.doc.text(lines[i], x + width / 2, y, { align: "center" });
      else this.doc.text(lines[i], x, y);
    }
    return Math.max(size + 2, lines.length * lineH);
  };

  PdfWriter.prototype.measure = function (str, width, size) {
    this.setFont(false, size);
    var lines = this.doc.splitTextToSize(String(str || ""), width);
    return Math.max(size + 2, lines.length * (size + 2));
  };

  PdfWriter.prototype.hairline = function (top) {
    this.doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    this.doc.setLineWidth(1);
    this.doc.line(this.mL, top, this.pageW - this.mR, top);
  };

  PdfWriter.prototype.ensure = function (height) {
    if (this.y + height > this.pageH - this.mB) this.beginPage();
  };

  PdfWriter.prototype.beginPage = function () {
    if (this.pageIndex > 0) this.doc.addPage();
    this.pageIndex += 1;
    this.y = this.drawChrome();
  };

  PdfWriter.prototype.drawChrome = function () {
    var d = this.draft;
    var totals = this.totals;
    var doc = this.doc;
    fill(doc, NAVY);
    doc.rect(0, 0, this.pageW, 5, "F");

    var headerTop = 22;
    var textLeft = this.mL + this.logoSize + 16;
    if (this.logo) {
      try { doc.addImage(this.logo, "JPEG", this.mL, headerTop, this.logoSize, this.logoSize); } catch (e) {}
    } else {
      fill(doc, NAVY);
      doc.roundedRect(this.mL, headerTop, this.logoSize, this.logoSize, 12, 12, "F");
      this.drawText("STL", this.mL, headerTop + 28, { width: this.logoSize, size: 18, bold: true, color: [255, 255, 255], align: "center" });
    }

    var companyName = text(d.fromName) || "STL Apps LLC";
    var companyY = headerTop + 4;
    this.drawText(companyName, textLeft, companyY, { width: 240, size: 14, bold: true, color: NAVY });
    companyY += 18;
    var rest = fromLines(d).filter(function (line) { return line !== companyName; }).slice(0, 5);
    var i;
    for (i = 0; i < rest.length; i += 1) {
      companyY += this.drawWrapped(rest[i], textLeft, companyY, 230, { size: 8.5, color: MUTED }) + 1;
    }

    this.drawText(documentWord(d.kind), this.mL, headerTop + 2, { width: this.maxW, size: 20, bold: true, color: NAVY, align: "right" });
    this.drawText(d.number || "", this.mL, headerTop + 26, { width: this.maxW, size: 10, color: MUTED, align: "right" });
    if (d.kind === "invoice" || d.kind === "receipt" || d.kind === "quote") {
      this.drawText(statusTitle(totals.status).toUpperCase(), this.mL, headerTop + 44, {
        width: this.maxW, size: 9, bold: true, color: statusColor(totals.status), align: "right"
      });
    }

    var separatorTop = Math.max(headerTop + this.logoSize + 14, companyY + 8, headerTop + 62);
    this.hairline(separatorTop);

    var footer = [d.fromName, d.fromWebsite, d.fromEmail].filter(function (v) { return text(v); }).join("  ·  ");
    this.hairline(this.pageH - 40);
    this.drawText(footer, this.mL, this.pageH - 30, { size: 8, color: MUTED });
    this.drawText("Page " + this.pageIndex, this.mL, this.pageH - 30, { width: this.maxW, size: 8, color: MUTED, align: "right" });
    return separatorTop + 18;
  };

  PdfWriter.prototype.drawPartyAndMeta = function () {
    var d = this.draft;
    var totals = this.totals;
    var lines = clientLines(d);
    var boxW = this.maxW * 0.55;
    var boxHeight = 28;
    var i;
    for (i = 0; i < lines.length; i += 1) {
      boxHeight += this.measure(lines[i], boxW - 24, i === 0 ? 10.5 : 9.2) + 2;
    }
    var meta = [];
    if (d.kind === "quote") {
      meta = [
        ["Date", formatDate(d.documentDate)],
        ["Valid for", validLabel(d.validDays)],
        ["Valid until", formatDate(totals.resolvedDueDate)]
      ];
    } else if (d.kind === "receipt") {
      meta = [
        ["Invoice", d.number || "—"],
        ["Invoice date", formatDate(d.documentDate)],
        ["Payment", formatDate(d.paidDate || todayISO())]
      ];
      if (text(d.poNumber)) meta.push(["PO", d.poNumber]);
    } else {
      meta = [
        ["Date", formatDate(d.documentDate)],
        ["Terms", termsTitle(d.terms)],
        ["Due", formatDate(totals.resolvedDueDate)]
      ];
      if (text(d.poNumber)) meta.push(["PO", d.poNumber]);
      if (totals.status === "paid" && d.paidDate) meta.push(["Paid", formatDate(d.paidDate)]);
    }
    boxHeight = Math.max(boxHeight, meta.length * 15 + 8);
    this.ensure(boxHeight + 12);
    fill(this.doc, ICE);
    this.doc.roundedRect(this.mL, this.y, boxW, boxHeight, 8, 8, "F");
    this.drawText(partyTitle(d.kind), this.mL + 12, this.y + 10, { size: 8, bold: true, color: BLUE });
    var yy = this.y + 26;
    for (i = 0; i < lines.length; i += 1) {
      yy += this.drawWrapped(lines[i], this.mL + 12, yy, boxW - 24, {
        size: i === 0 ? 10.5 : 9.2,
        bold: i === 0,
        color: INK
      }) + 2;
    }
    var metaY = this.y + 8;
    var metaX = this.mL + boxW + 18;
    var metaW = this.maxW - boxW - 18;
    for (i = 0; i < meta.length; i += 1) {
      this.drawText(meta[i][0].toUpperCase(), metaX, metaY, { width: 78, size: 7.5, bold: true, color: MUTED });
      this.drawText(meta[i][1], metaX, metaY, { width: metaW, size: 9.5, color: INK, align: "right" });
      metaY += 16;
    }
    this.y += boxHeight + 16;
  };

  PdfWriter.prototype.drawItemTable = function () {
    var rows = this.totals.numberedItems;
    var colW = [28, this.maxW - 28 - 52 - 78 - 82, 52, 78, 82];
    var headers = ["#", "Description", "Qty", "Rate", "Amount"];
    this.ensure(40 + rows.length * 24);
    var height = 28;
    fill(this.doc, NAVY);
    this.doc.roundedRect(this.mL, this.y, this.maxW, height, 6, 6, "F");
    var x = this.mL;
    var i;
    for (i = 0; i < headers.length; i += 1) {
      var align = i === 0 ? "center" : (i === 1 ? "left" : "right");
      this.drawText(headers[i], x + 4, this.y + 8, {
        width: colW[i] - 8, size: 8.5, bold: true, color: [255, 255, 255], align: align
      });
      x += colW[i];
    }
    this.y += height;
    for (i = 0; i < rows.length; i += 1) {
      var item = rows[i];
      var cells = [
        String(item.n),
        item.desc,
        trimmedPercent(item.qty),
        money(item.rate),
        money(item.amount)
      ];
      var descHeight = Math.max(26, this.measure(item.desc, colW[1] - 8, 9.2) + 12);
      this.ensure(descHeight + 2);
      if (item.n % 2 === 0) {
        this.doc.setFillColor(244, 248, 255);
        this.doc.rect(this.mL, this.y, this.maxW, descHeight, "F");
      }
      x = this.mL;
      var c;
      for (c = 0; c < cells.length; c += 1) {
        var a = c === 0 ? "center" : (c === 1 ? "left" : "right");
        this.drawWrapped(cells[c], x + 4, this.y + 7, colW[c] - 8, { size: c === 1 ? 9.2 : 9, color: INK, align: a });
        x += colW[c];
      }
      this.y += descHeight;
      this.doc.setDrawColor(GRID[0], GRID[1], GRID[2]);
      this.doc.setLineWidth(0.6);
      this.doc.line(this.mL, this.y, this.pageW - this.mR, this.y);
    }
    this.y += 16;
  };

  PdfWriter.prototype.drawTotalsAndNotes = function () {
    var d = this.draft;
    var totals = this.totals;
    var rows = [["Subtotal", money(totals.subtotal)]];
    if (totals.discount > 0) rows.push([totals.discountLabel, "−" + money(totals.discount)]);
    if (totals.tax > 0) rows.push(["Tax (" + trimmedPercent(totals.taxPercent) + "%)", money(totals.tax)]);
    if (d.kind === "quote") {
      if (totals.deposit > 0) rows.push(["Deposit to start", money(totals.deposit)]);
      rows.push(["Quoted total", money(totals.total)]);
    } else if (d.kind === "receipt") {
      rows.push(["Invoice total", money(totals.total)]);
      if (totals.amountPaid > 0) rows.push(["This payment", money(totals.amountPaid)]);
      rows.push(["Balance due", money(totals.balance)]);
    } else {
      rows.push(["Total", money(totals.total)]);
      if (totals.amountPaid > 0) rows.push(["Amount paid", money(totals.amountPaid)]);
      rows.push(["Balance due", money(totals.balance)]);
    }

    var boxW = 230;
    var notesW = this.maxW - boxW - 24;
    this.ensure(rows.length * 17 + 90);
    var notesY = this.y;
    if (text(d.notes)) {
      this.drawText(d.kind === "quote" ? "TERMS" : "NOTES", this.mL, notesY, { size: 8, bold: true, color: BLUE });
      notesY += 14;
      notesY += this.drawWrapped(d.notes, this.mL, notesY, notesW, { size: 9, color: INK }) + 12;
    }
    if (d.kind === "quote" && Number(d.hourlyRate) > 0) {
      notesY += this.drawWrapped(
        "Out-of-scope work, if accepted later, is billed at " + money(d.hourlyRate) + " per hour.",
        this.mL, notesY, notesW, { size: 9, color: MUTED }
      ) + 10;
    }
    if (d.kind !== "quote" && text(d.paymentNotes)) {
      this.drawText("PAYMENT", this.mL, notesY, { size: 8, bold: true, color: BLUE });
      notesY += 14;
      notesY += this.drawWrapped(d.paymentNotes, this.mL, notesY, notesW, { size: 9, color: INK });
    }

    var boxY = this.y;
    var x = this.mL + this.maxW - boxW;
    var i;
    for (i = 0; i < rows.length; i += 1) {
      var last = i === rows.length - 1;
      if (last) {
        fill(this.doc, NAVY);
        this.doc.roundedRect(x, boxY, boxW, 34, 8, 8, "F");
        this.drawText(lastLabel(d, totals), x + 12, boxY + 10, { size: 9, bold: true, color: [255, 255, 255] });
        this.drawText(rows[i][1], x, boxY + 10, { width: boxW - 12, size: 12, bold: true, color: [255, 255, 255], align: "right" });
        boxY += 40;
      } else {
        this.drawText(rows[i][0], x + 4, boxY + 2, { size: 9, color: MUTED });
        this.drawText(rows[i][1], x, boxY + 2, { width: boxW - 4, size: 9.5, bold: true, color: INK, align: "right" });
        boxY += 17;
      }
    }
    this.y = Math.max(notesY, boxY) + 8;
  };

  PdfWriter.prototype.drawPaidStamp = function () {
    var doc = this.doc;
    var pages = doc.getNumberOfPages();
    var cx = this.pageW / 2;
    var cy = this.pageH / 2 + 18;
    // Match CSS .letter-stamp rotate(-32deg).
    var angle = 32;
    var p;
    for (p = 1; p <= pages; p += 1) {
      doc.setPage(p);
      if (doc.saveGraphicsState) {
        doc.saveGraphicsState();
        if (doc.GState) doc.setGState(new doc.GState({ opacity: 0.78 }));
      }
      this.setFont(true, 38);
      rgb(doc, PAID_RED);
      doc.text("PAID IN FULL", cx, cy + 12, { align: "center", angle: angle });
      if (doc.restoreGraphicsState) doc.restoreGraphicsState();
    }
  };

  PdfWriter.prototype.render = function (d) {
    this.draft = d;
    this.totals = compute(d);
    this.beginPage();
    this.drawPartyAndMeta();
    if (text(d.projectName)) {
      this.y += this.drawWrapped("Project: " + d.projectName, this.mL, this.y, this.maxW, { size: 9.5, italic: true, color: MUTED }) + 14;
    } else {
      this.y += 6;
    }
    this.drawItemTable();
    this.drawTotalsAndNotes();
    if (this.totals.status === "paid") this.drawPaidStamp();
  };

  function buildPdf(d) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      return Promise.reject(new Error("PDF library failed to load."));
    }
    var totals = compute(d);
    return loadLogo().then(function (logo) {
      var doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter", compress: true });
      doc.setProperties({
        title: documentWord(d.kind) + " " + (d.number || "") + (d.clientName ? " — " + d.clientName : ""),
        author: d.fromName || "STL Apps LLC",
        creator: "STL Apps LLC"
      });
      var writer = new PdfWriter(doc, logo);
      writer.render(d);
      return {
        blob: doc.output("blob"),
        filename: filename(d, totals)
      };
    });
  }

  window.STLBillingDoc = {
    todayISO: todayISO,
    addDays: addDays,
    dueFromTerms: dueFromTerms,
    money: money,
    compute: compute,
    previewHtml: previewHtml,
    buildPdf: buildPdf,
    filename: filename,
    statusTitle: statusTitle,
    termsTitle: termsTitle
  };
})();

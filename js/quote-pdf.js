/**
 * Shared quote PDF builder. Matches the Admin quote layout.
 */
(function (root) {
  "use strict";

  var LOGO_SRC = "images/stlapps-logo.jpg";
  var logoDataUrl = null;

  function money(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) x = 0;
    return x.toLocaleString("en-US", { style: "currency", currency: "USD" });
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

  function addDays(iso, days) {
    if (!iso) return "";
    var d = new Date(iso + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function validDaysLabel(days) {
    if (days === "7") return "7 days";
    if (days === "30") return "30 days";
    if (days === "custom") return "Custom";
    return "14 days";
  }

  function discountLabel(d) {
    if (d.discountType === "percent") return "Discount (" + d.discountValue + "%)";
    return "Discount";
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
      String(d.clientAddress).split(/\n+/).forEach(function (line) {
        if (text(line)) lines.push(text(line));
      });
    }
    if (d.clientEmail) lines.push(d.clientEmail);
    if (d.clientPhone) lines.push(d.clientPhone);
    return lines;
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
      ["Valid", validDaysLabel(String(d.validDays))],
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

  function filenameFor(d) {
    return "STL-Apps-LLC_Quote_" + slug(d.quoteNumber) + "_" + slug(d.clientName) + ".pdf";
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  async function build(d) {
    if (!root.jspdf || !root.jspdf.jsPDF) {
      throw new Error("PDF library failed to load. Refresh and try again.");
    }
    var logo = await loadLogo();
    var doc = new root.jspdf.jsPDF({ unit: "pt", format: "letter", compress: true });
    doc.setProperties({
      title: "Quote " + d.quoteNumber + (d.clientName ? " — " + d.clientName : ""),
      author: d.fromName || "STL Apps LLC",
      subject: "Quote for " + (d.clientName || "client"),
      creator: "STL Apps LLC quote"
    });
    var w = new PdfWriter(doc, logo);
    w.body(d);
    w.drawChrome(d);
    var filename = filenameFor(d);
    var blob = doc.output("blob");
    return { blob: blob, filename: filename, dataUrl: doc.output("datauristring") };
  }

  root.STLQuotePdf = {
    money: money,
    todayISO: todayISO,
    addDays: addDays,
    slug: slug,
    build: build,
    download: downloadBlob
  };
})(window);

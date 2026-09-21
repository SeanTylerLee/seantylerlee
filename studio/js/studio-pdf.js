(function () {
  "use strict";

  var NAVY = [18, 33, 61];
  var BLUE = [26, 112, 235];
  var INK = [26, 35, 54];
  var MUTED = [80, 92, 118];
  var ICE = [242, 244, 248];
  var LINE = [213, 220, 232];
  var WHITE = [255, 255, 255];
  var LOGO = "images/brand-logo.jpg";

  var logoCache = null;
  var companyCache = null;

  function money(n) {
    return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function prepared() {
    return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function loadLogo() {
    if (logoCache) return Promise.resolve(logoCache);
    return fetch(LOGO).then(function (res) {
      if (!res.ok) return null;
      return res.blob();
    }).then(function (blob) {
      if (!blob) return null;
      return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function () {
          logoCache = reader.result;
          resolve(logoCache);
        };
        reader.onerror = function () { resolve(null); };
        reader.readAsDataURL(blob);
      });
    }).catch(function () { return null; });
  }

  function loadCompany(db) {
    var fallback = {
      name: "STL Apps LLC",
      contact: "Sean Tyler Lee",
      email: "seantylerlee@icloud.com",
      website: "seantylerlee.com",
      taxId: "",
      address: ""
    };
    if (companyCache) return Promise.resolve(companyCache);
    if (!db) {
      companyCache = fallback;
      return Promise.resolve(fallback);
    }
    return db.from("business_profile").select("*").limit(1).maybeSingle()
      .then(function (res) {
        var p = (res && res.data) || {};
        companyCache = {
          name: (p.name || fallback.name).trim() || fallback.name,
          contact: (p.contact || fallback.contact).trim(),
          email: (p.email || fallback.email).trim(),
          website: (p.website || fallback.website).trim(),
          taxId: (p.tax_id || "").trim(),
          address: (p.address || "").trim()
        };
        return companyCache;
      })
      .catch(function () {
        companyCache = fallback;
        return fallback;
      });
  }

  function Report(doc, logo, company, opts) {
    this.doc = doc;
    this.logo = logo;
    this.company = company;
    this.word = opts.word || "REPORT";
    this.yearLabel = opts.yearLabel || "";
    this.pageW = 612;
    this.pageH = 792;
    this.mL = 48;
    this.mR = 48;
    this.mB = 52;
    this.logoSize = 78;
    this.maxW = this.pageW - this.mL - this.mR;
    this.pageIndex = 0;
    this.y = 0;
  }

  Report.prototype.setFont = function (bold, size) {
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
  };

  Report.prototype.baseline = function (top, size) {
    return top + size * 0.82;
  };

  Report.prototype.color = function (rgb) {
    this.doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  };

  Report.prototype.fill = function (rgb) {
    this.doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  };

  Report.prototype.text = function (str, x, top, opts) {
    opts = opts || {};
    var size = opts.size || 10;
    var width = opts.width;
    var align = opts.align || "left";
    this.setFont(!!opts.bold, size);
    this.color(opts.color || INK);
    var y = this.baseline(top, size);
    if (align === "right") this.doc.text(String(str || ""), x + (width || 0), y, { align: "right" });
    else if (align === "center") this.doc.text(String(str || ""), x + (width || 0) / 2, y, { align: "center" });
    else this.doc.text(String(str || ""), x, y);
  };

  Report.prototype.wrap = function (str, x, top, width, opts) {
    opts = opts || {};
    var size = opts.size || 9;
    this.setFont(!!opts.bold, size);
    this.color(opts.color || INK);
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

  Report.prototype.measure = function (str, width, size) {
    this.setFont(false, size);
    var lines = this.doc.splitTextToSize(String(str || ""), width);
    return Math.max(size + 2, lines.length * (size + 2));
  };

  Report.prototype.hairline = function (top) {
    this.doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    this.doc.setLineWidth(0.8);
    this.doc.line(this.mL, top, this.pageW - this.mR, top);
  };

  Report.prototype.ensure = function (height) {
    if (this.y + height > this.pageH - this.mB) this.beginPage();
  };

  Report.prototype.beginPage = function () {
    if (this.pageIndex > 0) this.doc.addPage();
    this.pageIndex += 1;
    this.y = this.drawChrome();
  };

  Report.prototype.drawChrome = function () {
    var c = this.company;
    var doc = this.doc;
    this.fill(NAVY);
    doc.rect(0, 0, this.pageW, 5, "F");

    var headerTop = 22;
    var textLeft = this.mL + this.logoSize + 16;
    if (this.logo) {
      try { doc.addImage(this.logo, "JPEG", this.mL, headerTop, this.logoSize, this.logoSize); } catch (e) {}
    } else {
      this.fill(NAVY);
      doc.roundedRect(this.mL, headerTop, this.logoSize, this.logoSize, 12, 12, "F");
      this.text("STL", this.mL, headerTop + 28, { width: this.logoSize, size: 18, bold: true, color: WHITE, align: "center" });
    }

    var companyY = headerTop + 4;
    this.text(c.name || "STL Apps LLC", textLeft, companyY, { width: 240, size: 14, bold: true, color: NAVY });
    companyY += 18;
    var extras = [c.contact, c.email, c.taxId ? "EIN " + c.taxId : ""].filter(Boolean);
    var i;
    for (i = 0; i < extras.length && i < 4; i += 1) {
      companyY += this.wrap(extras[i], textLeft, companyY, 230, { size: 8.5, color: MUTED }) + 1;
    }

    this.text(this.word, this.mL, headerTop + 2, { width: this.maxW, size: 16, bold: true, color: NAVY, align: "right" });
    if (this.yearLabel) {
      this.text(this.yearLabel, this.mL, headerTop + 24, { width: this.maxW, size: 10, color: MUTED, align: "right" });
    }

    var separatorTop = Math.max(headerTop + this.logoSize + 14, companyY + 8, headerTop + 50);
    this.hairline(separatorTop);

    var footer = [c.name, c.website, c.email].filter(Boolean).join("  ·  ");
    this.hairline(this.pageH - 40);
    this.text(footer, this.mL, this.pageH - 30, { size: 8, color: MUTED });
    this.text("Page " + this.pageIndex, this.mL, this.pageH - 30, { width: this.maxW, size: 8, color: MUTED, align: "right" });
    return separatorTop + 18;
  };

  Report.prototype.heading = function (str, size) {
    this.ensure(22);
    this.text(str, this.mL, this.y, { width: this.maxW, size: size || 13, bold: true, color: NAVY });
    this.y += (size || 13) + 10;
  };

  Report.prototype.newSection = function (title, blurb) {
    this.yearLabel = title || "";
    this.beginPage();
    this.heading(title || "Section", 16);
    if (blurb) this.note(blurb);
  };

  Report.prototype.fields = function (pairs) {
    var labelW = 148;
    var valueW = this.maxW - labelW;
    var i;
    for (i = 0; i < (pairs || []).length; i += 1) {
      var pair = pairs[i] || [];
      var label = String(pair[0] == null ? "" : pair[0]);
      var value = pair[1] == null || pair[1] === "" ? "—" : String(pair[1]);
      var h = Math.max(this.measure(label, labelW - 8, 8), this.measure(value, valueW - 8, 9)) + 10;
      this.ensure(h);
      this.wrap(label, this.mL, this.y + 2, labelW - 8, { size: 8, bold: true, color: MUTED });
      this.wrap(value, this.mL + labelW, this.y + 2, valueW - 8, { size: 9, color: INK });
      this.y += h;
      this.hairline(this.y);
    }
  };

  Report.prototype.bullets = function (lines) {
    var i;
    var n = 0;
    for (i = 0; i < (lines || []).length; i += 1) {
      var raw = String(lines[i] == null ? "" : lines[i]);
      if (!raw.trim()) continue;
      var isHead = /^\s*##/.test(raw);
      var label = isHead ? raw.replace(/^\s*##\s*/, "") : ((n += 1) + ". " + raw);
      var size = isHead ? 10 : 9;
      var h = this.measure(label, this.maxW, size) + 6;
      this.ensure(h);
      this.y += this.wrap(label, this.mL, this.y, this.maxW, {
        size: size,
        bold: isHead,
        color: isHead ? NAVY : INK
      }) + 4;
    }
  };

  Report.prototype.note = function (str) {
    var h = this.measure(str, this.maxW, 9);
    this.ensure(h + 8);
    this.y += this.wrap(str, this.mL, this.y, this.maxW, { size: 9, color: MUTED }) + 10;
  };

  Report.prototype.chips = function (items) {
    var chipW = (this.maxW - 18) / 2;
    var chipH = 44;
    var i;
    for (i = 0; i < items.length; i += 1) {
      var col = i % 2;
      if (col === 0) this.ensure(chipH + 12);
      var x = this.mL + col * (chipW + 18);
      var top = this.y;
      this.fill(ICE);
      this.doc.roundedRect(x, top, chipW, chipH, 8, 8, "F");
      this.text(String(items[i][0] || "").toUpperCase(), x + 12, top + 8, { width: chipW - 24, size: 7.5, bold: true, color: BLUE });
      this.text(items[i][1], x + 12, top + 22, { width: chipW - 24, size: 12, bold: true, color: INK });
      if (col === 1 || i === items.length - 1) this.y = top + chipH + 10;
    }
  };

  Report.prototype.tableHeader = function (headers, widths, rightFrom) {
    var height = 26;
    this.ensure(height + 4);
    this.fill(NAVY);
    this.doc.rect(this.mL, this.y, this.maxW, height, "F");
    var x = this.mL;
    var startRight = rightFrom == null ? headers.length - 1 : rightFrom;
    var i;
    for (i = 0; i < headers.length; i += 1) {
      var align = i === 0 || i === headers.length - 1 ? "center" : (i >= startRight ? "right" : "left");
      if (i === 0) align = "center";
      this.text(String(headers[i] || "").toUpperCase(), x + 4, this.y + 7, {
        width: widths[i] - 8,
        size: 7.5,
        bold: true,
        color: WHITE,
        align: align
      });
      x += widths[i];
    }
    this.y += height;
  };

  Report.prototype.tableRow = function (cells, widths, opts) {
    opts = opts || {};
    var fonts = opts.sizes || [];
    var aligns = opts.aligns || [];
    var bolds = opts.bolds || [];
    var heights = cells.map(function (cell, i) {
      return this.measure(cell, widths[i] - 8, fonts[i] || 9);
    }, this);
    var rowH = Math.max(26, Math.max.apply(null, heights) + 12);
    this.ensure(rowH + 2);
    if (opts.stripe) {
      this.fill(ICE);
      this.doc.rect(this.mL, this.y, this.maxW, rowH, "F");
    }
    var x = this.mL;
    var i;
    for (i = 0; i < cells.length; i += 1) {
      this.wrap(cells[i], x + 4, this.y + 7, widths[i] - 8, {
        size: fonts[i] || 9,
        bold: !!bolds[i],
        color: INK,
        align: aligns[i] || "left"
      });
      x += widths[i];
    }
    this.y += rowH;
    this.hairline(this.y);
  };

  Report.prototype.totalLine = function (label, value) {
    this.ensure(36);
    this.y += 12;
    this.text(label, this.mL, this.y, { width: this.maxW - 90, size: 11, bold: true, color: NAVY });
    this.text(value, this.mL, this.y, { width: this.maxW, size: 12, bold: true, color: NAVY, align: "right" });
    this.y += 20;
  };

  Report.prototype.exhibitHead = function (meta) {
    var label = "EXHIBIT  " + String(meta.number || "");
    this.text(label, this.mL, this.y, { width: this.maxW, size: 9, bold: true, color: BLUE });
    this.y += 16;
    this.text(meta.title || "Proof", this.mL, this.y, { width: this.maxW, size: 14, bold: true, color: NAVY });
    this.y += 18;
    if (meta.line) {
      this.y += this.wrap(meta.line, this.mL, this.y, this.maxW, { size: 9, color: MUTED }) + 8;
    }
  };

  Report.prototype.proofImage = function (dataUrl, meta) {
    this.beginPage();
    this.exhibitHead(meta);
    var boxH = Math.max(160, this.pageH - this.mB - this.y - 6);
    this.fill(ICE);
    this.doc.roundedRect(this.mL, this.y, this.maxW, boxH, 8, 8, "F");
    this.doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    this.doc.setLineWidth(0.7);
    this.doc.roundedRect(this.mL, this.y, this.maxW, boxH, 8, 8, "S");
    if (!dataUrl) {
      this.text("Receipt image is on file in Studio.", this.mL + 16, this.y + 20, { size: 10, color: MUTED });
      return;
    }
    var pad = 14;
    var innerW = this.maxW - pad * 2;
    var innerH = boxH - pad * 2;
    var srcW = Number(meta.width) || 0;
    var srcH = Number(meta.height) || 0;
    var dw = innerW;
    var dh = innerH;
    if (srcW > 0 && srcH > 0) {
      var scale = Math.min(innerW / srcW, innerH / srcH);
      dw = srcW * scale;
      dh = srcH * scale;
    }
    var x = this.mL + pad + (innerW - dw) / 2;
    var y = this.y + pad + (innerH - dh) / 2;
    try {
      var fmt = /image\/png/i.test(dataUrl) ? "PNG" : "JPEG";
      this.doc.addImage(dataUrl, fmt, x, y, dw, dh, undefined, "FAST");
    } catch (e) {
      this.text("Receipt image could not be placed on this page.", this.mL + 16, this.y + 20, { size: 10, color: MUTED });
    }
  };

  Report.prototype.proofNote = function (meta) {
    this.beginPage();
    this.exhibitHead(meta);
    var boxH = 120;
    this.fill(ICE);
    this.doc.roundedRect(this.mL, this.y, this.maxW, boxH, 8, 8, "F");
    this.doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    this.doc.setLineWidth(0.7);
    this.doc.roundedRect(this.mL, this.y, this.maxW, boxH, 8, 8, "S");
    this.text("Original PDF receipt", this.mL + 16, this.y + 18, { size: 11, bold: true, color: NAVY });
    this.wrap(
      meta.fileNote ||
        "This exhibit is a PDF receipt on file in STL Studio. The original file is included in the tax packet under Receipts.",
      this.mL + 16,
      this.y + 40,
      this.maxW - 32,
      { size: 9, color: MUTED }
    );
  };

  Report.prototype.blob = function () {
    this.doc.setProperties({
      title: this.word + (this.yearLabel ? " — " + this.yearLabel : ""),
      author: this.company.name || "STL Apps LLC",
      creator: "STL Apps LLC"
    });
    return this.doc.output("blob");
  };

  Report.prototype.save = function (filename) {
    this.doc.setProperties({
      title: this.word + (this.yearLabel ? " — " + this.yearLabel : ""),
      author: this.company.name || "STL Apps LLC",
      creator: "STL Apps LLC"
    });
    this.doc.save(filename);
  };

  function open(opts) {
    opts = opts || {};
    if (!window.jspdf || !window.jspdf.jsPDF) {
      return Promise.reject(new Error("PDF library missing."));
    }
    return Promise.all([loadLogo(), loadCompany(opts.db)]).then(function (pair) {
      var doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter", compress: true });
      var report = new Report(doc, pair[0], pair[1], opts);
      report.beginPage();
      return report;
    });
  }

  window.STLStudioPdf = {
    open: open,
    money: money,
    prepared: prepared,
    loadCompany: loadCompany
  };
})();

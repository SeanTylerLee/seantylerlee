(function () {
  "use strict";

  var root = document.querySelector("[data-receipt-root]");
  var chrome = document.querySelector("[data-receipt-chrome]");
  if (!root) return;

  function el(name) {
    return root.querySelector('[data-el="' + name + '"]') ||
      (chrome && chrome.querySelector('[data-el="' + name + '"]'));
  }

  var previewEl = el("preview");
  var errorEl = el("error");
  var okEl = el("ok");
  var downloadBtn = el("download");
  var resetBtn = el("reset");
  var loadPdfBtns = Array.prototype.slice.call(document.querySelectorAll(
    '[data-receipt-root] [data-el="load-pdf"], [data-receipt-chrome] [data-el="load-pdf"]'
  ));
  var loadPdfBtn = loadPdfBtns[0] || el("load-pdf");
  var pdfFileInput = el("pdf-file");
  var markPaidBtn = el("mark-paid");
  var paidDateInput = el("paid-date");
  var loadedPanel = el("loaded");
  var summaryEl = el("summary");
  var emptyEl = el("empty");
  var dropEl = el("drop") || root;

  if (!previewEl) return;

  var draft = null;

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function api() {
    return window.STLInvoice;
  }

  function showError(msg) {
    if (okEl) {
      okEl.classList.remove("is-on");
      okEl.textContent = "";
    }
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.classList.add("is-on");
    errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function showOk(msg) {
    if (errorEl) {
      errorEl.classList.remove("is-on");
      errorEl.textContent = "";
    }
    if (!okEl) return;
    okEl.textContent = msg;
    okEl.classList.add("is-on");
  }

  function clearStatus() {
    if (errorEl) {
      errorEl.classList.remove("is-on");
      errorEl.textContent = "";
    }
    if (okEl) {
      okEl.classList.remove("is-on");
      okEl.textContent = "";
    }
  }

  function data() {
    if (!draft || !api()) return null;
    return api().computeDraft(draft);
  }

  function isPaid(d) {
    return !!(api() && d && api().invoiceStatus(d) === "paid");
  }

  function render() {
    var d = data();
    if (!d) {
      if (loadedPanel) loadedPanel.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      if (summaryEl) summaryEl.innerHTML = "";
      if (markPaidBtn) markPaidBtn.disabled = true;
      previewEl.innerHTML = '<p class="receipt-placeholder">Upload an invoice PDF to see it here.</p>';
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (loadedPanel) loadedPanel.hidden = false;
    if (markPaidBtn) markPaidBtn.disabled = isPaid(d);

    if (summaryEl) {
      summaryEl.innerHTML =
        "<strong>" + (d.invoiceNumber || "Invoice") + "</strong>" +
        "<span>" + (d.clientName || "No client") +
        (d.projectName ? " · " + d.projectName : "") +
        " · " + api().money(d.total) +
        (isPaid(d) ? " · Paid in full" : " · Unpaid") +
        "</span>";
    }

    previewEl.innerHTML = api().previewHtml(d);
  }

  async function handlePdfFile(file) {
    if (!file) return;
    var typeOk = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!typeOk) {
      showError("Choose a PDF invoice downloaded from this page.");
      return;
    }
    if (!api() || !api().readPdf) {
      showError("Invoice tools failed to load. Refresh and try again.");
      return;
    }
    loadPdfBtns.forEach(function (btn) {
      btn.disabled = true;
      btn.textContent = "Reading PDF…";
    });
    try {
      var buf = await file.arrayBuffer();
      var loaded = await api().readPdf(buf);
      if (!loaded || !loaded.values || !loaded.values.invoiceNumber) {
        showError("Couldn't read this PDF. It needs to be an invoice downloaded from the Invoice tab.");
        return;
      }
      draft = loaded;
      if (paidDateInput && !paidDateInput.value) paidDateInput.value = todayISO();
      render();
      if (isPaid(data())) {
        showOk("Loaded " + loaded.values.invoiceNumber + ". It is already paid in full. Download to save a stamped copy.");
      } else {
        showOk("Loaded " + loaded.values.invoiceNumber + ". Click Paid in full, then download.");
      }
    } catch (e) {
      showError("Couldn't read that PDF. Try a file downloaded from the Invoice tab.");
    } finally {
      loadPdfBtns.forEach(function (btn) {
        btn.disabled = false;
        btn.textContent = btn.closest(".header-actions") ? "Upload invoice" : "Upload invoice PDF";
      });
      if (pdfFileInput) pdfFileInput.value = "";
    }
  }

  function markPaid() {
    var d = data();
    if (!d) {
      showError("Upload an invoice PDF first.");
      return;
    }
    if (isPaid(d)) {
      showOk("This invoice is already paid in full.");
      return;
    }
    if (!draft.values) draft.values = {};
    draft.values.amountPaid = String(d.total);
    draft.values.paidDate = (paidDateInput && paidDateInput.value) || todayISO();
    render();
    showOk("Paid in full. Download the stamped invoice to your computer.");
  }

  async function downloadPdf() {
    var d = data();
    if (!d) {
      showError("Upload an invoice PDF first.");
      return;
    }
    if (!isPaid(d)) {
      showError("Click Paid in full first. That stamps PAID IN FULL across the invoice.");
      return;
    }
    if (!api() || !api().buildPdf) {
      showError("PDF library failed to load. Refresh and try again.");
      return;
    }
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Building PDF…";
    try {
      var out = await api().buildPdf(d);
      api().savePdfBytes(out.bytes, out.filename);
    } catch (e) {
      showError("Could not build the PDF. Try a current desktop browser.");
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = "Download PDF";
    }
  }

  function resetAll() {
    draft = null;
    if (paidDateInput) paidDateInput.value = todayISO();
    if (pdfFileInput) pdfFileInput.value = "";
    clearStatus();
    render();
  }

  function toolOpen() {
    return document.documentElement.getAttribute("data-admin-tool") === "receipt";
  }

  if (pdfFileInput) {
    loadPdfBtns.forEach(function (btn) {
      btn.addEventListener("click", function () { pdfFileInput.click(); });
    });
    pdfFileInput.addEventListener("change", function () {
      if (pdfFileInput.files && pdfFileInput.files[0]) handlePdfFile(pdfFileInput.files[0]);
    });
  }

  if (markPaidBtn) markPaidBtn.addEventListener("click", markPaid);
  if (downloadBtn) downloadBtn.addEventListener("click", downloadPdf);
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (draft && !window.confirm("Clear the loaded invoice?")) return;
      resetAll();
    });
  }
  if (paidDateInput) {
    paidDateInput.addEventListener("change", function () {
      if (!draft || !draft.values) return;
      draft.values.paidDate = paidDateInput.value;
    });
  }

  if (dropEl) {
    dropEl.addEventListener("dragover", function (e) {
      if (!toolOpen()) return;
      if (!e.dataTransfer || !e.dataTransfer.types) return;
      if (Array.prototype.indexOf.call(e.dataTransfer.types, "Files") === -1) return;
      e.preventDefault();
      dropEl.classList.add("is-drop");
    });
    dropEl.addEventListener("dragleave", function (e) {
      if (e.relatedTarget && dropEl.contains(e.relatedTarget)) return;
      dropEl.classList.remove("is-drop");
    });
    dropEl.addEventListener("drop", function (e) {
      if (!toolOpen()) return;
      e.preventDefault();
      dropEl.classList.remove("is-drop");
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handlePdfFile(file);
    });
  }

  if (paidDateInput && !paidDateInput.value) paidDateInput.value = todayISO();
  render();
})();

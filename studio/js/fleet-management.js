(function () {
  "use strict";

  var root = null;
  var fleets = [];
  var seats = [];
  var invoices = [];
  var loading = false;
  var error = "";
  var notice = "";
  var openId = "";
  var draft = blankDraft();
  var invoiceDraft = null;

  function blankDraft() {
    var through = new Date();
    through.setFullYear(through.getFullYear() + 1);
    return {
      id: "",
      company_name: "",
      contact_email: "",
      code: "",
      seats: 5,
      paid_through: through.toISOString().slice(0, 10),
      active: true,
      notes: "",
      billing_address: ""
    };
  }

  function el(name) {
    return root ? root.querySelector('[data-el="' + name + '"]') : null;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function makeCode(name) {
    var letters = String(name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    var slug = (letters || "FLEET").slice(0, 8);
    if (slug.length < 2) slug = "FLEET";
    var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var tail = "";
    for (var i = 0; i < 4; i += 1) tail += alphabet[Math.floor(Math.random() * alphabet.length)];
    return "PP-" + slug + "-" + tail;
  }

  function seatsFor(id) {
    return seats.filter(function (row) { return row.fleet_id === id; });
  }

  function statusOf(fleet) {
    if (!fleet.active) return "Off";
    var day = String(fleet.paid_through || "");
    var today = new Date().toISOString().slice(0, 10);
    if (day && day < today) return "Unpaid";
    return "Paid";
  }

  function shell() {
    return (
      '<div class="fleet-shell">' +
        '<p class="tos-note">A company pays you by invoice. Each seat gets its own code, and that code works on one phone or tablet. The apps do not ask for a code until the next build that includes Company tablet.</p>' +
        '<p class="fleet-error" data-el="notice"></p>' +
        '<form class="fleet-form" data-el="form">' +
          "<h2>Add a company</h2>" +
          '<label>Company name<input name="company_name" required placeholder="Harper Trucking"></label>' +
          '<label>Contact email<input name="contact_email" type="email" placeholder="office@harper.example"></label>' +
          '<label>Billing address<textarea name="billing_address" rows="2" placeholder="Street, city, state, ZIP"></textarea></label>' +
          '<div class="fleet-form-row">' +
            '<label>Seats<input name="seats" type="number" min="1" max="5000" value="5" required></label>' +
            '<label>Paid through<input name="paid_through" type="date" required></label>' +
          "</div>" +
          '<p class="tos-note">Saving creates one code per seat. Harper with 10 seats gets 10 different codes.</p>' +
          '<label>Company notes<textarea name="notes" rows="3" placeholder="Who to call, how they pay, anything you want to remember"></textarea></label>' +
          '<div class="fleet-form-actions">' +
            '<button type="submit" class="btn btn-primary">Save company</button>' +
          "</div>" +
        "</form>" +
        '<div data-el="list"></div>' +
      "</div>"
    );
  }

  function fillForm() {
    var form = el("form");
    if (!form) return;
    form.company_name.value = draft.company_name || "";
    form.contact_email.value = draft.contact_email || "";
    form.seats.value = draft.seats || 5;
    form.paid_through.value = draft.paid_through || "";
    form.billing_address.value = draft.billing_address || "";
    form.notes.value = draft.notes || "";
    var title = form.querySelector("h2");
    var submit = form.querySelector('button[type="submit"]');
    if (title) title.textContent = draft.id ? "Edit company" : "Add a company";
    if (submit) submit.textContent = draft.id ? "Save changes" : "Save company";
  }

  function readForm() {
    var form = el("form");
    return {
      id: draft.id || "",
      company_name: form.company_name.value.trim(),
      contact_email: form.contact_email.value.trim(),
      seats: Number(form.seats.value || 1),
      paid_through: form.paid_through.value,
      notes: form.notes.value.trim(),
      billing_address: form.billing_address.value.trim(),
      active: draft.id ? draft.active !== false : true
    };
  }

  function invoicesFor(id) {
    return invoices.filter(function (row) { return row.fleet_id === id; });
  }

  function nextInvoiceNumber() {
    var year = new Date().getFullYear();
    var n = invoices.length + 1;
    var number = "PP-" + year + "-" + String(n).padStart(3, "0");
    var used = {};
    invoices.forEach(function (row) { used[row.number] = true; });
    while (used[number]) {
      n += 1;
      number = "PP-" + year + "-" + String(n).padStart(3, "0");
    }
    return number;
  }

  function blankInvoice(fleet) {
    var issued = new Date().toISOString().slice(0, 10);
    var due = new Date();
    due.setDate(due.getDate() + 14);
    return {
      id: "",
      fleet_id: fleet.id,
      number: nextInvoiceNumber(),
      status: "draft",
      issued_on: issued,
      due_on: due.toISOString().slice(0, 10),
      description: "Permit Path fleet seats for " + fleet.company_name + ". " + fleet.seats + " phones or tablets, paid through " + fleet.paid_through + ".",
      qty: Number(fleet.seats) || 1,
      rate: "",
      note: ""
    };
  }

  function invoiceDoc(fleet, invoice, amountPaid) {
    return {
      kind: "invoice",
      number: invoice.number,
      fromName: "STL Apps LLC",
      fromContact: "Sean Tyler Lee",
      fromEmail: "seantylerlee@icloud.com",
      fromWebsite: "seantylerlee.com",
      clientName: fleet.company_name,
      clientEmail: fleet.contact_email || "",
      clientAddress: fleet.billing_address || "",
      projectName: "Permit Path",
      documentDate: invoice.issued_on,
      terms: "custom",
      dueDate: invoice.due_on,
      items: [{ desc: invoice.description, qty: Number(invoice.qty) || 0, rate: Number(invoice.rate) || 0 }],
      discountType: "none",
      discountValue: 0,
      taxPercent: 0,
      amountPaid: amountPaid || 0,
      notes: invoice.note || "STL Apps LLC is the owner of Permit Path. This invoice is for fleet seats on company phones and tablets.",
      paymentNotes: "Payable to STL Apps LLC. Include the invoice number with your payment."
    };
  }

  function readInvoiceForm(fleet) {
    var box = root.querySelector("[data-invoice-form]");
    return {
      id: invoiceDraft && invoiceDraft.id || "",
      fleet_id: fleet.id,
      number: box.querySelector("[name=number]").value.trim(),
      status: box.querySelector("[name=status]").value,
      issued_on: box.querySelector("[name=issued_on]").value,
      due_on: box.querySelector("[name=due_on]").value,
      description: box.querySelector("[name=description]").value.trim(),
      qty: Number(box.querySelector("[name=qty]").value || 1),
      rate: Number(box.querySelector("[name=rate]").value || 0),
      note: box.querySelector("[name=note]").value.trim()
    };
  }

  function invoiceBlock(fleet, deviceRows) {
    var list = invoicesFor(fleet.id).map(function (row) {
      return "<tr><td>" + esc(row.number) + "</td><td>" + esc(row.status) + "</td><td>" +
        esc(row.issued_on) + "</td><td>" + esc(Number(row.amount || 0).toLocaleString("en-US", { style: "currency", currency: "USD" })) +
        '</td><td><button type="button" class="btn btn-ghost" data-invoice-edit="' + esc(row.id) + '">Open</button></td></tr>';
    }).join("");
    var editor = "";
    if (invoiceDraft && invoiceDraft.fleet_id === fleet.id) {
      editor =
        '<form class="fleet-form" data-invoice-form>' +
          "<h2>" + (invoiceDraft.id ? "Edit invoice" : "New invoice") + "</h2>" +
          '<div class="fleet-form-row">' +
            '<label>Invoice number<input name="number" value="' + esc(invoiceDraft.number) + '" required></label>' +
            '<label>Status<select name="status">' +
              ["draft", "sent", "paid"].map(function (status) {
                return '<option value="' + status + '"' + (invoiceDraft.status === status ? " selected" : "") + ">" + status + "</option>";
              }).join("") +
            "</select></label>" +
          "</div>" +
          '<div class="fleet-form-row">' +
            '<label>Issued<input name="issued_on" type="date" value="' + esc(invoiceDraft.issued_on) + '" required></label>' +
            '<label>Due<input name="due_on" type="date" value="' + esc(invoiceDraft.due_on) + '"></label>' +
          "</div>" +
          '<label>Line description<textarea name="description" rows="3">' + esc(invoiceDraft.description) + "</textarea></label>" +
          '<div class="fleet-form-row">' +
            '<label>Quantity<input name="qty" type="number" min="1" value="' + esc(invoiceDraft.qty) + '"></label>' +
            '<label>Rate, USD<input name="rate" type="number" min="0" step="0.01" value="' + esc(invoiceDraft.rate) + '"></label>' +
          "</div>" +
          '<label>Invoice note<textarea name="note" rows="2">' + esc(invoiceDraft.note || "") + "</textarea></label>" +
          '<p class="tos-note">The PDF is from STL Apps LLC for Permit Path. The bill-to name and address come from this company.</p>' +
          '<div class="fleet-form-actions">' +
            '<button type="submit" class="btn btn-primary">Save invoice</button>' +
            '<button type="button" class="btn btn-ghost" data-invoice-pdf>Download PDF</button>' +
            '<button type="button" class="btn btn-ghost" data-invoice-send>Send</button>' +
            '<button type="button" class="btn btn-ghost" data-invoice-cancel>Close</button>' +
          "</div>" +
        "</form>";
    }
    return (
      '<table class="fleet-seats"><thead><tr><th>Code</th><th>Status</th><th>Last check</th><th></th></tr></thead><tbody>' +
        (deviceRows || '<tr><td colspan="4">No codes yet. Save the company with a seat count.</td></tr>') +
      "</tbody></table>" +
      "<h3>Invoices</h3>" +
      '<table class="fleet-seats"><thead><tr><th>Number</th><th>Status</th><th>Issued</th><th>Amount</th><th></th></tr></thead><tbody>' +
        (list || '<tr><td colspan="5">No invoices saved for this company.</td></tr>') +
      "</tbody></table>" +
      '<div class="fleet-form-actions"><button type="button" class="btn btn-primary" data-invoice-new="' + esc(fleet.id) + '">New invoice</button></div>' +
      editor
    );
  }

  function card(fleet) {
    var used = seatsFor(fleet.id);
    var open = openId === fleet.id;
    var claimed = used.filter(function (seat) { return seat.install_id; }).length;
    var rows = used.map(function (seat) {
      var phone = seat.platform === "ios" ? "iPhone or iPad" : seat.platform === "android" ? "Android" : "Phone or tablet";
      var where = seat.install_id ? phone + " · " + String(seat.install_id).slice(0, 8) : "Not used yet";
      if (seat.active === false) where = "Turned off";
      return (
        "<tr><td class=\"fleet-code\">" + esc(seat.code || "—") + "</td><td>" + esc(where) +
        "</td><td>" + esc(seat.last_seen && seat.install_id ? new Date(seat.last_seen).toLocaleString() : "") +
        '</td><td><button type="button" class="btn btn-ghost" data-copy="' + esc(seat.code || "") + '">Copy</button> ' +
        '<button type="button" class="btn btn-ghost" data-seat="' + esc(seat.id) + '" data-seat-active="' + (seat.active === false ? "1" : "0") + '">' +
        (seat.active === false ? "Turn on" : "Turn off") + "</button></td></tr>"
      );
    }).join("");
    return (
      '<article class="fleet-card">' +
        '<header><div><h3>' + esc(fleet.company_name) + "</h3><p>" + esc(fleet.contact_email || "No email") + "</p></div>" +
        '<span class="fleet-status fleet-status-' + statusOf(fleet).toLowerCase() + '">' + esc(statusOf(fleet)) + "</span></header>" +
        "<p>" + claimed + " of " + used.length + " codes in use · paid through " + esc(fleet.paid_through) + "</p>" +
        (fleet.notes ? "<p>" + esc(fleet.notes) + "</p>" : "") +
        '<div class="fleet-form-actions">' +
          '<button type="button" class="btn btn-ghost" data-edit="' + esc(fleet.id) + '">Edit</button>' +
          '<button type="button" class="btn btn-ghost" data-toggle="' + esc(fleet.id) + '">' + (fleet.active ? "Turn company off" : "Turn company on") + "</button>" +
          '<button type="button" class="btn btn-danger" data-remove="' + esc(fleet.id) + '">Delete</button>' +
        "</div>" +
        invoiceBlock(fleet, rows) +
      "</article>"
    );
  }

  function render() {
    if (!root) return;
    if (!root.querySelector("[data-el='form']")) root.innerHTML = shell();
    var note = el("notice");
    if (note) note.textContent = loading ? "Loading fleets…" : error || notice;
    fillForm();
    var list = el("list");
    if (!list) return;
    list.innerHTML = fleets.length
      ? fleets.map(card).join("")
      : '<div class="ops-empty">No companies yet. Add one above. The code is created here, not inside the app.</div>';
    bind();
  }

  function bind() {
    var form = el("form");
    if (form && !form.getAttribute("data-bound")) {
      form.setAttribute("data-bound", "1");
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        save(readForm());
      });
      var newer = el("new-code");
    }
    if (!root) return;
    root.querySelectorAll("[data-copy]").forEach(function (btn) {
      btn.onclick = function () {
        var code = btn.getAttribute("data-copy") || "";
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code);
        notice = code ? "Copied " + code : "";
        error = "";
        render();
      };
    });
    root.querySelectorAll("[data-seat]").forEach(function (btn) {
      btn.onclick = function () {
        api().post("/api/permitpath-fleets", {
          action: "toggle-seat",
          id: btn.getAttribute("data-seat"),
          active: btn.getAttribute("data-seat-active") === "1"
        }).then(function () {
          notice = "Seat updated.";
          load();
        }).catch(function (err) {
          error = (err && err.message) || "Could not update that seat.";
          render();
        });
      };
    });
    root.querySelectorAll("[data-edit]").forEach(function (btn) {
      btn.onclick = function () {
        var found = fleets.filter(function (row) { return row.id === btn.getAttribute("data-edit"); })[0];
        if (!found) return;
        draft = {
          id: found.id,
          company_name: found.company_name,
          contact_email: found.contact_email,
          code: found.code,
          seats: found.seats,
          paid_through: found.paid_through,
          active: found.active,
          notes: found.notes || "",
          billing_address: found.billing_address || ""
        };
        render();
        var formEl = el("form");
        if (formEl) formEl.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    });
    root.querySelectorAll("[data-toggle]").forEach(function (btn) {
      btn.onclick = function () {
        var found = fleets.filter(function (row) { return row.id === btn.getAttribute("data-toggle"); })[0];
        if (!found) return;
        save({
          id: found.id,
          company_name: found.company_name,
          contact_email: found.contact_email || "",
          code: found.code,
          seats: found.seats,
          paid_through: found.paid_through,
          notes: found.notes || "",
          billing_address: found.billing_address || "",
          active: !found.active
        });
      };
    });
    root.querySelectorAll("[data-open]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-open") || "";
        openId = openId === id ? "" : id;
        render();
      };
    });
    root.querySelectorAll("[data-invoice-new]").forEach(function (btn) {
      btn.onclick = function () {
        var fleet = fleets.filter(function (row) { return row.id === btn.getAttribute("data-invoice-new"); })[0];
        if (!fleet) return;
        invoiceDraft = blankInvoice(fleet);
        openId = fleet.id;
        render();
      };
    });
    root.querySelectorAll("[data-invoice-edit]").forEach(function (btn) {
      btn.onclick = function () {
        var row = invoices.filter(function (item) { return item.id === btn.getAttribute("data-invoice-edit"); })[0];
        if (!row) return;
        var payload = row.payload || {};
        var item = (payload.items && payload.items[0]) || {};
        invoiceDraft = {
          id: row.id,
          fleet_id: row.fleet_id,
          number: row.number,
          status: row.status,
          issued_on: row.issued_on,
          due_on: row.due_on || "",
          description: item.desc || payload.projectName || "",
          qty: item.qty || 1,
          rate: item.rate || row.amount || "",
          note: payload.note || ""
        };
        openId = row.fleet_id;
        render();
      };
    });
    var invoiceForm = root.querySelector("[data-invoice-form]");
    if (invoiceForm) {
      invoiceForm.onsubmit = function (event) {
        event.preventDefault();
        var fleet = fleets.filter(function (row) { return row.id === invoiceDraft.fleet_id; })[0];
        if (fleet) saveInvoice(fleet, readInvoiceForm(fleet), false);
      };
      var pdfBtn = invoiceForm.querySelector("[data-invoice-pdf]");
      var sendBtn = invoiceForm.querySelector("[data-invoice-send]");
      var cancelBtn = invoiceForm.querySelector("[data-invoice-cancel]");
      if (pdfBtn) pdfBtn.onclick = function () {
        var fleet = fleets.filter(function (row) { return row.id === invoiceDraft.fleet_id; })[0];
        if (fleet) downloadInvoice(fleet, readInvoiceForm(fleet));
      };
      if (sendBtn) sendBtn.onclick = function () {
        var fleet = fleets.filter(function (row) { return row.id === invoiceDraft.fleet_id; })[0];
        if (!fleet) return;
        var invoice = readInvoiceForm(fleet);
        invoice.status = invoice.status === "paid" ? "paid" : "sent";
        saveInvoice(fleet, invoice, true);
      };
      if (cancelBtn) cancelBtn.onclick = function () {
        invoiceDraft = null;
        render();
      };
    }
    root.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-remove") || "";
        var found = fleets.filter(function (row) { return row.id === id; })[0];
        if (!found) return;
        if (!window.confirm("Delete " + found.company_name + "? Their code will stop working.")) return;
        remove(id);
      };
    });
  }

  function api() {
    if (!window.STLLocalApi || !window.STLLocalApi.available || !window.STLLocalApi.available()) {
      throw new Error("Sign in, then open Studio again.");
    }
    return window.STLLocalApi;
  }

  function load() {
    loading = true;
    error = "";
    render();
    var client;
    try { client = api(); } catch (err) {
      loading = false;
      error = err.message;
      render();
      return;
    }
    client.get("/api/permitpath-fleets").then(function (res) {
      fleets = (res && res.fleets) || [];
      seats = (res && res.seats) || [];
      invoices = (res && res.invoices) || [];
      loading = false;
      if (!draft.code) draft.code = makeCode("");
      render();
    }).catch(function (err) {
      fleets = [];
      seats = [];
      invoices = [];
      loading = false;
      error = (err && err.message) || "Could not load fleets.";
      render();
    });
  }

  function save(body) {
    notice = "";
    error = "";
    api().post("/api/permitpath-fleets", body).then(function (res) {
      draft = blankDraft();
      if (res && res.warning) {
        error = res.warning;
        notice = "";
      } else {
        error = "";
        notice = "Saved. Each seat below has its own code.";
      }
      load();
    }).catch(function (err) {
      error = (err && err.message) || "Could not save.";
      render();
    });
  }

  function amountOf(invoice) {
    return Math.round((Number(invoice.qty) || 0) * (Number(invoice.rate) || 0) * 100) / 100;
  }

  function downloadInvoice(fleet, invoice) {
    if (!window.STLBillingDoc || !window.STLBillingDoc.buildPdf) {
      error = "The invoice PDF library is not loaded. Refresh Studio.";
      render();
      return Promise.reject(new Error(error));
    }
    var paid = invoice.status === "paid" ? amountOf(invoice) : 0;
    return window.STLBillingDoc.buildPdf(invoiceDoc(fleet, invoice, paid)).then(function (file) {
      var link = document.createElement("a");
      link.href = URL.createObjectURL(file.blob);
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1500);
    });
  }

  function saveInvoice(fleet, invoice, send) {
    notice = "";
    error = "";
    var amount = amountOf(invoice);
    var payload = invoiceDoc(fleet, invoice, invoice.status === "paid" ? amount : 0);
    payload.note = invoice.note || "";
    payload.items = [{ desc: invoice.description, qty: invoice.qty, rate: invoice.rate }];
    api().post("/api/permitpath-fleets", {
      action: "save-invoice",
      invoice: {
        id: invoice.id,
        fleet_id: fleet.id,
        number: invoice.number,
        status: invoice.status,
        issued_on: invoice.issued_on,
        due_on: invoice.due_on,
        amount: amount,
        payload: payload
      }
    }).then(function () {
      notice = send ? "Invoice saved. Your mail app will open so you can attach the PDF." : "Invoice saved.";
      if (send) {
        downloadInvoice(fleet, invoice).catch(function () {});
        var subject = encodeURIComponent("Permit Path invoice " + invoice.number + " from STL Apps LLC");
        var body = encodeURIComponent(
          "Attached is invoice " + invoice.number + " from STL Apps LLC for Permit Path fleet seats.\n\nPayable to STL Apps LLC."
        );
        if (fleet.contact_email) window.location.href = "mailto:" + fleet.contact_email + "?subject=" + subject + "&body=" + body;
      }
      invoiceDraft = null;
      load();
    }).catch(function (err) {
      error = (err && err.message) || "Could not save the invoice.";
      render();
    });
  }

  function remove(id) {
    api().post("/api/permitpath-fleets", { action: "delete", id: id }).then(function () {
      if (draft.id === id) draft = blankDraft();
      notice = "Company deleted.";
      load();
    }).catch(function (err) {
      error = (err && err.message) || "Could not delete.";
      render();
    });
  }

  window.STLFleetManagement = {
    mount: function (panel) {
      root = panel;
      fleets = [];
      seats = [];
      invoices = [];
      invoiceDraft = null;
      openId = "";
      draft = blankDraft();
      error = "";
      notice = "";
      if (root) root.innerHTML = shell();
      load();
    },
    unmount: function () { root = null; },
    shown: function () { load(); }
  };
})();

(function () {
  "use strict";

  var root = null;
  var fleets = [];
  var seats = [];
  var invoices = [];
  var payments = [];
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

  function isTrial(seat) {
    return String(seat.billing || "paid") === "trial";
  }

  function paidSeats(id) {
    return seatsFor(id).filter(function (seat) { return !isTrial(seat) && seat.active !== false; });
  }

  function trialSeats(id) {
    return seatsFor(id).filter(function (seat) { return isTrial(seat) && seat.active !== false; });
  }

  function rateFor(paidCount) {
    return paidCount >= 21 ? 3.39 : 3.99;
  }

  function paymentLine(id) {
    var rows = payments.filter(function (row) { return row.fleet_id === id; }).slice(0, 3);
    if (!rows.length) return "";
    return "<p>Payments: " + rows.map(function (row) {
      return money(row.amount) + " on " + String(row.paid_at || "").slice(0, 10);
    }).join(" · ") + "</p>";
  }

  function renewSoon(fleet) {
    if (!fleet || !fleet.active || !fleet.paid_through) return false;
    var end = new Date(fleet.paid_through + "T00:00:00");
    if (isNaN(end.getTime())) return false;
    var days = (end.getTime() - Date.now()) / 86400000;
    return days <= 30;
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
        '<div class="direct-stats" data-el="summary"></div>' +
        '<p class="tos-note">1–20 paid devices are $3.99 each per month. 21 or more are $3.39 each per month. Trial codes are free for one month and are not in that price.</p>' +
        '<p class="fleet-error" data-el="notice"></p>' +
        '<form class="fleet-form" data-el="form">' +
          "<h2>Add a company</h2>" +
          '<label>Company name<input name="company_name" required placeholder="Harper Trucking"></label>' +
          '<label>Contact email<input name="contact_email" type="email" placeholder="office@harper.example"></label>' +
          '<label>Fleet login email<input name="portal_email" type="email" placeholder="office@harper.example"></label>' +
          '<label>Fleet password<input name="portal_password" type="text" autocomplete="off" placeholder="At least 8 characters. Leave blank to keep the current password."></label>' +
          '<label>Billing address<textarea name="billing_address" rows="2" placeholder="Street, city, state, ZIP"></textarea></label>' +
          '<div class="fleet-form-row">' +
            '<label>Paid seats<input name="seats" type="number" min="1" max="5000" value="5" required></label>' +
            '<label>Paid through<input name="paid_through" type="date" required></label>' +
          "</div>" +
          '<p class="tos-note">Paid seats are billed. Add trial codes from the company after it is saved. A trial lasts one month.</p>' +
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
    if (form.portal_email) form.portal_email.value = draft.portal_email || "";
    if (form.portal_password) form.portal_password.value = "";
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
      portal_email: form.portal_email.value.trim(),
      portal_password: form.portal_password.value,
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
      service_start: issued,
      seats: activeSeatCodes(fleet.id).length || Number(fleet.seats) || 1,
      codes: activeSeatCodes(fleet.id),
      rate: "",
      months: 6,
      note: ""
    };
  }

  function addMonths(iso, months) {
    if (!iso) return "";
    var date = new Date(iso + "T00:00:00");
    if (isNaN(date.getTime())) return "";
    date.setMonth(date.getMonth() + Number(months || 0));
    return date.toISOString().slice(0, 10);
  }

  function prettyDate(iso) {
    if (!iso) return "";
    var date = new Date(iso + "T00:00:00");
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  function money(n) {
    return Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function invoicePreviewHtml(fleet, invoice) {
    var total = amountOf(invoice);
    var start = invoice.service_start || invoice.issued_on;
    var end = addMonths(start, invoice.months);
    var address = String(fleet.billing_address || "").split(/\n/).filter(Boolean).map(function (line) {
      return "<div>" + esc(line) + "</div>";
    }).join("");
    var note = invoice.note || ("Payable to STL Apps LLC, owner of Permit Path. Access runs from " +
      prettyDate(start) + " through " + prettyDate(end) + ".");
    return (
      '<article class="invoice-sheet">' +
        '<header>' +
          '<img src="images/permitpath-logo.png" alt="Permit Path">' +
          '<div><strong>INVOICE</strong><span>' + esc(invoice.number || "") + "</span><em>" + esc(String(invoice.status || "draft").toUpperCase()) + "</em></div>" +
        "</header>" +
        '<p class="invoice-brand"><img src="images/stlapps-logo.jpg" alt="STL Apps LLC"><span>An STL Apps LLC company<br>Sean Lee<br>seantylerlee@icloud.com<br>seantylerlee.com</span></p>' +
        '<div class="invoice-parties">' +
          "<section><h4>Bill to</h4><strong>" + esc(fleet.company_name || "") + "</strong>" + address +
            (fleet.contact_email ? "<div>" + esc(fleet.contact_email) + "</div>" : "") + "</section>" +
          "<section><h4>Service</h4>" +
            "<div><span>Issued</span>" + esc(prettyDate(invoice.issued_on)) + "</div>" +
            "<div><span>Payment due</span>" + esc(prettyDate(invoice.due_on)) + "</div>" +
            "<div><span>Starts</span>" + esc(prettyDate(start)) + "</div>" +
            "<div><span>Expires</span>" + esc(prettyDate(end)) + "</div>" +
          "</section>" +
        "</div>" +
        "<table><thead><tr><th>Description</th><th>Seats</th><th>Months</th><th>Per seat</th><th>Amount</th></tr></thead><tbody><tr>" +
          "<td>Permit Path fleet seats" + (invoice.rate === 3.39 ? " · 21+ rate" : "") + "</td><td>" + esc(invoice.seats) + "</td><td>" + esc(invoice.months) +
          "</td><td>" + esc(money(invoice.rate)) + "</td><td>" + esc(money(total)) + "</td>" +
        "</tr></tbody></table>" +
        '<p class="invoice-due"><span>Amount due</span><strong>' + esc(money(total)) + "</strong></p>" +
        codeListHtml(invoice.codes) +
        "<p>" + esc(note) + "</p>" +
      "</article>"
    );
  }

  function codeListHtml(codes) {
    var list = codes || [];
    if (!list.length) return "<p>No seat codes on this invoice.</p>";
    return "<h4>Seat codes</h4><div class=\"invoice-codes\">" + list.map(function (code) {
      return "<span>" + esc(code) + "</span>";
    }).join("") + "</div>";
  }

  function activeSeatCodes(fleetId) {
    return seatsFor(fleetId).filter(function (seat) {
      return seat.code && seat.active !== false;
    }).map(function (seat) { return seat.code; });
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
      service_start: box.querySelector("[name=service_start]").value,
      seats: checkedCodes().filter(function (code) {
        var seat = seats.filter(function (row) { return row.code === code; })[0];
        return seat && !isTrial(seat);
      }).length,
      rate: rateFor(paidSeats(fleet.id).length),
      months: Number(box.querySelector("[name=months]").value || 1),
      note: box.querySelector("[name=note]").value.trim(),
      codes: checkedCodes()
    };
  }

  function checkedCodes() {
    if (!root) return [];
    return Array.prototype.map.call(root.querySelectorAll("[data-code-pick]:checked"), function (box) {
      return box.getAttribute("data-code-pick");
    });
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
        '<div class="invoice-maker">' +
          '<form class="fleet-form" data-invoice-form>' +
            "<h2>" + (invoiceDraft.id ? "Edit invoice" : "New invoice") + "</h2>" +
            '<div class="fleet-form-row">' +
              '<label>Invoice number<input name="number" value="' + esc(invoiceDraft.number) + '" required></label>' +
              '<label>Status<select name="status">' +
                ["draft", "sent", "paid"].map(function (status) {
                  var label = status.charAt(0).toUpperCase() + status.slice(1);
                  return '<option value="' + status + '"' + (invoiceDraft.status === status ? " selected" : "") + ">" + label + "</option>";
                }).join("") +
              "</select></label>" +
            "</div>" +
            '<div class="fleet-form-row">' +
              '<label>Issued<input name="issued_on" type="date" value="' + esc(invoiceDraft.issued_on) + '" required></label>' +
              '<label>Payment due<input name="due_on" type="date" value="' + esc(invoiceDraft.due_on) + '"></label>' +
            "</div>" +
            '<p class="tos-note">Price follows the company. 1–20 paid devices are $3.99. 21 or more are $3.39. Trial codes on this invoice are free.</p>' +
            '<div class="fleet-form-row">' +
              '<label>Duration<select name="months">' +
                [1, 3, 6, 12].map(function (months) {
                  return '<option value="' + months + '"' + (Number(invoiceDraft.months) === months ? " selected" : "") + ">" + months + (months === 1 ? " month" : " months") + "</option>";
                }).join("") +
              "</select></label>" +
              '<label>Service starts<input name="service_start" type="date" value="' + esc(invoiceDraft.service_start || invoiceDraft.issued_on) + '"></label>' +
            "</div>" +
            '<p class="tos-note">Check the codes to print on this invoice. The seat count follows those checks. Copy all codes copies every active code.</p>' +
            '<label>Note on the invoice<textarea name="note" rows="2" placeholder="Optional. Leave blank for the standard payment note.">' + esc(invoiceDraft.note || "") + "</textarea></label>" +
            '<div class="fleet-form-actions">' +
              '<button type="submit" class="btn btn-primary">Save invoice</button>' +
              '<button type="button" class="btn btn-ghost" data-invoice-pdf>Download PDF</button>' +
              '<button type="button" class="btn btn-ghost" data-invoice-send>Send</button>' +
              '<button type="button" class="btn btn-ghost" data-invoice-cancel>Close</button>' +
            "</div>" +
          "</form>" +
          '<div class="invoice-preview" data-invoice-preview></div>' +
        "</div>";
    }
    return (
      '<div class="fleet-form-actions">' +
        '<button type="button" class="btn btn-ghost" data-copy-all="' + esc(fleet.id) + '">Copy all codes</button>' +
        '<button type="button" class="btn btn-primary" data-invoice-new="' + esc(fleet.id) + '">New invoice</button>' +
      "</div>" +
      '<table class="fleet-seats"><thead><tr><th></th><th>Code</th><th>Status</th><th></th></tr></thead><tbody>' +
        (deviceRows || '<tr><td colspan="4">No codes yet. Save the company with a seat count.</td></tr>') +
      "</tbody></table>" +
      (list ? '<table class="fleet-seats"><thead><tr><th>Invoice</th><th>Status</th><th>Issued</th><th>Amount</th><th></th></tr></thead><tbody>' + list + "</tbody></table>" : "") +
      editor
    );
  }

  function card(fleet) {
    var used = seatsFor(fleet.id);
    var open = openId === fleet.id;
    var claimed = used.filter(function (seat) { return seat.install_id; }).length;
    var invoicing = invoiceDraft && invoiceDraft.fleet_id === fleet.id;
    var chosen = invoicing && invoiceDraft.codes ? invoiceDraft.codes : [];
    var rows = used.map(function (seat) {
      var phone = seat.platform === "ios" ? "iPhone or iPad" : seat.platform === "android" ? "Android" : "Phone or tablet";
      var where = isTrial(seat) ? "Trial until " + (seat.trial_until || "—") : "Paid";
      if (seat.install_id) where += " · " + phone;
      else where += " · not used";
      if (seat.active === false) where = "Off";
      var pick = invoicing && seat.code
        ? '<input type="checkbox" data-code-pick="' + esc(seat.code) + '"' + (chosen.indexOf(seat.code) !== -1 ? " checked" : "") + (seat.active === false ? " disabled" : "") + ">"
        : "";
      return (
        "<tr><td>" + pick + "</td><td class=\"fleet-code\">" + esc(seat.code || "—") + "</td><td>" + esc(where) +
        '</td><td><button type="button" class="btn btn-ghost" data-copy="' + esc(seat.code || "") + '">Copy</button> ' +
        '<button type="button" class="btn btn-ghost" data-seat="' + esc(seat.id) + '" data-seat-active="' + (seat.active === false ? "1" : "0") + '">' +
        (seat.active === false ? "Turn on" : "Turn off") + "</button></td></tr>"
      );
    }).join("");
    return (
      '<article class="fleet-card">' +
        '<header><div><h3>' + esc(fleet.company_name) + "</h3><p>" + esc(fleet.contact_email || "No email") + "</p></div>" +
        '<span class="fleet-status fleet-status-' + statusOf(fleet).toLowerCase() + '">' + esc(statusOf(fleet)) + "</span></header>" +
        (renewSoon(fleet) ? '<p class="fleet-error">Renewal is inside 30 days. Email ' + esc(fleet.portal_email || fleet.contact_email || "the company") + " to request payment. Turn the company off if they do not pay.</p>" : "") +
        paymentLine(fleet.id) +
        "<p>" + (fleet.portal_email ? "Login " + esc(fleet.portal_email) + " · " : "No fleet login yet · ") + paidSeats(fleet.id).length + " paid at " + money(rateFor(paidSeats(fleet.id).length)) + " / device / month · " +
          trialSeats(fleet.id).length + " trial · " + claimed + " in use · paid through " + esc(fleet.paid_through) + "</p>" +
        '<div class="fleet-form-actions">' +
          '<label>Add paid seats<input type="number" min="1" value="1" data-add-count="paid-' + esc(fleet.id) + '"></label>' +
          '<button type="button" class="btn btn-ghost" data-add-seats="' + esc(fleet.id) + '" data-add-kind="paid">Add paid</button>' +
          '<label>Add trial seats<input type="number" min="1" value="2" data-add-count="trial-' + esc(fleet.id) + '"></label>' +
          '<button type="button" class="btn btn-ghost" data-add-seats="' + esc(fleet.id) + '" data-add-kind="trial">Add 1-month trial</button>' +
        "</div>" +
        (fleet.notes ? "<p>" + esc(fleet.notes) + "</p>" : "") +
        '<div class="fleet-form-actions">' +
          '<button type="button" class="btn btn-ghost" data-copy-link="https://permitpathnav.com/fleet-solutions.html#fleet-login">Copy login link</button>' +
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
    var summary = el("summary");
    if (summary) {
      var paid = 0;
      var trial = 0;
      var monthly = 0;
      fleets.forEach(function (fleet) {
        var count = paidSeats(fleet.id).length;
        paid += count;
        trial += trialSeats(fleet.id).length;
        monthly += count * rateFor(count);
      });
      summary.innerHTML =
        '<div class="direct-stat"><span>' + fleets.length + '</span><small>Companies</small></div>' +
        '<div class="direct-stat"><span>' + paid + '</span><small>Paid devices</small></div>' +
        '<div class="direct-stat"><span>' + trial + '</span><small>Trial devices</small></div>' +
        '<div class="direct-stat"><span>' + money(monthly) + '</span><small>Per month</small></div>';
    }
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
    root.querySelectorAll("[data-add-seats]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-add-seats");
        var kind = btn.getAttribute("data-add-kind") || "paid";
        var input = root.querySelector('[data-add-count="' + kind + "-" + id + '"]');
        var fleet = fleets.filter(function (row) { return row.id === id; })[0];
        api().post("/api/permitpath-fleets", {
          action: "add-seats",
          id: id,
          company_name: fleet ? fleet.company_name : "",
          kind: kind,
          count: Number(input && input.value) || 1
        }).then(function (res) {
          var data = (res && res.data) || {};
          if (!res || !res.ok) {
            error = data.error || "Could not add seats.";
            render();
            return;
          }
          notice = kind === "trial" ? "Trial codes added for one month." : "Paid codes added.";
          load();
        }).catch(function (err) {
          error = (err && err.message) || "Could not add seats.";
          render();
        });
      };
    });
    root.querySelectorAll("[data-copy-link]").forEach(function (btn) {
      btn.onclick = function () {
        var link = btn.getAttribute("data-copy-link") || "";
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link);
        notice = "Copied the fleet login link.";
        error = "";
        render();
      };
    });
    root.querySelectorAll("[data-copy-all]").forEach(function (btn) {
      btn.onclick = function () {
        var codes = activeSeatCodes(btn.getAttribute("data-copy-all"));
        var text = codes.join("\n");
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
        notice = codes.length ? "Copied " + codes.length + " codes." : "No active codes to copy.";
        error = "";
        render();
      };
    });
    root.querySelectorAll("[data-code-pick]").forEach(function (box) {
      box.onchange = function () {
        var codes = checkedCodes();
        if (invoiceDraft) invoiceDraft.codes = codes;
        var preview = root.querySelector("[data-invoice-preview]");
        var fleet = fleets.filter(function (row) { return invoiceDraft && row.id === invoiceDraft.fleet_id; })[0];
        if (preview && fleet) preview.innerHTML = invoicePreviewHtml(fleet, readInvoiceForm(fleet));
      };
    });
    root.querySelectorAll("[data-seat]").forEach(function (btn) {
      btn.onclick = function () {
        api().post("/api/permitpath-fleets", {
          action: "toggle-seat",
          id: btn.getAttribute("data-seat"),
          active: btn.getAttribute("data-seat-active") === "1"
        }).then(function (res) {
          var data = (res && res.data) || {};
          if (!res || !res.ok) {
            error = data.error || "Could not update that seat.";
            render();
            return;
          }
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
          billing_address: found.billing_address || "",
          portal_email: found.portal_email || ""
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
        invoiceDraft = {
          id: row.id,
          fleet_id: row.fleet_id,
          number: row.number,
          status: row.status,
          issued_on: row.issued_on,
          due_on: row.due_on || "",
          service_start: payload.service_start || row.issued_on,
          codes: payload.codes || [],
          seats: payload.seats || 1,
          rate: payload.rate || "",
          months: payload.months || 1,
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
      var preview = root.querySelector("[data-invoice-preview]");
      var refreshMath = function () {
        if (!preview || !invoiceDraft) return;
        var fleet = fleets.filter(function (row) { return row.id === invoiceDraft.fleet_id; })[0];
        if (!fleet) return;
        preview.innerHTML = invoicePreviewHtml(fleet, readInvoiceForm(fleet));
      };
      invoiceForm.querySelectorAll("input, select, textarea").forEach(function (field) {
        field.addEventListener("input", function () {
            refreshMath();
        });
      });
      refreshMath();
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
      var data = (res && res.data) || {};
      if (!res || !res.ok) {
        fleets = [];
        seats = [];
        invoices = [];
        error = data.error || "Could not load fleets.";
      } else {
        fleets = data.fleets || [];
        seats = data.seats || [];
        invoices = data.invoices || [];
        payments = data.payments || [];
        error = "";
      }
      loading = false;
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
      var data = (res && res.data) || {};
      if (!res || !res.ok) {
        error = data.error || "Could not save.";
        render();
        return;
      }
      draft = blankDraft();
      if (data.warning) {
        error = data.warning;
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
    return Math.round((Number(invoice.seats) || 0) * (Number(invoice.rate) || 0) * (Number(invoice.months) || 0) * 100) / 100;
  }

  function drawInvoiceCodes(doc, codes, y, pageW) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 24, 72);
    if (y > 700) {
      doc.addPage();
      y = 48;
    }
    doc.text("SEAT CODES", 48, y);
    y += 16;
    doc.setFont("courier", "normal");
    doc.setFontSize(10);
    doc.setTextColor(26, 35, 54);
    if (!codes.length) {
      doc.setFont("helvetica", "normal");
      doc.text("No seat codes on this invoice.", 48, y);
      return y + 18;
    }
    var columns = 3;
    var colW = (pageW - 96) / columns;
    codes.forEach(function (code, index) {
      var col = index % columns;
      if (col === 0 && index > 0) y += 14;
      if (y > 740) {
        doc.addPage();
        y = 48;
      }
      doc.text(String(code), 48 + col * colW, y);
    });
    return y + 22;
  }

  function loadLogo(src) {
    return fetch(src).then(function (res) { return res.blob(); }).then(function (blob) {
      return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.readAsDataURL(blob);
      });
    }).catch(function () { return null; });
  }

  function buildFleetInvoicePdf(fleet, invoice) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      return Promise.reject(new Error("PDF library failed to load."));
    }
    return Promise.all([
      loadLogo("images/permitpath-logo.png"),
      loadLogo("images/stlapps-logo.jpg")
    ]).then(function (logos) {
      var doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter", compress: true });
      var total = amountOf(invoice);
      var start = invoice.service_start || invoice.issued_on;
      var end = addMonths(start, invoice.months);
      var pageW = doc.internal.pageSize.getWidth();
      doc.setProperties({
        title: "Invoice " + invoice.number,
        author: "STL Apps LLC",
        creator: "STL Apps LLC"
      });
      doc.setFillColor(0, 24, 72);
      doc.rect(0, 0, pageW, 6, "F");
      if (logos[0]) doc.addImage(logos[0], "PNG", 48, 28, 210, 88);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(0, 24, 72);
      doc.text("INVOICE", pageW - 48, 52, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(80, 92, 118);
      doc.text(invoice.number || "", pageW - 48, 70, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(invoice.status === "paid" ? 27 : 138, invoice.status === "paid" ? 107 : 90, invoice.status === "paid" ? 50 : 0);
      doc.text(String(invoice.status || "draft").toUpperCase(), pageW - 48, 88, { align: "right" });

      var y = 132;
      if (logos[1]) doc.addImage(logos[1], "JPEG", 48, y, 92, 21);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(80, 92, 118);
      doc.text("An STL Apps LLC company", 148, y + 14);
      y += 36;
      doc.text("Sean Lee", 48, y);
      doc.text("seantylerlee@icloud.com", 48, y + 12);
      doc.text("seantylerlee.com", 48, y + 24);
      y += 42;
      doc.setDrawColor(213, 227, 251);
      doc.line(48, y, pageW - 48, y);
      y += 22;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(0, 24, 72);
      doc.text("BILL TO", 48, y);
      doc.text("SERVICE", 300, y);
      y += 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(26, 35, 54);
      doc.text(fleet.company_name || "", 48, y);
      var address = String(fleet.billing_address || "").split(/\n/).slice(0, 4);
      address.forEach(function (line, index) {
        doc.setFontSize(10);
        doc.text(line, 48, y + 14 + index * 12);
      });
      if (fleet.contact_email) doc.text(fleet.contact_email, 48, y + 14 + address.length * 12);
      var facts = [
        ["Issued", prettyDate(invoice.issued_on)],
        ["Payment due", prettyDate(invoice.due_on)],
        ["Service starts", prettyDate(start)],
        ["Service expires", prettyDate(end)]
      ];
      facts.forEach(function (fact, index) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(80, 92, 118);
        doc.text(fact[0], 300, y + index * 16);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(26, 35, 54);
        doc.text(fact[1] || "—", 390, y + index * 16);
      });
      y += Math.max(78, 28 + address.length * 12);
      doc.setFillColor(244, 248, 255);
      doc.rect(48, y, pageW - 96, 22, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(0, 24, 72);
      doc.text("DESCRIPTION", 56, y + 15);
      doc.text("SEATS", 300, y + 15);
      doc.text("MONTHS", 360, y + 15);
      doc.text("PER SEAT / MO", 430, y + 15);
      doc.text("AMOUNT", pageW - 56, y + 15, { align: "right" });
      y += 40;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(26, 35, 54);
      doc.text("Permit Path fleet seats", 56, y);
      doc.setFontSize(9);
      doc.setTextColor(80, 92, 118);
      doc.text("Company phones and tablets. One seat is one device.", 56, y + 14);
      doc.setFontSize(11);
      doc.setTextColor(26, 35, 54);
      doc.text(String(invoice.seats), 300, y);
      doc.text(String(invoice.months), 360, y);
      doc.text(money(invoice.rate), 430, y);
      doc.text(money(total), pageW - 56, y, { align: "right" });
      y += 36;
      doc.line(48, y, pageW - 48, y);
      y += 22;
      doc.setFont("helvetica", "bold");
      doc.text("AMOUNT DUE", 360, y);
      doc.setFontSize(14);
      doc.text(money(total), pageW - 56, y, { align: "right" });
      y += 28;
      y = drawInvoiceCodes(doc, invoice.codes || [], y, pageW);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(26, 35, 54);
      var note = invoice.note || "Payable to STL Apps LLC, owner of Permit Path. Access runs from " +
        prettyDate(start) + " through " + prettyDate(end) + ".";
      doc.splitTextToSize(note, pageW - 96).forEach(function (line) {
        doc.text(line, 48, y);
        y += 13;
      });
      doc.setFontSize(8);
      doc.setTextColor(80, 92, 118);
      doc.text("STL Apps LLC  ·  Permit Path  ·  seantylerlee.com", 48, 760);
      return {
        blob: doc.output("blob"),
        filename: "STL-Apps-LLC_Permit-Path_Invoice_" + String(invoice.number || "invoice").replace(/[^A-Za-z0-9-]+/g, "-") + ".pdf"
      };
    });
  }

  function downloadInvoice(fleet, invoice) {
    return buildFleetInvoicePdf(fleet, invoice).then(function (file) {
      var link = document.createElement("a");
      link.href = URL.createObjectURL(file.blob);
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1500);
    }).catch(function (err) {
      error = (err && err.message) || "Could not build the PDF.";
      render();
    });
  }

  function saveInvoice(fleet, invoice, send) {
    notice = "";
    error = "";
    var amount = amountOf(invoice);
    var payload = {
      seats: invoice.seats,
      rate: invoice.rate,
      months: invoice.months,
      service_start: invoice.service_start,
      service_end: addMonths(invoice.service_start, invoice.months),
      codes: invoice.codes || [],
      note: invoice.note || ""
    };
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
    }).then(function (res) {
      var data = (res && res.data) || {};
      if (!res || !res.ok) {
        error = data.error || "Could not save the invoice.";
        render();
        return;
      }
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
    api().post("/api/permitpath-fleets", { action: "delete", id: id }).then(function (res) {
      var data = (res && res.data) || {};
      if (!res || !res.ok) {
        error = data.error || "Could not delete.";
        render();
        return;
      }
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

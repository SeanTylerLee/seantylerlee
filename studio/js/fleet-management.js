(function () {
  "use strict";

  var root = null;
  var fleets = [];
  var seats = [];
  var payments = [];
  var loading = false;
  var error = "";
  var notice = "";
  var openId = "";
  var draft = blankDraft();
  var formOpen = false;

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

  function money(n) {
    return Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
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

  function fleetStillPaid(fleet) {
    if (!fleet || !fleet.paid_through) return false;
    var today = new Date().toISOString().slice(0, 10);
    if (String(fleet.paid_through).slice(0, 10) < today) return false;
    var paid = payments.some(function (row) { return row.fleet_id === fleet.id; });
    return paid || paidSeats(fleet.id).length > 0;
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
        '<button type="button" class="btn btn-primary" data-el="add-toggle">Add a company</button>' +
        '<form class="fleet-form hidden" data-el="form">' +
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
            '<button type="button" class="btn btn-ghost" data-el="add-close">Close</button>' +
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
    form.classList.toggle("hidden", !(formOpen || draft.id));
    var toggle = el("add-toggle");
    if (toggle) toggle.classList.toggle("hidden", !!(formOpen || draft.id));
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

  function invoiceBlock(fleet, deviceRows) {
    return (
      '<div class="fleet-form-actions">' +
        '<button type="button" class="btn btn-ghost" data-copy-all="' + esc(fleet.id) + '">Copy all codes</button>' +
      "</div>" +
      '<table class="fleet-seats"><thead><tr><th>Code</th><th>Note</th><th>Status</th><th></th></tr></thead><tbody>' +
        (deviceRows || '<tr><td colspan="4">No codes yet.</td></tr>') +
      "</tbody></table>"
    );
  }

  function card(fleet) {
    var used = seatsFor(fleet.id);
    var open = openId === fleet.id;
    var claimed = used.filter(function (seat) { return seat.install_id; }).length;
    var rows = used.map(function (seat) {
      var phone = seat.platform === "ios" ? "iPhone or iPad" : seat.platform === "android" ? "Android" : "Phone or tablet";
      var where = isTrial(seat) ? "Trial until " + (seat.trial_until || "—") : "Paid";
      if (seat.install_id) where += " · " + phone;
      else where += " · not used";
      if (seat.active === false) where = "Off";
      return (
        "<tr>" +
          '<td class="fleet-code">' + esc(seat.code || "—") + "</td>" +
          '<td class="fleet-note-cell">' +
            '<input type="text" maxlength="240" value="' + esc(seat.label || "") + '" placeholder="Note for this code" data-note-input="' + esc(seat.id) + '">' +
            '<button type="button" class="btn btn-ghost" data-save-note="' + esc(seat.id) + '">Save note</button>' +
          "</td>" +
          "<td>" + esc(where) + "</td>" +
          "<td>" +
            '<button type="button" class="btn btn-ghost" data-copy="' + esc(seat.code || "") + '">Copy</button> ' +
            '<button type="button" class="btn btn-ghost" data-seat="' + esc(seat.id) + '" data-seat-active="' + (seat.active === false ? "1" : "0") + '">' +
            (seat.active === false ? "Turn on" : "Turn off") + "</button>" +
          "</td>" +
        "</tr>"
      );
    }).join("");
    return (
      '<article class="fleet-card">' +
        '<header><div><h3>' + esc(fleet.company_name) + "</h3><p>" + esc(fleet.contact_email || "No email") + "</p></div>" +
        '<span class="fleet-status fleet-status-' + statusOf(fleet).toLowerCase() + '">' + esc(statusOf(fleet)) + "</span></header>" +
        (renewSoon(fleet) ? '<p class="fleet-error">Renewal is inside 30 days. Email ' + esc(fleet.portal_email || fleet.contact_email || "the company") + " to request payment. Turn the company off if they do not pay.</p>" : "") +
        (Number(fleet.trial_request_seats) > trialSeats(fleet.id).length ? '<p class="fleet-error">Free trial requested for ' + Number(fleet.trial_request_seats) + ' drivers. Add a 1-month trial for the seats they asked for.</p>' : "") +
        paymentLine(fleet.id) +
        "<p>" + (fleet.portal_email ? "Login " + esc(fleet.portal_email) + " · password " + esc(fleet.portal_password || "not saved yet") + " · " : "No fleet login yet · ") +
          (paidSeats(fleet.id).length ? paidSeats(fleet.id).length + " paid codes" : "No codes yet. Waiting on payment") + " · " +
          trialSeats(fleet.id).length + " trial · " + claimed + " in use · paid through " + esc(fleet.paid_through) + "</p>" +
        '<div class="fleet-form-actions">' +
          '<label>Add paid seats<input type="number" min="1" value="1" data-add-count="paid-' + esc(fleet.id) + '"></label>' +
          '<button type="button" class="btn btn-ghost" data-add-seats="' + esc(fleet.id) + '" data-add-kind="paid">Add paid</button>' +
          '<label>Add trial seats<input type="number" min="1" value="2" data-add-count="trial-' + esc(fleet.id) + '"></label>' +
          '<button type="button" class="btn btn-ghost" data-add-seats="' + esc(fleet.id) + '" data-add-kind="trial">Add 1-month trial</button>' +
        "</div>" +
        '<div class="fleet-custom-code">' +
          "<p class=\"tos-note\">Make your own code for this company. Drivers type it in Company access. Turn it off anytime. One phone per code.</p>" +
          '<div class="fleet-form-row">' +
            '<label>Custom code<input type="text" maxlength="40" placeholder="PP-HARPER-VIP1" data-custom-code="' + esc(fleet.id) + '"></label>' +
            '<label>Note for this code<input type="text" maxlength="240" placeholder="Dispatcher phone, truck 12, etc." data-custom-note="' + esc(fleet.id) + '"></label>' +
            '<label>Type<select data-custom-kind="' + esc(fleet.id) + '"><option value="paid">Paid</option><option value="trial">1-month trial</option></select></label>' +
          "</div>" +
          '<div class="fleet-form-actions">' +
            '<button type="button" class="btn btn-primary" data-add-custom="' + esc(fleet.id) + '">Add custom code</button>' +
          "</div>" +
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
    var opener = el("add-toggle");
    if (opener) opener.onclick = function () {
      formOpen = true;
      draft = blankDraft();
      render();
    };
    var closer = el("add-close");
    if (closer) closer.onclick = function () {
      formOpen = false;
      draft = blankDraft();
      render();
    };
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
    root.querySelectorAll("[data-add-custom]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-add-custom") || "";
        var codeInput = root.querySelector('[data-custom-code="' + id + '"]');
        var noteInput = root.querySelector('[data-custom-note="' + id + '"]');
        var kindInput = root.querySelector('[data-custom-kind="' + id + '"]');
        var code = codeInput ? String(codeInput.value || "").trim() : "";
        var note = noteInput ? String(noteInput.value || "").trim() : "";
        var kind = kindInput ? String(kindInput.value || "paid") : "paid";
        if (!code) {
          error = "Enter a custom code first.";
          notice = "";
          render();
          return;
        }
        api().post("/api/permitpath-fleets", {
          action: "add-custom-code",
          id: id,
          code: code,
          note: note,
          kind: kind
        }).then(function (res) {
          var data = (res && res.data) || {};
          if (!res || !res.ok) {
            error = data.error || "Could not add that custom code.";
            notice = "";
            render();
            return;
          }
          notice = "Custom code added" + (kind === "trial" ? " as a 1-month trial." : ".");
          error = "";
          load();
        }).catch(function (err) {
          error = (err && err.message) || "Could not add that custom code.";
          notice = "";
          render();
        });
      };
    });
    root.querySelectorAll("[data-save-note]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-save-note") || "";
        var input = root.querySelector('[data-note-input="' + id + '"]');
        var note = input ? String(input.value || "").trim() : "";
        api().post("/api/permitpath-fleets", {
          action: "update-seat-note",
          id: id,
          note: note
        }).then(function (res) {
          var data = (res && res.data) || {};
          if (!res || !res.ok) {
            error = data.error || "Could not save that note.";
            notice = "";
            render();
            return;
          }
          notice = "Note saved.";
          error = "";
          load();
        }).catch(function (err) {
          error = (err && err.message) || "Could not save that note.";
          notice = "";
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
        formOpen = true;
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
        if (found.active && fleetStillPaid(found)) {
          window.alert(found.company_name + " is paid through " + found.paid_through + ". Studio will not turn off a fleet until that paid period has ended.");
          return;
        }
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
    root.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-remove") || "";
        var found = fleets.filter(function (row) { return row.id === id; })[0];
        if (!found) return;
        if (fleetStillPaid(found)) {
          window.alert(found.company_name + " is paid through " + found.paid_through + ". Studio will not delete a fleet until that paid period has ended.");
          return;
        }
        if (!window.confirm("Delete " + found.company_name + "? Their codes will stop working.")) return;
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
          error = data.error || "Could not load fleets.";
      } else {
        fleets = data.fleets || [];
        seats = data.seats || [];
        payments = data.payments || [];
        error = "";
      }
      loading = false;
      render();
    }).catch(function (err) {
      fleets = [];
      seats = [];
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
      formOpen = false;
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

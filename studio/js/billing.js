(function () {
  "use strict";

  var FROM = {
    fromName: "STL Apps LLC",
    fromContact: "Sean Tyler Lee",
    fromEmail: "seantylerlee@icloud.com",
    fromPhone: "",
    fromWebsite: "seantylerlee.com",
    fromTaxId: "",
    fromAddress: "",
    paymentNotes: ""
  };

  var root = null;
  var db = null;
  var docs = [];
  var studioClients = [];
  var currentId = null;
  var currentKind = "invoice";
  var appEl = null;
  var scaleTimer = null;

  function Doc() {
    return window.STLBillingDoc;
  }

  function el(name) {
    return root.querySelector('[data-el="' + name + '"]');
  }

  function text(v) {
    return String(v == null ? "" : v).trim();
  }

  function showMsg(msg, ok) {
    var box = el("msg");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }

  function nextNumber(kind) {
    var use = kind || currentKind;
    var pre = use === "quote" ? "QTE" : "INV";
    var year = new Date().getFullYear();
    var re = new RegExp("^" + pre + "-" + year + "-(\\d+)$", "i");
    var max = 0;
    docs.forEach(function (doc) {
      if (use === "quote" && doc.kind !== "quote") return;
      if (use !== "quote" && doc.kind !== "invoice") return;
      var m = re.exec(doc.number || "");
      if (m) max = Math.max(max, Number(m[1]));
    });
    return pre + "-" + year + "-" + String(max + 1).padStart(4, "0");
  }

  function pdfKind() {
    if (currentKind === "quote") return "quote";
    var draft = {
      kind: "invoice",
      amountPaid: el("amount-paid") ? Number(el("amount-paid").value || 0) : 0,
      items: itemsFromForm(),
      discountType: el("discount-type") ? el("discount-type").value : "none",
      discountValue: el("discount-value") ? Number(el("discount-value").value || 0) : 0,
      taxPercent: el("tax") ? Number(el("tax").value || 0) : 0
    };
    var t = Doc().compute(draft);
    if (t.amountPaid > 0) return "receipt";
    return "invoice";
  }

  function itemsFromForm() {
    var rows = root.querySelectorAll(".item-row");
    var items = [];
    Array.prototype.forEach.call(rows, function (row) {
      items.push({
        desc: text(row.querySelector(".item-desc").value),
        qty: Number(row.querySelector(".item-qty").value || 0),
        rate: Number(row.querySelector(".item-rate").value || 0)
      });
    });
    return items;
  }

  function refreshAmounts() {
    var D = Doc();
    Array.prototype.forEach.call(root.querySelectorAll(".item-row"), function (row) {
      var qty = Number(row.querySelector(".item-qty").value || 0);
      var rate = Number(row.querySelector(".item-rate").value || 0);
      row.querySelector(".item-amount").textContent = D.money(qty * rate);
    });
    var t = D.compute(readDraft());
    var line = "Total " + D.money(t.total);
    if (currentKind !== "quote") {
      line += " · Paid " + D.money(t.amountPaid) + " · Remaining " + D.money(t.balance);
    }
    el("totals").textContent = line;
    var statusEl = el("status-label");
    if (statusEl) {
      statusEl.textContent = currentKind === "quote" ? "Quote" : Doc().statusTitle(t.status);
    }
  }

  function hidePricePicker() {
    var box = el("price-picker");
    if (box) box.classList.add("hidden");
  }

  function fillPricePicker(box, list) {
    if (!list.length) {
      box.innerHTML = "<p>No prices yet. Open Pricing, add items, and Save.</p>";
      return;
    }
    box.innerHTML = list.map(function (item, i) {
      var label = (item.name || "Item") + " · " + Doc().money(item.rate);
      return '<button type="button" data-pick="' + i + '">' + escapeHtml(label) + "</button>";
    }).join("");
    box.querySelectorAll("[data-pick]").forEach(function (btn) {
      btn.onclick = function () {
        var item = list[Number(btn.getAttribute("data-pick"))];
        if (!item) return;
        addItem(item.name || "", 1, item.rate);
        hidePricePicker();
        refreshPreview();
      };
    });
  }

  function togglePricePicker() {
    var box = el("price-picker");
    if (!box) return;
    if (!box.classList.contains("hidden")) {
      box.classList.add("hidden");
      return;
    }
    box.innerHTML = "<p>Loading prices…</p>";
    box.classList.remove("hidden");
    var ready = window.STLPricing && window.STLPricing.ensureLoaded
      ? window.STLPricing.ensureLoaded()
      : Promise.resolve(window.STLPricing && window.STLPricing.items ? window.STLPricing.items() : []);
    ready.then(function (list) {
      fillPricePicker(box, list || []);
    }).catch(function () {
      fillPricePicker(box, []);
    });
  }

  function addItem(desc, qty, rate) {
    var wrap = el("items");
    var row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML =
      '<input class="item-desc" type="text" placeholder="Line item" />' +
      '<input class="item-qty" type="number" min="0" step="0.01" />' +
      '<input class="item-rate" type="number" min="0" step="0.01" />' +
      '<span class="item-amount">$0.00</span>' +
      '<button class="item-remove" type="button" aria-label="Remove">&times;</button>';
    if (desc) row.querySelector(".item-desc").value = desc;
    row.querySelector(".item-qty").value = qty == null || qty === "" ? "1" : qty;
    if (rate != null && rate !== "") row.querySelector(".item-rate").value = rate;
    row.querySelector(".item-remove").addEventListener("click", function () {
      if (wrap.children.length < 2) return;
      row.remove();
      refreshPreview();
    });
    row.addEventListener("input", refreshPreview);
    wrap.appendChild(row);
  }

  function defaultNotes() {
    if (currentKind === "quote") {
      return "This quote is an estimate, not a contract. Prices are good through the valid-until date. Work starts after a signed agreement and the deposit clears. Anything not listed is out of scope.";
    }
    return "Thank you for your business.";
  }

  function emptyDraft() {
    var D = Doc();
    var today = D.todayISO();
    var kind = currentKind === "quote" ? "quote" : "invoice";
    return Object.assign({
      kind: kind,
      number: nextNumber(kind),
      documentDate: today,
      dueDate: kind === "quote" ? D.addDays(today, 14) : D.dueFromTerms(today, "14"),
      terms: "14",
      poNumber: "",
      projectName: "",
      linkedClientID: "",
      clientName: "",
      clientEmail: "",
      clientPhone: "",
      clientAddress: "",
      items: [{ desc: "", qty: 1, rate: 0 }, { desc: "", qty: 1, rate: 0 }],
      discountType: "none",
      discountValue: 0,
      taxPercent: 0,
      amountPaid: 0,
      paidDate: "",
      paymentNotes: "",
      notes: defaultNotes(),
      validDays: "14",
      validUntil: D.addDays(today, 14),
      depositPercent: 50,
      hourlyRate: 150,
      status: currentKind === "quote" ? "estimate" : "unpaid"
    }, FROM);
  }

  function draftFromDoc(doc) {
    var payload = (doc && doc.payload) || {};
    var base = emptyDraft();
    var merged = Object.assign(base, payload, {
      kind: doc.kind === "quote" ? "quote" : (doc.status === "paid" ? "receipt" : "invoice"),
      number: doc.number || base.number,
      documentDate: doc.issued_on || payload.documentDate || base.documentDate,
      dueDate: doc.due_on || payload.dueDate || base.dueDate,
      clientName: doc.client_name || payload.clientName || "",
      clientEmail: doc.client_email || payload.clientEmail || "",
      clientPhone: payload.clientPhone || "",
      clientAddress: payload.clientAddress || "",
      linkedClientID: payload.linkedClientID || "",
      projectName: doc.project_name || payload.projectName || "",
      notes: doc.notes || payload.notes || base.notes,
      paidDate: doc.paid_on || payload.paidDate || "",
      amountPaid: payload.amountPaid != null ? payload.amountPaid : (doc.status === "paid" ? Number(doc.amount) || 0 : 0)
    });
    if (!merged.items || !merged.items.length) merged.items = base.items;
    return merged;
  }

  function clientLabel(c) {
    var company = text(c.company_name);
    var person = text(c.name);
    if (company && person) return company + " · " + person;
    return company || person || "Untitled client";
  }

  function fillClientPicker(selectedId) {
    var sel = el("client-pick");
    if (!sel) return;
    var html = '<option value="">Enter manually</option>';
    studioClients.forEach(function (c) {
      html += '<option value="' + escapeHtml(c.link_id) + '"' +
        (selectedId && selectedId === c.link_id ? " selected" : "") +
        ">" + escapeHtml(clientLabel(c)) + "</option>";
    });
    sel.innerHTML = html;
    if (selectedId) sel.value = selectedId;
    else sel.value = "";
  }

  function applyClient(linkId) {
    if (!linkId) return;
    var c = studioClients.filter(function (x) { return x.link_id === linkId; })[0];
    if (!c) return;
    var company = text(c.company_name);
    var person = text(c.name);
    el("client").value = company || person;
    el("email").value = c.email || "";
    el("phone").value = c.phone || "";
    var address = text(c.address);
    if (company && person) {
      el("address").value = address ? ("Attn: " + person + "\n" + address) : ("Attn: " + person);
    } else {
      el("address").value = address;
    }
  }

  function readDraft() {
    var D = Doc();
    var kind = pdfKind();
    var terms = el("terms") ? el("terms").value : "14";
    var validDays = el("valid-days") ? el("valid-days").value : "14";
    var issued = el("issued").value || D.todayISO();
    var draft = {
      kind: kind,
      number: text(el("number").value),
      documentDate: issued,
      dueDate: el("due").value,
      terms: terms,
      poNumber: el("po") ? text(el("po").value) : "",
      projectName: text(el("project").value),
      linkedClientID: el("client-pick") ? text(el("client-pick").value) : "",
      fromName: text(el("from-name").value) || FROM.fromName,
      fromContact: text(el("from-contact").value) || FROM.fromContact,
      fromEmail: text(el("from-email").value) || FROM.fromEmail,
      fromPhone: text(el("from-phone").value),
      fromWebsite: text(el("from-website").value) || FROM.fromWebsite,
      fromTaxId: text(el("from-tax").value),
      fromAddress: text(el("from-address").value),
      clientName: text(el("client").value),
      clientEmail: text(el("email").value),
      clientPhone: text(el("phone").value),
      clientAddress: text(el("address").value),
      items: itemsFromForm(),
      discountType: el("discount-type").value,
      discountValue: Number(el("discount-value").value || 0),
      taxPercent: Number(el("tax").value || 0),
      amountPaid: Number(el("amount-paid").value || 0),
      paidDate: el("paid").value,
      paymentNotes: text(el("pay-notes").value),
      notes: text(el("notes").value),
      validDays: validDays,
      validUntil: el("due").value,
      depositPercent: Number(el("deposit").value || 0),
      hourlyRate: Number(el("hourly").value || 0)
    };
    return draft;
  }

  function fillForm(doc) {
    currentId = doc && doc.id ? doc.id : null;
    if (doc && doc.kind) currentKind = doc.kind === "quote" ? "quote" : "invoice";
    var d = doc ? draftFromDoc(doc) : emptyDraft();
    el("number").value = d.number;
    el("issued").value = d.documentDate;
    el("due").value = d.kind === "quote" ? (d.validUntil || d.dueDate) : d.dueDate;
    if (el("po")) el("po").value = d.poNumber || "";
    el("project").value = d.projectName || "";
    fillClientPicker(d.linkedClientID || "");
    el("client").value = d.clientName || "";
    el("email").value = d.clientEmail || "";
    el("phone").value = d.clientPhone || "";
    el("address").value = d.clientAddress || "";
    el("from-name").value = d.fromName;
    el("from-contact").value = d.fromContact;
    el("from-email").value = d.fromEmail;
    el("from-phone").value = d.fromPhone || "";
    el("from-website").value = d.fromWebsite;
    el("from-tax").value = d.fromTaxId || "";
    el("from-address").value = d.fromAddress || "";
    el("discount-type").value = d.discountType || "none";
    el("discount-value").value = d.discountValue || 0;
    el("tax").value = d.taxPercent || 0;
    el("amount-paid").value = d.amountPaid || 0;
    el("paid").value = d.paidDate || "";
    el("pay-notes").value = d.paymentNotes || "";
    el("notes").value = d.notes || "";
    el("deposit").value = d.depositPercent || 0;
    el("hourly").value = d.hourlyRate || 0;
    if (el("terms")) el("terms").value = d.terms || "14";
    if (el("valid-days")) el("valid-days").value = d.validDays || "14";
    el("items").innerHTML = "";
    (d.items && d.items.length ? d.items : [{ desc: "", qty: 1, rate: 0 }]).forEach(function (item) {
      addItem(item.desc, item.qty, item.rate);
    });
    syncKindFields();
    showMsg("");
    renderList();
    refreshPreview();
  }

  function syncKindFields() {
    var isQuote = currentKind === "quote";
    var t = Doc().compute(readDraft());
    var isPaid = !isQuote && t.status === "paid";
    el("invoice-fields").classList.toggle("hidden", isQuote);
    el("quote-fields").classList.toggle("hidden", !isQuote);
    Array.prototype.forEach.call(root.querySelectorAll('[data-el="paid-fields"]'), function (node) {
      node.classList.toggle("hidden", isQuote);
    });
    el("mark-paid").classList.toggle("hidden", isQuote || isPaid);
    el("convert").classList.toggle("hidden", !isQuote || !currentId);
    el("due-label").textContent = isQuote ? "Valid until" : "Due";
    el("title").textContent = (currentId ? "Edit " : "New ") + (isQuote ? "quote" : (isPaid ? "receipt" : "invoice"));
    el("pdf").textContent = isQuote ? "Download PDF" : (t.amountPaid > 0 ? "Download receipt" : "Download PDF");
  }

  function docTotals(doc) {
    var payload = (doc && doc.payload) || {};
    var paid = payload.amountPaid;
    if (paid == null && doc && doc.status === "paid") paid = Number(doc.amount) || 0;
    return Doc().compute(Object.assign({}, payload, {
      kind: doc && doc.kind === "quote" ? "quote" : "invoice",
      amountPaid: paid || 0,
      items: payload.items || [{ desc: "", qty: 1, rate: Number(doc && doc.amount) || 0 }]
    }));
  }

  function isReceipt(doc) {
    if (!doc || doc.kind === "quote") return false;
    return doc.status === "paid" || docTotals(doc).balance <= 0;
  }

  function listButton(doc) {
    var D = Doc();
    var t = docTotals(doc);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "billing-doc" + (doc.id === currentId ? " is-on" : "");
    var extra = "";
    if (doc.kind === "invoice" && t.balance > 0 && t.amountPaid > 0) {
      extra = " · " + D.money(t.balance) + " due";
    } else if (doc.status === "paid" || t.status === "paid") {
      extra = " · PAID";
    }
    btn.innerHTML =
      "<strong>" + escapeHtml(doc.number) + " · " + D.money(t.total || doc.amount) + extra + "</strong>" +
      "<span>" + escapeHtml(doc.client_name || "No client") + (doc.project_name ? " · " + escapeHtml(doc.project_name) : "") + "</span>";
    btn.addEventListener("click", function () {
      fillForm(doc);
    });
    return btn;
  }

  function addGroup(list, title, rows) {
    var label = document.createElement("div");
    label.className = "billing-group";
    label.textContent = title;
    list.appendChild(label);
    if (!rows.length) {
      var empty = document.createElement("p");
      empty.className = "billing-empty";
      empty.textContent = "None yet.";
      list.appendChild(empty);
      return;
    }
    rows.forEach(function (doc) { list.appendChild(listButton(doc)); });
  }

  function renderList() {
    var list = el("docs");
    list.innerHTML = "";
    var quotes = docs.filter(function (d) { return d.kind === "quote"; });
    var receipts = docs.filter(isReceipt);
    var invoices = docs.filter(function (d) { return d.kind === "invoice" && !isReceipt(d); });
    addGroup(list, "Quotes", quotes);
    addGroup(list, "Invoices", invoices);
    addGroup(list, "Receipts", receipts);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function scalePreview() {
    var stage = el("stage");
    var paper = el("paper-scale");
    if (!stage || !paper) return;
    var w = stage.clientWidth;
    var s = Math.min(1, Math.max(0.42, (w - 8) / 612));
    paper.style.transform = "scale(" + s + ")";
    paper.style.height = (792 * s) + "px";
  }

  function refreshPreview() {
    refreshAmounts();
    var html = Doc().previewHtml(readDraft());
    el("paper").innerHTML = html;
    scalePreview();
  }

  function missingTable(err) {
    var msg = (err && err.message) || "";
    return /billing_documents/i.test(msg) && /does not exist|schema cache|not find/i.test(msg);
  }

  function loadClients() {
    return db.from("studio_clients").select("id,link_id,name,company_name,email,phone,address")
      .order("company_name")
      .then(function (res) {
        studioClients = (res && res.data) || [];
        var current = el("client-pick") ? el("client-pick").value : "";
        fillClientPicker(current || "");
      });
  }

  function loadCompany() {
    return db.from("business_profile").select("*").limit(1).maybeSingle()
      .then(function (res) {
        if (!res || res.error || !res.data) return;
        var p = res.data;
        if (p.name) FROM.fromName = p.name;
        if (p.contact) FROM.fromContact = p.contact;
        if (p.email) FROM.fromEmail = p.email;
        if (p.phone) FROM.fromPhone = p.phone;
        if (p.website) FROM.fromWebsite = p.website;
        if (p.tax_id) FROM.fromTaxId = p.tax_id;
        if (p.address) FROM.fromAddress = p.address;
        if (p.payment_notes) FROM.paymentNotes = p.payment_notes;
      })
      .catch(function () { /* Business Info table optional until 005 runs */ });
  }

  function load() {
    return Promise.all([
      db.from("billing_documents").select("*").order("updated_at", { ascending: false }),
      loadClients(),
      loadCompany()
    ]).then(function (pair) {
      var res = pair[0];
      if (res.error) {
        showMsg(missingTable(res.error)
          ? "Run sql/001_billing.sql in Supabase, then refresh."
          : res.error.message, false);
        docs = [];
        renderList();
        return;
      }
      docs = res.data || [];
      renderList();
      if (!currentId) fillForm(null);
    });
  }

  function save() {
    var D = Doc();
    var draft = readDraft();
    var totals = D.compute(draft);
    if (!draft.number) return showMsg("Give it a number.", false);
    if (!draft.clientName) return showMsg("Client name is required.", false);
    var status = totals.status;
    if (currentKind === "quote") status = "estimate";
    var body = {
      kind: currentKind === "quote" ? "quote" : "invoice",
      number: draft.number,
      client_name: draft.clientName,
      client_email: draft.clientEmail,
      project_name: draft.projectName,
      status: status,
      amount: totals.total,
      issued_on: draft.documentDate || null,
      due_on: totals.resolvedDueDate || null,
      paid_on: status === "paid" ? (draft.paidDate || D.todayISO()) : null,
      notes: draft.notes,
      payload: draft
    };
    var req = currentId
      ? db.from("billing_documents").update(body).eq("id", currentId).select().single()
      : db.from("billing_documents").insert(body).select().single();
    req.then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      currentId = res.data.id;
      showMsg("Saved.", true);
      load().then(function () { fillForm(res.data); });
    });
  }

  function removeDoc() {
    if (!currentId) {
      fillForm(null);
      return;
    }
    if (!window.confirm("Delete this document?")) return;
    db.from("billing_documents").delete().eq("id", currentId).then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      currentId = null;
      load().then(function () { fillForm(null); });
    });
  }

  function markPaid() {
    var D = Doc();
    var draft = readDraft();
    var totals = D.compute(draft);
    el("amount-paid").value = String(totals.total);
    if (!el("paid").value) el("paid").value = D.todayISO();
    syncKindFields();
    refreshPreview();
    save();
    downloadPdf();
  }

  function convertQuote() {
    if (currentKind !== "quote" || !currentId) return;
    if (!window.confirm("Turn this quote into an invoice? It will move under Invoices. You can still edit amounts and due date.")) return;
    var quoteNotes = "This quote is an estimate, not a contract. Prices are good through the valid-until date. Work starts after a signed agreement and the deposit clears. Anything not listed is out of scope.";
    currentKind = "invoice";
    el("number").value = nextNumber("invoice");
    if (text(el("notes").value) === quoteNotes) {
      el("notes").value = "Thank you for your business.";
    }
    if (el("terms") && el("issued").value && el("terms").value !== "custom") {
      el("due").value = Doc().dueFromTerms(el("issued").value, el("terms").value);
    }
    syncKindFields();
    refreshPreview();
    save();
  }

  function downloadPdf() {
    var btn = el("pdf");
    btn.disabled = true;
    Doc().buildPdf(readDraft()).then(function (out) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(out.blob);
      a.download = out.filename;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }).catch(function (err) {
      showMsg(err.message || "Could not build the PDF.", false);
    }).then(function () {
      btn.disabled = false;
    });
  }

  function html() {
    return (
      '<div class="billing-workspace">' +
        '<aside class="billing-rail">' +
          "<h1>Billing</h1>" +
          '<div class="billing-new-row">' +
            '<button class="btn btn-primary" type="button" data-el="new-quote">New quote</button>' +
            '<button class="btn btn-ghost" type="button" data-el="new-invoice">New invoice</button>' +
          "</div>" +
          '<div class="billing-docs" data-el="docs"></div>' +
        "</aside>" +
        '<section class="billing-editor">' +
          '<div class="billing-toolbar">' +
            '<button class="btn btn-primary" type="button" data-el="save">Save</button>' +
            '<button class="btn btn-ghost" type="button" data-el="pdf">Download PDF</button>' +
            '<button class="btn btn-ghost" type="button" data-el="convert">Turn into invoice</button>' +
            '<button class="btn btn-ghost" type="button" data-el="mark-paid">Mark paid in full</button>' +
            '<button class="btn btn-ghost" type="button" data-el="delete">Delete</button>' +
          "</div>" +
          '<p class="status" data-el="msg"></p>' +
          '<form data-el="form" autocomplete="off">' +
            '<div class="card">' +
              '<h3 data-el="title">New invoice</h3>' +
              '<div class="grid2">' +
                '<div class="field"><label>Number</label><input data-el="number" type="text" /></div>' +
                '<div class="field"><label>Status</label><p class="status-label" data-el="status-label">Unpaid</p></div>' +
                '<div class="field"><label>Date</label><input data-el="issued" type="date" /></div>' +
                '<div class="field"><label data-el="due-label">Due</label><input data-el="due" type="date" /></div>' +
              "</div>" +
              '<div class="grid2" data-el="invoice-fields">' +
                '<div class="field"><label>Terms</label><select data-el="terms"><option value="receipt">Due on receipt</option><option value="7">Net 7</option><option value="14" selected>Net 14</option><option value="30">Net 30</option><option value="custom">Custom</option></select></div>' +
                '<div class="field"><label>PO</label><input data-el="po" type="text" /></div>' +
              "</div>" +
              '<div class="grid2" data-el="quote-fields">' +
                '<div class="field"><label>Good for</label><select data-el="valid-days"><option value="7">7 days</option><option value="14" selected>14 days</option><option value="30">30 days</option><option value="custom">Custom</option></select></div>' +
                '<div class="field"><label>Deposit %</label><input data-el="deposit" type="number" min="0" max="100" /></div>' +
                '<div class="field"><label>Hourly extras</label><input data-el="hourly" type="number" min="0" /></div>' +
              "</div>" +
              '<div class="field"><label>Project</label><input data-el="project" type="text" /></div>' +
            "</div>" +
            '<div class="card">' +
              "<h3>Bill to</h3>" +
              '<div class="field"><label>Choose client</label>' +
                '<select data-el="client-pick">' +
                  '<option value="">Enter manually</option>' +
                "</select>" +
                '<p class="hint-inline">Pick a saved client to autofill, or leave on Enter manually and type below.</p>' +
              "</div>" +
              '<div class="field"><label>Client / company name</label><input data-el="client" type="text" placeholder="Acme Trucking LLC" /></div>' +
              '<div class="grid2">' +
                '<div class="field"><label>Email</label><input data-el="email" type="email" /></div>' +
                '<div class="field"><label>Phone</label><input data-el="phone" type="tel" /></div>' +
              "</div>" +
              '<div class="field"><label>Address</label><textarea data-el="address" rows="2"></textarea></div>' +
            "</div>" +
            '<details class="card more-fields">' +
              "<summary>Your details</summary>" +
              '<div class="grid2" style="margin-top:8px">' +
                '<div class="field"><label>Company</label><input data-el="from-name" type="text" /></div>' +
                '<div class="field"><label>Contact</label><input data-el="from-contact" type="text" /></div>' +
                '<div class="field"><label>Email</label><input data-el="from-email" type="email" /></div>' +
                '<div class="field"><label>Phone</label><input data-el="from-phone" type="tel" /></div>' +
                '<div class="field"><label>Website</label><input data-el="from-website" type="text" /></div>' +
                '<div class="field"><label>EIN</label><input data-el="from-tax" type="text" /></div>' +
              "</div>" +
              '<div class="field"><label>Address</label><textarea data-el="from-address" rows="2"></textarea></div>' +
            "</details>" +
            '<div class="card">' +
              "<h3>Line items</h3>" +
              '<div class="item-head"><span>Description</span><span>Qty</span><span>Rate</span><span>Amt</span><span></span></div>' +
              '<div data-el="items"></div>' +
              '<div class="item-add-row">' +
                '<button class="btn btn-ghost" type="button" data-el="add-item">Add line</button>' +
                '<button class="btn btn-ghost" type="button" data-el="add-price">Add pricing item</button>' +
                '<div class="price-picker hidden" data-el="price-picker"></div>' +
              "</div>" +
              '<p class="totals-mini" data-el="totals">Total $0.00</p>' +
            "</div>" +
            '<div class="card">' +
              "<h3>Totals</h3>" +
              '<div class="grid2">' +
                '<div class="field"><label>Discount</label><select data-el="discount-type"><option value="none">None</option><option value="percent">Percent</option><option value="amount">Amount</option></select></div>' +
                '<div class="field"><label>Discount value</label><input data-el="discount-value" type="number" min="0" step="0.01" /></div>' +
                '<div class="field"><label>Tax %</label><input data-el="tax" type="number" min="0" step="0.01" /></div>' +
                '<div class="field" data-el="paid-fields"><label>Amount paid</label><input data-el="amount-paid" type="number" min="0" step="0.01" /></div>' +
                '<div class="field" data-el="paid-fields"><label>Paid on</label><input data-el="paid" type="date" /></div>' +
              "</div>" +
              '<p class="hint-inline" data-el="paid-fields">Enter what they paid, then Save. Download receipt shows amount paid and remaining balance. Paid in full moves it under Receipts.</p>' +
            "</div>" +
            '<div class="card">' +
              "<h3>Notes</h3>" +
              '<div class="field"><label>How to pay</label><textarea data-el="pay-notes" rows="2"></textarea></div>' +
              '<div class="field"><label>Notes on the document</label><textarea data-el="notes" rows="3"></textarea></div>' +
            "</div>" +
          "</form>" +
        "</section>" +
        '<section class="billing-preview">' +
          '<p class="preview-label">Preview</p>' +
          '<div class="paper-stage" data-el="stage"><div class="paper-scale" data-el="paper-scale"><div data-el="paper"></div></div></div>' +
        "</section>" +
      "</div>"
    );
  }

  function bind() {
    el("save").addEventListener("click", save);
    el("new-quote").addEventListener("click", function () {
      currentId = null;
      currentKind = "quote";
      fillForm(null);
    });
    el("new-invoice").addEventListener("click", function () {
      currentId = null;
      currentKind = "invoice";
      fillForm(null);
    });
    el("add-item").addEventListener("click", function () {
      hidePricePicker();
      addItem("", 1, "");
      refreshPreview();
    });
    el("add-price").addEventListener("click", function (event) {
      event.stopPropagation();
      togglePricePicker();
    });
    el("delete").addEventListener("click", removeDoc);
    el("mark-paid").addEventListener("click", markPaid);
    el("convert").addEventListener("click", convertQuote);
    el("pdf").addEventListener("click", downloadPdf);
    el("form").addEventListener("input", function () {
      showMsg("");
      refreshPreview();
    });
    el("form").addEventListener("change", function (event) {
      var D = Doc();
      if (event.target === el("client-pick")) {
        var linkId = text(el("client-pick").value);
        if (linkId) applyClient(linkId);
        refreshPreview();
        return;
      }
      if (event.target === el("terms") && el("terms").value !== "custom") {
        el("due").value = D.dueFromTerms(el("issued").value, el("terms").value);
      }
      if (event.target === el("valid-days") && el("valid-days").value !== "custom") {
        el("due").value = D.addDays(el("issued").value, parseInt(el("valid-days").value, 10) || 14);
      }
      if (event.target === el("issued") && currentKind === "invoice" && el("terms").value !== "custom") {
        el("due").value = D.dueFromTerms(el("issued").value, el("terms").value);
      }
      if (event.target === el("issued") && currentKind === "quote" && el("valid-days").value !== "custom") {
        el("due").value = D.addDays(el("issued").value, parseInt(el("valid-days").value, 10) || 14);
      }
      refreshPreview();
    });
    window.addEventListener("resize", onResize);
  }

  function onResize() {
    clearTimeout(scaleTimer);
    scaleTimer = setTimeout(scalePreview, 50);
  }

  function showSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = "Save";
  }

  function hideSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }

  window.STLBilling = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      appEl = document.querySelector(".app");
      panel.classList.add("wide");
      panel.innerHTML = html();
      bind();
      currentKind = "invoice";
      fillForm(null);
      load();
      showSave();
    },
    unmount: function (panel) {
      window.removeEventListener("resize", onResize);
      hideSave();
      if (panel) panel.classList.remove("wide");
      if (appEl) appEl.classList.remove("is-billing");
      root = null;
    },
    saveAll: save
  };
})();

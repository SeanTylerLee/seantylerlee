(function () {
  "use strict";

  var CHANNELS = [
    { id: "email", title: "Email" },
    { id: "phone", title: "Phone" },
    { id: "text", title: "Text" },
    { id: "noCalls", title: "Don't call" }
  ];

  var TIMES = [
    { id: "anytime", title: "Anytime" },
    { id: "mornings", title: "Mornings" },
    { id: "afternoons", title: "Afternoons" },
    { id: "afterSix", title: "After 6pm" },
    { id: "weekdays", title: "Weekdays" },
    { id: "weekends", title: "Weekends" }
  ];

  var root = null;
  var db = null;
  var clients = [];
  var projects = [];
  var invoices = [];
  var expandedId = null;
  var dirty = false;
  var saving = false;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function trim(s) {
    return String(s == null ? "" : s).trim();
  }

  function el(name) {
    return root ? root.querySelector('[data-el="' + name + '"]') : null;
  }

  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }

  function missingTable(err) {
    var msg = (err && err.message) || "";
    return /does not exist|schema cache|not find/i.test(msg);
  }

  function displayTitle(c) {
    var company = trim(c.company_name);
    var person = trim(c.name);
    if (company && person) return company + " · " + person;
    if (company) return company;
    if (person) return person;
    return "Untitled client";
  }

  function channelTitle(id) {
    var hit = CHANNELS.filter(function (c) { return c.id === id; })[0];
    return hit ? hit.title : "Email";
  }

  function timeTitle(id) {
    var hit = TIMES.filter(function (t) { return t.id === id; })[0];
    return hit ? hit.title : "Anytime";
  }

  function commsSummary(c) {
    var parts = [channelTitle(c.comms_channel || "email")];
    if ((c.comms_best_time || "anytime") !== "anytime") parts.push(timeTitle(c.comms_best_time));
    if (trim(c.comms_notes)) parts.push(trim(c.comms_notes));
    return parts.join(" · ");
  }

  function money(n) {
    return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function relatedProjects(c) {
    var key = c.link_id;
    var company = trim(c.company_name).toLowerCase();
    return projects.filter(function (p) {
      if (p.linked_client_id === key) return true;
      if (!p.linked_client_id && company && trim(p.company_name).toLowerCase() === company) return true;
      return false;
    });
  }

  function relatedInvoices(c) {
    var company = trim(c.company_name).toLowerCase();
    var person = trim(c.name).toLowerCase();
    return invoices.filter(function (doc) {
      var name = trim(doc.client_name).toLowerCase();
      if (!name) return false;
      return (company && name === company) || (person && name === person);
    });
  }

  function syncSaveButton() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.disabled = !dirty || saving || !clients.length;
    btn.textContent = saving ? "Saving…" : "Save";
  }

  function hideSaveButton() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }

  function markDirty() {
    dirty = true;
    syncSaveButton();
    showMsg("Unsaved changes", true);
  }

  function clearDirty() {
    dirty = false;
    syncSaveButton();
  }

  function options(list, current) {
    return list.map(function (item) {
      return '<option value="' + esc(item.id) + '"' + (current === item.id ? " selected" : "") + ">" + esc(item.title) + "</option>";
    }).join("");
  }

  function field(label, key, value, type) {
    if (type === "textarea") {
      return '<div class="client-field"><label>' + label + '</label><textarea data-key="' + key + '">' + esc(value || "") + "</textarea></div>";
    }
    if (type === "select") {
      return '<div class="client-field"><label>' + label + "</label><select data-key=\"" + key + "\">" + value + "</select></div>";
    }
    return '<div class="client-field"><label>' + label + '</label><input data-key="' + key + '" type="' + (type || "text") + '" value="' + esc(value || "") + '" /></div>';
  }

  function shell() {
    return (
      '<div class="clients-workspace">' +
        '<div class="clients-header">' +
          "<h1>Clients</h1>" +
          "<p>People and companies you work with. Link them to projects so billing fills in automatically.</p>" +
        "</div>" +
        '<p class="status clients-banner" data-el="banner"></p>' +
        '<div class="clients-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function render() {
    var body = el("body");
    if (!body) return;
    if (!clients.length) {
      body.innerHTML =
        '<div class="clients-empty">No clients yet. Add clients so you have contacts ready when you bill or start a project.</div>' +
        '<div class="client-actions clients-add"><button class="btn btn-ghost" type="button" data-el="add">Add client</button></div>';
      body.querySelector('[data-el="add"]').addEventListener("click", addClient);
      syncSaveButton();
      return;
    }

    var html = clients.map(function (c) {
      var open = c.id === expandedId;
      var contact = [trim(c.email), trim(c.phone)].filter(Boolean).join(" · ");
      var relP = relatedProjects(c);
      var relI = relatedInvoices(c);
      var related = "";
      if (relP.length || relI.length) {
        related = '<div class="client-related">';
        if (relP.length) related += "<div>Projects: " + esc(relP.map(function (p) { return p.name; }).join(", ")) + "</div>";
        if (relI.length) related += "<div>Invoices on file: " + relI.length + "</div>";
        related += "</div>";
      }
      return (
        '<div class="client-card' + (open ? " is-open" : "") + '" data-id="' + c.id + '">' +
          '<button type="button" class="client-card-head" data-action="toggle">' +
            '<span class="chev">▸</span>' +
            '<span class="meta">' +
              "<strong>" + esc(displayTitle(c)) + "</strong>" +
              (contact ? '<span class="line">' + esc(contact) + "</span>" : "") +
              '<span class="line">' + esc(commsSummary(c)) + "</span>" +
            "</span>" +
          "</button>" +
          '<div class="client-card-body">' +
            '<div class="client-grid">' +
              field("Contact name", "name", c.name) +
              field("Company", "company_name", c.company_name) +
              field("Email", "email", c.email, "email") +
              field("Phone", "phone", c.phone, "tel") +
            "</div>" +
            field("Address", "address", c.address, "textarea") +
            '<div class="client-grid">' +
              field("Preferred contact", "comms_channel", options(CHANNELS, c.comms_channel || "email"), "select") +
              field("Best time", "comms_best_time", options(TIMES, c.comms_best_time || "anytime"), "select") +
            "</div>" +
            field("Comms notes", "comms_notes", c.comms_notes, "textarea") +
            field("Notes", "notes", c.notes, "textarea") +
            related +
            '<div class="client-actions">' +
              '<button class="btn btn-ghost" type="button" data-action="statement">Statement PDF</button>' +
              '<button class="btn btn-ghost" type="button" data-action="remove">Remove client</button>' +
            "</div>" +
          "</div>" +
        "</div>"
      );
    }).join("");

    html += '<div class="client-actions clients-add"><button class="btn btn-ghost" type="button" data-el="add">Add client</button></div>';
    body.innerHTML = html;
    bind();
    syncSaveButton();
  }

  function applyLocal(input, card) {
    var id = card.getAttribute("data-id");
    var key = input.getAttribute("data-key");
    var value = input.value;
    clients.forEach(function (c) {
      if (c.id === id) c[key] = value;
    });
  }

  function harvest() {
    if (!root) return;
    root.querySelectorAll(".client-card").forEach(function (card) {
      card.querySelectorAll("[data-key]").forEach(function (input) {
        applyLocal(input, card);
      });
    });
  }

  function bind() {
    root.querySelectorAll('[data-action="toggle"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var card = btn.closest(".client-card");
        var id = card.getAttribute("data-id");
        harvest();
        expandedId = expandedId === id ? null : id;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      });
    });

    root.querySelectorAll("[data-key]").forEach(function (input) {
      var evt = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(evt, function () {
        applyLocal(input, input.closest(".client-card"));
        markDirty();
        if (input.getAttribute("data-key") === "name" || input.getAttribute("data-key") === "company_name") {
          var card = input.closest(".client-card");
          var c = clients.filter(function (x) { return x.id === card.getAttribute("data-id"); })[0];
          var strong = card.querySelector("strong");
          if (strong && c) strong.textContent = displayTitle(c);
        }
      });
    });

    root.querySelectorAll('[data-action="remove"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.closest(".client-card").getAttribute("data-id");
        var c = clients.filter(function (x) { return x.id === id; })[0];
        if (!c) return;
        if (!window.confirm('Remove "' + displayTitle(c) + '"?')) return;
        db.from("studio_clients").delete().eq("id", id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          if (expandedId === id) expandedId = null;
          // unlink projects
          var key = c.link_id;
          var linked = projects.filter(function (p) { return p.linked_client_id === key; });
          Promise.all(linked.map(function (p) {
            return db.from("client_projects").update({ linked_client_id: "" }).eq("id", p.id);
          })).finally(function () {
            load();
          });
        });
      });
    });

    root.querySelectorAll('[data-action="statement"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.closest(".client-card").getAttribute("data-id");
        var c = clients.filter(function (x) { return x.id === id; })[0];
        if (c) downloadStatement(c);
      });
    });

    var add = root.querySelector('[data-el="add"]');
    if (add) add.addEventListener("click", addClient);
  }

  function addClient() {
    harvest();
    db.from("studio_clients").insert({
      name: "New contact",
      company_name: "",
      comms_channel: "email",
      comms_best_time: "anytime"
    }).select("*").single().then(function (res) {
      if (res.error) {
        showMsg(missingTable(res.error)
          ? "Run sql/004_clients.sql in Supabase, then refresh."
          : res.error.message, false);
        return;
      }
      clients.unshift(res.data);
      expandedId = res.data.id;
      clearDirty();
      render();
      showMsg("Client added. Edit details, then Save.", true);
    });
  }

  function saveAll() {
    if (saving || !dirty) return;
    harvest();
    saving = true;
    syncSaveButton();
    showMsg("Saving…", true);
    var jobs = clients.map(function (c) {
      return db.from("studio_clients").update({
        name: c.name || "",
        company_name: c.company_name || "",
        email: c.email || "",
        phone: c.phone || "",
        address: c.address || "",
        notes: c.notes || "",
        comms_channel: c.comms_channel || "email",
        comms_best_time: c.comms_best_time || "anytime",
        comms_notes: c.comms_notes || ""
      }).eq("id", c.id);
    });
    Promise.all(jobs).then(function (results) {
      saving = false;
      var err = results.map(function (r) { return r && r.error; }).filter(Boolean)[0];
      if (err) {
        showMsg(err.message || "Save failed.", false);
        syncSaveButton();
        return;
      }
      clearDirty();
      showMsg("Saved", true);
      setTimeout(function () { if (!dirty) showMsg(""); }, 1000);
      render();
    }).catch(function (err) {
      saving = false;
      showMsg((err && err.message) || "Save failed.", false);
      syncSaveButton();
    });
  }

  function downloadStatement(c) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showMsg("PDF library missing.", false);
      return;
    }
    var docs = relatedInvoices(c);
    var relP = relatedProjects(c);
    var doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter" });
    var y = 48;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Client statement", 48, y);
    y += 22;
    doc.setFontSize(12);
    doc.text(displayTitle(c), 48, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    if (trim(c.email)) { doc.text(c.email, 48, y); y += 14; }
    if (trim(c.phone)) { doc.text(c.phone, 48, y); y += 14; }
    if (trim(c.address)) {
      var lines = doc.splitTextToSize(c.address, 516);
      doc.text(lines, 48, y);
      y += lines.length * 13 + 8;
    }
    y += 10;
    if (relP.length) {
      doc.setFont("helvetica", "bold");
      doc.text("Projects", 48, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      relP.forEach(function (p) {
        doc.text("• " + (p.name || "Untitled"), 56, y);
        y += 13;
      });
      y += 8;
    }
    doc.setFont("helvetica", "bold");
    doc.text("Invoices", 48, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    if (!docs.length) {
      doc.text("No invoices on file.", 56, y);
    } else {
      docs.forEach(function (inv) {
        if (y > 720) { doc.addPage(); y = 48; }
        doc.text(
          (inv.number || "") + "  " + money(inv.amount) + "  " + (inv.status || "") +
            (inv.issued_on ? "  " + inv.issued_on : ""),
          56,
          y
        );
        y += 14;
      });
    }
    var slug = displayTitle(c).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
    doc.save("STL-Apps-LLC_Statement_" + slug + ".pdf");
    showMsg("Statement PDF downloaded.", true);
  }

  function load() {
    showMsg("Loading clients…", true);
    return Promise.all([
      db.from("studio_clients").select("*").order("updated_at", { ascending: false }),
      db.from("client_projects").select("id,name,company_name,linked_client_id"),
      db.from("billing_documents").select("id,kind,number,client_name,amount,status,issued_on").eq("kind", "invoice")
    ]).then(function (results) {
      if (results[0].error) {
        var msg = results[0].error.message || "Could not load clients.";
        if (missingTable(results[0].error)) msg = "Run sql/004_clients.sql in Supabase, then refresh.";
        else if (/permission denied|42501/i.test(msg)) msg = "Permission denied. Re-run sql/004_clients.sql grants in Supabase.";
        showMsg(msg, false);
        clients = [];
        render();
        return;
      }
      clients = results[0].data || [];
      projects = (results[1].data || []);
      invoices = (results[2].data || []);
      clearDirty();
      render();
      showMsg(clients.length ? "" : "No clients yet — click Add client.", true);
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not load clients.", false);
      clients = [];
      render();
    });
  }

  window.STLClients = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      expandedId = null;
      dirty = false;
      saving = false;
      panel.classList.add("clients-wide");
      panel.innerHTML = shell();
      syncSaveButton();
      load();
    },
    unmount: function (panel) {
      hideSaveButton();
      if (panel) panel.classList.remove("clients-wide");
      root = null;
    },
    saveAll: saveAll,
    isDirty: function () { return dirty; },
    list: function () { return clients.slice(); }
  };
})();

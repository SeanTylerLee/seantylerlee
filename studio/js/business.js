(function () {
  "use strict";

  var SUGGESTED = [
    "Operating Agreement",
    "Articles of Organization",
    "Certificate of LLC",
    "EIN Documents"
  ];

  var DEFAULTS = {
    name: "STL Apps LLC",
    contact: "Sean Tyler Lee",
    signer_title: "Member",
    email: "seantylerlee@icloud.com",
    phone: "",
    website: "seantylerlee.com",
    tax_id: "",
    duns_number: "",
    address: "",
    formation_state: "Oklahoma",
    governing_state: "Oklahoma",
    bank_name: "",
    bank_routing: "",
    bank_account: "",
    bank_address: "",
    portal_url: "",
    portal_username: "",
    portal_password: "",
    payment_notes: ""
  };

  var root = null;
  var db = null;
  var profileId = null;
  var profile = Object.assign({}, DEFAULTS);
  var documents = [];
  var selectedPacket = {};
  var dirty = false;
  var saving = false;
  var revealBank = false;
  var revealPortal = false;
  var userId = null;

  function el(name) {
    return root ? root.querySelector('[data-el="' + name + '"]') : null;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
    return /does not exist|schema cache|not find|bucket/i.test(msg);
  }

  function syncSaveButton() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.disabled = !dirty || saving;
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

  function field(label, key, value, type) {
    if (type === "textarea") {
      return '<div class="biz-field"><label>' + label + '</label><textarea data-key="' + key + '">' + esc(value || "") + "</textarea></div>";
    }
    return '<div class="biz-field"><label>' + label + '</label><input data-key="' + key + '" type="' + (type || "text") + '" value="' + esc(value || "") + '" /></div>';
  }

  function secretField(label, key, value, revealed) {
    return (
      '<div class="biz-field"><label>' + label + "</label>" +
      '<div class="secret-wrap">' +
        '<input data-key="' + key + '" type="' + (revealed ? "text" : "password") + '" value="' + esc(value || "") + '" autocomplete="off" />' +
        '<button class="btn btn-ghost" type="button" data-reveal="' + key + '">' + (revealed ? "Hide" : "Show") + "</button>" +
      "</div></div>"
    );
  }

  function shell() {
    return (
      '<div class="business-workspace">' +
        '<div class="business-header">' +
          "<h1>Business Info</h1>" +
          "<p>Fill this in once. New invoices and quotes use these details. Bank numbers and portal password stay behind your login.</p>" +
        "</div>" +
        '<p class="status business-banner" data-el="banner"></p>' +
        '<div class="business-body" data-el="body"></div>' +
        '<input data-el="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*" hidden />' +
      "</div>"
    );
  }

  function render() {
    var body = el("body");
    if (!body) return;
    var html = "";

    html +=
      '<div class="biz-card"><h3>Company</h3>' +
      '<div class="biz-grid">' +
        field("Company name", "name", profile.name) +
        field("Contact / signer", "contact", profile.contact) +
        field("Signer title", "signer_title", profile.signer_title) +
        field("Email", "email", profile.email, "email") +
        field("Phone", "phone", profile.phone, "tel") +
        field("Website", "website", profile.website) +
        field("EIN / tax ID", "tax_id", profile.tax_id) +
        field("D-U-N-S Number", "duns_number", profile.duns_number) +
      "</div>" +
      field("Address", "address", profile.address, "textarea") +
      "</div>";

    html +=
      '<div class="biz-card"><h3>Legal</h3><p class="sub">Used on development contracts.</p>' +
      '<div class="biz-grid">' +
        field("LLC formation state", "formation_state", profile.formation_state) +
        field("Governing state", "governing_state", profile.governing_state) +
      "</div></div>";

    html +=
      '<div class="biz-card"><h3>Company Documents</h3>' +
      '<p class="sub">Name each file and upload a PDF or image. Check items to export a vendor packet later.</p>';
    if (!documents.length) {
      html += '<p class="sub">No documents yet. Add one and give it a name.</p>';
    } else {
      documents.forEach(function (doc) {
        html +=
          '<div class="doc-row" data-id="' + doc.id + '">' +
            '<input type="checkbox" data-packet="' + doc.id + '"' + (selectedPacket[doc.id] ? " checked" : "") + (doc.storage_path ? "" : " disabled") + " />" +
            '<div class="name"><input data-doc-name="' + doc.id + '" type="text" value="' + esc(doc.name) + '" /></div>' +
            '<span class="meta">' + (doc.storage_path ? esc(doc.file_name || "Uploaded") : "No file yet") + "</span>" +
            '<button class="btn btn-ghost" type="button" data-upload="' + doc.id + '">' + (doc.storage_path ? "Replace" : "Upload") + "</button>" +
            (doc.storage_path ? '<button class="btn btn-ghost" type="button" data-open="' + doc.id + '">Open</button>' : "") +
            '<button class="btn btn-ghost" type="button" data-remove-doc="' + doc.id + '">Remove</button>' +
          "</div>";
      });
    }
    html +=
      '<div class="biz-actions">' +
        '<button class="btn btn-ghost" type="button" data-el="add-doc">Add Document</button>' +
        '<button class="btn btn-ghost" type="button" data-el="add-common">Add common…</button>' +
        '<button class="btn btn-ghost" type="button" data-el="select-packet">Select all for packet</button>' +
        '<button class="btn btn-primary" type="button" data-el="export-packet">Export Vendor Packet</button>' +
      "</div></div>";

    html +=
      '<div class="biz-card"><h3>Bank Information</h3>' +
      '<p class="sub">Routing and account numbers are saved to your private studio database.</p>' +
      '<div class="biz-grid">' +
        field("Bank name", "bank_name", profile.bank_name) +
        secretField("Routing number", "bank_routing", profile.bank_routing, revealBank) +
        secretField("Account number", "bank_account", profile.bank_account, revealBank) +
      "</div>" +
      field("Bank address", "bank_address", profile.bank_address, "textarea") +
      '<div class="biz-actions"><button class="btn btn-ghost" type="button" data-el="toggle-bank">' +
        (revealBank ? "Hide bank numbers" : "Show bank numbers") +
      "</button></div></div>";

    html +=
      '<div class="biz-card"><h3>LLC Login Information</h3>' +
      '<p class="sub">Oklahoma state portal (or similar). Password stays behind your login.</p>' +
      field("Portal link", "portal_url", profile.portal_url) +
      '<div class="biz-grid">' +
        field("Username", "portal_username", profile.portal_username) +
        secretField("Password", "portal_password", profile.portal_password, revealPortal) +
      "</div>" +
      '<div class="biz-actions"><button class="btn btn-ghost" type="button" data-el="toggle-portal">' +
        (revealPortal ? "Hide password" : "Show password") +
      "</button></div></div>";

    html +=
      '<div class="biz-card"><h3>Payments</h3>' +
      '<p class="sub">Default text for invoices and reminders.</p>' +
      field("Default payment notes", "payment_notes", profile.payment_notes, "textarea") +
      "</div>";

    html += '<div class="biz-lock">🔒 Saved to your private Supabase account. Use Save in the top bar.</div>';

    body.innerHTML = html;
    bind();
    syncSaveButton();
  }

  function harvest() {
    if (!root) return;
    root.querySelectorAll("[data-key]").forEach(function (input) {
      profile[input.getAttribute("data-key")] = input.value;
    });
    root.querySelectorAll("[data-doc-name]").forEach(function (input) {
      var id = input.getAttribute("data-doc-name");
      documents.forEach(function (doc) {
        if (doc.id === id) doc.name = input.value;
      });
    });
    root.querySelectorAll("[data-packet]").forEach(function (input) {
      selectedPacket[input.getAttribute("data-packet")] = input.checked;
    });
  }

  function bind() {
    root.querySelectorAll("[data-key], [data-doc-name]").forEach(function (input) {
      input.addEventListener("input", function () {
        if (input.hasAttribute("data-key")) profile[input.getAttribute("data-key")] = input.value;
        markDirty();
      });
    });

    root.querySelectorAll("[data-packet]").forEach(function (input) {
      input.addEventListener("change", function () {
        selectedPacket[input.getAttribute("data-packet")] = input.checked;
      });
    });

    var toggleBank = el("toggle-bank");
    if (toggleBank) {
      toggleBank.addEventListener("click", function () {
        harvest();
        revealBank = !revealBank;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      });
    }
    var togglePortal = el("toggle-portal");
    if (togglePortal) {
      togglePortal.addEventListener("click", function () {
        harvest();
        revealPortal = !revealPortal;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      });
    }

    root.querySelectorAll("[data-reveal]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        harvest();
        var key = btn.getAttribute("data-reveal");
        if (key === "portal_password") revealPortal = !revealPortal;
        else revealBank = !revealBank;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      });
    });

    var addDoc = el("add-doc");
    if (addDoc) addDoc.addEventListener("click", function () { createDocument(""); });

    var addCommon = el("add-common");
    if (addCommon) {
      addCommon.addEventListener("click", function () {
        var pick = window.prompt("Common document name:\n\n" + SUGGESTED.join("\n"), SUGGESTED[0]);
        if (pick == null) return;
        createDocument(String(pick).trim() || SUGGESTED[0]);
      });
    }

    var selectPacket = el("select-packet");
    if (selectPacket) {
      selectPacket.addEventListener("click", function () {
        documents.forEach(function (doc) {
          if (doc.storage_path) selectedPacket[doc.id] = true;
        });
        render();
        if (dirty) showMsg("Unsaved changes", true);
      });
    }

    var exportPacket = el("export-packet");
    if (exportPacket) exportPacket.addEventListener("click", exportVendorPacket);

    root.querySelectorAll("[data-upload]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        pendingUploadId = btn.getAttribute("data-upload");
        el("file").click();
      });
    });

    root.querySelectorAll("[data-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openDocument(btn.getAttribute("data-open"));
      });
    });

    root.querySelectorAll("[data-remove-doc]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        removeDocument(btn.getAttribute("data-remove-doc"));
      });
    });

    var file = el("file");
    if (file) {
      file.onchange = function () {
        var chosen = file.files && file.files[0];
        file.value = "";
        if (chosen && pendingUploadId) uploadFile(pendingUploadId, chosen);
        pendingUploadId = null;
      };
    }
  }

  var pendingUploadId = null;

  function createDocument(name) {
    var title = name || window.prompt("Document name", "New document");
    if (title == null) return;
    title = String(title).trim();
    if (!title) return showMsg("Enter a name for this document.", false);
    db.from("business_documents").insert({ name: title, storage_path: "", file_name: "" }).select("*").single()
      .then(function (res) {
        if (res.error) return showMsg(res.error.message, false);
        documents.push(res.data);
        render();
        if (dirty) showMsg("Unsaved changes", true);
        pendingUploadId = res.data.id;
        el("file").click();
      });
  }

  function uploadFile(docId, file) {
    if (!userId) return showMsg("Not signed in.", false);
    var safe = file.name.replace(/[^\w.\-]+/g, "-");
    var path = userId + "/" + docId + "/" + safe;
    showMsg("Uploading…", true);
    db.storage.from("business-docs").upload(path, file, { upsert: true })
      .then(function (up) {
        if (up.error) {
          showMsg(missingTable(up.error)
            ? "Run sql/005_business.sql in Supabase (includes storage bucket), then refresh."
            : up.error.message, false);
          return null;
        }
        return db.from("business_documents").update({
          storage_path: path,
          file_name: file.name
        }).eq("id", docId).select("*").single();
      })
      .then(function (res) {
        if (!res) return;
        if (res.error) return showMsg(res.error.message, false);
        documents = documents.map(function (d) { return d.id === docId ? res.data : d; });
        showMsg("Document uploaded.", true);
        render();
        if (dirty) showMsg("Unsaved changes", true);
      });
  }

  function openDocument(docId) {
    var doc = documents.filter(function (d) { return d.id === docId; })[0];
    if (!doc || !doc.storage_path) return;
    if (!window.STLFileFloat) return showMsg("File viewer missing. Refresh the page.", false);
    showMsg("Opening document…", true);
    db.storage.from("business-docs").createSignedUrl(doc.storage_path, 600)
      .then(function (res) {
        if (res.error) return showMsg(res.error.message, false);
        showMsg("");
        window.STLFileFloat.open({
          title: doc.name || "Document",
          fileName: doc.file_name || doc.storage_path || "",
          url: res.data.signedUrl
        });
      });
  }

  function removeDocument(docId) {
    var doc = documents.filter(function (d) { return d.id === docId; })[0];
    if (!doc) return;
    if (!window.confirm('Remove "' + doc.name + '"?')) return;
    var chain = Promise.resolve();
    if (doc.storage_path) {
      chain = db.storage.from("business-docs").remove([doc.storage_path]);
    }
    chain.then(function () {
      return db.from("business_documents").delete().eq("id", docId);
    }).then(function (res) {
      if (res && res.error) return showMsg(res.error.message, false);
      documents = documents.filter(function (d) { return d.id !== docId; });
      delete selectedPacket[docId];
      render();
      if (dirty) showMsg("Unsaved changes", true);
    });
  }

  function exportVendorPacket() {
    harvest();
    var picked = documents.filter(function (d) { return selectedPacket[d.id] && d.storage_path; });
    if (!picked.length) return showMsg("Select uploaded documents for the packet.", false);
    showMsg("Building packet…", true);
    var cover =
      "STL Apps LLC — Vendor Packet\n" +
      "Generated " + new Date().toLocaleString() + "\n\n" +
      "Company: " + (profile.name || "") + "\n" +
      "Contact: " + (profile.contact || "") + "\n" +
      "Email: " + (profile.email || "") + "\n" +
      "Phone: " + (profile.phone || "") + "\n" +
      "Website: " + (profile.website || "") + "\n" +
      "EIN: " + (profile.tax_id || "") + "\n\n" +
      "Included documents:\n" +
      picked.map(function (d, i) { return (i + 1) + ". " + d.name; }).join("\n");

    Promise.all(picked.map(function (doc) {
      return db.storage.from("business-docs").download(doc.storage_path).then(function (res) {
        if (res.error) throw res.error;
        return { name: doc.file_name || (doc.name + ".bin"), blob: res.data };
      });
    })).then(function (files) {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        // fallback: download cover + open first files
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([cover], { type: "text/plain" }));
        a.download = "STL-Apps-LLC_Vendor-Packet-Cover.txt";
        a.click();
        files.forEach(function (f) {
          var link = document.createElement("a");
          link.href = URL.createObjectURL(f.blob);
          link.download = f.name;
          link.click();
        });
        showMsg("Packet files downloaded.", true);
        return;
      }
      var pdf = new window.jspdf.jsPDF({ unit: "pt", format: "letter" });
      var y = 48;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text("Vendor Packet", 48, y);
      y += 24;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      cover.split("\n").forEach(function (line) {
        if (y > 720) { pdf.addPage(); y = 48; }
        pdf.text(line || " ", 48, y);
        y += 14;
      });
      pdf.save("STL-Apps-LLC_Vendor-Packet-Cover.pdf");
      files.forEach(function (f) {
        var link = document.createElement("a");
        link.href = URL.createObjectURL(f.blob);
        link.download = f.name;
        link.click();
      });
      showMsg("Cover PDF + selected files downloaded.", true);
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not export packet.", false);
    });
  }

  function saveAll() {
    if (saving || !dirty) return;
    harvest();
    saving = true;
    syncSaveButton();
    showMsg("Saving…", true);

    var body = {
      name: profile.name || "",
      contact: profile.contact || "",
      signer_title: profile.signer_title || "",
      email: profile.email || "",
      phone: profile.phone || "",
      website: profile.website || "",
      tax_id: profile.tax_id || "",
      duns_number: profile.duns_number || "",
      address: profile.address || "",
      formation_state: profile.formation_state || "",
      governing_state: profile.governing_state || "",
      bank_name: profile.bank_name || "",
      bank_routing: profile.bank_routing || "",
      bank_account: profile.bank_account || "",
      bank_address: profile.bank_address || "",
      portal_url: profile.portal_url || "",
      portal_username: profile.portal_username || "",
      portal_password: profile.portal_password || "",
      payment_notes: profile.payment_notes || ""
    };

    var profileJob = profileId
      ? db.from("business_profile").update(body).eq("id", profileId).select("*").single()
      : db.from("business_profile").insert(body).select("*").single();

    var docJobs = documents.map(function (doc) {
      return db.from("business_documents").update({ name: doc.name || "" }).eq("id", doc.id);
    });

    Promise.all([profileJob].concat(docJobs)).then(function (results) {
      saving = false;
      var profileRes = results[0];
      if (profileRes.error) {
        showMsg(missingTable(profileRes.error)
          ? "Run sql/005_business.sql in Supabase, then refresh."
          : profileRes.error.message, false);
        syncSaveButton();
        return;
      }
      profileId = profileRes.data.id;
      Object.keys(body).forEach(function (k) { profile[k] = profileRes.data[k]; });
      clearDirty();
      showMsg("Saved", true);
      setTimeout(function () { if (!dirty) showMsg(""); }, 1000);
      // Keep billing defaults in sync for this session
      if (window.STLBillingDoc) {
        /* no-op: billing reads its own FROM; profile is source of truth on this page */
      }
      syncSaveButton();
    }).catch(function (err) {
      saving = false;
      showMsg((err && err.message) || "Save failed.", false);
      syncSaveButton();
    });
  }

  function load() {
    showMsg("Loading…", true);
    return db.auth.getUser().then(function (authRes) {
      userId = authRes.data && authRes.data.user && authRes.data.user.id;
      return Promise.all([
        db.from("business_profile").select("*").limit(1).maybeSingle(),
        db.from("business_documents").select("*").order("created_at", { ascending: true })
      ]);
    }).then(function (pair) {
      var profileRes = pair[0];
      var docsRes = pair[1];
      if (profileRes.error) {
        showMsg(missingTable(profileRes.error)
          ? "Run sql/005_business.sql in Supabase, then refresh."
          : profileRes.error.message, false);
        render();
        return;
      }
      if (profileRes.data) {
        profileId = profileRes.data.id;
        Object.keys(DEFAULTS).forEach(function (k) {
          profile[k] = profileRes.data[k] != null ? profileRes.data[k] : DEFAULTS[k];
        });
      } else {
        profileId = null;
        profile = Object.assign({}, DEFAULTS);
      }
      documents = (docsRes && docsRes.data) || [];
      clearDirty();
      render();
      showMsg("");
    }).catch(function (err) {
      showMsg((err && err.message) || "Could not load business info.", false);
      render();
    });
  }

  window.STLBusiness = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      dirty = false;
      saving = false;
      revealBank = false;
      revealPortal = false;
      selectedPacket = {};
      panel.classList.add("business-wide");
      panel.innerHTML = shell();
      syncSaveButton();
      load();
    },
    unmount: function (panel) {
      hideSaveButton();
      if (panel) panel.classList.remove("business-wide");
      root = null;
    },
    saveAll: saveAll,
    isDirty: function () { return dirty; },
    getProfile: function () { return Object.assign({}, profile); }
  };
})();

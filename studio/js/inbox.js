(function () {
  "use strict";

  var TYPES = [
    { id: "contact", title: "Contact" },
    { id: "release_notify", title: "Notify me" },
    { id: "quote", title: "Quote" }
  ];

  var root = null;
  var db = null;
  var items = [];
  var selectedId = null;
  var filter = "unread";
  var search = "";
  var loading = false;
  var searchBound = false;

  function el(name) { return root ? root.querySelector('[data-el="' + name + '"]') : null; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function trim(s) { return String(s == null ? "" : s).trim(); }
  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }
  function hideSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }
  function publishUnread() {
    var n = items.filter(function (row) { return row.status === "unread"; }).length;
    if (window.STLApp && typeof window.STLApp.setInboxUnread === "function") {
      window.STLApp.setInboxUnread(n);
    }
  }
  function selected() {
    return items.filter(function (row) { return row.id === selectedId; })[0] || null;
  }
  function typeTitle(source) {
    var found = TYPES.filter(function (t) { return t.id === source; })[0];
    return found ? found.title : "Message";
  }
  function siteTitle(site) {
    var s = String(site || "").toLowerCase();
    if (s.indexOf("pilotcar") !== -1) return "Pilot Car 4 Hire";
    if (s.indexOf("permitpath") !== -1) return "Permit Path";
    if (s.indexOf("seantylerlee") !== -1 || s.indexOf("stlapps") !== -1) return "STL Apps";
    return trim(site) || "Website";
  }
  function replySubject(row) {
    if (row && row.source === "quote") {
      var draft = billingDraft(row);
      var num = draft && draft.number;
      return num ? "STL Apps quote " + num : "STL Apps quote";
    }
    if (row && row.source === "release_notify") {
      return siteTitle(row.site) + " — your signup";
    }
    return siteTitle(row && row.site) + " — your message";
  }
  function replyBody(row) {
    var lines = ["", "", "----- Original message -----"];
    var from = trim(row && row.name) || "—";
    if (trim(row && row.email)) from += " <" + trim(row.email) + ">";
    lines.push("From: " + from);
    if (row && row.source === "quote") {
      var info = quoteContact(row);
      var p = quotePayload(row);
      if (info.phone) lines.push("Phone: " + info.phone);
      lines.push("Best contact: " + (info.method === "phone" ? "Phone" : "Email"));
      if (trim(p.company)) lines.push("Company: " + trim(p.company));
    }
    lines.push("Via: " + typeTitle(row && row.source) + " · " + siteTitle(row && row.site));
    lines.push("Date: " + stamp(row && row.created_at));
    if (row && row.source === "quote") {
      var draft = billingDraft(row);
      var payload = quotePayload(row);
      if (draft && draft.number) lines.push("Quote: " + draft.number);
      if (draft && (draft.total != null || payload.total != null)) {
        lines.push("Total: " + money(draft.total != null ? draft.total : payload.total));
      }
      if (draft && trim(draft.projectName)) lines.push("Project: " + trim(draft.projectName));
    }
    lines.push("");
    var msg = trim(row && row.message);
    if (msg.length > 1800) msg = msg.slice(0, 1800) + "…";
    if (msg) lines.push(msg);
    return lines.join("\n");
  }
  function replyMailto(row) {
    return "mailto:" + encodeURIComponent(trim(row.email)) +
      "?subject=" + encodeURIComponent(replySubject(row)) +
      "&body=" + encodeURIComponent(replyBody(row));
  }
  function money(n) {
    var x = Number(n);
    if (!isFinite(x)) x = 0;
    return x.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  function asObject(v) {
    if (!v) return {};
    if (typeof v === "object") return v;
    if (typeof v === "string") {
      try {
        var parsed = JSON.parse(v);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (e) {}
    }
    return {};
  }
  function quotePayload(row) {
    return asObject(row && row.payload);
  }
  function billingDraft(row) {
    var p = quotePayload(row);
    if (p.billing && typeof p.billing === "object") return p.billing;
    if (Array.isArray(p.items)) return p;
    return null;
  }
  function when(iso) {
    if (!iso) return "";
    var t = new Date(iso).getTime();
    if (isNaN(t)) return "";
    var s = (Date.now() - t) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    if (s < 86400 * 7) return Math.floor(s / 86400) + "d ago";
    return new Date(iso).toLocaleDateString();
  }
  function stamp(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString();
  }

  function snippet(text) {
    return trim(text).replace(/\s+/g, " ").slice(0, 88);
  }
  function initials(name, email) {
    var s = trim(name) || trim(email);
    if (!s) return "•";
    var parts = s.replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    return s.slice(0, 2).toUpperCase();
  }
  function siteTone(site) {
    var s = String(site || "").toLowerCase();
    if (s.indexOf("pilotcar") !== -1) return "pc";
    if (s.indexOf("permitpath") !== -1) return "pp";
    if (s.indexOf("seantylerlee") !== -1 || s.indexOf("stlapps") !== -1) return "sa";
    return "xx";
  }
  function visible() {
    var list = items.slice();
    if (filter === "unread") list = list.filter(function (row) { return row.status === "unread"; });
    else if (filter === "archived") list = list.filter(function (row) { return row.status === "archived"; });
    else if (filter === "contact" || filter === "quote" || filter === "release_notify") {
      list = list.filter(function (row) { return row.status !== "archived" && row.source === filter; });
    } else list = list.filter(function (row) { return row.status !== "archived"; });
    var q = trim(search).toLowerCase();
    if (q) {
      list = list.filter(function (row) {
        var draft = billingDraft(row);
        return [row.name, row.email, row.message, row.site, typeTitle(row.source), siteTitle(row.site), draft && draft.number, draft && draft.projectName]
          .some(function (v) { return String(v || "").toLowerCase().indexOf(q) !== -1; });
      });
    }
    list.sort(function (a, b) {
      if ((a.status === "unread") !== (b.status === "unread")) return a.status === "unread" ? -1 : 1;
      return String(b.created_at || "") < String(a.created_at || "") ? -1 : 1;
    });
    return list;
  }

  function shell() {
    return (
      '<div class="ops-workspace inbox-shell">' +
        '<div class="inbox-head">' +
          "<div><h1>Inbox</h1><p>Website messages and quotes. Reply from your own email.</p></div>" +
          '<input data-el="search" type="search" placeholder="Search messages" />' +
        "</div>" +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="inbox-bar" data-el="bar"></div>' +
        '<div class="inbox-split">' +
          '<div class="inbox-list" data-el="list"></div>' +
          '<div class="inbox-read" data-el="read"></div>' +
        "</div>" +
      "</div>"
    );
  }

  function countPills() {
    var live = items.filter(function (row) { return row.status !== "archived"; });
    return [
      ["unread", "Unread", items.filter(function (row) { return row.status === "unread"; }).length],
      ["all", "All", live.length],
      ["contact", "Contact", live.filter(function (row) { return row.source === "contact"; }).length],
      ["quote", "Quotes", live.filter(function (row) { return row.source === "quote"; }).length],
      ["release_notify", "Notify", live.filter(function (row) { return row.source === "release_notify"; }).length],
      ["archived", "Archived", items.filter(function (row) { return row.status === "archived"; }).length]
    ];
  }

  function renderBar() {
    var bar = el("bar");
    if (!bar) return;
    bar.innerHTML = countPills().map(function (pill) {
      var on = filter === pill[0] ? " is-on" : "";
      var count = pill[2] ? '<em>' + pill[2] + "</em>" : "";
      return '<button type="button" class="inbox-pill' + on + '" data-filter="' + pill[0] + '">' + pill[1] + count + "</button>";
    }).join("");
    bar.querySelectorAll("[data-filter]").forEach(function (btn) {
      btn.onclick = function () {
        filter = btn.getAttribute("data-filter");
        if (selectedId && !visible().some(function (row) { return row.id === selectedId; })) selectedId = null;
        render();
      };
    });
  }

  function renderList() {
    var box = el("list");
    if (!box) return;
    var list = visible();
    if (!list.length) {
      box.innerHTML = '<p class="inbox-empty">' +
        (items.length ? "Nothing in this filter." : "No messages yet. Contact forms, quotes, and notify-me signups land here.") +
        "</p>";
      return;
    }
    box.innerHTML = list.map(function (item) {
      var draft = billingDraft(item);
      var label = trim(item.name) || trim(item.email) || (draft && draft.number) || "Message";
      var extra = item.source === "quote" ? money((draft && draft.total != null) ? draft.total : quotePayload(item).total) : "";
      var snip = snippet(item.message);
      return (
        '<button type="button" class="inbox-row' +
          (item.id === selectedId ? " is-on" : "") +
          (item.status === "unread" ? " is-unread" : "") +
          '" data-id="' + item.id + '">' +
          '<span class="inbox-dot" aria-hidden="true"></span>' +
          '<span class="inbox-avatar is-' + siteTone(item.site) + '">' + esc(initials(item.name, item.email)) + "</span>" +
          '<span class="inbox-row-body">' +
            '<span class="inbox-row-top"><strong>' + esc(label) + "</strong><time>" + esc(when(item.created_at)) + "</time></span>" +
            '<span class="inbox-row-meta">' +
              '<span class="inbox-tag is-' + esc(item.source) + '">' + esc(typeTitle(item.source)) + "</span>" +
              "<span>" + esc(siteTitle(item.site)) + (extra ? " · " + extra : "") + "</span>" +
            "</span>" +
            (snip ? '<span class="inbox-row-snip">' + esc(snip) + "</span>" : "") +
          "</span>" +
        "</button>"
      );
    }).join("");
    box.querySelectorAll("[data-id]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-id");
        if (id === selectedId) return;
        selectedId = id;
        var row = selected();
        render();
        if (row && row.status === "unread") setStatus(row, "read");
      };
    });
  }

  function renderRead() {
    var box = el("read");
    if (!box) return;
    var row = selected();
    if (!row) {
      box.innerHTML = '<div class="inbox-placeholder"><strong>Select a message</strong><p>Replies open in your own email with the original note quoted.</p></div>';
      return;
    }
    var info = row.source === "quote" ? quoteContact(row) : { phone: "", method: "email" };
    var bits = [];
    if (trim(row.email)) bits.push('<a href="mailto:' + esc(row.email) + '">' + esc(row.email) + "</a>");
    if (info.phone) bits.push('<a href="tel:' + esc(info.phone.replace(/[^\d+]/g, "")) + '">' + esc(info.phone) + "</a>");
    if (row.source === "quote") bits.push("Prefers " + (info.method === "phone" ? "phone" : "email"));
    box.innerHTML =
      '<article class="inbox-letter">' +
        '<header class="inbox-letter-head">' +
          '<span class="inbox-avatar lg is-' + siteTone(row.site) + '">' + esc(initials(row.name, row.email)) + "</span>" +
          "<div>" +
            "<h2>" + esc(trim(row.name) || trim(row.email) || "Message") + "</h2>" +
            (bits.length ? '<p class="inbox-letter-contact">' + bits.join(" · ") + "</p>" : "") +
            '<p class="inbox-letter-meta">' + esc(typeTitle(row.source)) + " · " + esc(siteTitle(row.site)) + " · " + esc(stamp(row.created_at)) + "</p>" +
          "</div>" +
          '<span class="inbox-tag is-' + esc(row.source) + '">' + esc(typeTitle(row.source)) + "</span>" +
        "</header>" +
        quoteDetailHtml(row) +
        '<div class="inbox-letter-body">' + esc(row.message || "") + "</div>" +
        '<footer class="inbox-letter-foot">' +
          '<div class="inbox-letter-primary">' + contactActionHtml(row) +
            (row.source === "quote"
              ? (row.billing_id
                ? '<button class="btn btn-ghost" type="button" data-el="open-billing">Open in Billing</button>'
                : '<button class="btn btn-ghost" type="button" data-el="send-billing">Send to Billing</button>')
              : "") +
          "</div>" +
          '<div class="inbox-letter-more">' +
            (row.status === "unread"
              ? '<button class="btn btn-ghost" type="button" data-el="read">Mark read</button>'
              : '<button class="btn btn-ghost" type="button" data-el="unread">Mark unread</button>') +
            (row.status === "archived"
              ? '<button class="btn btn-ghost" type="button" data-el="unarchive">Move to inbox</button>'
              : '<button class="btn btn-ghost" type="button" data-el="archive">Archive</button>') +
            '<button class="btn btn-ghost" type="button" data-el="delete">Delete</button>' +
          "</div>" +
        "</footer>" +
      "</article>";
    bindRead();
  }

  function render() {
    renderBar();
    renderList();
    renderRead();
    hideSave();
  }

  function quoteContact(row) {
    var p = quotePayload(row);
    var draft = billingDraft(row) || {};
    return {
      phone: trim(draft.clientPhone || p.phone || ""),
      method: (p.contactMethod || draft.contactMethod) === "phone" ? "phone" : "email"
    };
  }

  function contactActionHtml(row) {
    var info = row && row.source === "quote" ? quoteContact(row) : { phone: "", method: "email" };
    var html = "";
    var emailLink = trim(row.email)
      ? '<a class="btn btn-primary" data-el="reply" href="' + esc(replyMailto(row)) + '">Reply</a>'
      : "";
    var callLink = info.phone
      ? '<a class="btn btn-ghost" href="tel:' + esc(info.phone.replace(/[^\d+]/g, "")) + '">Call</a>'
      : "";
    if (info.method === "phone") html += callLink + emailLink;
    else html += emailLink + callLink;
    return html;
  }

  function quoteDetailHtml(row) {
    if (!row || row.source !== "quote") return "";
    var p = quotePayload(row);
    var draft = billingDraft(row);
    if (!draft) return "";
    var items = Array.isArray(draft.items) ? draft.items : [];
    var html =
      '<section class="inbox-quote">' +
        '<div class="inbox-quote-top">' +
          "<strong>" + esc(draft.number || "Website quote") + "</strong>" +
          "<span>" + money(draft.total != null ? draft.total : p.total) + "</span>" +
        "</div>" +
        '<p>' +
          (p.intent === "interested" ? "Interested · " : "") +
          (row.billing_id ? "In Billing · " : "") +
          "Deposit " + money(p.deposit != null ? p.deposit : (Number(draft.total || 0) * Number(draft.depositPercent || 0) / 100)) +
          " · Valid until " + esc(draft.validUntil || draft.dueDate || "—") +
        "</p>" +
        (trim(draft.projectName) ? "<p>" + esc(draft.projectName) + "</p>" : "");
    if (items.length) {
      html += "<ul>";
      items.forEach(function (item) {
        html += "<li><span>" + esc(item.desc || "Item") + "</span><b>" + money(item.rate) + "</b></li>";
      });
      html += "</ul>";
    }
    html += "</section>";
    return html;
  }

  function openInBilling(id) {
    if (!id) return;
    if (window.STLBilling && typeof window.STLBilling.openDoc === "function") {
      window.STLBilling.openDoc(id);
    }
    if (window.STLApp && typeof window.STLApp.navigate === "function") {
      window.STLApp.navigate("billing");
    }
  }

  function sendToBilling(row) {
    if (!row) return;
    if (row.billing_id) {
      openInBilling(row.billing_id);
      return;
    }
    var draft = billingDraft(row);
    if (!draft) {
      showMsg("This quote has no billing details.", false);
      return;
    }
    var items = (Array.isArray(draft.items) ? draft.items : []).map(function (item) {
      return {
        desc: trim(item.desc || item.label || ""),
        qty: Number(item.qty) || 1,
        rate: Number(item.rate != null ? item.rate : item.amount) || 0
      };
    });
    if (!items.length) items = [{ desc: "Website quote", qty: 1, rate: Number(quotePayload(row).total) || 0 }];
    var total = Number(draft.total != null ? draft.total : quotePayload(row).total);
    if (!isFinite(total)) {
      total = items.reduce(function (sum, item) { return sum + item.qty * item.rate; }, 0);
    }
    var payload = {
      kind: "quote",
      number: draft.number || "",
      documentDate: draft.documentDate || draft.quoteDate || "",
      dueDate: draft.validUntil || draft.dueDate || "",
      terms: "14",
      poNumber: "",
      projectName: draft.projectName || "",
      linkedClientID: "",
      fromName: draft.fromName || "STL Apps LLC",
      fromContact: draft.fromContact || "Sean Tyler Lee",
      fromEmail: draft.fromEmail || "",
      fromPhone: draft.fromPhone || "",
      fromWebsite: draft.fromWebsite || "seantylerlee.com",
      fromTaxId: draft.fromTaxId || "",
      fromAddress: draft.fromAddress || "",
      clientName: draft.clientName || row.name || "",
      clientEmail: draft.clientEmail || row.email || "",
      clientPhone: draft.clientPhone || quotePayload(row).phone || "",
      clientAddress: draft.clientAddress || "",
      contactMethod: quotePayload(row).contactMethod || draft.contactMethod || "email",
      items: items,
      discountType: draft.discountType || "none",
      discountValue: Number(draft.discountValue) || 0,
      taxPercent: Number(draft.taxPercent) || 0,
      amountPaid: 0,
      paidDate: "",
      paymentNotes: draft.paymentNotes || "",
      notes: draft.notes || "",
      validDays: String(draft.validDays || "14"),
      validUntil: draft.validUntil || draft.dueDate || "",
      depositPercent: Number(draft.depositPercent) || 50,
      hourlyRate: Number(draft.hourlyRate) || 30
    };
    var contactLine = "Best contact: " + (payload.contactMethod === "phone" ? "phone" : "email") +
      (payload.clientPhone ? " · " + payload.clientPhone : "") + ".";
    payload.notes = contactLine + (payload.notes ? "\n\n" + payload.notes : "");
    showMsg("Sending to Billing…", true);
    db.from("billing_documents").insert({
      kind: "quote",
      number: payload.number || ("QTE-WEB-" + Date.now()),
      client_name: payload.clientName,
      client_email: payload.clientEmail,
      project_name: payload.projectName,
      status: "estimate",
      amount: total,
      issued_on: payload.documentDate || null,
      due_on: payload.validUntil || null,
      notes: payload.notes,
      payload: payload
    }).select("*").single().then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      db.from("studio_inbox").update({ billing_id: res.data.id, status: "archived" }).eq("id", row.id).then(function (up) {
        if (up.error) return showMsg(up.error.message, false);
        row.billing_id = res.data.id;
        row.status = "archived";
        publishUnread();
        showMsg("Moved to Billing.", true);
        openInBilling(res.data.id);
      });
    });
  }

  function bindSearch() {
    var searchEl = el("search");
    if (!searchEl || searchBound) return;
    searchBound = true;
    searchEl.addEventListener("input", function () {
      search = searchEl.value;
      if (selectedId && !visible().some(function (row) { return row.id === selectedId; })) selectedId = null;
      renderList();
      renderBar();
    });
  }

  function bindRead() {
    var sendBilling = el("send-billing");
    if (sendBilling) sendBilling.onclick = function () { sendToBilling(selected()); };
    var openBilling = el("open-billing");
    if (openBilling) openBilling.onclick = function () {
      var row = selected();
      if (row && row.billing_id) openInBilling(row.billing_id);
    };
    var readBtn = el("read");
    if (readBtn) readBtn.onclick = function () { setStatus(selected(), "read"); };
    var unreadBtn = el("unread");
    if (unreadBtn) unreadBtn.onclick = function () { setStatus(selected(), "unread"); };
    var archiveBtn = el("archive");
    if (archiveBtn) archiveBtn.onclick = function () { setStatus(selected(), "archived"); };
    var unarchiveBtn = el("unarchive");
    if (unarchiveBtn) unarchiveBtn.onclick = function () { setStatus(selected(), "read"); };
    var del = el("delete");
    if (del) {
      del.onclick = function () {
        var row = selected();
        if (!row || !window.confirm("Delete this message?")) return;
        db.from("studio_inbox").delete().eq("id", row.id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          items = items.filter(function (item) { return item.id !== row.id; });
          selectedId = null;
          publishUnread();
          showMsg("Deleted", true);
          setTimeout(function () { showMsg(""); }, 900);
          render();
        });
      };
    }
  }

  function setStatus(row, status) {
    if (!row || row.status === status) {
      render();
      return;
    }
    db.from("studio_inbox").update({ status: status }).eq("id", row.id).then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      row.status = status;
      publishUnread();
      render();
    });
  }

  function load() {
    if (!db) return;
    loading = true;
    showMsg("Loading inbox…", true);
    db.from("studio_inbox").select("*").order("created_at", { ascending: false }).then(function (res) {
      loading = false;
      if (res.error) {
        showMsg(/does not exist|schema cache/i.test(res.error.message || "") ? "Run sql/028_studio_inbox.sql in Supabase." : res.error.message, false);
        items = [];
      } else {
        items = res.data || [];
        showMsg("");
      }
      if (selectedId && !items.some(function (row) { return row.id === selectedId; })) selectedId = null;
      publishUnread();
      render();
    });
  }

  window.STLInbox = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      selectedId = null;
      filter = "unread";
      search = "";
      items = [];
      searchBound = false;
      panel.classList.add("ops-wide");
      panel.innerHTML = shell();
      bindSearch();
      hideSave();
      load();
    },
    unmount: function (panel) {
      hideSave();
      searchBound = false;
      if (panel) panel.classList.remove("ops-wide");
      root = null;
    },
    shown: function () {
      if (db && root && !loading) load();
    }
  };
})();

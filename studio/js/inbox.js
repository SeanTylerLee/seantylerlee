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

  function visible() {
    var list = items.slice();
    if (filter === "unread") list = list.filter(function (row) { return row.status === "unread"; });
    else if (filter === "archived") list = list.filter(function (row) { return row.status === "archived"; });
    else list = list.filter(function (row) { return row.status !== "archived"; });
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
      '<div class="ops-workspace">' +
        '<div class="ops-header"><h1>Inbox</h1><p>Website contact, notify-me signups, and STL Apps quotes. Reply from your own email. Quotes can be sent to Billing.</p></div>' +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="ops-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function render() {
    var unread = items.filter(function (row) { return row.status === "unread"; }).length;
    var contact = items.filter(function (row) { return row.source === "contact" && row.status !== "archived"; }).length;
    var quotes = items.filter(function (row) { return row.source === "quote" && row.status !== "archived"; }).length;
    var notify = items.filter(function (row) { return row.source === "release_notify" && row.status !== "archived"; }).length;
    var list = visible();
    var row = selected();

    var html =
      '<div class="ops-chips">' +
        '<div class="ops-chip danger"><span class="k">Unread</span><span class="v">' + unread + "</span></div>" +
        '<div class="ops-chip"><span class="k">Contact</span><span class="v">' + contact + "</span></div>" +
        '<div class="ops-chip"><span class="k">Quotes</span><span class="v">' + quotes + "</span></div>" +
        '<div class="ops-chip"><span class="k">Notify me</span><span class="v">' + notify + "</span></div>" +
      "</div>" +
      '<div class="ops-filters">' +
        [["unread", "Unread"], ["all", "All"], ["archived", "Archived"]].map(function (pair) {
          return '<button type="button" class="ops-pill' + (filter === pair[0] ? " is-on" : "") + '" data-filter="' + pair[0] + '">' + pair[1] + "</button>";
        }).join("") +
        '<input data-el="search" type="search" placeholder="Search…" value="' + esc(search) + '" style="margin-left:auto;min-height:30px;border-radius:8px;border:1px solid rgba(0,24,72,.12);padding:0 10px;font-size:12px" />' +
      "</div>" +
      '<div class="ops-split">' +
        '<div class="ops-list">';

    if (!list.length) {
      html += '<p class="sub" style="padding:8px;color:#6b7388">' +
        (items.length ? "Nothing in this filter." : "No messages yet. Contact forms, quotes, and notify-me signups from your websites show up here.") +
        "</p>";
    } else {
      list.forEach(function (item) {
        var draft = billingDraft(item);
        var label = trim(item.name) || trim(item.email) || (draft && draft.number) || "Message";
        var extra = item.source === "quote" ? " · " + money((draft && draft.total != null) ? draft.total : quotePayload(item).total) : "";
        html +=
          '<button type="button" class="ops-item' +
            (item.id === selectedId ? " is-on" : "") +
            (item.status === "unread" ? " is-unread" : "") +
            '" data-id="' + item.id + '">' +
            "<strong>" + esc(label) + extra + "</strong>" +
            "<span>" + esc(typeTitle(item.source)) + " · " + esc(siteTitle(item.site)) + " · " + esc(when(item.created_at)) + "</span>" +
          "</button>";
      });
    }

    html += '</div><div class="ops-detail">';
    if (!row) {
      html += '<p class="sub">Pick a message on the left.</p>';
    } else {
      html +=
        '<p class="sub" style="margin-bottom:12px">' + esc(typeTitle(row.source)) +
          " · " + esc(siteTitle(row.site)) +
          " · " + esc(stamp(row.created_at)) +
        "</p>" +
        '<div class="ops-grid">' +
          '<div class="ops-field"><label>From</label><div>' + esc(row.name || "—") + "</div></div>" +
          '<div class="ops-field"><label>Email</label><div>' +
            (trim(row.email)
              ? '<a href="mailto:' + esc(row.email) + '">' + esc(row.email) + "</a>"
              : "—") +
          "</div></div>" +
          contactFieldsHtml(row) +
        "</div>" +
        quoteDetailHtml(row) +
        '<div class="ops-field"><label>Message</label><div class="inbox-message">' +
          esc(row.message || "").replace(/\n/g, "<br>") +
        "</div></div>" +
        '<div class="ops-actions">' +
          contactActionHtml(row) +
          (row.source === "quote"
            ? (row.billing_id
              ? '<button class="btn btn-ghost" type="button" data-el="open-billing">Open in Billing</button>'
              : '<button class="btn btn-ghost" type="button" data-el="send-billing">Send to Billing</button>')
            : "") +
          (row.status === "unread"
            ? '<button class="btn btn-ghost" type="button" data-el="read">Mark read</button>'
            : '<button class="btn btn-ghost" type="button" data-el="unread">Mark unread</button>') +
          (row.status === "archived"
            ? '<button class="btn btn-ghost" type="button" data-el="unarchive">Move to inbox</button>'
            : '<button class="btn btn-ghost" type="button" data-el="archive">Archive</button>') +
          '<button class="btn btn-ghost" type="button" data-el="delete">Delete</button>' +
        "</div>";
    }
    html += "</div></div>";
    el("body").innerHTML = html;
    bind();
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

  function contactFieldsHtml(row) {
    if (!row || row.source !== "quote") return "";
    var info = quoteContact(row);
    var html = "";
    html += '<div class="ops-field"><label>Phone</label><div>' +
      (info.phone ? '<a href="tel:' + esc(info.phone.replace(/[^\d+]/g, "")) + '">' + esc(info.phone) + "</a>" : "—") +
      "</div></div>";
    html += '<div class="ops-field"><label>Best contact</label><div>' +
      (info.method === "phone" ? "Phone" : "Email") +
      "</div></div>";
    return html;
  }

  function contactActionHtml(row) {
    var info = row && row.source === "quote" ? quoteContact(row) : { phone: "", method: "email" };
    var html = "";
    var emailLink = trim(row.email)
      ? '<a class="btn btn-ghost" data-el="reply" href="' + esc(replyMailto(row)) + '">Reply</a>'
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
      '<div class="ops-field"><label>Quote</label><div>' +
        esc(draft.number || "Website quote") +
        (p.intent === "interested" ? " · Interested" : "") +
        (row.billing_id ? " · In Billing" : "") +
      "</div></div>" +
      '<div class="ops-grid">' +
        '<div class="ops-field"><label>Total</label><div>' + money(draft.total != null ? draft.total : p.total) + "</div></div>" +
        '<div class="ops-field"><label>Deposit</label><div>' + money(p.deposit != null ? p.deposit : (Number(draft.total || 0) * Number(draft.depositPercent || 0) / 100)) + "</div></div>" +
        '<div class="ops-field"><label>Valid until</label><div>' + esc(draft.validUntil || draft.dueDate || "—") + "</div></div>" +
        '<div class="ops-field"><label>Project</label><div>' + esc(draft.projectName || "—") + "</div></div>" +
      "</div>";
    if (items.length) {
      html += '<div class="ops-field"><label>Line items</label><div class="inbox-message">';
      items.forEach(function (item) {
        html += esc(item.desc || "Item") + " · " + money(item.rate) + "<br>";
      });
      html += "</div></div>";
    }
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

  function bind() {
    root.querySelectorAll("[data-filter]").forEach(function (btn) {
      btn.onclick = function () {
        filter = btn.getAttribute("data-filter");
        if (selectedId && !visible().some(function (row) { return row.id === selectedId; })) {
          selectedId = null;
        }
        render();
      };
    });
    var searchEl = el("search");
    if (searchEl) {
      searchEl.oninput = function () {
        var caret = searchEl.selectionStart;
        search = searchEl.value;
        render();
        var again = el("search");
        if (again) {
          again.focus();
          try { again.setSelectionRange(caret, caret); } catch (e) {}
        }
      };
    }
    root.querySelectorAll(".ops-list [data-id]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-id");
        if (id === selectedId) return;
        selectedId = id;
        var row = selected();
        render();
        if (row && row.status === "unread") setStatus(row, "read");
      };
    });
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
      panel.classList.add("ops-wide");
      panel.innerHTML = shell();
      hideSave();
      load();
    },
    unmount: function (panel) {
      hideSave();
      if (panel) panel.classList.remove("ops-wide");
      root = null;
    },
    shown: function () {
      if (db && root && !loading) load();
    }
  };
})();

(function () {
  "use strict";

  var STATUSES = [
    { id: "hot", title: "Hot" },
    { id: "warm", title: "Warm" },
    { id: "cold", title: "Cold" },
    { id: "converted", title: "Converted" },
    { id: "dead", title: "Dead" }
  ];

  var root = null;
  var db = null;
  var leads = [];
  var filter = "open";
  var expandedId = null;
  var dirty = false;
  var saving = false;

  function el(name) { return root ? root.querySelector('[data-el="' + name + '"]') : null; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function trim(s) { return String(s == null ? "" : s).trim(); }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }
  function syncSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.disabled = !dirty || saving;
    btn.textContent = saving ? "Saving…" : "Save";
  }
  function hideSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }
  function markDirty() { dirty = true; syncSave(); showMsg("Unsaved changes", true); }
  function clearDirty() { dirty = false; syncSave(); }

  function titleOf(l) {
    var company = trim(l.company_name);
    var person = trim(l.name);
    if (company && person) return company + " · " + person;
    return company || person || "Untitled lead";
  }

  function visible() {
    var list = leads.slice();
    if (filter === "open") list = list.filter(function (l) { return ["hot", "warm", "cold"].indexOf(l.status) >= 0; });
    else if (filter === "hot") list = list.filter(function (l) { return l.status === "hot"; });
    else if (filter !== "all") list = list.filter(function (l) { return l.status === filter; });
    var rank = { hot: 0, warm: 1, cold: 2, converted: 3, dead: 4 };
    list.sort(function (a, b) {
      if ((rank[a.status] || 9) !== (rank[b.status] || 9)) return (rank[a.status] || 9) - (rank[b.status] || 9);
      return String(b.updated_at || "") < String(a.updated_at || "") ? -1 : 1;
    });
    return list;
  }

  function field(label, key, value, type) {
    if (type === "textarea") return '<div class="ops-field"><label>' + label + '</label><textarea data-key="' + key + '">' + esc(value || "") + "</textarea></div>";
    if (type === "select") return '<div class="ops-field"><label>' + label + "</label><select data-key=\"" + key + "\">" + value + "</select></div>";
    return '<div class="ops-field"><label>' + label + '</label><input data-key="' + key + '" type="' + (type || "text") + '" value="' + esc(value || "") + '" /></div>';
  }

  function shell() {
    return '<div class="ops-workspace"><div class="ops-header"><h1>Leads</h1><p>People who might hire you. Convert a lead into a client when they book.</p></div><p class="status ops-banner" data-el="banner"></p><div class="ops-body" data-el="body"></div></div>';
  }

  function render() {
    var open = leads.filter(function (l) { return ["hot", "warm", "cold"].indexOf(l.status) >= 0; }).length;
    var hot = leads.filter(function (l) { return l.status === "hot"; }).length;
    var html =
      '<div class="ops-chips">' +
        '<div class="ops-chip danger"><span class="k">Open</span><span class="v">' + open + "</span></div>" +
        '<div class="ops-chip warn"><span class="k">Hot</span><span class="v">' + hot + "</span></div>" +
        '<div class="ops-chip"><span class="k">All</span><span class="v">' + leads.length + "</span></div>" +
      "</div>" +
      '<div class="ops-filters">' +
        ["open", "hot", "warm", "cold", "converted", "dead", "all"].map(function (f) {
          var label = f === "open" ? "Open" : f.charAt(0).toUpperCase() + f.slice(1);
          return '<button type="button" class="ops-pill' + (filter === f ? " is-on" : "") + '" data-filter="' + f + '">' + label + "</button>";
        }).join("") +
        '<button type="button" class="ops-pill" data-el="add" style="margin-left:auto">+ Add lead</button>' +
      "</div>";

    var rows = visible();
    if (!rows.length) {
      html += '<div class="ops-empty">No leads in this filter. Add someone who asked about a build.</div>';
    } else {
      rows.forEach(function (lead) {
        var openCard = lead.id === expandedId;
        html +=
          '<div class="ops-card' + (openCard ? " is-open" : "") + '" data-id="' + lead.id + '">' +
            '<button type="button" class="ops-card-head" data-action="toggle"><span class="chev">▸</span>' +
            '<div style="flex:1"><strong>' + esc(titleOf(lead)) + '</strong><span class="sub" style="margin:2px 0 0;display:block">' +
            esc(lead.status || "warm") + (trim(lead.source) ? " · " + esc(lead.source) : "") +
            "</span></div></button>" +
            '<div class="ops-card-body">' +
              '<div class="ops-grid">' +
                field("Name", "name", lead.name) +
                field("Company", "company_name", lead.company_name) +
                field("Email", "email", lead.email, "email") +
                field("Phone", "phone", lead.phone) +
                field("Source", "source", lead.source) +
                field("Status", "status", STATUSES.map(function (s) {
                  return '<option value="' + s.id + '"' + (lead.status === s.id ? " selected" : "") + ">" + s.title + "</option>";
                }).join(""), "select") +
                field("Last touch", "last_touch", lead.last_touch || "", "date") +
                field("Follow up", "follow_up", lead.follow_up || "", "date") +
              "</div>" +
              field("Notes", "notes", lead.notes, "textarea") +
              '<div class="ops-actions">' +
                '<button class="btn btn-ghost" type="button" data-action="touch">Mark touched today</button>' +
                '<button class="btn btn-ghost" type="button" data-action="convert">Convert to client</button>' +
                '<button class="btn btn-ghost" type="button" data-action="remove">Remove</button>' +
              "</div>" +
            "</div></div>";
      });
    }
    el("body").innerHTML = html;
    bind();
    syncSave();
  }

  function applyLocal(input, card) {
    var id = card.getAttribute("data-id");
    var key = input.getAttribute("data-key");
    leads.forEach(function (l) { if (l.id === id) l[key] = input.value; });
  }

  function harvest() {
    root.querySelectorAll(".ops-card[data-id]").forEach(function (card) {
      card.querySelectorAll("[data-key]").forEach(function (input) { applyLocal(input, card); });
    });
  }

  function bind() {
    root.querySelectorAll("[data-filter]").forEach(function (btn) {
      btn.onclick = function () {
        harvest();
        filter = btn.getAttribute("data-filter");
        expandedId = null;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      };
    });
    var add = el("add");
    if (add) add.onclick = addLead;
    root.querySelectorAll("[data-action='toggle']").forEach(function (btn) {
      btn.onclick = function () {
        harvest();
        var id = btn.closest("[data-id]").getAttribute("data-id");
        expandedId = expandedId === id ? null : id;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      };
    });
    root.querySelectorAll("[data-key]").forEach(function (input) {
      var evt = input.tagName === "SELECT" || input.type === "date" ? "change" : "input";
      input.addEventListener(evt, function () {
        applyLocal(input, input.closest("[data-id]"));
        markDirty();
      });
    });
    root.querySelectorAll("[data-action='touch']").forEach(function (btn) {
      btn.onclick = function () {
        harvest();
        var id = btn.closest("[data-id]").getAttribute("data-id");
        leads.forEach(function (l) { if (l.id === id) l.last_touch = todayISO(); });
        markDirty();
        render();
        showMsg("Unsaved changes", true);
      };
    });
    root.querySelectorAll("[data-action='convert']").forEach(function (btn) {
      btn.onclick = function () { convertLead(btn.closest("[data-id]").getAttribute("data-id")); };
    });
    root.querySelectorAll("[data-action='remove']").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.closest("[data-id]").getAttribute("data-id");
        var lead = leads.filter(function (l) { return l.id === id; })[0];
        if (!lead || !window.confirm('Remove "' + titleOf(lead) + '"?')) return;
        db.from("studio_leads").delete().eq("id", id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          leads = leads.filter(function (l) { return l.id !== id; });
          if (expandedId === id) expandedId = null;
          render();
        });
      };
    });
  }

  function addLead() {
    harvest();
    db.from("studio_leads").insert({
      name: "New lead",
      status: "warm",
      last_touch: todayISO()
    }).select("*").single().then(function (res) {
      if (res.error) return showMsg(/does not exist|schema cache/i.test(res.error.message || "") ? "Run sql/012_support_emails_leads.sql in Supabase." : res.error.message, false);
      leads.unshift(res.data);
      expandedId = res.data.id;
      filter = "open";
      clearDirty();
      render();
      showMsg("Lead added. Edit, then Save.", true);
    });
  }

  function convertLead(id) {
    harvest();
    var lead = leads.filter(function (l) { return l.id === id; })[0];
    if (!lead) return;
    if (!window.confirm("Convert this lead into a client?")) return;
    db.from("studio_clients").insert({
      name: lead.name || "",
      company_name: lead.company_name || "",
      email: lead.email || "",
      phone: lead.phone || "",
      notes: lead.notes || ""
    }).then(function (res) {
      if (res.error) return showMsg(res.error.message, false);
      lead.status = "converted";
      return db.from("studio_leads").update({ status: "converted" }).eq("id", id);
    }).then(function (res) {
      if (res && res.error) return showMsg(res.error.message, false);
      render();
      showMsg("Converted to client. Open Clients to finish details.", true);
    });
  }

  function saveAll() {
    if (saving || !dirty) return;
    harvest();
    saving = true;
    syncSave();
    showMsg("Saving…", true);
    Promise.all(leads.map(function (l) {
      return db.from("studio_leads").update({
        name: l.name || "",
        company_name: l.company_name || "",
        email: l.email || "",
        phone: l.phone || "",
        source: l.source || "",
        notes: l.notes || "",
        status: l.status || "warm",
        last_touch: l.last_touch || null,
        follow_up: l.follow_up || null
      }).eq("id", l.id);
    })).then(function (results) {
      saving = false;
      var err = results.map(function (r) { return r && r.error; }).filter(Boolean)[0];
      if (err) { showMsg(err.message, false); syncSave(); return; }
      clearDirty();
      showMsg("Saved", true);
      setTimeout(function () { showMsg(""); }, 900);
      render();
    });
  }

  function load() {
    showMsg("Loading leads…", true);
    db.from("studio_leads").select("*").order("updated_at", { ascending: false }).then(function (res) {
      if (res.error) {
        showMsg(/does not exist|schema cache/i.test(res.error.message || "") ? "Run sql/012_support_emails_leads.sql in Supabase." : res.error.message, false);
        leads = [];
        render();
        return;
      }
      leads = res.data || [];
      clearDirty();
      showMsg("");
      render();
    });
  }

  window.STLLeads = {
    mount: function (panel, client) {
      db = client; root = panel; filter = "open"; expandedId = null; dirty = false; saving = false;
      panel.classList.add("ops-wide");
      panel.innerHTML = shell();
      syncSave();
      load();
    },
    unmount: function (panel) {
      hideSave();
      if (panel) panel.classList.remove("ops-wide");
      root = null;
    },
    saveAll: saveAll,
    isDirty: function () { return dirty; }
  };
})();

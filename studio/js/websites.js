(function () {
  "use strict";

  var DEFAULTS = [
    { name: "STL Apps", domain: "seantylerlee.com" },
    { name: "Permit Path", domain: "permitpathnav.com" },
    { name: "HaulPath", domain: "haulpath.com" },
    { name: "Pilot Car 4 Hire", domain: "pilotcar4hire.com" }
  ];

  var root = null;
  var db = null;
  var sites = [];
  var selectedId = null;
  var clicks = [];
  var clickCount = 0;
  var visitCount = 0;
  var lastClick = "";

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

  function trim(s) {
    return String(s == null ? "" : s).trim();
  }

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

  function missingTable(err) {
    return /does not exist|schema cache/i.test((err && err.message) || "");
  }

  function hint(err) {
    if (missingTable(err)) return "Run sql/056_studio_websites.sql in Supabase, then refresh.";
    return (err && err.message) || "Could not load websites.";
  }

  function normalizeDomain(raw) {
    var d = trim(raw).toLowerCase();
    d = d.replace(/^https?:\/\//, "");
    d = d.split("/")[0];
    d = d.replace(/^www\./, "");
    return d;
  }

  function selectedSite() {
    return sites.filter(function (s) { return s.id === selectedId; })[0] || null;
  }

  function formatWhen(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
  }

  function shell() {
    return (
      '<div class="ops-workspace web-shell">' +
        '<div class="inbox-head">' +
          "<div><h1>Websites</h1><p>Pick a site to see its clicks. Add or delete sites here. Clicks keep date, time, page, visit id, and IP for 90 days.</p></div>" +
          '<div class="inbox-head-actions">' +
            '<button class="btn btn-ghost" type="button" data-el="add">Add website</button>' +
          "</div>" +
        "</div>" +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="web-pills" data-el="pills"></div>' +
        '<div class="ops-body web-body" data-el="detail"></div>' +
      "</div>"
    );
  }

  function renderPills() {
    var box = el("pills");
    if (!box) return;
    if (!sites.length) {
      box.innerHTML = '<p class="web-empty">No websites yet. Add one to start counting clicks.</p>';
      return;
    }
    box.innerHTML = sites.map(function (site) {
      return (
        '<button class="ops-pill' + (site.id === selectedId ? " is-on" : "") + '" type="button" data-pick="' + esc(site.id) + '">' +
          esc(site.name || site.domain) +
        "</button>"
      );
    }).join("");
    box.querySelectorAll("[data-pick]").forEach(function (btn) {
      btn.onclick = function () {
        selectedId = btn.getAttribute("data-pick");
        loadClicks();
      };
    });
  }

  function renderDetail() {
    var box = el("detail");
    if (!box) return;
    var site = selectedSite();
    if (!site) {
      box.innerHTML = '<p class="web-empty">Select a website.</p>';
      return;
    }
    box.innerHTML =
      '<div class="ops-card web-info">' +
        '<div class="ops-field"><label>Name</label><input data-el="name" type="text" value="' + esc(site.name) + '" /></div>' +
        '<div class="ops-field"><label>Domain</label><input data-el="domain" type="text" value="' + esc(site.domain) + '" /></div>' +
        '<div class="ops-field"><label>Notes</label><textarea data-el="notes" rows="3">' + esc(site.notes || "") + "</textarea></div>" +
        '<div class="web-info-actions">' +
          '<button class="btn btn-primary" type="button" data-el="save-info">Save</button>' +
          '<button class="btn btn-ghost" type="button" data-el="remove">Delete website</button>' +
        "</div>" +
      "</div>" +
      '<div class="ops-chips">' +
        '<div class="ops-chip"><span class="k">Clicks</span><span class="v">' + clickCount + "</span></div>" +
        '<div class="ops-chip"><span class="k">Visitors</span><span class="v">' + visitCount + "</span></div>" +
        '<div class="ops-chip"><span class="k">Last click</span><span class="v">' + esc(lastClick ? formatWhen(lastClick) : "—") + "</span></div>" +
      "</div>" +
      '<div class="ops-card">' +
        "<h3>Clicks</h3>" +
        '<p class="sub">Newest first. Page views and link taps. Kept 90 days.</p>' +
        (clicks.length
          ? '<div class="web-table-wrap"><table class="web-table"><thead><tr><th>When</th><th>Kind</th><th>Page</th><th>Label</th><th>Visit</th><th>IP</th></tr></thead><tbody>' +
            clicks.map(function (row) {
              return (
                "<tr>" +
                  "<td>" + esc(formatWhen(row.clicked_at)) + "</td>" +
                  "<td>" + esc(row.kind) + "</td>" +
                  "<td>" + esc(row.path) + "</td>" +
                  "<td>" + esc(row.label || "—") + "</td>" +
                  "<td>" + esc(row.visit_id ? row.visit_id.slice(0, 8) : "—") + "</td>" +
                  "<td>" + esc(row.ip_address || "—") + "</td>" +
                "</tr>"
              );
            }).join("") +
            "</tbody></table></div>"
          : '<p class="web-empty">No clicks yet for this site.</p>') +
      "</div>";

    var saveBtn = el("save-info");
    if (saveBtn) saveBtn.onclick = saveInfo;
    var removeBtn = el("remove");
    if (removeBtn) removeBtn.onclick = removeSite;
  }

  function render() {
    renderPills();
    renderDetail();
  }

  function saveInfo() {
    var site = selectedSite();
    if (!site) return;
    var name = trim(el("name") && el("name").value);
    var domain = normalizeDomain(el("domain") && el("domain").value);
    var notes = trim(el("notes") && el("notes").value);
    if (!name || !domain) return showMsg("Name and domain are required.", false);
    db.from("studio_websites").update({ name: name, domain: domain, notes: notes }).eq("id", site.id).select("*").single().then(function (res) {
      if (res.error) return showMsg(hint(res.error), false);
      sites = sites.map(function (s) { return s.id === site.id ? res.data : s; });
      showMsg("Saved.", true);
      loadClicks();
    });
  }

  function addSite() {
    var name = trim(window.prompt("Website name"));
    if (!name) return;
    var domain = normalizeDomain(window.prompt("Domain, like haulpath.com"));
    if (!domain) return showMsg("A domain is required.", false);
    db.from("studio_websites").insert({
      name: name,
      domain: domain,
      sort_order: sites.length
    }).select("*").single().then(function (res) {
      if (res.error) return showMsg(hint(res.error), false);
      sites.push(res.data);
      selectedId = res.data.id;
      showMsg("Website added.", true);
      loadClicks();
    });
  }

  function removeSite() {
    var site = selectedSite();
    if (!site || !window.confirm("Delete " + (site.name || site.domain) + " and its clicks?")) return;
    db.from("studio_website_clicks").delete().eq("host", site.domain).then(function (clickRes) {
      if (clickRes.error && !missingTable(clickRes.error)) return showMsg(hint(clickRes.error), false);
      db.from("studio_websites").delete().eq("id", site.id).then(function (res) {
        if (res.error) return showMsg(hint(res.error), false);
        sites = sites.filter(function (s) { return s.id !== site.id; });
        selectedId = sites[0] ? sites[0].id : null;
        showMsg("Website deleted.", true);
        loadClicks();
      });
    });
  }

  function ensureDefaults() {
    var have = {};
    sites.forEach(function (s) { have[normalizeDomain(s.domain)] = true; });
    var missing = DEFAULTS.filter(function (d) { return !have[d.domain]; });
    if (!missing.length) return Promise.resolve();
    return db.from("studio_websites").insert(missing.map(function (d, i) {
      return { name: d.name, domain: d.domain, sort_order: sites.length + i };
    })).select("*").then(function (res) {
      if (res.error) throw res.error;
      sites = sites.concat(res.data || []);
    });
  }

  function loadClicks() {
    renderPills();
    var site = selectedSite();
    if (!site) {
      clicks = [];
      clickCount = 0;
      visitCount = 0;
      lastClick = "";
      renderDetail();
      return;
    }
    var host = normalizeDomain(site.domain);
    var q = db.from("studio_website_clicks").select("*", { count: "exact" })
      .eq("host", host)
      .order("clicked_at", { ascending: false })
      .limit(400);
    q.then(function (res) {
      if (res.error) return showMsg(hint(res.error), false);
      clicks = res.data || [];
      clickCount = res.count || clicks.length;
      lastClick = clicks[0] ? clicks[0].clicked_at : "";
      var visits = {};
      clicks.forEach(function (row) {
        if (row.visit_id) visits[row.visit_id] = true;
      });
      visitCount = Object.keys(visits).length;
      renderDetail();
    });
  }

  function load() {
    hideSave();
    return db.from("studio_websites").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }).then(function (res) {
      if (res.error) {
        showMsg(hint(res.error), false);
        return;
      }
      sites = res.data || [];
      return ensureDefaults().then(function () {
        if (!selectedId || !sites.some(function (s) { return s.id === selectedId; })) {
          selectedId = sites[0] ? sites[0].id : null;
        }
        loadClicks();
      });
    }).catch(function (err) {
      showMsg(hint(err), false);
    });
  }

  window.STLWebsites = {
    mount: function (panel, client) {
      root = panel;
      db = client;
      root.classList.add("ops-wide");
      root.innerHTML = shell();
      var addBtn = el("add");
      if (addBtn) addBtn.onclick = addSite;
      return load();
    },
    shown: function () {
      hideSave();
      if (db) load();
    }
  };
})();

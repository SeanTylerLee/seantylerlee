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
  var ignores = [];

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
    if (missingTable(err)) return "Run sql/056_studio_websites.sql and sql/057_studio_website_ignores.sql in Supabase, then refresh.";
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

  function kindOfValue(raw) {
    var v = trim(raw);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v) || v.indexOf(":") >= 0) return "ip";
    return "visit";
  }

  function isIgnored(row) {
    if (!row) return false;
    var visit = trim(row.visit_id);
    var ip = trim(row.ip_address);
    return ignores.some(function (item) {
      var val = trim(item.value);
      if (!val) return false;
      if (item.kind === "ip") return ip === val;
      return visit === val || (visit && visit.indexOf(val) === 0);
    });
  }

  function visibleClicks() {
    return clicks.filter(function (row) { return !isIgnored(row); });
  }

  function renderIgnores() {
    var box = el("ignores");
    if (!box) return;
    if (!ignores.length) {
      box.innerHTML = '<p class="web-empty">Nothing ignored yet.</p>';
      return;
    }
    box.innerHTML = '<ul class="web-ignore-list">' + ignores.map(function (item) {
      var label = item.kind === "ip" ? "IP" : "Visit";
      return (
        "<li>" +
          "<span>" + esc(label) + " · " + esc(item.value) + "</span>" +
          '<button class="btn btn-ghost" type="button" data-unignore="' + esc(item.id) + '">Remove</button>' +
        "</li>"
      );
    }).join("") + "</ul>";
    box.querySelectorAll("[data-unignore]").forEach(function (btn) {
      btn.onclick = function () { removeIgnore(btn.getAttribute("data-unignore")); };
    });
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
        '<div class="ops-body web-body">' +
          '<div class="ops-card web-ignore">' +
            "<h3>Ignore list</h3>" +
            '<p class="sub">Hide your own traffic on every site. Add a visit id or an IP, or use Ignore on a click row.</p>' +
            '<div class="web-ignore-add">' +
              '<input data-el="ignore-value" type="text" placeholder="Visit id or IP" />' +
              '<button class="btn btn-primary" type="button" data-el="ignore-add">Add</button>' +
            "</div>" +
            '<div data-el="ignores"></div>' +
          "</div>" +
          '<div data-el="detail"></div>' +
        "</div>" +
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
    var shown = visibleClicks();
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
        (shown.length
          ? '<div class="web-table-wrap"><table class="web-table"><thead><tr><th>When</th><th>Kind</th><th>Page</th><th>Label</th><th>Visit</th><th>IP</th><th></th></tr></thead><tbody>' +
            shown.map(function (row) {
              return (
                "<tr>" +
                  "<td>" + esc(formatWhen(row.clicked_at)) + "</td>" +
                  "<td>" + esc(row.kind) + "</td>" +
                  "<td>" + esc(row.path) + "</td>" +
                  "<td>" + esc(row.label || "—") + "</td>" +
                  "<td>" + esc(row.visit_id ? row.visit_id.slice(0, 8) : "—") + "</td>" +
                  "<td>" + esc(row.ip_address || "—") + "</td>" +
                  "<td class=\"web-row-actions\">" +
                    (row.visit_id ? '<button class="btn btn-ghost" type="button" data-ignore-visit="' + esc(row.visit_id) + '">Ignore visit</button>' : "") +
                    (row.ip_address ? '<button class="btn btn-ghost" type="button" data-ignore-ip="' + esc(row.ip_address) + '">Ignore IP</button>' : "") +
                  "</td>" +
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
    box.querySelectorAll("[data-ignore-visit]").forEach(function (btn) {
      btn.onclick = function () { addIgnore("visit", btn.getAttribute("data-ignore-visit")); };
    });
    box.querySelectorAll("[data-ignore-ip]").forEach(function (btn) {
      btn.onclick = function () { addIgnore("ip", btn.getAttribute("data-ignore-ip")); };
    });
  }

  function render() {
    renderPills();
    renderIgnores();
    renderDetail();
  }

  function addIgnore(kind, value) {
    var v = trim(value);
    if (!v) return showMsg("Add a visit id or an IP.", false);
    var k = kind || kindOfValue(v);
    if (ignores.some(function (item) { return item.kind === k && trim(item.value) === v; })) {
      return showMsg("Already on the ignore list.", true);
    }
    db.from("studio_website_ignores").insert({ kind: k, value: v }).select("*").single().then(function (res) {
      if (res.error) return showMsg(hint(res.error), false);
      ignores = [res.data].concat(ignores);
      showMsg("Ignored.", true);
      applyIgnoreCounts();
      render();
    });
  }

  function removeIgnore(id) {
    db.from("studio_website_ignores").delete().eq("id", id).then(function (res) {
      if (res.error) return showMsg(hint(res.error), false);
      ignores = ignores.filter(function (item) { return item.id !== id; });
      showMsg("Removed from ignore list.", true);
      applyIgnoreCounts();
      render();
    });
  }

  function applyIgnoreCounts() {
    var shown = visibleClicks();
    clickCount = shown.length;
    lastClick = shown[0] ? shown[0].clicked_at : "";
    var visits = {};
    shown.forEach(function (row) {
      if (row.visit_id) visits[row.visit_id] = true;
    });
    visitCount = Object.keys(visits).length;
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
      applyIgnoreCounts();
      render();
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
      applyIgnoreCounts();
      render();
    });
  }

  function loadIgnores() {
    return db.from("studio_website_ignores").select("*").order("created_at", { ascending: false }).then(function (res) {
      if (res.error) {
        if (missingTable(res.error)) {
          showMsg(hint(res.error), false);
          ignores = [];
          return;
        }
        showMsg(hint(res.error), false);
        return;
      }
      ignores = res.data || [];
    });
  }

  function load() {
    hideSave();
    return Promise.all([
      db.from("studio_websites").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      loadIgnores()
    ]).then(function (parts) {
      var res = parts[0];
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
      var ignoreAdd = el("ignore-add");
      if (ignoreAdd) {
        ignoreAdd.onclick = function () {
          var box = el("ignore-value");
          addIgnore(null, box && box.value);
          if (box) box.value = "";
        };
      }
      var ignoreInput = el("ignore-value");
      if (ignoreInput) {
        ignoreInput.onkeydown = function (event) {
          if (event.key === "Enter") {
            event.preventDefault();
            addIgnore(null, ignoreInput.value);
            ignoreInput.value = "";
          }
        };
      }
      return load();
    },
    shown: function () {
      hideSave();
      if (db) load();
    }
  };
})();

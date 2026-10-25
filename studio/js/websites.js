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
  var seoCache = {};

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

  function startOfToday() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function sinceMs(days) {
    return Date.now() - days * 86400000;
  }

  function clickTime(row) {
    var t = new Date(row && row.clicked_at).getTime();
    return isNaN(t) ? 0 : t;
  }

  function inWindow(row, since) {
    return clickTime(row) >= since;
  }

  function rank(rows, keyFn, limit) {
    var map = {};
    rows.forEach(function (row) {
      var key = keyFn(row) || "—";
      map[key] = (map[key] || 0) + 1;
    });
    return Object.keys(map).map(function (key) {
      return { label: key, n: map[key] };
    }).sort(function (a, b) { return b.n - a.n; }).slice(0, limit || 8);
  }

  function pathKey(row) {
    var p = trim(row && row.path) || "/";
    var q = p.indexOf("?");
    return q >= 0 ? p.slice(0, q) : p;
  }

  function referrerKey(row, host) {
    var ref = trim(row && row.referrer);
    if (!ref) return "Direct";
    try {
      var h = String(new URL(ref).hostname || "").toLowerCase().replace(/^www\./, "");
      if (!h) return "Direct";
      if (h === host) return "This site";
      return h;
    } catch (err) {
      return "Direct";
    }
  }

  function isPhoneUA(ua) {
    return /iPhone|iPod|Windows Phone|IEMobile|BlackBerry|Opera Mini/i.test(ua || "") ||
      (/Android/i.test(ua || "") && /Mobile/i.test(ua || ""));
  }

  function windowStats(rows, since) {
    var slice = rows.filter(function (row) { return inWindow(row, since); });
    var views = 0;
    var taps = 0;
    var visits = {};
    slice.forEach(function (row) {
      if (row.kind === "click") taps += 1;
      else views += 1;
      if (row.visit_id) visits[row.visit_id] = true;
    });
    return { views: views, taps: taps, visitors: Object.keys(visits).length };
  }

  function rankList(items) {
    if (!items.length) return '<p class="web-empty">None yet.</p>';
    return "<ol class=\"web-rank\">" + items.map(function (item) {
      return "<li><span>" + esc(item.label) + "</span><strong>" + item.n + "</strong></li>";
    }).join("") + "</ol>";
  }

  function trafficHtml(host) {
    var rows = visibleClicks();
    var today = windowStats(rows, startOfToday());
    var week = windowStats(rows, sinceMs(7));
    var month = windowStats(rows, sinceMs(30));
    var pages = rank(rows, pathKey, 8);
    var taps = rank(rows.filter(function (row) { return row.kind === "click" && trim(row.label); }), function (row) {
      return trim(row.label);
    }, 8);
    var refs = rank(rows, function (row) { return referrerKey(row, host); }, 8);
    var phone = 0;
    var computer = 0;
    rows.forEach(function (row) {
      if (isPhoneUA(row.user_agent)) phone += 1;
      else computer += 1;
    });
    return (
      '<div class="ops-card web-traffic">' +
        "<h3>Traffic</h3>" +
        '<p class="sub">From the 90-day click log, ignoring your list. Views are page loads. Taps are buttons and links.</p>' +
        '<div class="ops-chips">' +
          '<div class="ops-chip"><span class="k">Today</span><span class="v">' + today.views + '</span><span class="web-chip-sub">views · ' + today.taps + ' taps · ' + today.visitors + ' visitors</span></div>' +
          '<div class="ops-chip"><span class="k">7 days</span><span class="v">' + week.views + '</span><span class="web-chip-sub">views · ' + week.taps + ' taps · ' + week.visitors + ' visitors</span></div>' +
          '<div class="ops-chip"><span class="k">30 days</span><span class="v">' + month.views + '</span><span class="web-chip-sub">views · ' + month.taps + ' taps · ' + month.visitors + ' visitors</span></div>' +
        '</div>' +
        '<div class="web-split">' +
          '<div><h4>Top pages</h4>' + rankList(pages) + "</div>" +
          "<div><h4>Hottest taps</h4>" + rankList(taps) + "</div>" +
          "<div><h4>Referrers</h4>" + rankList(refs) + "</div>" +
          "<div><h4>Phone vs computer</h4>" + rankList([
            { label: "Phone", n: phone },
            { label: "Computer", n: computer }
          ].filter(function (item) { return item.n; })) + "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function seoHtml(host) {
    var pack = seoCache[host] || { status: "idle" };
    var inner = "";
    if (pack.status === "loading") inner = '<p class="web-empty">Reading the live homepage…</p>';
    else if (pack.status === "err") inner = '<p class="web-empty">' + esc(pack.error || "Could not read the homepage.") + "</p>";
    else if (pack.status === "ok" && pack.data) {
      var d = pack.data;
      var issues = d.issues || [];
      inner =
        '<div class="web-share">' +
          (d.image ? '<img class="web-share-img" src="' + esc(d.image) + '" alt="" />' : '<div class="web-share-img is-empty">No image</div>') +
          "<div>" +
            "<p class=\"web-share-title\">" + esc(d.shareTitle || d.title || "No title") + "</p>" +
            "<p class=\"web-share-desc\">" + esc(d.shareDescription || d.description || "No description") + "</p>" +
            '<p class="web-share-url">' + esc(d.canonical || d.url || host) + "</p>" +
          "</div>" +
        "</div>" +
        '<div class="web-seo-meta">' +
          "<p><strong>Title</strong> " + esc(d.title || "—") + (d.title ? " · " + d.title.length + " characters" : "") + "</p>" +
          "<p><strong>Description</strong> " + esc(d.description || "—") + (d.description ? " · " + d.description.length + " characters" : "") + "</p>" +
        "</div>" +
        (issues.length
          ? "<h4>Needs a look</h4><ul class=\"web-issues\">" + issues.map(function (item) {
            return "<li>" + esc(item) + "</li>";
          }).join("") + "</ul>"
          : '<p class="web-empty">Title, description, share image, and canonical look set.</p>');
    } else {
      inner = '<p class="web-empty">Open this site to read the live homepage.</p>';
    }
    return (
      '<div class="ops-card web-seo" data-el="seo-card">' +
        "<h3>SEO and sharing</h3>" +
        '<p class="sub">What Google and social previews see on the live homepage.</p>' +
        inner +
      "</div>"
    );
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
      trafficHtml(normalizeDomain(site.domain)) +
      seoHtml(normalizeDomain(site.domain)) +
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
    try {
      renderPills();
      renderIgnores();
      renderDetail();
    } catch (err) {
      showMsg(hint(err), false);
    }
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
      .limit(1500);
    q.then(function (res) {
      if (res.error) return showMsg(hint(res.error), false);
      clicks = res.data || [];
      applyIgnoreCounts();
      render();
      loadSeo();
    });
  }

  function loadSeo() {
    var site = selectedSite();
    if (!site) return;
    var host = normalizeDomain(site.domain);
    var cached = seoCache[host];
    if (cached && (cached.status === "ok" || cached.status === "loading")) return;
    if (!window.STLLocalApi || typeof window.STLLocalApi.get !== "function" || !window.STLLocalApi.available()) {
      seoCache[host] = { status: "err", error: "Sign in on the live Studio site to read SEO." };
      render();
      return;
    }
    seoCache[host] = { status: "loading" };
    render();
    window.STLLocalApi.get("/api/website-seo?host=" + encodeURIComponent(host)).then(function (res) {
      if (selectedSite() && normalizeDomain(selectedSite().domain) !== host) return;
      if (!res.ok) {
        seoCache[host] = { status: "err", error: (res.data && res.data.error) || "Could not read the homepage." };
      } else {
        seoCache[host] = { status: "ok", data: res.data || {} };
      }
      render();
    }).catch(function (err) {
      seoCache[host] = { status: "err", error: (err && err.message) || "Could not read the homepage." };
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
        sites = sites || [];
        render();
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
      render();
    });
  }

  window.STLWebsites = {
    mount: function (panel, client) {
      root = panel;
      db = client;
      root.classList.remove("ops-wide");
      root.classList.add("web-page");
      root.innerHTML = shell();
      renderPills();
      renderIgnores();
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

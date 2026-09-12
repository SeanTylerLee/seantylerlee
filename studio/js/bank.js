(function () {
  "use strict";

  var root = null;
  var snapshot = null;
  var selectedAccountID = null;
  var revealNumbers = false;
  var loading = false;
  var tokenHint = "Not set";

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

  function money(n) {
    return (Number(n) || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD"
    });
  }

  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }

  function accounts() {
    return (snapshot && snapshot.accounts) || [];
  }

  function transactions() {
    return (snapshot && snapshot.transactions) || [];
  }

  function selectedAccount() {
    var list = accounts();
    return list.filter(function (a) { return a.id === selectedAccountID; })[0] || list[0] || null;
  }

  function displayName(account) {
    var nick = String(account.nickname || "").trim();
    return nick || account.name || "Account";
  }

  function last4(account) {
    var digits = String(account.accountNumber || "").replace(/\D/g, "");
    return digits.slice(-4) || "????";
  }

  function isActive(account) {
    return String(account.status || "").toLowerCase() === "active";
  }

  function txTitle(row) {
    var name = String(row.counterpartyName || "").trim();
    if (name) return name;
    var note = String(row.note || "").trim();
    if (note) return note;
    var desc = String(row.bankDescription || "").trim();
    if (desc) return desc;
    return kindLabel(row.kind);
  }

  function kindLabel(kind) {
    return String(kind || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, function (c) { return c.toUpperCase(); }) || "Transfer";
  }

  function isPending(row) {
    return String(row.status || "").toLowerCase() === "pending";
  }

  function parseDate(raw) {
    if (!raw) return null;
    var d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDay(raw) {
    var d = parseDate(raw);
    if (!d) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function totals() {
    var list = accounts().filter(isActive);
    var cash = list.reduce(function (s, a) { return s + Number(a.currentBalance || 0); }, 0);
    var available = list.reduce(function (s, a) { return s + Number(a.availableBalance || 0); }, 0);
    var now = new Date();
    var monthRows = transactions().filter(function (t) {
      var d = parseDate(t.createdAt);
      return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    var monthIn = monthRows.filter(function (t) { return Number(t.amount) > 0 && !isPending(t); })
      .reduce(function (s, t) { return s + Number(t.amount); }, 0);
    var monthOut = monthRows.filter(function (t) { return Number(t.amount) < 0 && !isPending(t); })
      .reduce(function (s, t) { return s + Number(t.amount); }, 0);
    var pendingOut = transactions().filter(function (t) { return isPending(t) && Number(t.amount) < 0; })
      .reduce(function (s, t) { return s + Number(t.amount); }, 0);
    return { cash: cash, available: available, monthIn: monthIn, monthOut: monthOut, pendingOut: pendingOut };
  }

  function visibleTransactions() {
    var rows = transactions();
    var account = selectedAccount();
    if (account) {
      rows = rows.filter(function (t) { return t.accountId === account.id; });
    }
    return rows.slice(0, 30);
  }

  function shell() {
    return (
      '<div class="bank-workspace">' +
        '<div class="bank-header">' +
          "<div><h1>Bank</h1>" +
          "<p>Mercury — cash, accounts, and recent activity. The API token stays on this Mac, not in the browser.</p></div>" +
          '<div class="actions">' +
            '<button class="btn btn-ghost" type="button" data-el="refresh">Refresh</button>' +
          "</div>" +
        "</div>" +
        '<p class="status bank-banner" data-el="banner"></p>' +
        '<div class="bank-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function render() {
    var body = el("body");
    if (!body) return;
    var t = totals();
    var account = selectedAccount();
    var html = "";

    if (snapshot) {
      html += '<p class="bank-updated">Updated ' + esc(formatDay(snapshot.fetchedAt)) +
        (snapshot.fetchedAt ? " · " + new Date(snapshot.fetchedAt).toLocaleTimeString() : "") +
        " · Token " + esc(tokenHint) + "</p>";
      html +=
        '<div class="bank-chips">' +
          '<div class="bank-chip ok"><span class="k">Cash on hand</span><span class="v">' + money(t.cash) + "</span></div>" +
          '<div class="bank-chip blue"><span class="k">Available</span><span class="v">' + money(t.available) + "</span></div>" +
          '<div class="bank-chip ok"><span class="k">In this month</span><span class="v">' + money(t.monthIn) + "</span></div>" +
          '<div class="bank-chip warn"><span class="k">Out this month</span><span class="v">' + money(t.monthOut) + "</span></div>" +
        "</div>";
      if (t.pendingOut < 0) {
        html += '<p class="bank-updated" style="color:#b06a00;font-weight:700">Pending outgoing ' + money(t.pendingOut) + "</p>";
      }

      html += '<div class="bank-card"><h3>Accounts</h3><p class="sub">Click an account to filter activity.</p>';
      if (!accounts().length) {
        html += '<p class="sub">No Mercury accounts on this token.</p>';
      } else {
        accounts().forEach(function (a) {
          var on = account && a.id === account.id;
          html +=
            '<button type="button" class="bank-account' + (on ? " is-on" : "") + '" data-account="' + esc(a.id) + '">' +
              '<div class="bank-account-row">' +
                "<div><strong>" + esc(displayName(a)) + "</strong>" +
                '<span class="meta">' + esc((a.kind || "").toString()) + " · " + esc((a.status || "").toString()) + "</span>" +
                '<span class="meta">' +
                  (revealNumbers
                    ? ("Acct " + esc(a.accountNumber || "") + " · ABA " + esc(a.routingNumber || ""))
                    : ("Acct ••••" + esc(last4(a)))) +
                "</span></div>" +
                '<div class="bal"><b>' + money(a.currentBalance) + "</b>" +
                "<span>Avail " + money(a.availableBalance) + "</span></div>" +
              "</div>" +
            "</button>";
        });
      }
      html +=
        '<label class="bank-check"><input data-el="reveal" type="checkbox"' + (revealNumbers ? " checked" : "") +
        " /> Show full account numbers</label></div>";

      html +=
        '<div class="bank-card"><h3>Activity' +
        (account ? (" · " + esc(displayName(account))) : "") +
        '</h3><p class="sub">Last 45 days.</p>';
      var rows = visibleTransactions();
      if (!rows.length) {
        html += '<p class="sub">No recent transactions.</p>';
      } else {
        rows.forEach(function (row) {
          var amt = Number(row.amount || 0);
          var cls = isPending(row) ? "pending" : (amt > 0 ? "in" : "out");
          html +=
            '<div class="bank-tx">' +
              '<span class="bank-dot ' + cls + '"></span>' +
              "<div><div class=\"title\">" + esc(txTitle(row)) + "</div>" +
              '<div class="meta">' + esc(formatDay(row.createdAt)) + " · " + esc(kindLabel(row.kind)) +
              (isPending(row) ? " · Pending" : "") + "</div></div>" +
              '<div class="amt' + (amt > 0 ? " in" : "") + '">' + money(amt) + "</div>" +
            "</div>";
        });
      }
      html += "</div>";
    } else if (!loading) {
      html =
        '<div class="bank-card"><h3>Mercury</h3>' +
        '<p class="sub">Refresh to load your Mercury accounts. Token is stored in secrets/mercury.token on this computer.</p>' +
        '<button class="btn btn-primary" type="button" data-el="refresh-empty" style="min-height:32px;font-size:12px">Refresh</button></div>';
    } else {
      html = '<div class="bank-card"><p class="sub">Loading Mercury…</p></div>';
    }

    html +=
      '<div class="bank-card"><h3>API token</h3>' +
      '<p class="sub">Read-only Mercury token. Kept on this Mac only. Never placed in page JavaScript.</p>' +
      '<p class="sub">Saved token ' + esc(tokenHint) + "</p></div>";

    body.innerHTML = html;
    bind();
  }

  function bind() {
    var refresh = el("refresh");
    if (refresh) refresh.addEventListener("click", loadSnapshot);
    var refreshEmpty = el("refresh-empty");
    if (refreshEmpty) refreshEmpty.addEventListener("click", loadSnapshot);
    var reveal = el("reveal");
    if (reveal) {
      reveal.addEventListener("change", function () {
        revealNumbers = reveal.checked;
        render();
      });
    }
    root.querySelectorAll("[data-account]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectedAccountID = btn.getAttribute("data-account");
        render();
      });
    });
  }

  function loadStatus() {
    if (!window.STLLocalApi || !window.STLLocalApi.available()) {
      tokenHint = "Mac only";
      return Promise.resolve();
    }
    return window.STLLocalApi.get("/api/mercury/status")
      .then(function (res) {
        var data = res.data || {};
        tokenHint = data.hint || (data.configured ? "Saved" : "Not set");
      })
      .catch(function () {
        tokenHint = "Proxy offline — restart with python3 server.py";
      });
  }

  function loadSnapshot() {
    if (loading) return;
    if (!window.STLLocalApi || !window.STLLocalApi.available()) {
      snapshot = null;
      showMsg(window.STLLocalApi ? window.STLLocalApi.message : "Bank only works on this Mac.", false);
      render();
      return;
    }
    loading = true;
    showMsg("Loading Mercury…", true);
    render();
    window.STLLocalApi.get("/api/mercury/snapshot")
      .then(function (res) {
        loading = false;
        if (!res.ok) {
          snapshot = null;
          showMsg((res.data && res.data.error) || "Could not load Mercury.", false);
          render();
          return;
        }
        snapshot = res.data;
        if (!selectedAccountID || !accounts().some(function (a) { return a.id === selectedAccountID; })) {
          selectedAccountID = accounts()[0] ? accounts()[0].id : null;
        }
        showMsg("");
        render();
      })
      .catch(function (err) {
        loading = false;
        snapshot = null;
        showMsg((err && err.message) || "Could not reach the studio server. Run python3 server.py", false);
        render();
      });
  }

  window.STLBank = {
    mount: function (panel) {
      root = panel;
      snapshot = null;
      selectedAccountID = null;
      revealNumbers = false;
      panel.classList.add("bank-wide");
      panel.innerHTML = shell();
      loadStatus().then(function () {
        render();
        loadSnapshot();
      });
    },
    unmount: function (panel) {
      if (panel) panel.classList.remove("bank-wide");
      root = null;
    }
  };
})();

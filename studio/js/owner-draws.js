(function () {
  "use strict";

  var M = function () { return window.STLMoney; };
  var root = null;
  var db = null;
  var draws = [];
  var selectedYear = new Date().getFullYear();
  var expandedId = null;
  var dirty = false;
  var saving = false;

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

  function yearDraws() {
    return draws
      .filter(function (d) { return Number(d.year) === selectedYear; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }

  function yearTotal() {
    return M().round2(yearDraws().reduce(function (s, d) { return s + Number(d.amount || 0); }, 0));
  }

  function syncSave() {
    M().syncSaveButton(dirty, saving);
  }

  function markDirty() {
    dirty = true;
    syncSave();
    showMsg("Unsaved changes", true);
  }

  function clearDirty() {
    dirty = false;
    syncSave();
  }

  function field(label, key, value, type) {
    if (type === "textarea") {
      return '<div class="money-field"><label>' + label + '</label><textarea data-key="' + key + '">' + M().esc(value || "") + "</textarea></div>";
    }
    return '<div class="money-field"><label>' + label + '</label><input data-key="' + key + '" type="' + (type || "text") + '" value="' + M().esc(value || "") + '" /></div>';
  }

  function shell() {
    return (
      '<div class="money-workspace">' +
        '<div data-el="yearbar"></div>' +
        '<div class="money-header"><h1>Owner Draws</h1>' +
        "<p>Money you took out of the LLC — pay, reimbursement, whatever. This is not an expense. Profit stays income minus expenses; draws are how much you actually pulled.</p></div>" +
        '<p class="status money-banner" data-el="banner"></p>' +
        '<div class="money-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function renderYearBar() {
    var years = M().visibleYears(draws, selectedYear);
    el("yearbar").innerHTML = M().yearBarHTML(selectedYear, years);
    el("yearbar").querySelector('[data-el="year-prev"]').onclick = function () {
      if (selectedYear <= M().currentYear() - 25) return;
      harvest();
      selectedYear -= 1;
      expandedId = null;
      render();
      if (dirty) showMsg("Unsaved changes", true);
    };
    el("yearbar").querySelector('[data-el="year-next"]').onclick = function () {
      if (selectedYear >= M().currentYear() + 1) return;
      harvest();
      selectedYear += 1;
      expandedId = null;
      render();
      if (dirty) showMsg("Unsaved changes", true);
    };
    el("yearbar").querySelectorAll("[data-year]").forEach(function (btn) {
      btn.onclick = function () {
        harvest();
        selectedYear = Number(btn.getAttribute("data-year"));
        expandedId = null;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      };
    });
    el("yearbar").querySelector('[data-el="add"]').onclick = addDraw;
  }

  function render() {
    renderYearBar();
    var list = yearDraws();
    var html =
      '<div class="money-chips">' +
        '<div class="money-chip warn"><span class="k">' + selectedYear + ' drawn</span><span class="v">' + M().money(yearTotal()) + "</span></div>" +
        '<div class="money-chip navy"><span class="k">Draws</span><span class="v">' + list.length + "</span></div>" +
      "</div>";

    if (!list.length) {
      html +=
        '<div class="money-empty">No draws in ' + selectedYear + ". Add one when you pay yourself or take money out of Mercury.</div>" +
        '<div class="money-actions"><button class="btn btn-ghost" type="button" data-el="add2">Add draw</button></div>';
    } else {
      list.forEach(function (draw) {
        var open = draw.id === expandedId;
        html +=
          '<div class="money-card' + (open ? " is-open" : "") + '" data-id="' + draw.id + '">' +
            '<button type="button" class="money-card-head" data-action="toggle">' +
              '<span class="chev">▸</span>' +
              '<span class="meta"><strong>' + M().esc(M().trim(draw.reason) || "Owner draw") + "</strong>" +
              '<span class="line">' + M().esc(M().formatDate(draw.date)) + "</span></span>" +
              '<span class="side">' + M().money(draw.amount) + "</span>" +
            "</button>" +
            '<div class="money-card-body">' +
              '<div class="money-grid">' +
                field("Amount", "amount", draw.amount, "number") +
                field("Date", "date", draw.date, "date") +
              "</div>" +
              field("Reason", "reason", draw.reason) +
              field("Notes", "notes", draw.notes, "textarea") +
              '<div class="money-actions" style="justify-content:flex-end">' +
                '<button class="btn btn-ghost" type="button" data-action="remove">Remove</button>' +
              "</div>" +
            "</div></div>";
      });
      html += '<div class="money-actions"><button class="btn btn-ghost" type="button" data-el="add2">Add draw</button></div>';
    }

    el("body").innerHTML = html;
    bind();
    syncSave();
  }

  function applyLocal(input, card) {
    var id = card.getAttribute("data-id");
    var key = input.getAttribute("data-key");
    var value = input.value;
    if (key === "amount") value = Number(value || 0);
    draws.forEach(function (d) {
      if (d.id !== id) return;
      d[key] = value;
      if (key === "date") d.year = M().yearFromISO(value);
    });
  }

  function harvest() {
    if (!root) return;
    root.querySelectorAll(".money-card[data-id]").forEach(function (card) {
      card.querySelectorAll("[data-key]").forEach(function (input) {
        applyLocal(input, card);
      });
    });
  }

  function bind() {
    root.querySelectorAll('[data-action="toggle"]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.closest("[data-id]").getAttribute("data-id");
        harvest();
        expandedId = expandedId === id ? null : id;
        render();
        if (dirty) showMsg("Unsaved changes", true);
      };
    });
    root.querySelectorAll("[data-key]").forEach(function (input) {
      var evt = input.type === "date" || input.type === "number" ? "change" : "input";
      input.addEventListener(evt, function () {
        applyLocal(input, input.closest("[data-id]"));
        markDirty();
        if (input.getAttribute("data-key") === "date") {
          harvest();
          var item = draws.filter(function (d) { return d.id === input.closest("[data-id]").getAttribute("data-id"); })[0];
          if (item && Number(item.year) !== selectedYear) selectedYear = Number(item.year);
          render();
          if (dirty) showMsg("Unsaved changes", true);
        }
      });
    });
    root.querySelectorAll('[data-action="remove"]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.closest("[data-id]").getAttribute("data-id");
        var draw = draws.filter(function (d) { return d.id === id; })[0];
        if (!draw) return;
        if (!window.confirm('Remove "' + (M().trim(draw.reason) || "Owner draw") + '"?')) return;
        db.from("owner_draws").delete().eq("id", id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          draws = draws.filter(function (d) { return d.id !== id; });
          if (expandedId === id) expandedId = null;
          render();
          if (dirty) showMsg("Unsaved changes", true);
        });
      };
    });
    var add2 = el("add2");
    if (add2) add2.onclick = addDraw;
  }

  function addDraw() {
    harvest();
    var date = selectedYear === M().currentYear() ? M().todayISO() : selectedYear + "-01-01";
    db.from("owner_draws").insert({
      amount: 0,
      reason: "",
      date: date,
      year: selectedYear,
      notes: ""
    }).select("*").single().then(function (res) {
      if (res.error) {
        showMsg(M().missingTable(res.error) ? "Run sql/009_money.sql in Supabase, then refresh." : res.error.message, false);
        return;
      }
      draws.unshift(res.data);
      expandedId = res.data.id;
      clearDirty();
      render();
      showMsg("Draw added. Fill it in, then Save.", true);
    });
  }

  function saveAll() {
    if (saving || !dirty) return;
    harvest();
    saving = true;
    syncSave();
    showMsg("Saving…", true);
    var jobs = draws.map(function (d) {
      return db.from("owner_draws").update({
        amount: Number(d.amount) || 0,
        reason: d.reason || "",
        date: d.date || M().todayISO(),
        year: Number(d.year) || selectedYear,
        notes: d.notes || ""
      }).eq("id", d.id);
    });
    Promise.all(jobs).then(function (results) {
      saving = false;
      var err = results.map(function (r) { return r && r.error; }).filter(Boolean)[0];
      if (err) {
        showMsg(err.message || "Save failed.", false);
        syncSave();
        return;
      }
      clearDirty();
      showMsg("Saved", true);
      setTimeout(function () { if (!dirty) showMsg(""); }, 1000);
      render();
    }).catch(function (err) {
      saving = false;
      showMsg((err && err.message) || "Save failed.", false);
      syncSave();
    });
  }

  function load() {
    showMsg("Loading…", true);
    db.from("owner_draws").select("*").order("date", { ascending: false }).then(function (res) {
      if (res.error) {
        showMsg(M().missingTable(res.error) ? "Run sql/009_money.sql in Supabase, then refresh." : res.error.message, false);
        draws = [];
        render();
        return;
      }
      draws = res.data || [];
      clearDirty();
      render();
      showMsg("");
    });
  }

  window.STLOwnerDraws = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      selectedYear = M().currentYear();
      expandedId = null;
      dirty = false;
      saving = false;
      panel.classList.add("money-wide");
      panel.innerHTML = shell();
      syncSave();
      load();
    },
    unmount: function (panel) {
      M().hideSaveButton();
      if (panel) panel.classList.remove("money-wide");
      root = null;
    },
    saveAll: saveAll,
    isDirty: function () { return dirty; }
  };
})();

(function () {
  "use strict";

  var root = null;
  var db = null;
  var items = [];
  var expandedId = null;
  var dirty = false;
  var saving = false;
  var search = "";

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

  function money(n) {
    return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function formatDate(iso) {
    if (!iso) return "—";
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return "—";
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

  function markDirty() {
    dirty = true;
    syncSave();
    showMsg("Unsaved changes", true);
  }

  function clearDirty() {
    dirty = false;
    syncSave();
  }

  function titleOf(item) {
    return trim(item.name) || "Untitled item";
  }

  function totalValue() {
    return items.reduce(function (sum, item) {
      return sum + (Number(item.amount) || 0);
    }, 0);
  }

  function visible() {
    var q = trim(search).toLowerCase();
    var list = items.slice();
    if (q) {
      list = list.filter(function (item) {
        return [item.name, item.purpose, item.serial_number]
          .join(" ")
          .toLowerCase()
          .indexOf(q) !== -1;
      });
    }
    list.sort(function (a, b) {
      var ad = String(a.purchased_on || "");
      var bd = String(b.purchased_on || "");
      if (ad !== bd) return bd < ad ? -1 : 1;
      return String(b.updated_at || "") < String(a.updated_at || "") ? -1 : 1;
    });
    return list;
  }

  function field(label, key, value, type) {
    if (type === "textarea") {
      return (
        '<div class="ops-field"><label>' + label + "</label>" +
        '<textarea data-key="' + key + '">' + esc(value || "") + "</textarea></div>"
      );
    }
    return (
      '<div class="ops-field"><label>' + label + "</label>" +
      '<input data-key="' + key + '" type="' + (type || "text") + '" value="' + esc(value == null ? "" : value) + '" /></div>'
    );
  }

  function shell() {
    return (
      '<div class="ops-workspace inventory-workspace">' +
        '<div class="ops-header">' +
          "<h1>Inventory</h1>" +
          "<p>Gear you bought for the LLC. No photos — just the list, purchase date, cost, what it’s for, and serial number.</p>" +
        "</div>" +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="ops-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function render() {
    var rows = visible();
    var html =
      '<div class="ops-chips">' +
        '<div class="ops-chip"><span class="k">Items</span><span class="v">' + items.length + "</span></div>" +
        '<div class="ops-chip ok"><span class="k">Total spent</span><span class="v">' + money(totalValue()) + "</span></div>" +
      "</div>" +
      '<div class="ops-filters inventory-filters">' +
        '<input class="inventory-search" data-el="search" type="search" placeholder="Search name, purpose, or serial…" value="' + esc(search) + '" />' +
        '<button type="button" class="ops-pill" data-el="add" style="margin-left:auto">+ Add item</button>' +
      "</div>";

    if (!rows.length) {
      html +=
        '<div class="ops-empty">' +
        (items.length
          ? "No items match that search."
          : "No inventory yet. Add a laptop, phone, SSD, or anything you bought for the business.") +
        "</div>";
    } else {
      rows.forEach(function (item) {
        var open = item.id === expandedId;
        var sub =
          (item.purchased_on ? formatDate(item.purchased_on) : "No purchase date") +
          " · " + money(item.amount) +
          (trim(item.serial_number) ? " · SN " + trim(item.serial_number) : "");
        html +=
          '<div class="ops-card' + (open ? " is-open" : "") + '" data-id="' + item.id + '">' +
            '<button type="button" class="ops-card-head" data-action="toggle">' +
              '<span class="chev">▸</span>' +
              '<div style="flex:1">' +
                "<strong>" + esc(titleOf(item)) + "</strong>" +
                '<span class="sub" style="margin:2px 0 0;display:block">' +
                  esc(trim(item.purpose) || "No purpose set") + " · " + esc(sub) +
                "</span>" +
              "</div>" +
            "</button>" +
            '<div class="ops-card-body">' +
              '<div class="ops-grid">' +
                field("Item name", "name", item.name) +
                field("What it’s for", "purpose", item.purpose) +
                field("Purchased", "purchased_on", item.purchased_on || "", "date") +
                field("How much", "amount", item.amount == null ? "" : item.amount, "number") +
                field("Serial number", "serial_number", item.serial_number) +
              "</div>" +
              '<div class="ops-actions">' +
                '<button class="btn btn-ghost" type="button" data-action="remove">Remove</button>' +
              "</div>" +
            "</div>" +
          "</div>";
      });
    }

    el("body").innerHTML = html;
    bind();
    syncSave();
  }

  function applyLocal(input, card) {
    var id = card.getAttribute("data-id");
    var key = input.getAttribute("data-key");
    var value = input.value;
    items.forEach(function (item) {
      if (item.id !== id) return;
      if (key === "amount") item.amount = value === "" ? 0 : Number(value);
      else item[key] = value;
    });
  }

  function harvest() {
    root.querySelectorAll(".ops-card[data-id]").forEach(function (card) {
      card.querySelectorAll("[data-key]").forEach(function (input) {
        applyLocal(input, card);
      });
    });
  }

  function bind() {
    var searchEl = el("search");
    if (searchEl) {
      searchEl.oninput = function () {
        var caret = searchEl.selectionStart;
        search = searchEl.value;
        harvest();
        render();
        var again = el("search");
        if (again) {
          again.focus();
          try { again.setSelectionRange(caret, caret); } catch (e) {}
        }
        if (dirty) showMsg("Unsaved changes", true);
      };
    }

    var add = el("add");
    if (add) add.onclick = addItem;

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
      var evt = input.type === "date" || input.type === "number" ? "change" : "input";
      input.addEventListener(evt, function () {
        applyLocal(input, input.closest("[data-id]"));
        markDirty();
      });
      if (input.type === "number") {
        input.addEventListener("input", function () {
          applyLocal(input, input.closest("[data-id]"));
          markDirty();
        });
      }
    });

    root.querySelectorAll("[data-action='remove']").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.closest("[data-id]").getAttribute("data-id");
        var item = items.filter(function (row) { return row.id === id; })[0];
        if (!item || !window.confirm('Remove "' + titleOf(item) + '"?')) return;
        db.from("inventory_items").delete().eq("id", id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          items = items.filter(function (row) { return row.id !== id; });
          if (expandedId === id) expandedId = null;
          render();
        });
      };
    });
  }

  function addItem() {
    harvest();
    var keepDirty = dirty;
    db.from("inventory_items").insert({
      name: "New item",
      purpose: "",
      purchased_on: todayISO(),
      amount: 0,
      serial_number: ""
    }).select("*").single().then(function (res) {
      if (res.error) {
        return showMsg(
          /does not exist|schema cache/i.test(res.error.message || "")
            ? "Run sql/013_inventory.sql in Supabase."
            : res.error.message,
          false
        );
      }
      items.unshift(res.data);
      expandedId = res.data.id;
      if (!keepDirty) clearDirty();
      else markDirty();
      render();
      showMsg("Item added. Edit, then Save.", true);
    });
  }

  function saveAll() {
    if (saving || !dirty) return;
    harvest();
    saving = true;
    syncSave();
    showMsg("Saving…", true);
    Promise.all(items.map(function (item) {
      return db.from("inventory_items").update({
        name: item.name || "",
        purpose: item.purpose || "",
        purchased_on: item.purchased_on || null,
        amount: Number(item.amount) || 0,
        serial_number: item.serial_number || ""
      }).eq("id", item.id);
    })).then(function (results) {
      saving = false;
      var err = results.map(function (r) { return r && r.error; }).filter(Boolean)[0];
      if (err) {
        showMsg(err.message, false);
        syncSave();
        return;
      }
      clearDirty();
      showMsg("Saved", true);
      setTimeout(function () { showMsg(""); }, 900);
      render();
    });
  }

  function load() {
    showMsg("Loading inventory…", true);
    db.from("inventory_items").select("*").order("purchased_on", { ascending: false }).then(function (res) {
      if (res.error) {
        showMsg(
          /does not exist|schema cache/i.test(res.error.message || "")
            ? "Run sql/013_inventory.sql in Supabase."
            : res.error.message,
          false
        );
        items = [];
        render();
        return;
      }
      items = res.data || [];
      clearDirty();
      showMsg("");
      render();
    });
  }

  window.STLInventory = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      expandedId = null;
      dirty = false;
      saving = false;
      search = "";
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

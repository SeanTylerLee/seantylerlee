(function () {
  "use strict";

  var DEFAULT_RATE = 0.70;

  var root = null;
  var db = null;
  var trips = [];
  var selectedYear = new Date().getFullYear();
  var expandedId = null;
  var dirty = false;
  var saving = false;
  var rate = DEFAULT_RATE;
  var rateDirty = false;
  var exporting = false;

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

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function round1(n) {
    return Math.round((Number(n) || 0) * 10) / 10;
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
    btn.disabled = !(dirty || rateDirty) || saving;
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
    rateDirty = false;
    syncSave();
  }

  function yearOf(trip) {
    return Number(String(trip.trip_date || "").slice(0, 4)) || 0;
  }

  function yearTrips() {
    return trips
      .filter(function (t) { return yearOf(t) === selectedYear; })
      .sort(function (a, b) {
        return String(b.trip_date || "") < String(a.trip_date || "") ? -1 : 1;
      });
  }

  function yearMiles() {
    return round1(yearTrips().reduce(function (s, t) { return s + (Number(t.miles) || 0); }, 0));
  }

  function yearDeduction() {
    return round2(yearMiles() * rate);
  }

  function titleOf(trip) {
    return trim(trip.purpose) || "Untitled trip";
  }

  function routeLine(trip) {
    var start = trim(trip.start_place);
    var end = trim(trip.end_place);
    if (start && end) return start + " → " + end;
    return start || end || "No route set";
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
      '<div class="ops-workspace mileage-workspace">' +
        '<div class="ops-header">' +
          "<h1>Mileage</h1>" +
          "<p>Business trips for tax records. Set the cents-per-mile rate, log each trip, then export a PDF for your accountant.</p>" +
        "</div>" +
        '<p class="status ops-banner" data-el="banner"></p>' +
        '<div class="ops-body" data-el="body"></div>' +
      "</div>"
    );
  }

  function yearPills() {
    var years = {};
    var cy = new Date().getFullYear();
    years[cy] = true;
    years[selectedYear] = true;
    trips.forEach(function (t) {
      var y = yearOf(t);
      if (y) years[y] = true;
    });
    return Object.keys(years).map(Number).sort(function (a, b) { return a - b; }).map(function (year) {
      return (
        '<button type="button" class="ops-pill' + (year === selectedYear ? " is-on" : "") + '" data-year="' + year + '">' +
        (year === cy ? year + " · Now" : String(year)) +
        "</button>"
      );
    }).join("");
  }

  function render() {
    var rows = yearTrips();
    var html =
      '<div class="ops-chips">' +
        '<div class="ops-chip"><span class="k">' + selectedYear + " miles</span><span class=\"v\">" + yearMiles().toLocaleString("en-US") + "</span></div>" +
        '<div class="ops-chip ok"><span class="k">Deduction @ ' + money(rate) + "/mi</span><span class=\"v\">" + money(yearDeduction()) + "</span></div>" +
        '<div class="ops-chip"><span class="k">Trips</span><span class="v">' + rows.length + "</span></div>" +
      "</div>" +
      '<div class="ops-filters mileage-filters">' +
        '<div class="mileage-year-pills">' + yearPills() + "</div>" +
        '<div class="mileage-rate-wrap">' +
          '<label>Rate ($/mi)</label>' +
          '<input data-el="rate" type="number" min="0" step="0.01" value="' + esc(String(rate)) + '" />' +
        "</div>" +
        '<button type="button" class="ops-pill" data-el="export"' + (exporting ? " disabled" : "") + ">Export " + selectedYear + " PDF</button>" +
        '<button type="button" class="ops-pill" data-el="add" style="margin-left:auto">+ Add trip</button>' +
      "</div>";

    if (!rows.length) {
      html +=
        '<div class="ops-empty">' +
        (trips.length
          ? "No trips in " + selectedYear + "."
          : "No mileage yet. Add client visits, store runs, or any business drive.") +
        "</div>";
    } else {
      rows.forEach(function (trip) {
        var open = trip.id === expandedId;
        var miles = Number(trip.miles) || 0;
        var sub = formatDate(trip.trip_date) + " · " + miles.toLocaleString("en-US") + " mi · " + money(round2(miles * rate));
        html +=
          '<div class="ops-card' + (open ? " is-open" : "") + '" data-id="' + trip.id + '">' +
            '<button type="button" class="ops-card-head" data-action="toggle">' +
              '<span class="chev">▸</span>' +
              '<div style="flex:1">' +
                "<strong>" + esc(titleOf(trip)) + "</strong>" +
                '<span class="sub" style="margin:2px 0 0;display:block">' +
                  esc(routeLine(trip)) + " · " + esc(sub) +
                "</span>" +
              "</div>" +
            "</button>" +
            '<div class="ops-card-body">' +
              '<div class="ops-grid">' +
                field("Purpose", "purpose", trip.purpose) +
                field("Date", "trip_date", trip.trip_date || "", "date") +
                field("From", "start_place", trip.start_place) +
                field("To", "end_place", trip.end_place) +
                field("Miles", "miles", trip.miles == null ? "" : trip.miles, "number") +
              "</div>" +
              field("Notes", "notes", trip.notes, "textarea") +
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
    trips.forEach(function (trip) {
      if (trip.id !== id) return;
      if (key === "miles") trip.miles = value === "" ? 0 : Number(value);
      else trip[key] = value;
    });
  }

  function harvest() {
    root.querySelectorAll(".ops-card[data-id]").forEach(function (card) {
      card.querySelectorAll("[data-key]").forEach(function (input) {
        applyLocal(input, card);
      });
    });
    var rateEl = el("rate");
    if (rateEl) {
      var next = Number(rateEl.value);
      if (Number.isFinite(next) && next >= 0) rate = next;
    }
  }

  function bind() {
    root.querySelectorAll("[data-year]").forEach(function (btn) {
      btn.onclick = function () {
        harvest();
        selectedYear = Number(btn.getAttribute("data-year"));
        expandedId = null;
        render();
        if (dirty || rateDirty) showMsg("Unsaved changes", true);
      };
    });

    var rateEl = el("rate");
    if (rateEl) {
      rateEl.onchange = function () {
        var next = Number(rateEl.value);
        if (!Number.isFinite(next) || next < 0) return;
        rate = next;
        rateDirty = true;
        syncSave();
        showMsg("Unsaved changes", true);
        harvest();
        render();
      };
      rateEl.oninput = function () {
        var next = Number(rateEl.value);
        if (!Number.isFinite(next) || next < 0) return;
        rate = next;
        rateDirty = true;
        syncSave();
      };
    }

    var add = el("add");
    if (add) add.onclick = addTrip;
    var exp = el("export");
    if (exp) exp.onclick = exportPdf;

    root.querySelectorAll("[data-action='toggle']").forEach(function (btn) {
      btn.onclick = function () {
        harvest();
        var id = btn.closest("[data-id]").getAttribute("data-id");
        expandedId = expandedId === id ? null : id;
        render();
        if (dirty || rateDirty) showMsg("Unsaved changes", true);
      };
    });

    root.querySelectorAll("[data-key]").forEach(function (input) {
      var evt = input.type === "date" || input.type === "number" ? "change" : "input";
      input.addEventListener(evt, function () {
        applyLocal(input, input.closest("[data-id]"));
        markDirty();
        if (input.getAttribute("data-key") === "trip_date") {
          harvest();
          var trip = trips.filter(function (t) { return t.id === input.closest("[data-id]").getAttribute("data-id"); })[0];
          if (trip) {
            var y = yearOf(trip);
            if (y && y !== selectedYear) selectedYear = y;
          }
          render();
          if (dirty || rateDirty) showMsg("Unsaved changes", true);
        }
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
        var trip = trips.filter(function (row) { return row.id === id; })[0];
        if (!trip || !window.confirm('Remove "' + titleOf(trip) + '"?')) return;
        db.from("mileage_trips").delete().eq("id", id).then(function (res) {
          if (res.error) return showMsg(res.error.message, false);
          trips = trips.filter(function (row) { return row.id !== id; });
          if (expandedId === id) expandedId = null;
          render();
        });
      };
    });
  }

  function addTrip() {
    harvest();
    var keepDirty = dirty || rateDirty;
    var date = selectedYear === new Date().getFullYear()
      ? todayISO()
      : selectedYear + "-01-01";
    db.from("mileage_trips").insert({
      trip_date: date,
      purpose: "",
      start_place: "",
      end_place: "",
      miles: 0,
      notes: ""
    }).select("*").single().then(function (res) {
      if (res.error) {
        return showMsg(
          /does not exist|schema cache/i.test(res.error.message || "")
            ? "Run sql/021_mileage.sql in Supabase."
            : res.error.message,
          false
        );
      }
      trips.unshift(res.data);
      expandedId = res.data.id;
      if (!keepDirty) clearDirty();
      else {
        dirty = true;
        syncSave();
      }
      render();
      showMsg("Trip added. Edit, then Save.", true);
    });
  }

  function saveRate() {
    return db.from("studio_settings").upsert({
      key: "mileage_rate",
      value: String(rate)
    }, { onConflict: "user_id,key" });
  }

  function saveAll() {
    if (saving || !(dirty || rateDirty)) return;
    harvest();
    saving = true;
    syncSave();
    showMsg("Saving…", true);
    var jobs = [];
    if (rateDirty) jobs.push(saveRate());
    if (dirty) {
      trips.forEach(function (trip) {
        jobs.push(db.from("mileage_trips").update({
          trip_date: trip.trip_date || todayISO(),
          purpose: trip.purpose || "",
          start_place: trip.start_place || "",
          end_place: trip.end_place || "",
          miles: round1(Number(trip.miles) || 0),
          notes: trip.notes || ""
        }).eq("id", trip.id));
      });
    }
    Promise.all(jobs).then(function (results) {
      saving = false;
      var err = results.map(function (r) { return r && r.error; }).filter(Boolean)[0];
      if (err) {
        var msg = err.message || "Save failed.";
        if (/does not exist|schema cache/i.test(msg)) msg = "Run sql/021_mileage.sql in Supabase.";
        showMsg(msg, false);
        syncSave();
        return;
      }
      clearDirty();
      showMsg("Saved", true);
      setTimeout(function () { showMsg(""); }, 900);
      render();
    });
  }

  function exportPdf() {
    if (!window.STLStudioPdf) return showMsg("PDF library missing.", false);
    harvest();
    var rows = yearTrips();
    exporting = true;
    render();
    showMsg("Building PDF…", true);
    window.STLStudioPdf.open({
      db: db,
      word: "MILEAGE LOG",
      yearLabel: "Tax year " + selectedYear
    }).then(function (pdf) {
      pdf.heading("Business mileage — " + selectedYear, 13);
      pdf.note("Prepared " + window.STLStudioPdf.prepared() + ". Rate " + money(rate) + " per mile. This is a record for your accountant, not tax advice.");
      pdf.chips([
        ["Trips", String(rows.length)],
        ["Miles", yearMiles().toLocaleString("en-US")],
        ["Rate", money(rate) + "/mi"],
        ["Deduction", money(yearDeduction())]
      ]);
      var colW = [70, 120, pdf.maxW - 70 - 120 - 55 - 70, 55, 70];
      pdf.tableHeader(["Date", "Purpose", "Route", "Miles", "Amount"], colW, 1);
      if (!rows.length) {
        pdf.note("No trips logged for this year.");
      } else {
        rows.forEach(function (trip, i) {
          var miles = Number(trip.miles) || 0;
          pdf.tableRow(
            [
              formatDate(trip.trip_date),
              titleOf(trip),
              routeLine(trip),
              miles.toLocaleString("en-US"),
              money(round2(miles * rate))
            ],
            colW,
            {
              sizes: [8, 8, 8, 8, 8],
              aligns: ["left", "left", "left", "right", "right"],
              stripe: i % 2 === 1
            }
          );
        });
      }
      pdf.totalLine(selectedYear + " mileage deduction", money(yearDeduction()));
      pdf.save("STL-Apps-LLC_Mileage_" + selectedYear + ".pdf");
      exporting = false;
      showMsg("Mileage PDF downloaded.", true);
      render();
    }).catch(function (err) {
      exporting = false;
      showMsg((err && err.message) || "Could not build the PDF.", false);
      render();
    });
  }

  function loadRate() {
    return db.from("studio_settings").select("value").eq("key", "mileage_rate").maybeSingle()
      .then(function (res) {
        if (res.error || !res.data) {
          rate = DEFAULT_RATE;
          return;
        }
        var n = Number(res.data.value);
        rate = Number.isFinite(n) && n >= 0 ? n : DEFAULT_RATE;
      })
      .catch(function () { rate = DEFAULT_RATE; });
  }

  function load() {
    showMsg("Loading mileage…", true);
    Promise.all([
      loadRate(),
      db.from("mileage_trips").select("*").order("trip_date", { ascending: false })
    ]).then(function (parts) {
      var res = parts[1];
      if (res.error) {
        showMsg(
          /does not exist|schema cache/i.test(res.error.message || "")
            ? "Run sql/021_mileage.sql in Supabase."
            : res.error.message,
          false
        );
        trips = [];
        render();
        return;
      }
      trips = res.data || [];
      clearDirty();
      showMsg("");
      render();
    });
  }

  window.STLMileage = {
    applyRate: function (n) {
      var v = Number(n);
      if (!Number.isFinite(v) || v < 0) return;
      rate = v;
      rateDirty = false;
      if (root) render();
    },
    mount: function (panel, client) {
      db = client;
      root = panel;
      selectedYear = new Date().getFullYear();
      expandedId = null;
      dirty = false;
      saving = false;
      rateDirty = false;
      exporting = false;
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
    isDirty: function () { return dirty || rateDirty; }
  };
})();

(function () {
  "use strict";

  function createLedger(config) {
    var M = function () { return window.STLMoney; };
    var root = null;
    var db = null;
    var rows = [];
    var skips = [];
    var selectedYear = new Date().getFullYear();
    var expandedId = null;
    var dirty = false;
    var saving = false;
    var pendingUploadId = null;
    var userId = null;
    var proofUrls = {};
    var proofTried = {};

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

    function yearRows() {
      return rows
        .filter(function (r) { return Number(r.year) === selectedYear; })
        .sort(function (a, b) {
          if (a.date !== b.date) return a.date < b.date ? 1 : -1;
          return 0;
        });
    }

    function totals() {
      var list = yearRows();
      var one = 0;
      var yearly = 0;
      var monthly = 0;
      list.forEach(function (item) {
        var rec = M().resolvedRecurrence(item);
        var total = M().yearTotal(item);
        if (rec === "monthly") monthly += total;
        else if (rec === "yearly") yearly += total;
        else one += total;
      });
      return {
        count: list.length,
        one: M().round2(one),
        yearly: M().round2(yearly),
        monthly: M().round2(monthly),
        year: M().round2(one + yearly + monthly)
      };
    }

    function missingRecurring() {
      var prior = rows.filter(function (r) {
        return Number(r.year) < selectedYear && r.is_recurring;
      });
      var bySeries = {};
      prior.forEach(function (r) {
        if (!bySeries[r.series_id] || Number(bySeries[r.series_id].year) < Number(r.year)) {
          bySeries[r.series_id] = r;
        }
      });
      var existing = {};
      yearRows().forEach(function (r) { existing[r.series_id] = true; });
      var skipped = {};
      skips.forEach(function (s) {
        if (Number(s.year) === selectedYear) skipped[s.series_id] = true;
      });
      return Object.keys(bySeries)
        .filter(function (id) { return !existing[id] && !skipped[id]; })
        .map(function (id) { return bySeries[id]; });
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

    function proofsOf(item) {
      var list = [];
      var raw = item && item.proofs;
      if (Array.isArray(raw)) list = raw.slice();
      else if (typeof raw === "string") {
        try {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) list = parsed;
        } catch (e) {}
      }
      if (!list.length && item && item.receipt_path) {
        list = [{ path: item.receipt_path, file_name: item.receipt_file_name || "receipt", bytes: 0 }];
      }
      return list.filter(function (p) { return p && p.path; });
    }

    function isImageName(name) {
      return /\.(png|jpe?g|webp|gif)$/i.test(String(name || ""));
    }

    function field(label, key, value, type) {
      if (type === "textarea") {
        return '<div class="money-field"><label>' + label + '</label><textarea data-key="' + key + '">' + M().esc(value || "") + "</textarea></div>";
      }
      if (type === "select") {
        return '<div class="money-field"><label>' + label + "</label><select data-key=\"" + key + "\">" + value + "</select></div>";
      }
      return '<div class="money-field"><label>' + label + '</label><input data-key="' + key + '" type="' + (type || "text") + '" value="' + M().esc(value || "") + '" /></div>';
    }

    function shell() {
      return (
        '<div class="money-workspace">' +
          '<div data-el="yearbar"></div>' +
          '<div class="money-header"><h1>' + M().esc(config.title) + "</h1><p>" + M().esc(config.blurb) + "</p></div>" +
          '<p class="status money-banner" data-el="banner"></p>' +
          '<div class="money-body" data-el="body"></div>' +
          '<input data-el="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*" multiple hidden />' +
        "</div>"
      );
    }

    function renderYearBar() {
      var years = M().visibleYears(rows, selectedYear);
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
      el("yearbar").querySelector('[data-el="add"]').onclick = addItem;
    }

    function render() {
      renderYearBar();
      var body = el("body");
      var list = yearRows();
      var t = totals();
      var missing = missingRecurring();
      var html =
        '<div class="money-chips">' +
          '<div class="money-chip ok"><span class="k">' + selectedYear + " total</span><span class=\"v\">" + M().money(t.year) + "</span></div>" +
          '<div class="money-chip"><span class="k">Items</span><span class="v">' + t.count + "</span></div>" +
          '<div class="money-chip warn"><span class="k">Recurring</span><span class="v">' + M().money(t.yearly + t.monthly) + "</span></div>" +
          '<div class="money-chip navy"><span class="k">One-time</span><span class="v">' + M().money(t.one) + "</span></div>" +
        "</div>";

      html +=
        '<div class="money-card"><h3>Totals</h3>' +
        '<div class="money-month-row"><span>One-time</span><strong>' + M().money(t.one) + "</strong></div>" +
        '<div class="money-month-row"><span>Yearly recurring</span><strong>' + M().money(t.yearly) + "</strong></div>" +
        '<div class="money-month-row"><span>Monthly recurring</span><strong>' + M().money(t.monthly) + "</strong></div>" +
        '<div class="money-month-row"><span>' + selectedYear + " total</span><strong>" + M().money(t.year) + "</strong></div></div>";

      if (missing.length) {
        html +=
          '<div class="money-banner-card"><p>' + missing.length +
          " recurring item" + (missing.length === 1 ? "" : "s") +
          " from earlier years can be copied into " + selectedYear + ".</p>" +
          '<button class="btn btn-ghost" type="button" data-el="copy-recurring">Copy recurring into ' + selectedYear + "</button></div>";
      }

      if (!list.length) {
        html +=
          '<div class="money-empty">' + M().esc(config.empty) + "</div>" +
          '<div class="money-actions"><button class="btn btn-ghost" type="button" data-el="add2">Add</button></div>';
      } else {
        list.forEach(function (item) {
          var open = item.id === expandedId;
          html +=
            '<div class="money-card' + (open ? " is-open" : "") + '" data-id="' + item.id + '">' +
              '<button type="button" class="money-card-head" data-action="toggle">' +
                '<span class="chev">▸</span>' +
                '<span class="meta"><strong>' + M().esc(M().trim(item.title) || config.untitled) + "</strong>" +
                '<span class="line">' + M().esc(M().formatDate(item.date)) +
                (proofsOf(item).length ? " · " + proofsOf(item).length + " proof" + (proofsOf(item).length === 1 ? "" : "s") : "") + "</span>" +
                '<span class="money-badge">' + M().esc(M().recurrenceTitle(item)) + "</span></span>" +
                '<span class="side">' + M().money(M().yearTotal(item)) + "</span>" +
              "</button>" +
              '<div class="money-card-body">' +
                field(config.titleLabel, "title", item.title) +
                '<div class="money-grid">' +
                  field("Amount", "amount", item.amount, "number") +
                  field("Date", "date", item.date, "date") +
                "</div>" +
                '<label class="money-check"><input data-key="is_recurring" type="checkbox"' + (item.is_recurring ? " checked" : "") + " /> Recurring</label>" +
                (item.is_recurring
                  ? '<div class="money-grid">' +
                      field("Cadence", "recurrence",
                        '<option value="yearly"' + (item.recurrence === "yearly" || item.recurrence === "none" ? " selected" : "") + ">Yearly</option>" +
                        '<option value="monthly"' + (item.recurrence === "monthly" ? " selected" : "") + ">Monthly</option>",
                        "select") +
                      (M().resolvedRecurrence(item) === "monthly"
                        ? field("Months this year", "recurring_month_count", item.recurring_month_count || M().resolvedMonthCount(item), "number")
                        : "") +
                    "</div>"
                  : "") +
                field("Notes", "notes", item.notes, "textarea") +
                proofBlock(item) +
                '<div class="money-actions">' +
                  '<button class="btn btn-ghost" type="button" data-upload="' + item.id + '">Add proof</button>' +
                  '<button class="btn btn-ghost" type="button" data-action="remove">Remove</button>' +
                "</div>" +
              "</div></div>";
        });
        html += '<div class="money-actions"><button class="btn btn-ghost" type="button" data-el="add2">Add</button></div>';
      }

      if (config.exportLabel) {
        html +=
          '<div class="money-actions" style="margin-top:14px">' +
            '<button class="btn btn-ghost" type="button" data-el="export-pdf">' + M().esc(config.exportLabel) + "</button>" +
          "</div>";
      }

      body.innerHTML = html;
      bind();
      syncSave();
      if (expandedId) resolveProofThumbs(expandedId);
    }

    function proofBlock(item) {
      var list = proofsOf(item);
      var html = '<div class="money-proofs"><div class="money-proofs-label">Proof</div>';
      if (!list.length) {
        html += '<p class="money-proofs-empty">Photos or PDFs of the receipt. Images are compressed before upload.</p>';
      } else {
        html += '<div class="money-proof-list">';
        list.forEach(function (proof, index) {
          var name = proof.file_name || "Proof";
          var url = proofUrls[proof.path] || "";
          html +=
            '<div class="money-proof">' +
              (url && isImageName(name)
                ? '<button type="button" class="money-proof-thumb" data-open-proof="' + item.id + '" data-proof-index="' + index + '"><img src="' + M().esc(url) + '" alt="" /></button>'
                : '<button type="button" class="money-proof-thumb is-file" data-open-proof="' + item.id + '" data-proof-index="' + index + '">PDF</button>') +
              '<span class="money-proof-name">' + M().esc(name) + "</span>" +
              '<button type="button" class="btn btn-ghost" data-clear-proof="' + item.id + '" data-proof-index="' + index + '">Remove</button>' +
            "</div>";
        });
        html += "</div>";
      }
      html += "</div>";
      return html;
    }

    function applyLocal(input, card) {
      var id = card.getAttribute("data-id");
      var key = input.getAttribute("data-key");
      var value = input.type === "checkbox" ? input.checked : input.value;
      if (key === "amount" || key === "recurring_month_count") value = Number(value || 0);
      rows.forEach(function (item) {
        if (item.id !== id) return;
        item[key] = value;
        if (key === "date") item.year = M().yearFromISO(value);
        if (key === "is_recurring" && value && (!item.recurrence || item.recurrence === "none")) item.recurrence = "yearly";
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
        var evt = input.tagName === "SELECT" || input.type === "checkbox" || input.type === "date" || input.type === "number" ? "change" : "input";
        input.addEventListener(evt, function () {
          applyLocal(input, input.closest("[data-id]"));
          markDirty();
          var key = input.getAttribute("data-key");
          if (key === "is_recurring" || key === "recurrence" || key === "date") {
            harvest();
            var item = rows.filter(function (r) { return r.id === input.closest("[data-id]").getAttribute("data-id"); })[0];
            if (item && key === "date") {
              var y = M().yearFromISO(item.date);
              if (y !== selectedYear) selectedYear = y;
            }
            render();
            if (dirty) showMsg("Unsaved changes", true);
          }
        });
      });

      root.querySelectorAll('[data-action="remove"]').forEach(function (btn) {
        btn.onclick = function () { removeItem(btn.closest("[data-id]").getAttribute("data-id")); };
      });
      root.querySelectorAll("[data-upload]").forEach(function (btn) {
        btn.onclick = function () {
          pendingUploadId = btn.getAttribute("data-upload");
          el("file").click();
        };
      });
      root.querySelectorAll("[data-open-proof]").forEach(function (btn) {
        btn.onclick = function () {
          openProof(btn.getAttribute("data-open-proof"), Number(btn.getAttribute("data-proof-index")));
        };
      });
      root.querySelectorAll("[data-clear-proof]").forEach(function (btn) {
        btn.onclick = function () {
          clearProof(btn.getAttribute("data-clear-proof"), Number(btn.getAttribute("data-proof-index")));
        };
      });

      var add2 = el("add2");
      if (add2) add2.onclick = addItem;
      var copy = el("copy-recurring");
      if (copy) copy.onclick = copyRecurring;
      var exp = el("export-pdf");
      if (exp) exp.onclick = exportPdf;

      var file = el("file");
      if (file) {
        file.onchange = function () {
          var chosen = file.files ? Array.prototype.slice.call(file.files) : [];
          file.value = "";
          var id = pendingUploadId;
          pendingUploadId = null;
          if (id && chosen.length) uploadProofs(id, chosen);
        };
      }
    }

    function addItem() {
      harvest();
      var payload = {
        title: "",
        amount: 0,
        year: selectedYear,
        date: selectedYear + "-01-01",
        is_recurring: false,
        recurrence: "none",
        recurring_month_count: 0,
        notes: ""
      };
      if (selectedYear === M().currentYear()) payload.date = M().todayISO();
      if (config.extraInsert) Object.assign(payload, config.extraInsert());
      db.from(config.table).insert(payload).select("*").single().then(function (res) {
        if (res.error) {
          showMsg(M().missingTable(res.error) ? "Run sql/009_money.sql in Supabase, then refresh." : res.error.message, false);
          return;
        }
        rows.unshift(res.data);
        expandedId = res.data.id;
        clearDirty();
        render();
        showMsg("Added. Fill it in, then Save.", true);
      });
    }

    function removeItem(id) {
      var item = rows.filter(function (r) { return r.id === id; })[0];
      if (!item) return;
      var name = M().trim(item.title) || config.untitled;
      if (!window.confirm('Remove "' + name + '"?')) return;
      var stop = item.is_recurring && window.confirm("Also stop copying this recurring item into future years?");
      var chain = Promise.resolve();
      var paths = proofsOf(item).map(function (p) { return p.path; });
      if (item.receipt_path && paths.indexOf(item.receipt_path) < 0) paths.push(item.receipt_path);
      if (paths.length) {
        chain = db.storage.from("ledger-receipts").remove(paths);
      }
      chain.then(function () {
        return db.from(config.table).delete().eq("id", id);
      }).then(function (res) {
        if (res && res.error) return showMsg(res.error.message, false);
        rows = rows.filter(function (r) { return r.id !== id; });
        if (expandedId === id) expandedId = null;
        if (stop) {
          return db.from(config.skipsTable).insert({
            series_id: item.series_id,
            year: selectedYear
          }).then(function () {
            return db.from(config.skipsTable).select("*");
          }).then(function (skipRes) {
            skips = (skipRes && skipRes.data) || skips;
          });
        }
      }).then(function () {
        render();
        if (dirty) showMsg("Unsaved changes", true);
      });
    }

    function copyRecurring() {
      var missing = missingRecurring();
      if (!missing.length) return;
      var inserts = missing.map(function (src) {
        var date = String(src.date || "").slice(0, 10);
        var parts = date.split("-");
        var copiedDate = selectedYear + "-" + (parts[1] || "01") + "-" + (parts[2] || "01");
        if (parts[1] === "02" && parts[2] === "29") copiedDate = selectedYear + "-02-28";
        var row = {
          title: src.title,
          amount: src.amount,
          year: selectedYear,
          date: copiedDate,
          is_recurring: true,
          recurrence: M().resolvedRecurrence(src),
          recurring_month_count: M().resolvedRecurrence(src) === "monthly" ? M().resolvedMonthCount(src) : 0,
          notes: src.notes || "",
          series_id: src.series_id
        };
        if (config.extraInsert) Object.assign(row, { source_invoice_number: "", source_payment_key: "" });
        return row;
      });
      db.from(config.table).insert(inserts).select("*").then(function (res) {
        if (res.error) return showMsg(res.error.message, false);
        rows = rows.concat(res.data || []);
        render();
        showMsg("Copied recurring items into " + selectedYear + ".", true);
      });
    }

    function shrinkFile(file) {
      if (window.STLImageCompress && window.STLImageCompress.file) {
        return window.STLImageCompress.file(file);
      }
      return Promise.resolve(file);
    }

    function persistProofs(id, list) {
      var first = list[0] || {};
      var patch = {
        proofs: list,
        receipt_path: first.path || "",
        receipt_file_name: first.file_name || ""
      };
      return db.from(config.table).update(patch).eq("id", id).select("*").single().then(function (res) {
        if (res.error) {
          if (/proofs|schema cache|column/i.test(res.error.message || "")) {
            throw new Error("Run sql/015_ledger_proofs.sql in Supabase, then refresh.");
          }
          throw res.error;
        }
        rows = rows.map(function (r) { return r.id === id ? res.data : r; });
        return res.data;
      });
    }

    function uploadProofs(id, files) {
      if (!userId) return showMsg("Not signed in.", false);
      var queue = files.slice();
      var total = queue.length;
      var i = 0;
      function next() {
        if (!queue.length) {
          showMsg(total === 1 ? "Proof attached." : total + " proofs attached.", true);
          render();
          if (dirty) showMsg("Unsaved changes", true);
          return;
        }
        i += 1;
        var original = queue.shift();
        showMsg("Compressing " + i + " of " + total + "…", true);
        return shrinkFile(original).then(function (file) {
          var safe = String(file.name || original.name || "proof").replace(/[^\w.\-]+/g, "-");
          var path = userId + "/" + config.kind + "/" + id + "/" + Date.now() + "-" + i + "-" + safe;
          showMsg("Uploading " + i + " of " + total + "…", true);
          return db.storage.from("ledger-receipts").upload(path, file, { upsert: true }).then(function (up) {
            if (up.error) {
              throw new Error(M().missingTable(up.error)
                ? "Run sql/009_money.sql (includes receipt storage)."
                : up.error.message);
            }
            var item = rows.filter(function (r) { return r.id === id; })[0];
            var list = proofsOf(item);
            list.push({
              path: path,
              file_name: file.name || original.name || "proof.jpg",
              bytes: file.size || 0
            });
            return persistProofs(id, list);
          });
        }).then(next);
      }
      next().catch(function (err) {
        showMsg((err && err.message) || "Upload failed.", false);
      });
    }

    function openProof(id, index) {
      var item = rows.filter(function (r) { return r.id === id; })[0];
      var proof = proofsOf(item)[index];
      if (!proof || !proof.path) return;
      if (!window.STLFileFloat) return showMsg("File viewer missing. Refresh the page.", false);
      showMsg("Opening proof…", true);
      db.storage.from("ledger-receipts").createSignedUrl(proof.path, 600).then(function (res) {
        if (res.error) return showMsg(res.error.message, false);
        showMsg("");
        window.STLFileFloat.open({
          title: item.title || "Proof",
          fileName: proof.file_name || proof.path,
          url: res.data.signedUrl
        });
      });
    }

    function clearProof(id, index) {
      var item = rows.filter(function (r) { return r.id === id; })[0];
      var list = proofsOf(item);
      var proof = list[index];
      if (!proof) return;
      db.storage.from("ledger-receipts").remove([proof.path]).then(function () {
        list.splice(index, 1);
        return persistProofs(id, list);
      }).then(function () {
        render();
        if (dirty) showMsg("Unsaved changes", true);
      }).catch(function (err) {
        showMsg((err && err.message) || "Could not remove proof.", false);
      });
    }

    function resolveProofThumbs(id) {
      var item = rows.filter(function (r) { return r.id === id; })[0];
      var list = proofsOf(item).filter(function (p) {
        return isImageName(p.file_name || p.path) && p.path && !proofUrls[p.path] && !proofTried[p.path];
      });
      if (!list.length) return;
      list.forEach(function (p) { proofTried[p.path] = true; });
      var paths = list.map(function (p) { return p.path; });
      db.storage.from("ledger-receipts").createSignedUrls(paths, 600).then(function (res) {
        (res.data || []).forEach(function (row) {
          if (row && row.path && row.signedUrl) proofUrls[row.path] = row.signedUrl;
        });
        render();
        if (dirty) showMsg("Unsaved changes", true);
      }).catch(function () {});
    }

    function typeLabel(item) {
      var rec = M().resolvedRecurrence(item);
      if (rec === "monthly") {
        var n = M().resolvedMonthCount ? M().resolvedMonthCount(item) : 12;
        return "Monthly × " + (n || 12);
      }
      if (rec === "yearly") return "Yearly";
      return "One-time";
    }

    function blobToDataUrl(blob) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(new Error("Could not read proof")); };
        reader.readAsDataURL(blob);
      });
    }

    function loadProofAssets(item) {
      var list = proofsOf(item);
      if (!list.length) return Promise.resolve([]);
      return list.reduce(function (chain, proof) {
        return chain.then(function (out) {
          return db.storage.from("ledger-receipts").createSignedUrl(proof.path, 180).then(function (res) {
            if (res.error || !res.data || !res.data.signedUrl) {
              out.push({ kind: "note", name: proof.file_name || "Proof" });
              return out;
            }
            if (!isImageName(proof.file_name || proof.path)) {
              out.push({ kind: "pdf", name: proof.file_name || "Proof.pdf" });
              return out;
            }
            return fetch(res.data.signedUrl).then(function (r) { return r.blob(); }).then(blobToDataUrl).then(function (url) {
              out.push({ kind: "image", url: url, name: proof.file_name || "proof.jpg" });
              return out;
            }).catch(function () {
              out.push({ kind: "note", name: proof.file_name || "Proof" });
              return out;
            });
          });
        });
      }, Promise.resolve([]));
    }

    function exportPdf() {
      if (!window.STLLedgerPdf) return showMsg("PDF library missing.", false);
      showMsg("Building PDF…", true);
      window.STLLedgerPdf.buildYear({
        db: db,
        rows: rows,
        year: selectedYear,
        kind: config.kind,
        untitled: config.untitled
      }).then(function (out) {
        var stem = config.kind === "income" ? "Income" : "Expenses";
        var url = URL.createObjectURL(out.blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "STL-Apps-LLC_" + stem + "_" + selectedYear + ".pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        showMsg("PDF downloaded.", true);
      }).catch(function (err) {
        showMsg((err && err.message) || "Could not build the PDF.", false);
      });
    }

    function saveAll() {
      if (saving || !dirty) return;
      harvest();
      saving = true;
      syncSave();
      showMsg("Saving…", true);
      var jobs = rows.map(function (item) {
        var patch = {
          title: item.title || "",
          amount: Number(item.amount) || 0,
          year: Number(item.year) || selectedYear,
          date: item.date || M().todayISO(),
          is_recurring: !!item.is_recurring,
          recurrence: item.is_recurring ? (item.recurrence === "monthly" ? "monthly" : "yearly") : "none",
          recurring_month_count: Number(item.recurring_month_count) || 0,
          notes: item.notes || ""
        };
        return db.from(config.table).update(patch).eq("id", item.id);
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

    function maybeBackfillIncome() {
      if (!config.backfillFromBilling) return Promise.resolve();
      return db.from("billing_documents").select("*").eq("kind", "invoice").then(function (res) {
        var docs = res.data || [];
        var existingKeys = {};
        rows.forEach(function (r) {
          if (r.source_payment_key) existingKeys[r.source_payment_key] = true;
          if (r.source_invoice_number) existingKeys["inv:" + String(r.source_invoice_number).toLowerCase()] = true;
        });
        var inserts = [];
        docs.forEach(function (doc) {
          if (doc.status !== "paid") return;
          var payload = doc.payload || {};
          var paidDate = doc.paid_on || payload.paidDate || doc.issued_on || M().todayISO();
          var year = M().yearFromISO(paidDate);
          var key = "pay:" + doc.id;
          var numKey = doc.number ? ("inv:" + String(doc.number).toLowerCase()) : "";
          if (existingKeys[key] || (numKey && existingKeys[numKey])) return;
          inserts.push({
            title: (doc.client_name ? doc.client_name + " · " : "") + (doc.number || "Invoice"),
            amount: Number(doc.amount) || 0,
            year: year,
            date: String(paidDate).slice(0, 10),
            is_recurring: false,
            recurrence: "none",
            notes: "From paid invoice",
            source_invoice_number: doc.number || "",
            source_payment_key: key
          });
        });
        if (!inserts.length) return;
        return db.from(config.table).insert(inserts).select("*").then(function (ins) {
          if (ins.data) rows = rows.concat(ins.data);
        });
      });
    }

    function load() {
      showMsg("Loading…", true);
      return db.auth.getUser().then(function (authRes) {
        userId = authRes.data && authRes.data.user && authRes.data.user.id;
        return Promise.all([
          db.from(config.table).select("*").order("date", { ascending: false }),
          db.from(config.skipsTable).select("*")
        ]);
      }).then(function (pair) {
        if (pair[0].error) {
          showMsg(M().missingTable(pair[0].error) ? "Run sql/009_money.sql in Supabase, then refresh." : pair[0].error.message, false);
          rows = [];
          skips = [];
          render();
          return;
        }
        rows = pair[0].data || [];
        skips = (pair[1] && pair[1].data) || [];
        return maybeBackfillIncome();
      }).then(function () {
        clearDirty();
        render();
        showMsg("");
      }).catch(function (err) {
        showMsg((err && err.message) || "Could not load.", false);
        render();
      });
    }

    return {
      mount: function (panel, client) {
        db = client;
        root = panel;
        selectedYear = M().currentYear();
        expandedId = null;
        dirty = false;
        saving = false;
        panel.classList.add("money-wide");
        panel.classList.add(config.panelClass);
        panel.innerHTML = shell();
        syncSave();
        load();
      },
      unmount: function (panel) {
        M().hideSaveButton();
        if (panel) {
          panel.classList.remove("money-wide");
          panel.classList.remove(config.panelClass);
        }
        root = null;
      },
      saveAll: saveAll,
      isDirty: function () { return dirty; }
    };
  }

  function ledgerProofsOf(item) {
    var list = [];
    var raw = item && item.proofs;
    if (Array.isArray(raw)) list = raw.slice();
    else if (typeof raw === "string") {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch (e) {}
    }
    if (!list.length && item && item.receipt_path) {
      list = [{ path: item.receipt_path, file_name: item.receipt_file_name || "receipt", bytes: 0 }];
    }
    return list.filter(function (p) { return p && p.path; });
  }

  function ledgerIsImageName(name) {
    return /\.(png|jpe?g|webp|gif)$/i.test(String(name || ""));
  }

  function ledgerTypeLabel(item) {
    var M = window.STLMoney;
    var rec = M.resolvedRecurrence(item);
    if (rec === "monthly") {
      var n = M.resolvedMonthCount ? M.resolvedMonthCount(item) : 12;
      return "Monthly × " + (n || 12);
    }
    if (rec === "yearly") return "Yearly";
    return "One-time";
  }

  function ledgerBlobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error("Could not read proof")); };
      reader.readAsDataURL(blob);
    });
  }

  function ledgerMeasureDataUrl(dataUrl) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        resolve({ url: dataUrl, width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 });
      };
      img.onerror = function () { resolve({ url: dataUrl, width: 0, height: 0 }); };
      img.src = dataUrl;
    });
  }

  function ledgerSafeFile(name) {
    return String(name || "file").replace(/[\/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").trim() || "file";
  }

  function ledgerYearTotals(list) {
    var M = window.STLMoney;
    var one = 0;
    var yearly = 0;
    var monthly = 0;
    list.forEach(function (item) {
      var rec = M.resolvedRecurrence(item);
      var total = M.yearTotal(item);
      if (rec === "monthly") monthly += total;
      else if (rec === "yearly") yearly += total;
      else one += total;
    });
    return {
      one: M.round2(one),
      yearly: M.round2(yearly),
      monthly: M.round2(monthly),
      year: M.round2(one + yearly + monthly)
    };
  }

  function ledgerLoadProofAssets(db, item) {
    var list = ledgerProofsOf(item);
    if (!list.length) return Promise.resolve([]);
    return list.reduce(function (chain, proof) {
      return chain.then(function (out) {
        return db.storage.from("ledger-receipts").createSignedUrl(proof.path, 180).then(function (res) {
          if (res.error || !res.data || !res.data.signedUrl) {
            out.push({ kind: "note", name: proof.file_name || "Proof" });
            return out;
          }
          var url = res.data.signedUrl;
          var fileName = proof.file_name || proof.path || "proof";
          return fetch(url).then(function (r) { return r.blob(); }).then(function (blob) {
            var asset = { name: fileName, blob: blob };
            if (!ledgerIsImageName(fileName)) {
              asset.kind = "pdf";
              out.push(asset);
              return out;
            }
            return ledgerBlobToDataUrl(blob).then(ledgerMeasureDataUrl).then(function (measured) {
              asset.kind = "image";
              asset.url = measured.url;
              asset.width = measured.width;
              asset.height = measured.height;
              out.push(asset);
              return out;
            });
          }).catch(function () {
            out.push({ kind: "note", name: fileName });
            return out;
          });
        });
      });
    }, Promise.resolve([]));
  }

  function ledgerBuildYear(opts) {
    opts = opts || {};
    var M = window.STLMoney;
    if (!window.STLStudioPdf) return Promise.reject(new Error("PDF library missing."));
    var db = opts.db;
    var year = Number(opts.year) || new Date().getFullYear();
    var kind = opts.kind === "income" ? "income" : "expenses";
    var untitled = opts.untitled || (kind === "income" ? "Untitled income" : "Untitled expense");
    var list = (opts.rows || []).filter(function (r) { return Number(r.year) === year; }).slice().sort(function (a, b) {
      if (String(a.date) !== String(b.date)) return String(a.date) < String(b.date) ? -1 : 1;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
    if (!list.length) return Promise.reject(new Error("Add at least one item for this year first."));
    var t = ledgerYearTotals(list);
    var word = kind === "income" ? "INCOME REPORT" : "EXPENSE REPORT";
    var column = kind === "income" ? "Income" : "Expense";
    var noun = kind === "income" ? "income item" : "expense";
    var numbered = [];
    var proofCount = 0;
    list.forEach(function (item, i) {
      var proofs = ledgerProofsOf(item);
      var n = proofs.length ? (proofCount += proofs.length, proofCount - proofs.length + 1) : null;
      numbered.push({ item: item, number: i + 1, proofStart: n, proofs: proofs });
    });
    return Promise.all(numbered.map(function (row) {
      return ledgerLoadProofAssets(db, row.item).then(function (assets) {
        row.assets = assets;
        return row;
      });
    })).then(function (rows) {
      return window.STLStudioPdf.open({
        db: db,
        word: word,
        yearLabel: "Tax year " + year
      }).then(function (pdf) {
        pdf.heading(kind === "income" ? "Yearly income summary" : "Yearly expense summary", 13);
        pdf.note("Prepared " + window.STLStudioPdf.prepared() + " for tax records. Amounts are the total counted in " + year + ". Receipt photos are printed at true proportion on the exhibit pages that follow.");
        pdf.chips([
          ["Year total", window.STLStudioPdf.money(t.year)],
          ["One-time", window.STLStudioPdf.money(t.one)],
          ["Yearly recurring", window.STLStudioPdf.money(t.yearly)],
          ["Monthly recurring", window.STLStudioPdf.money(t.monthly)]
        ]);
        pdf.heading(kind === "income" ? "Income list" : "Expense list", 12);
        var attached = numbered.filter(function (r) { return r.proofs.length; }).length;
        pdf.note(attached
          ? "Exhibit numbers match the receipt pages that follow this list. Original files are also included in the tax packet under Receipts."
          : "No receipts are attached. Add photos or PDFs on each " + noun + " to include exhibit pages.");
        var colW = [28, 78, pdf.maxW - 28 - 78 - 88 - 78 - 48, 88, 78, 48];
        pdf.tableHeader(["#", "Date", column, "Type", "Amount", "Exh."], colW, 4);
        rows.forEach(function (row) {
          var item = row.item;
          var proof = row.proofStart
            ? (row.proofs.length > 1 ? row.proofStart + "–" + (row.proofStart + row.proofs.length - 1) : String(row.proofStart))
            : "—";
          pdf.tableRow(
            [
              String(row.number),
              M.formatDate(item.date),
              M.trim(item.title) || untitled,
              ledgerTypeLabel(item),
              window.STLStudioPdf.money(M.yearTotal(item)),
              proof
            ],
            colW,
            {
              sizes: [9, 8.5, 9, 8.5, 9, 9],
              bolds: [false, false, false, false, false, true],
              aligns: ["center", "left", "left", "left", "right", "center"],
              stripe: row.number % 2 === 0
            }
          );
        });
        pdf.totalLine("Total " + year, window.STLStudioPdf.money(t.year));
        if (attached) {
          pdf.note("The following pages are Exhibit 1 through Exhibit " + proofCount + ". Each exhibit is the receipt photo or original PDF attached to that " + noun + ".");
        }
        var proofNo = 0;
        var receipts = [];
        rows.forEach(function (row) {
          (row.assets || []).forEach(function (asset) {
            proofNo += 1;
            var meta = {
              number: proofNo,
              title: M.trim(row.item.title) || untitled,
              line: M.formatDate(row.item.date) + "  ·  " + window.STLStudioPdf.money(M.yearTotal(row.item)) + (asset.name ? "  ·  " + asset.name : ""),
              width: asset.width,
              height: asset.height
            };
            if (asset.kind === "image" && asset.url) pdf.proofImage(asset.url, meta);
            else pdf.proofNote(meta);
            if (asset.blob) {
              var ext = String(asset.name || "file").split(".").pop() || "bin";
              receipts.push({
                name: String(proofNo).padStart(2, "0") + "-" + ledgerSafeFile((M.trim(row.item.title) || untitled) + "." + ext),
                blob: asset.blob
              });
            }
          });
        });
        return { blob: pdf.blob(), receipts: receipts };
      });
    });
  }

  window.STLLedgerPdf = { buildYear: ledgerBuildYear };

  window.STLExpenses = createLedger({
    kind: "expenses",
    table: "business_expenses",
    skipsTable: "business_expense_skips",
    title: "Expenses",
    blurb: "Business costs for the year. Recurring items can copy forward. Receipts stay with each expense.",
    empty: "No expenses in this year yet. Add software, ads, contractors, gear…",
    untitled: "Untitled expense",
    titleLabel: "What it is",
    exportLabel: "Export year PDF",
    panelClass: "expenses-panel"
  });

  window.STLIncome = createLedger({
    kind: "income",
    table: "business_incomes",
    skipsTable: "business_income_skips",
    title: "Income",
    blurb: "Money the LLC earned this year. Paid invoices can appear here automatically. Owner draws are separate.",
    empty: "No income in this year yet. Add client payments, App Store, or other revenue.",
    untitled: "Untitled income",
    titleLabel: "What it is",
    exportLabel: "Export year PDF",
    panelClass: "income-panel",
    backfillFromBilling: true,
    extraInsert: function () {
      return { source_invoice_number: "", source_payment_key: "" };
    }
  });
})();

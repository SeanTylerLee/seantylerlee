(function () {
  "use strict";

  var W = 1080;
  var H = 1920;
  var SAFE_TOP = 120;
  var SAFE_BOTTOM = 240;

  var root = null;
  var db = null;
  var userId = null;
  var busy = false;
  var library = [];
  var selectedId = "";
  var apps = {
    haulpath: { title: "Haul Path", imageUrl: "", endpoint: "/api/haulpath/ad" },
    pc4h: { title: "Pilot Car 4 Hire", imageUrl: "", endpoint: "/api/pc4h/ad" }
  };
  var presets = [
    { name: "Navy", bg: "#0f1a2e", text: "#ffffff", accent: "#3dc8ff" },
    { name: "Blue", bg: "#1574e6", text: "#ffffff", accent: "#ffffff" },
    { name: "White", bg: "#f4f7fb", text: "#0c1526", accent: "#1574e6" },
    { name: "Black", bg: "#111111", text: "#ffffff", accent: "#ffffff" }
  ];

  function el(name) {
    return root ? root.querySelector('[data-el="' + name + '"]') : null;
  }

  function esc(value) {
    return String(value || "").replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function showMsg(msg, ok) {
    var box = el("banner");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!msg && !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }

  function schemaHint(message) {
    if (/studio_advertisements|schema cache|does not exist/i.test(message || "")) {
      return "Run sql/055_advertisement_library.sql in Studio Supabase, then refresh.";
    }
    return message || "Could not load the library.";
  }

  function shell() {
    return (
      '<div class="ops-workspace ad-workspace">' +
        '<div class="ops-header">' +
          "<h1>Advertisement</h1>" +
          "<p>The image you run shows every time that app opens, until the person taps Clear.</p>" +
        "</div>" +
        '<p class="status" data-el="banner"></p>' +
        '<div class="ad-page">' +
          '<section class="ops-card ad-now">' +
            runningSlot("haulpath") +
            runningSlot("pc4h") +
          "</section>" +
          '<section class="ops-card">' +
            '<div class="ad-section-head">' +
              "<div>" +
                "<h2>Library</h2>" +
                "<p>Portrait, 1080 by 1920. Keep the words in the middle.</p>" +
              "</div>" +
              '<div class="ad-toolbar">' +
                '<button class="btn btn-ghost" type="button" data-el="upload-btn">Upload</button>' +
                '<input data-el="upload" type="file" accept="image/png,image/jpeg,image/webp" hidden />' +
                '<button class="btn btn-primary" type="button" data-el="toggle-maker">Make one</button>' +
              "</div>" +
            "</div>" +
            '<div class="ad-library" data-el="library"></div>' +
            '<div class="ad-picked" data-el="picked" hidden>' +
              '<span class="ad-picked-name" data-el="picked-name"></span>' +
              '<button class="btn btn-primary" type="button" data-el="run-haulpath">Run in Haul Path</button>' +
              '<button class="btn btn-primary" type="button" data-el="run-pc4h">Run in Pilot Car 4 Hire</button>' +
              '<button class="btn btn-ghost" type="button" data-el="remove-lib">Delete</button>' +
            "</div>" +
          "</section>" +
          '<section class="ops-card ad-maker-card" data-el="maker" hidden>' +
            '<div class="ad-section-head">' +
              "<div>" +
                "<h2>Make an advertisement</h2>" +
                "<p>The shaded bands are the notch and the Clear button. They are not saved.</p>" +
              "</div>" +
            "</div>" +
            '<div class="ad-maker">' +
              '<div class="ad-maker-form">' +
                makerField("name", "Name", "text") +
                makerField("kicker", "Small line", "text") +
                makerField("headline", "Headline", "text") +
                '<label for="ad-message">Message</label>' +
                '<textarea id="ad-message" data-el="message" rows="3" maxlength="180"></textarea>' +
                makerField("button", "Button label", "text") +
                '<div class="ad-presets" data-el="presets"></div>' +
                '<div class="ad-colors">' +
                  colorField("bg", "Background") +
                  colorField("ink", "Words") +
                  colorField("accent", "Button") +
                "</div>" +
                '<div class="ad-toolbar ad-save">' +
                  '<button class="btn btn-primary" type="button" data-el="save-made">Save to library</button>' +
                "</div>" +
              "</div>" +
              '<div class="ad-stage">' +
                '<canvas data-el="canvas" width="1080" height="1920"></canvas>' +
                '<div class="ad-safe ad-safe-top"></div>' +
                '<div class="ad-safe ad-safe-bottom"></div>' +
              "</div>" +
            "</div>" +
          "</section>" +
        "</div>" +
      "</div>"
    );
  }

  function runningSlot(id) {
    var app = apps[id];
    return (
      '<div class="ad-slot">' +
        '<div class="ad-phone" data-el="preview-' + id + '"></div>' +
        '<div class="ad-slot-copy">' +
          "<h2>" + esc(app.title) + "</h2>" +
          '<p data-el="status-' + id + '">Off</p>' +
          '<button class="btn btn-ghost" type="button" data-el="off-' + id + '" hidden>Turn off</button>' +
        "</div>" +
      "</div>"
    );
  }

  function makerField(name, label, type) {
    return (
      "<label for=\"ad-" + name + "\">" + esc(label) + "</label>" +
      '<input id="ad-' + name + '" data-el="' + name + '" type="' + type + '" maxlength="80" />'
    );
  }

  function colorField(name, label) {
    return (
      "<label>" + esc(label) +
        '<input data-el="color-' + name + '" type="color" value="#000000" />' +
      "</label>"
    );
  }

  function field(name) {
    var node = el(name);
    return node ? String(node.value || "") : "";
  }

  function setColor(name, value) {
    var node = el("color-" + name);
    if (node) node.value = value;
  }

  function paintRunning(id) {
    var box = el("preview-" + id);
    var app = apps[id];
    if (!box || !app) return;
    if (app.imageUrl) {
      box.innerHTML = '<img alt="" src="' + esc(app.imageUrl) + '" />';
    } else {
      box.innerHTML = '<span class="ad-off">Off</span>';
    }
    var status = el("status-" + id);
    if (status) {
      status.textContent = app.imageUrl ? "On" : "Off";
      status.classList.toggle("is-on", !!app.imageUrl);
    }
    var off = el("off-" + id);
    if (off) {
      off.hidden = !app.imageUrl;
      off.disabled = !app.imageUrl || busy;
    }
  }

  function runningLabels(url) {
    if (!url) return "";
    var names = [];
    if (apps.haulpath.imageUrl === url) names.push("Haul Path");
    if (apps.pc4h.imageUrl === url) names.push("Pilot Car 4 Hire");
    return names.join(" · ");
  }

  function paintLibrary() {
    var box = el("library");
    if (!box) return;
    if (!library.length) {
      box.innerHTML = '<p class="ad-empty">No advertisements yet.</p>';
    } else {
      box.innerHTML = library.map(function (row) {
        var where = runningLabels(row.image_url);
        if (where.indexOf("·") >= 0) where = "Both apps";
        return (
          '<button type="button" class="ad-lib-card' + (row.id === selectedId ? " is-on" : "") + '" data-id="' + esc(row.id) + '">' +
            '<span class="ad-thumb">' +
              '<img alt="" src="' + esc(row.image_url) + '" />' +
              (where ? '<span class="ad-pill">' + esc(where) + "</span>" : "") +
            "</span>" +
            "<strong>" + esc(row.name || "Advertisement") + "</strong>" +
          "</button>"
        );
      }).join("");
    }
    var picked = library.filter(function (row) { return row.id === selectedId; })[0];
    var bar = el("picked");
    if (bar) bar.hidden = !picked;
    var name = el("picked-name");
    if (name) name.textContent = picked ? (picked.name || "Advertisement") : "";
  }

  function selected() {
    return library.filter(function (row) { return row.id === selectedId; })[0] || null;
  }

  function isLight(hex) {
    var raw = String(hex || "").replace("#", "");
    if (raw.length !== 6) return false;
    var n = parseInt(raw, 16);
    if (isNaN(n)) return false;
    var r = (n >> 16) & 255;
    var g = (n >> 8) & 255;
    var b = n & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 > 170;
  }

  function wrap(ctx, text, maxWidth) {
    var words = String(text || "").trim().split(/\s+/).filter(Boolean);
    var lines = [];
    var line = "";
    words.forEach(function (word) {
      var test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines.slice(0, 6);
  }

  function draw(showGuides) {
    var canvas = el("canvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var bg = field("color-bg") || "#0f1a2e";
    var ink = field("color-ink") || "#ffffff";
    var accent = field("color-accent") || "#3dc8ff";
    var kicker = field("kicker").trim();
    var headline = field("headline").trim();
    var message = field("message").trim();
    var button = field("button").trim();
    if (showGuides) {
      if (!kicker) kicker = "SMALL LINE";
      if (!headline) headline = "Your headline";
      if (!message) message = "A short line about the offer.";
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    var maxW = W - 160;
    ctx.font = "700 34px system-ui, sans-serif";
    var kickerLines = kicker ? wrap(ctx, kicker.toUpperCase(), maxW).slice(0, 2) : [];
    ctx.font = "800 78px system-ui, sans-serif";
    var headLines = headline ? wrap(ctx, headline, maxW).slice(0, 4) : [];
    ctx.font = "500 36px system-ui, sans-serif";
    var bodyLines = message ? wrap(ctx, message, maxW).slice(0, 5) : [];
    var block = kickerLines.length * 48 + (kickerLines.length ? 28 : 0) +
      headLines.length * 92 + (headLines.length && bodyLines.length ? 24 : 0) +
      bodyLines.length * 50 + (button ? 120 : 0);
    var y = SAFE_TOP + Math.max(40, ((H - SAFE_TOP - SAFE_BOTTOM) - block) / 2);
    ctx.fillStyle = accent;
    ctx.font = "700 34px system-ui, sans-serif";
    kickerLines.forEach(function (line) {
      ctx.fillText(line, W / 2, y, maxW);
      y += 48;
    });
    if (kickerLines.length) y += 28;
    ctx.fillStyle = ink;
    ctx.font = "800 78px system-ui, sans-serif";
    headLines.forEach(function (line) {
      ctx.fillText(line, W / 2, y, maxW);
      y += 92;
    });
    if (headLines.length && bodyLines.length) y += 24;
    ctx.font = "500 36px system-ui, sans-serif";
    bodyLines.forEach(function (line) {
      ctx.fillText(line, W / 2, y, maxW);
      y += 50;
    });
    if (button) {
      y += 36;
      ctx.font = "700 34px system-ui, sans-serif";
      var labelW = Math.min(maxW, ctx.measureText(button).width + 88);
      var x = (W - labelW) / 2;
      roundRect(ctx, x, y, labelW, 84, 42);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.fillStyle = isLight(accent) ? "#0c1526" : "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(button, W / 2, y + 42, labelW - 48);
      ctx.textBaseline = "top";
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function ensureUser() {
    if (userId) return Promise.resolve(userId);
    if (!db || !db.auth || !db.auth.getUser) return Promise.reject(new Error("Not signed in."));
    return db.auth.getUser().then(function (res) {
      userId = res && res.data && res.data.user && res.data.user.id;
      if (!userId) throw new Error("Not signed in.");
      return userId;
    });
  }

  function storeFile(file, name, source) {
    return ensureUser().then(function () {
    var ext = "png";
    if (file && file.name) {
      ext = (String(file.name).split(".").pop() || "png").toLowerCase();
      if (["png", "jpg", "jpeg", "webp"].indexOf(ext) < 0) ext = "png";
    }
    if (file && file.type === "image/jpeg") ext = "jpg";
    if (file && file.type === "image/webp") ext = "webp";
    var path = userId + "/library-" + Date.now() + "." + ext;
    return db.storage.from("announcement-images").upload(path, file, {
      upsert: false,
      contentType: (file && file.type) || "image/png"
    }).then(function (up) {
      if (up && up.error) throw new Error(up.error.message || "Upload failed.");
      var pub = db.storage.from("announcement-images").getPublicUrl(path);
      var url = pub && pub.data && pub.data.publicUrl;
      if (!url) throw new Error("Could not get a public photo URL.");
      return db.from("studio_advertisements").insert({
        user_id: userId,
        name: name || "Advertisement",
        image_url: url,
        storage_path: path,
        source: source === "made" ? "made" : "upload"
      }).select("*").single().then(function (res) {
        if (res.error) {
          return db.storage.from("announcement-images").remove([path]).then(function () {
            throw new Error(schemaHint(res.error.message || "Could not save the advertisement."));
          });
        }
        return res.data;
      });
    });
    });
  }

  function loadRunning() {
    if (!window.STLLocalApi) {
      paintRunning("haulpath");
      paintRunning("pc4h");
      return Promise.resolve();
    }
    return Promise.all(Object.keys(apps).map(function (id) {
      return window.STLLocalApi.get(apps[id].endpoint).then(function (res) {
        if (!res || !res.ok) {
          throw new Error((res && res.data && res.data.error) || ("Could not load the " + apps[id].title + " advertisement."));
        }
        apps[id].imageUrl = (res.data && res.data.image_url) || "";
        paintRunning(id);
      });
    }));
  }

  function loadLibrary() {
    if (!db) return Promise.resolve();
    return db.from("studio_advertisements").select("*").order("created_at", { ascending: false }).then(function (res) {
      if (res.error) throw new Error(schemaHint(res.error.message));
      library = res.data || [];
      if (selectedId && !selected()) selectedId = "";
      paintLibrary();
    });
  }

  function setRunning(id, url) {
    if (!window.STLLocalApi) return Promise.reject(new Error("Studio cannot reach the apps yet."));
    return window.STLLocalApi.post(apps[id].endpoint, { image_url: url || "" }).then(function (res) {
      if (!res || !res.ok) {
        throw new Error((res && res.data && res.data.error) || (apps[id].title + " save failed."));
      }
      apps[id].imageUrl = (res.data && res.data.image_url) || "";
      paintRunning(id);
      paintLibrary();
    });
  }

  function withBusy(work) {
    if (busy) return;
    busy = true;
    paintRunning("haulpath");
    paintRunning("pc4h");
    work().then(function () {
      busy = false;
      paintRunning("haulpath");
      paintRunning("pc4h");
    }).catch(function (err) {
      busy = false;
      paintRunning("haulpath");
      paintRunning("pc4h");
      draw(true);
      showMsg((err && err.message) || "Something went wrong.", false);
    });
  }

  function uploadPicked(file) {
    if (!file) return;
    var name = String(file.name || "Advertisement").replace(/\.[^.]+$/, "") || "Advertisement";
    showMsg("Uploading…", true);
    withBusy(function () {
      return storeFile(file, name, "upload").then(function (row) {
        var input = el("upload");
        if (input) input.value = "";
        selectedId = row && row.id ? row.id : "";
        return loadLibrary().then(function () {
          showMsg("Added to the library", true);
          setTimeout(function () { showMsg(""); }, 1200);
        });
      });
    });
  }

  function saveMade() {
    var canvas = el("canvas");
    if (!canvas) return;
    var name = field("name").trim() || field("headline").trim() || "Advertisement";
    draw(false);
    showMsg("Saving…", true);
    withBusy(function () {
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (!blob) {
            reject(new Error("Could not make the image."));
            return;
          }
          storeFile(blob, name, "made").then(resolve, reject);
        }, "image/png");
      }).then(function (row) {
        selectedId = row && row.id ? row.id : "";
        draw(true);
        return loadLibrary().then(function () {
          showMsg("Saved to the library", true);
          setTimeout(function () { showMsg(""); }, 1200);
        });
      });
    });
  }

  function runSelected(id) {
    var row = selected();
    if (!row || !row.image_url) {
      showMsg("Select an advertisement first.", false);
      return;
    }
    showMsg("Running in " + apps[id].title + "…", true);
    withBusy(function () {
      return setRunning(id, row.image_url).then(function () {
        showMsg("Running in " + apps[id].title, true);
        setTimeout(function () { showMsg(""); }, 1200);
      });
    });
  }

  function turnOff(id) {
    showMsg("Turning off…", true);
    withBusy(function () {
      return setRunning(id, "").then(function () {
        showMsg(apps[id].title + " ad is off", true);
        setTimeout(function () { showMsg(""); }, 1200);
      });
    });
  }

  function deleteSelected() {
    var row = selected();
    if (!row) return;
    var using = [];
    if (apps.haulpath.imageUrl && apps.haulpath.imageUrl === row.image_url) using.push("Haul Path");
    if (apps.pc4h.imageUrl && apps.pc4h.imageUrl === row.image_url) using.push("Pilot Car 4 Hire");
    var ask = "Delete this advertisement from the library?";
    if (using.length) ask += " It will also turn off on " + using.join(" and ") + ".";
    if (!window.confirm(ask)) return;
    showMsg("Deleting…", true);
    withBusy(function () {
      var chain = Promise.resolve();
      if (apps.haulpath.imageUrl === row.image_url) chain = chain.then(function () { return setRunning("haulpath", ""); });
      if (apps.pc4h.imageUrl === row.image_url) chain = chain.then(function () { return setRunning("pc4h", ""); });
      return chain.then(function () {
        if (row.storage_path) {
          return db.storage.from("announcement-images").remove([row.storage_path]);
        }
      }).then(function () {
        return db.from("studio_advertisements").delete().eq("id", row.id);
      }).then(function (res) {
        if (res && res.error) throw new Error(res.error.message || "Could not delete it.");
        selectedId = "";
        return loadLibrary().then(function () {
          showMsg("Deleted", true);
          setTimeout(function () { showMsg(""); }, 1200);
        });
      });
    });
  }

  function bind() {
    var uploadBtn = el("upload-btn");
    var upload = el("upload");
    if (uploadBtn && upload) {
      uploadBtn.addEventListener("click", function () { upload.click(); });
      upload.addEventListener("change", function () {
        var file = upload.files && upload.files[0];
        uploadPicked(file);
      });
    }
    var grid = el("library");
    if (grid) {
      grid.addEventListener("click", function (event) {
        var node = event.target;
        while (node && node !== grid) {
          if (node.getAttribute && node.getAttribute("data-id")) {
            selectedId = node.getAttribute("data-id");
            paintLibrary();
            return;
          }
          node = node.parentNode;
        }
      });
    }
    var runHaul = el("run-haulpath");
    var runPc = el("run-pc4h");
    var remove = el("remove-lib");
    if (runHaul) runHaul.addEventListener("click", function () { runSelected("haulpath"); });
    if (runPc) runPc.addEventListener("click", function () { runSelected("pc4h"); });
    if (remove) remove.addEventListener("click", deleteSelected);
    var maker = el("maker");
    var toggle = el("toggle-maker");
    if (maker && toggle) {
      toggle.addEventListener("click", function () {
        maker.hidden = !maker.hidden;
        var open = !maker.hidden;
        toggle.textContent = open ? "Close" : "Make one";
        toggle.classList.toggle("btn-primary", !open);
        toggle.classList.toggle("btn-ghost", open);
        if (open) {
          draw(true);
          maker.scrollIntoView({ block: "nearest" });
        }
      });
    }
    ["haulpath", "pc4h"].forEach(function (id) {
      var off = el("off-" + id);
      if (off) off.addEventListener("click", function () { turnOff(id); });
    });
    ["name", "kicker", "headline", "message", "button", "color-bg", "color-ink", "color-accent"].forEach(function (name) {
      var node = el(name);
      if (node) node.addEventListener("input", function () { draw(true); });
    });
    var presetBox = el("presets");
    if (presetBox) {
      presetBox.innerHTML = presets.map(function (preset, index) {
        return '<button class="btn btn-ghost" type="button" data-preset="' + index + '">' + esc(preset.name) + "</button>";
      }).join("");
      presetBox.addEventListener("click", function (event) {
        var node = event.target;
        if (!node || !node.getAttribute) return;
        var index = node.getAttribute("data-preset");
        if (index == null) return;
        var preset = presets[Number(index)];
        if (!preset) return;
        setColor("bg", preset.bg);
        setColor("ink", preset.text);
        setColor("accent", preset.accent);
        draw(true);
      });
    }
    var save = el("save-made");
    if (save) save.addEventListener("click", saveMade);
  }

  window.STLHaulPathAd = {
    mount: function (host, client) {
      root = host;
      db = client;
      userId = null;
      busy = false;
      library = [];
      selectedId = "";
      if (db && db.auth && db.auth.getUser) {
        db.auth.getUser().then(function (res) {
          userId = res && res.data && res.data.user && res.data.user.id;
        });
      }
      root.innerHTML = shell();
      setColor("bg", "#0f1a2e");
      setColor("ink", "#ffffff");
      setColor("accent", "#3dc8ff");
      bind();
      draw(true);
      paintRunning("haulpath");
      paintRunning("pc4h");
      paintLibrary();
      loadRunning().catch(function (err) {
        showMsg((err && err.message) || "Could not load the advertisements.", false);
      });
      loadLibrary().catch(function (err) {
        showMsg((err && err.message) || "Could not load the library.", false);
      });
    },
    shown: function () {},
    saveAll: function () {},
    isDirty: function () { return false; },
    usesGlobalSave: function () { return false; },
    unmount: function () { root = null; }
  };
})();

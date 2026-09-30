(function () {
  "use strict";

  var SIZES = [
    { id: "14px", label: "S" },
    { id: "16px", label: "M" },
    { id: "20px", label: "L" }
  ];
  var COLORS = [
    { id: "#e64747", label: "Red", swatch: "red" },
    { id: "#1a70eb", label: "Blue", swatch: "blue" },
    { id: "#1d1d1f", label: "Black", swatch: "ink" }
  ];

  var root = null;
  var db = null;
  var noteId = null;
  var saving = false;
  var dirty = false;
  var savedRange = null;

  function el(name) {
    return root ? root.querySelector('[data-el="' + name + '"]') : null;
  }

  function showMsg(msg, ok) {
    var box = el("msg");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-on", !!msg);
    box.classList.toggle("is-ok", !!ok);
    box.classList.toggle("is-bad", !!msg && !ok);
  }

  function missingTable(err) {
    var msg = (err && err.message) || "";
    return /studio_notes/i.test(msg) && /does not exist|schema cache|not find/i.test(msg);
  }

  function editorEmpty() {
    var editor = el("body");
    if (!editor) return true;
    return !String(editor.innerText || "").replace(/\u200B/g, "").replace(/\s+/g, " ").trim();
  }

  function syncPlaceholder() {
    var ph = el("placeholder");
    if (!ph) return;
    ph.classList.toggle("is-hidden", !editorEmpty());
  }

  function syncSaveButton() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.disabled = !dirty || saving;
    btn.textContent = saving ? "Saving…" : "Save";
  }

  function hideSaveButton() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }

  function markDirty() {
    dirty = true;
    syncSaveButton();
    showMsg("Unsaved changes", true);
  }

  function clearDirty() {
    dirty = false;
    syncSaveButton();
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function looksLikeHtml(s) {
    return /<[a-z][\s\S]*>/i.test(String(s || ""));
  }

  function allowedTag(tag) {
    return /^(B|STRONG|I|EM|U|SPAN|BR|DIV|P|FONT)$/.test(tag);
  }

  function cleanStyle(value) {
    var out = [];
    String(value || "").split(";").forEach(function (part) {
      var i = part.indexOf(":");
      if (i < 0) return;
      var k = part.slice(0, i).trim().toLowerCase();
      var v = part.slice(i + 1).trim();
      if (!v || /expression|url\s*\(|javascript/i.test(v)) return;
      if (k === "color") {
        if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ||
            /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(v)) {
          out.push("color:" + v);
        }
      } else if (k === "font-size") {
        if (/^\d+(\.\d+)?px$/i.test(v)) out.push("font-size:" + v.toLowerCase());
      } else if (k === "font-weight") {
        if (/^(bold|normal|400|600|700)$/i.test(v)) out.push("font-weight:" + v.toLowerCase());
      }
    });
    return out.join(";");
  }

  function sizeFromFontAttr(n) {
    var v = parseInt(n, 10);
    if (v <= 2) return "14px";
    if (v >= 5) return "20px";
    return "16px";
  }

  function sanitizeNode(node) {
    var kids = Array.prototype.slice.call(node.childNodes);
    kids.forEach(function (child) {
      if (child.nodeType === 8) {
        child.parentNode.removeChild(child);
        return;
      }
      if (child.nodeType === 3) return;
      if (child.nodeType !== 1) {
        child.parentNode.removeChild(child);
        return;
      }
      var tag = child.tagName;
      if (tag === "FONT") {
        var span = document.createElement("span");
        var color = child.getAttribute("color");
        var size = child.getAttribute("size");
        if (color) span.style.color = color;
        if (size) span.style.fontSize = sizeFromFontAttr(size);
        while (child.firstChild) span.appendChild(child.firstChild);
        node.replaceChild(span, child);
        sanitizeNode(span);
        return;
      }
      if (!allowedTag(tag)) {
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        node.removeChild(child);
        return;
      }
      var attrs = Array.prototype.slice.call(child.attributes || []);
      attrs.forEach(function (a) {
        if (tag === "SPAN" && a.name === "style") {
          var cleaned = cleanStyle(a.value);
          if (cleaned) child.setAttribute("style", cleaned);
          else child.removeAttribute("style");
        } else {
          child.removeAttribute(a.name);
        }
      });
      sanitizeNode(child);
    });
  }

  function sanitizeHtml(html) {
    var wrap = document.createElement("div");
    wrap.innerHTML = String(html || "");
    sanitizeNode(wrap);
    return wrap.innerHTML;
  }

  function toEditorHtml(body) {
    var s = String(body || "");
    if (!s) return "";
    if (looksLikeHtml(s)) return sanitizeHtml(s);
    return esc(s).replace(/\n/g, "<br>");
  }

  function fromEditor() {
    var editor = el("body");
    if (!editor) return "";
    if (editorEmpty()) return "";
    return sanitizeHtml(editor.innerHTML);
  }

  function rememberRange() {
    var editor = el("body");
    if (!editor) return;
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    var node = range.commonAncestorContainer;
    if (node === editor || editor.contains(node)) savedRange = range.cloneRange();
  }

  function restoreRange() {
    var editor = el("body");
    if (!editor) return;
    editor.focus();
    var sel = window.getSelection();
    if (!sel) return;
    if (savedRange) {
      try {
        sel.removeAllRanges();
        sel.addRange(savedRange);
        return;
      } catch (err) {}
    }
  }

  function rangeInEditor() {
    var editor = el("body");
    var sel = window.getSelection();
    if (!editor || !sel || !sel.rangeCount) return null;
    var range = sel.getRangeAt(0);
    var node = range.commonAncestorContainer;
    if (node !== editor && !editor.contains(node)) return null;
    return { sel: sel, range: range };
  }

  function ensureLineSelection() {
    restoreRange();
    var pack = rangeInEditor();
    var editor = el("body");
    if (!editor) return;
    if (!pack) {
      editor.focus();
      pack = rangeInEditor();
    }
    if (!pack) return;
    if (!pack.range.collapsed) return;
    if (typeof pack.sel.modify === "function") {
      pack.sel.modify("move", "backward", "lineboundary");
      pack.sel.modify("extend", "forward", "lineboundary");
    }
    rememberRange();
  }

  function replaceExecSize(px) {
    var editor = el("body");
    if (!editor) return;
    var fonts = editor.querySelectorAll("font[size='7']");
    for (var i = 0; i < fonts.length; i++) {
      var span = document.createElement("span");
      span.style.fontSize = px;
      var color = fonts[i].getAttribute("color") || fonts[i].style.color;
      if (color) span.style.color = color;
      while (fonts[i].firstChild) span.appendChild(fonts[i].firstChild);
      fonts[i].parentNode.replaceChild(span, fonts[i]);
    }
    var spans = editor.querySelectorAll("span");
    for (var j = 0; j < spans.length; j++) {
      var fs = String(spans[j].style.fontSize || "");
      if (fs === "xxx-large" || fs === "xx-large" || fs === "-webkit-xxx-large" || fs === "x-large") {
        spans[j].style.fontSize = px;
      }
    }
  }

  function runCommand(fn) {
    var editor = el("body");
    if (!editor) return;
    ensureLineSelection();
    try { document.execCommand("styleWithCSS", false, true); } catch (err) {}
    fn();
    rememberRange();
    syncPlaceholder();
    markDirty();
    syncToolbar();
  }

  function applyBold() {
    runCommand(function () { document.execCommand("bold", false, null); });
  }

  function applyColor(hex) {
    runCommand(function () { document.execCommand("foreColor", false, hex); });
  }

  function applySize(px) {
    runCommand(function () {
      document.execCommand("fontSize", false, "7");
      replaceExecSize(px);
    });
  }

  function rgbToHex(rgb) {
    var m = String(rgb || "").match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) {
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(rgb || "").trim())) return String(rgb).trim().toLowerCase();
      return "";
    }
    function hex(n) {
      var h = Number(n).toString(16);
      return h.length === 1 ? "0" + h : h;
    }
    return ("#" + hex(m[1]) + hex(m[2]) + hex(m[3])).toLowerCase();
  }

  function currentSizePx() {
    var pack = rangeInEditor();
    var node = pack ? pack.range.startContainer : null;
    if (node && node.nodeType === 3) node = node.parentNode;
    while (node && node !== el("body")) {
      if (node.nodeType === 1 && node.style && node.style.fontSize) return node.style.fontSize;
      node = node.parentNode;
    }
    return "16px";
  }

  function syncToolbar() {
    if (!root) return;
    var boldBtn = root.querySelector('[data-cmd="bold"]');
    var isBold = false;
    try { isBold = document.queryCommandState("bold"); } catch (err) {}
    if (boldBtn) boldBtn.classList.toggle("is-on", !!isBold);
    var color = "";
    try { color = rgbToHex(document.queryCommandValue("foreColor")); } catch (err2) {}
    var swatches = root.querySelectorAll("[data-color]");
    for (var i = 0; i < swatches.length; i++) {
      var hex = String(swatches[i].getAttribute("data-color") || "").toLowerCase();
      swatches[i].classList.toggle("is-on", !!color && hex === color);
    }
    var size = currentSizePx();
    var sizeBtns = root.querySelectorAll("[data-size]");
    for (var s = 0; s < sizeBtns.length; s++) {
      sizeBtns[s].classList.toggle("is-on", sizeBtns[s].getAttribute("data-size") === size);
    }
  }

  function load() {
    showMsg("Loading…", true);
    return db.from("studio_notes").select("id, body, updated_at").limit(1).maybeSingle()
      .then(function (res) {
        if (res.error) {
          showMsg(missingTable(res.error)
            ? "Run sql/002_notes.sql in Supabase, then refresh."
            : res.error.message, false);
          syncSaveButton();
          return;
        }
        var editor = el("body");
        if (res.data) {
          noteId = res.data.id;
          if (editor) editor.innerHTML = toEditorHtml(res.data.body || "");
        } else {
          noteId = null;
          if (editor) editor.innerHTML = "";
        }
        clearDirty();
        syncPlaceholder();
        showMsg(res.data ? "" : "Empty notepad — type, then Save.", true);
        setTimeout(function () {
          if (!dirty) showMsg("");
        }, 1200);
      });
  }

  function saveAll() {
    if (saving || !dirty) return;
    var body = fromEditor();
    saving = true;
    syncSaveButton();
    showMsg("Saving…", true);

    var req = noteId
      ? db.from("studio_notes").update({ body: body }).eq("id", noteId).select("id").single()
      : db.from("studio_notes").insert({ body: body }).select("id").single();

    req.then(function (res) {
      saving = false;
      if (res.error) {
        dirty = true;
        showMsg(missingTable(res.error)
          ? "Run sql/002_notes.sql in Supabase, then refresh."
          : res.error.message, false);
        syncSaveButton();
        return;
      }
      noteId = res.data.id;
      clearDirty();
      showMsg("Saved", true);
      setTimeout(function () {
        if (!dirty && !saving) showMsg("");
      }, 1000);
    }).catch(function (err) {
      saving = false;
      dirty = true;
      showMsg((err && err.message) || "Save failed.", false);
      syncSaveButton();
    });
  }

  function toolsHtml() {
    var colorBtns = COLORS.map(function (c) {
      return '<button class="notes-swatch notes-swatch-' + c.swatch + '" type="button" data-color="' +
        c.id + '" title="' + c.label + '" aria-label="' + c.label + '"></button>';
    }).join("");
    var sizeBtns = SIZES.map(function (s) {
      return '<button class="notes-size" type="button" data-size="' + s.id + '" title="Size ' +
        s.label + '">' + s.label + "</button>";
    }).join("");
    return (
      '<div class="notes-tools" data-el="tools">' +
        '<button class="notes-tool notes-tool-bold" type="button" data-cmd="bold" title="Bold">B</button>' +
        '<span class="notes-tools-sep"></span>' +
        colorBtns +
        '<span class="notes-tools-sep"></span>' +
        sizeBtns +
      "</div>"
    );
  }

  function html() {
    return (
      '<div class="notes-workspace">' +
        '<div class="notes-bar">' +
          "<h1>Notes</h1>" +
          toolsHtml() +
          '<p class="status" data-el="msg"></p>' +
        "</div>" +
        '<div class="notes-editor-wrap">' +
          '<p class="notes-placeholder" data-el="placeholder">Write whatever you want… then click Save.</p>' +
          '<div class="notes-editor" data-el="body" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true"></div>' +
        "</div>" +
      "</div>"
    );
  }

  function bind() {
    var editor = el("body");
    var tools = el("tools");
    if (!editor || !tools) return;

    editor.addEventListener("input", function () {
      rememberRange();
      syncPlaceholder();
      markDirty();
    });
    editor.addEventListener("keyup", function () {
      rememberRange();
      syncToolbar();
    });
    editor.addEventListener("mouseup", function () {
      rememberRange();
      syncToolbar();
    });
    editor.addEventListener("focus", function () {
      rememberRange();
      syncToolbar();
    });
    document.addEventListener("selectionchange", onSelectionChange);

    editor.addEventListener("paste", function (ev) {
      ev.preventDefault();
      var text = "";
      if (ev.clipboardData) text = ev.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, text || "");
      rememberRange();
      syncPlaceholder();
      markDirty();
    });

    editor.addEventListener("keydown", function (ev) {
      var key = String(ev.key || "").toLowerCase();
      if ((ev.metaKey || ev.ctrlKey) && key === "b") {
        ev.preventDefault();
        applyBold();
      }
    });

    tools.addEventListener("mousedown", function (ev) {
      if (ev.target === tools) return;
      ev.preventDefault();
      restoreRange();
    });

    tools.addEventListener("click", function (ev) {
      var btn = ev.target;
      while (btn && btn !== tools && String(btn.tagName || "").toLowerCase() !== "button") {
        btn = btn.parentNode;
      }
      if (!btn || btn === tools) return;
      if (btn.getAttribute("data-cmd") === "bold") applyBold();
      else if (btn.getAttribute("data-color")) applyColor(btn.getAttribute("data-color"));
      else if (btn.getAttribute("data-size")) applySize(btn.getAttribute("data-size"));
    });
  }

  function onSelectionChange() {
    if (!root) return;
    rememberRange();
    syncToolbar();
  }

  window.STLNotes = {
    mount: function (panel, client) {
      db = client;
      root = panel;
      noteId = null;
      dirty = false;
      saving = false;
      savedRange = null;
      panel.classList.add("notes-wide");
      panel.innerHTML = html();
      bind();
      syncSaveButton();
      load();
      setTimeout(function () {
        if (el("body")) el("body").focus();
      }, 40);
    },
    unmount: function (panel) {
      document.removeEventListener("selectionchange", onSelectionChange);
      hideSaveButton();
      if (panel) panel.classList.remove("notes-wide");
      root = null;
      savedRange = null;
    },
    saveAll: saveAll,
    isDirty: function () { return dirty; }
  };
})();

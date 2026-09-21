(function () {
  "use strict";

  var root = null;
  var hideTimer = null;
  var lastBusy = false;
  var observer = null;

  var BUSY = /loading|saving|sending|upload|building|publish|deleting|zipping|collecting|writing restore|signing/i;
  var SKIP = /unsaved changes/i;

  function el() {
    if (root && document.body.contains(root)) return root;
    root = document.getElementById("studio-hud");
    if (root) return root;
    root = document.createElement("div");
    root.id = "studio-hud";
    root.className = "studio-hud";
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    root.innerHTML =
      '<div class="studio-hud-card">' +
        '<div class="studio-hud-spin" data-kind="spin"></div>' +
        '<svg class="studio-hud-mark studio-hud-ok" data-kind="ok" viewBox="0 0 24 24" aria-hidden="true">' +
          '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l5 5 9-11"/>' +
        "</svg>" +
        '<svg class="studio-hud-mark studio-hud-bad" data-kind="bad" viewBox="0 0 24 24" aria-hidden="true">' +
          '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M7 7l10 10M17 7L7 17"/>' +
        "</svg>" +
      "</div>";
    document.body.appendChild(root);
    return root;
  }

  function setMode(mode) {
    var node = el();
    clearTimeout(hideTimer);
    node.hidden = false;
    node.classList.remove("is-spin", "is-ok", "is-bad");
    node.classList.add("is-" + mode);
    node.setAttribute("aria-hidden", "false");
    if (mode === "ok" || mode === "bad") {
      hideTimer = setTimeout(hide, mode === "bad" ? 1200 : 900);
    }
  }

  function hide() {
    var node = el();
    node.hidden = true;
    node.classList.remove("is-spin", "is-ok", "is-bad");
    node.setAttribute("aria-hidden", "true");
  }

  function readState() {
    var busy = false;
    var good = false;
    var fail = false;
    var nodes = document.querySelectorAll(".status.is-on");
    var i;
    for (i = 0; i < nodes.length; i += 1) {
      var text = String(nodes[i].textContent || "").trim();
      if (!text) continue;
      if (nodes[i].classList.contains("is-bad")) fail = true;
      else if (BUSY.test(text)) busy = true;
      else if (SKIP.test(text)) continue;
      else if (nodes[i].classList.contains("is-ok")) good = true;
    }
    var save = document.getElementById("global-save");
    if (save && !save.classList.contains("hidden") && BUSY.test(save.textContent || "")) busy = true;
    if (fail) {
      lastBusy = false;
      setMode("bad");
      return;
    }
    if (busy) {
      lastBusy = true;
      setMode("spin");
      return;
    }
    if (good) {
      lastBusy = false;
      setMode("ok");
      return;
    }
    if (lastBusy) {
      lastBusy = false;
      hide();
    }
  }

  function watch() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(function () { readState(); });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"]
    });
    readState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watch);
  } else {
    watch();
  }

  window.STLHud = {
    spin: function () { lastBusy = true; setMode("spin"); },
    ok: function () { lastBusy = false; setMode("ok"); },
    bad: function () { lastBusy = false; setMode("bad"); }
  };
})();

(function () {
  "use strict";

  var STORAGE_KEY = "stl-admin-tool-v1";
  var titleEl = document.getElementById("admin-tool-title");
  var tabs = document.querySelectorAll("[data-tool-tab]");

  function readHash() {
    var h = (location.hash || "").replace(/^#/, "").toLowerCase();
    if (h === "contract" || h === "invoice") return h;
    return "";
  }

  function readStored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v === "contract" || v === "invoice") return v;
    } catch (e) {}
    return "";
  }

  function current() {
    return readHash() || readStored() || "invoice";
  }

  function show(tool) {
    if (tool !== "contract" && tool !== "invoice") tool = "invoice";

    document.documentElement.setAttribute("data-admin-tool", tool);

    Array.prototype.forEach.call(document.querySelectorAll("[data-tool]"), function (el) {
      var on = el.getAttribute("data-tool") === tool;
      if (on) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-actions]"), function (el) {
      var on = el.getAttribute("data-actions") === tool;
      if (on) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    });

    Array.prototype.forEach.call(tabs, function (btn) {
      var on = btn.getAttribute("data-tool-tab") === tool;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });

    if (titleEl) {
      titleEl.textContent = tool === "contract" ? "Development contract" : "Invoice";
    }
    document.title = (tool === "contract" ? "Contract" : "Invoice") + " · Admin · STL Apps LLC";

    try {
      localStorage.setItem(STORAGE_KEY, tool);
    } catch (e) {}

    if (readHash() !== tool) {
      if (history.replaceState) {
        history.replaceState(null, "", "#" + tool);
      } else {
        location.hash = tool;
      }
    }
  }

  Array.prototype.forEach.call(tabs, function (btn) {
    btn.addEventListener("click", function () {
      show(btn.getAttribute("data-tool-tab"));
    });
  });

  window.addEventListener("hashchange", function () {
    var h = readHash();
    if (h) show(h);
  });

  show(current());
})();

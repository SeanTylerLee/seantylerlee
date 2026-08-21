(function () {
  "use strict";

  var STORAGE_KEY = "stl-admin-tool-v1";
  var TOOLS = {
    invoice: { title: "Invoice", doc: "Invoice" },
    contract: { title: "Development contract", doc: "Contract" },
    receipt: { title: "Receipt", doc: "Receipt" },
    reminder: { title: "Payment reminder", doc: "Reminder" },
    quote: { title: "Quote", doc: "Quote" }
  };

  var titleEl = document.getElementById("admin-tool-title");
  var tabs = document.querySelectorAll("[data-tool-tab]");

  function isTool(v) {
    return !!(v && TOOLS[v]);
  }

  function readHash() {
    var h = (location.hash || "").replace(/^#/, "").toLowerCase();
    return isTool(h) ? h : "";
  }

  function readStored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (isTool(v)) return v;
    } catch (e) {}
    return "";
  }

  function current() {
    return readHash() || readStored() || "quote";
  }

  function show(tool) {
    if (!isTool(tool)) tool = "invoice";
    var meta = TOOLS[tool];

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

    if (titleEl) titleEl.textContent = meta.title;
    document.title = meta.doc + " · Admin · STL Apps LLC";

    try {
      localStorage.setItem(STORAGE_KEY, tool);
    } catch (e) {}

    if (readHash() !== tool) {
      if (history.replaceState) history.replaceState(null, "", "#" + tool);
      else location.hash = tool;
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

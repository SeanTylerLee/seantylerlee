(function () {
  "use strict";

  var root = null;

  function hideSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }

  function shell() {
    return (
      '<div class="ops-workspace pc4h-admin">' +
        '<div class="ops-header">' +
          "<h1>PC4H Admin</h1>" +
          "<p>Pilot Car 4 Hire admin tools will live here.</p>" +
        "</div>" +
        '<div class="ops-body pc4h-admin-body">' +
          '<div class="ops-empty">' +
            "<p>Nothing here yet. This page is ready for Pilot Car 4 Hire admin tools.</p>" +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  window.STLPc4hAdmin = {
    mount: function (host) {
      root = host;
      var panel = host && host.closest ? host.closest(".panel") : null;
      if (panel) panel.classList.add("ops-wide");
      root.innerHTML = shell();
      hideSave();
    },
    unmount: function () {
      var panel = root && root.closest ? root.closest(".panel") : null;
      if (panel) panel.classList.remove("ops-wide");
      root = null;
    }
  };
})();

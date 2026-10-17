(function () {
  "use strict";

  var root = null;

  function shell() {
    return (
      '<div class="ops-workspace image-assets-workspace">' +
        '<div class="ops-header">' +
          "<h1>Image Assets</h1>" +
          '<p class="sub">Screenshots, icons, and store art will live here.</p>' +
        "</div>" +
      "</div>"
    );
  }

  window.STLImageAssets = {
    mount: function (el) {
      root = el;
      el.classList.add("ops-wide");
      el.innerHTML = shell();
    },
    shown: function () {}
  };
})();

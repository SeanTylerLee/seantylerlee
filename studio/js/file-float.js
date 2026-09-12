(function () {
  "use strict";

  var panel = null;
  var dragging = false;
  var offsetX = 0;
  var offsetY = 0;

  function isImageFile(name) {
    return /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(String(name || ""));
  }

  function isPdfFile(name) {
    return /\.pdf$/i.test(String(name || ""));
  }

  function ensurePanel() {
    panel = document.getElementById("file-float");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "file-float";
    panel.className = "file-float hidden";
    panel.innerHTML =
      '<div class="file-float-head" data-drag>' +
        "<strong data-title>File</strong>" +
        '<span class="meta" data-meta></span>' +
        '<button type="button" class="close" data-close aria-label="Close">×</button>' +
      "</div>" +
      '<div class="file-float-body" data-body></div>' +
      '<div class="file-float-foot">' +
        '<span data-hint>Drag the header to move. Stays open while you work.</span>' +
        '<a class="btn btn-ghost" data-external href="#" target="_blank" rel="noopener">Open in tab</a>' +
      "</div>";
    document.body.appendChild(panel);

    panel.querySelector("[data-close]").onclick = hide;
    var head = panel.querySelector("[data-drag]");
    head.addEventListener("mousedown", function (event) {
      if (event.target.closest("[data-close]")) return;
      dragging = true;
      var rect = panel.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      event.preventDefault();
    });
    window.addEventListener("mousemove", function (event) {
      if (!dragging || !panel) return;
      var x = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, event.clientX - offsetX));
      var y = Math.max(8, Math.min(window.innerHeight - 48, event.clientY - offsetY));
      panel.style.left = x + "px";
      panel.style.top = y + "px";
      panel.style.right = "auto";
    });
    window.addEventListener("mouseup", function () { dragging = false; });
    return panel;
  }

  function hide() {
    if (!panel) return;
    panel.classList.add("hidden");
    var body = panel.querySelector("[data-body]");
    if (body) body.innerHTML = "";
  }

  function show(opts) {
    opts = opts || {};
    ensurePanel();
    if (!panel.style.left) {
      panel.style.left = Math.max(24, Math.round((window.innerWidth - 720) / 2)) + "px";
      panel.style.top = "72px";
    }

    var title = opts.title || "File";
    var fileName = opts.fileName || opts.name || "";
    var url = opts.url || "";

    panel.querySelector("[data-title]").textContent = title;
    panel.querySelector("[data-meta]").textContent = fileName;
    panel.querySelector("[data-external]").href = url || "#";

    var body = panel.querySelector("[data-body]");
    body.innerHTML = "";

    if (!url) {
      body.innerHTML = '<div class="file-float-fallback"><p>No file to show.</p></div>';
      panel.classList.remove("hidden");
      return;
    }

    if (isImageFile(fileName) || isImageFile(url)) {
      var img = document.createElement("img");
      img.className = "file-float-img";
      img.src = url;
      img.alt = title;
      body.appendChild(img);
    } else if (isPdfFile(fileName) || isPdfFile(url) || !/\.[a-z0-9]+($|\?)/i.test(fileName || url)) {
      var frame = document.createElement("iframe");
      frame.className = "file-float-frame";
      frame.src = url;
      frame.title = title;
      body.appendChild(frame);
    } else {
      var wrap = document.createElement("div");
      wrap.className = "file-float-fallback";
      wrap.innerHTML = "<p>Preview isn’t available for this file type.</p>";
      var link = document.createElement("a");
      link.className = "btn btn-primary";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Open file";
      wrap.appendChild(link);
      body.appendChild(wrap);
    }

    panel.classList.remove("hidden");
  }

  window.STLFileFloat = {
    show: show,
    hide: hide,
    open: show,
    isOpen: function () {
      return !!(panel && !panel.classList.contains("hidden"));
    }
  };
})();

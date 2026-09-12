(function () {
  "use strict";

  var MAX_EDGE = 1600;
  var TARGET_BYTES = 350 * 1024;
  var SKIP_BYTES = 180 * 1024;
  var QUALITIES = [0.72, 0.62, 0.52];

  function isPdf(file) {
    return /pdf/i.test(file.type || "") || /\.pdf$/i.test(file.name || "");
  }

  function isImage(file) {
    if (/^image\//i.test(file.type || "")) return true;
    return /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(file.name || "");
  }

  function loadImage(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file).catch(function () {
        return loadImageTag(file);
      });
    }
    return loadImageTag(file);
  }

  function loadImageTag(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read image"));
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        resolve(blob);
      }, type, quality);
    });
  }

  function encodeJpeg(canvas) {
    var i = 0;
    function next() {
      return canvasToBlob(canvas, "image/jpeg", QUALITIES[i] || 0.5).then(function (blob) {
        if (!blob) return null;
        if (blob.size > TARGET_BYTES && i < QUALITIES.length - 1) {
          i += 1;
          return next();
        }
        return blob;
      });
    }
    return next();
  }

  function compress(file) {
    if (!file) return Promise.resolve(file);
    if (isPdf(file) || !isImage(file)) return Promise.resolve(file);

    return loadImage(file).then(function (img) {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      if (!w || !h) return file;
      var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      var tw = Math.max(1, Math.round(w * scale));
      var th = Math.max(1, Math.round(h * scale));
      if (scale === 1 && file.size <= SKIP_BYTES && /jpe?g/i.test(file.type || file.name || "")) {
        return file;
      }
      var canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, tw, th);
      ctx.drawImage(img, 0, 0, tw, th);
      if (img.close) try { img.close(); } catch (e) {}
      return encodeJpeg(canvas).then(function (blob) {
        if (!blob) return file;
        if (blob.size >= file.size && /jpe?g/i.test(file.type || "") && scale === 1) return file;
        var base = String(file.name || "proof").replace(/\.[^.]+$/, "");
        return new File([blob], base + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
      });
    }).catch(function () {
      return file;
    });
  }

  window.STLImageCompress = {
    file: compress
  };
})();

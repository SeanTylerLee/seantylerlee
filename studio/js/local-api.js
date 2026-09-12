(function () {
  "use strict";

  var MSG =
    "Bank and Analytics need this Mac’s studio server. On this computer open http://127.0.0.1:5173 (or the Cloudflare tunnel link) while python3 server.py is running. seantylerlee.com/studio cannot show Bank or Analytics.";

  function available() {
    var host = String(location.hostname || "");
    return host === "127.0.0.1" || host === "localhost" || /\.trycloudflare\.com$/i.test(host);
  }

  function get(path) {
    if (!available()) {
      return Promise.reject(new Error(MSG));
    }
    return fetch(path).then(function (r) {
      return r.text().then(function (text) {
        var data = {};
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (err) {
            throw new Error("Studio server did not answer. On this Mac run: python3 server.py");
          }
        }
        return { ok: r.ok, data: data, status: r.status };
      });
    });
  }

  window.STLLocalApi = {
    available: available,
    message: MSG,
    get: get
  };
})();

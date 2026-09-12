(function () {
  "use strict";

  var client = null;

  function isLocal() {
    var host = String(location.hostname || "");
    return host === "127.0.0.1" || host === "localhost" || /\.trycloudflare\.com$/i.test(host);
  }

  function parseResponse(r) {
    return r.text().then(function (text) {
      var data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (err) {
          if (r.status === 404) {
            throw new Error("Bank and Analytics are not turned on in the cloud yet. Run sql/017_studio_secrets.sql, open this Mac studio once, then deploy the studio-proxy function.");
          }
          throw new Error("Studio server did not answer with data.");
        }
      }
      return { ok: r.ok, data: data, status: r.status };
    });
  }

  function localGet(path) {
    return fetch(path).then(parseResponse);
  }

  function cloudGet(path) {
    if (!client) return Promise.reject(new Error("Sign in required."));
    var cfg = window.STL_STUDIO || {};
    var base = String(cfg.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/studio-proxy";
    var clean = String(path || "").replace(/^\/api/, "");
    if (clean.charAt(0) !== "/") clean = "/" + clean;
    return client.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) throw new Error("Sign in required.");
      return fetch(base + clean, {
        headers: {
          Authorization: "Bearer " + session.access_token,
          apikey: cfg.supabaseKey || "",
          Accept: "application/json"
        }
      }).then(parseResponse);
    });
  }

  function get(path) {
    if (isLocal()) return localGet(path);
    return cloudGet(path);
  }

  function syncSecretsFromMac() {
    if (!isLocal() || !client) return Promise.resolve();
    return localGet("/api/export-secrets").then(function (res) {
      if (!res.ok || !res.data) return;
      var d = res.data;
      if (!d.mercury_token && !d.asc_private_key && !d.play_service_account_json) return;
      return client.auth.getUser().then(function (auth) {
        var user = auth.data && auth.data.user;
        if (!user) return;
        return client.from("studio_secrets").upsert({
          user_id: user.id,
          mercury_token: d.mercury_token || "",
          asc_issuer_id: d.asc_issuer_id || "",
          asc_key_id: d.asc_key_id || "",
          asc_private_key: d.asc_private_key || "",
          play_service_account_json: d.play_service_account_json || ""
        }, { onConflict: "user_id" });
      });
    }).catch(function () {});
  }

  window.STLLocalApi = {
    init: function (c) {
      client = c || null;
    },
    isLocal: isLocal,
    available: function () {
      return isLocal() || !!(client && window.STL_STUDIO && window.STL_STUDIO.supabaseUrl);
    },
    message: "Bank and Analytics need keys saved in your studio account. Open this studio on your Mac once while signed in, after running sql/017_studio_secrets.sql.",
    get: get,
    syncSecretsFromMac: syncSecretsFromMac
  };
})();

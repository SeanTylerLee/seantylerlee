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

  function localPost(path, body) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body || {})
    }).then(parseResponse);
  }

  function cloudFetch(path, options) {
    if (!client) return Promise.reject(new Error("Sign in required."));
    var cfg = window.STL_STUDIO || {};
    var base = String(cfg.supabaseUrl || "").replace(/\/$/, "") + "/functions/v1/studio-proxy";
    var clean = String(path || "").replace(/^\/api/, "");
    if (clean.charAt(0) !== "/") clean = "/" + clean;
    return client.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) throw new Error("Sign in required.");
      var headers = Object.assign({
        Authorization: "Bearer " + session.access_token,
        apikey: cfg.supabaseKey || "",
        Accept: "application/json"
      }, (options && options.headers) || {});
      return fetch(base + clean, Object.assign({}, options || {}, { headers: headers })).then(parseResponse);
    });
  }

  function cloudGet(path) {
    return cloudFetch(path, { method: "GET" });
  }

  function cloudPost(path, body) {
    return cloudFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
  }

  function get(path) {
    if (isLocal()) return localGet(path);
    return cloudGet(path);
  }

  function post(path, body) {
    if (isLocal()) return localPost(path, body);
    return cloudPost(path, body);
  }

  function syncSecretsFromMac() {
    if (!isLocal() || !client) return Promise.resolve();
    return localGet("/api/export-secrets").then(function (res) {
      if (!res.ok || !res.data) return;
      var d = res.data;
      if (
        !d.mercury_token &&
        !d.asc_private_key &&
        !d.play_service_account_json &&
        !d.permitpath_service_role_key &&
        !d.pilotcar4hire_service_role_key &&
        !d.asc_vendor_number &&
        !d.play_gcs_bucket
      ) return;
      return client.auth.getUser().then(function (auth) {
        var user = auth.data && auth.data.user;
        if (!user) return;
        var row = {
          user_id: user.id,
          mercury_token: d.mercury_token || "",
          asc_issuer_id: d.asc_issuer_id || "",
          asc_key_id: d.asc_key_id || "",
          asc_private_key: d.asc_private_key || "",
          play_service_account_json: d.play_service_account_json || "",
          permitpath_supabase_url: d.permitpath_supabase_url || "",
          permitpath_service_role_key: d.permitpath_service_role_key || "",
          pilotcar4hire_supabase_url: d.pilotcar4hire_supabase_url || "",
          pilotcar4hire_service_role_key: d.pilotcar4hire_service_role_key || ""
        };
        if (d.asc_vendor_number) row.asc_vendor_number = d.asc_vendor_number;
        if (d.play_gcs_bucket) row.play_gcs_bucket = d.play_gcs_bucket;
        return client.from("studio_secrets").upsert(row, { onConflict: "user_id" });
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
    post: post,
    syncSecretsFromMac: syncSecretsFromMac
  };
})();

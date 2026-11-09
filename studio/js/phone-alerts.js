(function () {
  "use strict";

  var FLAG = "stl-phone-alerts";
  var poll = 0;

  function api() {
    if (!window.STLLocalApi || !window.STLLocalApi.available || !window.STLLocalApi.available()) {
      throw new Error("Sign in, then open Studio again.");
    }
    return window.STLLocalApi;
  }

  function standalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function enabled() {
    return localStorage.getItem(FLAG) === "on";
  }

  function urlBase64ToUint8Array(value) {
    var padding = "=".repeat((4 - (value.length % 4)) % 4);
    var base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function register() {
    if (!("serviceWorker" in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.register("sw.js").catch(function () { return null; });
  }

  function status() {
    var permission = ("Notification" in window) ? Notification.permission : "unsupported";
    return {
      standalone: standalone(),
      permission: permission,
      enabled: enabled() && permission === "granted"
    };
  }

  function explain(state) {
    if (state.permission === "unsupported") {
      return "This phone cannot show website alerts.";
    }
    if (!state.standalone) {
      return "On your iPhone, open the Studio icon on the home screen, then turn alerts on there. A browser tab cannot send them.";
    }
    if (state.permission === "denied") {
      return "Alerts are blocked. In iPhone Settings, open Notifications, find Studio, and allow them. Then come back and tap Turn on.";
    }
    if (state.enabled) {
      return "This phone is on. Studio pings you when something new shows up on Overview. What is already there stays quiet.";
    }
    return "Turn this on to get a ping for a new message, a fleet signup, a support ticket, a review, an unpaid invoice, a renewal, unbilled hours, a project due date, a project issue, or an overdue backup.";
  }

  function fill(root) {
    if (!root) return;
    var state = status();
    var note = root.querySelector('[data-el="alerts-note"]');
    var on = root.querySelector('[data-el="alerts-on"]');
    var off = root.querySelector('[data-el="alerts-off"]');
    var test = root.querySelector('[data-el="alerts-test"]');
    if (note) note.textContent = explain(state);
    if (on) on.classList.toggle("hidden", state.enabled);
    if (off) off.classList.toggle("hidden", !state.enabled);
    if (test) test.classList.toggle("hidden", !state.enabled);
  }

  function turnOn() {
    var state = status();
    if (!state.standalone) return Promise.reject(new Error(explain(state)));
    if (!("Notification" in window) || !("PushManager" in window)) {
      return Promise.reject(new Error("This phone cannot show website alerts."));
    }
    return Notification.requestPermission().then(function (permission) {
      if (permission !== "granted") throw new Error(explain(status()));
      return register();
    }).then(function () {
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return api().get("/api/phone-alerts/public-key").then(function (res) {
        if (!res.ok || !res.data || !res.data.publicKey) {
          throw new Error((res.data && res.data.error) || "Phone alerts are not ready on the server yet.");
        }
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(res.data.publicKey)
        });
      });
    }).then(function (sub) {
      return api().post("/api/phone-alerts/subscribe", { subscription: sub.toJSON() });
    }).then(function (res) {
      if (!res.ok) throw new Error((res.data && res.data.error) || "Could not save this phone.");
      localStorage.setItem(FLAG, "on");
      start();
      return true;
    });
  }

  function turnOff() {
    var client = api();
    return client.post("/api/phone-alerts/unsubscribe", {}).then(function () {
      localStorage.removeItem(FLAG);
      if (poll) {
        clearInterval(poll);
        poll = 0;
      }
      if (!("serviceWorker" in navigator)) return;
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          if (sub) return sub.unsubscribe();
        });
      });
    });
  }

  function test() {
    return api().post("/api/phone-alerts/test", {}).then(function (res) {
      if (!res.ok) throw new Error((res.data && res.data.error) || "Could not send a test.");
      return true;
    });
  }

  function tick() {
    if (!enabled()) return;
    if (!window.STLLocalApi || !window.STLLocalApi.available || !window.STLLocalApi.available()) return;
    window.STLLocalApi.post("/api/phone-alerts/tick", {}).catch(function () {});
  }

  function start() {
    register();
    if (poll) clearInterval(poll);
    poll = 0;
    if (!enabled()) return;
    tick();
    poll = setInterval(tick, 120000);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (event) {
      var section = event.data && event.data.open;
      if (section && window.STLApp && window.STLApp.navigate) window.STLApp.navigate(section);
    });
  }

  window.STLPhoneAlerts = {
    status: status,
    explain: explain,
    fill: fill,
    turnOn: turnOn,
    turnOff: turnOff,
    test: test,
    start: start
  };
})();

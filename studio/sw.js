self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: "Studio", body: event.data ? event.data.text() : "" };
  }
  var title = data.title || "Studio";
  var body = data.body || "";
  event.waitUntil(self.registration.showNotification(title, {
    body: body,
    icon: "images/studio-icon-192.png",
    badge: "images/studio-icon-192.png",
    data: { section: data.section || "overview" }
  }));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var section = (event.notification.data && event.notification.data.section) || "overview";
  var target = new URL("/studio/?open=" + encodeURIComponent(section), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windows) {
      var i;
      for (i = 0; i < windows.length; i++) {
        if (windows[i].url.indexOf("/studio") !== -1 && "focus" in windows[i]) {
          windows[i].postMessage({ open: section });
          return windows[i].focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

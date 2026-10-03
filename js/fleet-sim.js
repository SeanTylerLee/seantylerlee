/* FleetDispatch interactive selling demo — vanilla IIFE, no modules */
(function () {
  "use strict";

  /* —— Icons —— */
  var I = {
    house: function (f) {
      return f
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.2 3.5 10v10.3A1.5 1.5 0 0 0 5 21.8h4.2v-6.2h5.6v6.2H19a1.5 1.5 0 0 0 1.5-1.5V10L12 3.2z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"/></svg>';
    },
    clipboard: function (f) {
      return f
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 3a2 2 0 0 0-2 2H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1a2 2 0 0 0-2-2H9zm0 2h6v1H9V5zm1 5h4a1 1 0 1 1 0 2h-4a1 1 0 1 1 0-2zm0 4h6a1 1 0 1 1 0 2h-6a1 1 0 1 1 0-2z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 11h4M9 15h6"/></svg>';
    },
    list: function (f) {
      return f
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4v2h2V8H7zm4 0v2h6V8h-6zm-4 4v2h2v-2H7zm4 0v2h6v-2h-6zm-4 4v2h2v-2H7zm4 0v2h6v-2h-6z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h.01M12 9h4M8 13h.01M12 13h4M8 17h.01M12 17h4"/></svg>';
    },
    wrench: function (f) {
      return f
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.7 6.3a4 4 0 0 0-5.6 5.2L4 16.6 7.4 20l5.1-5.1a4 4 0 0 0 5.2-5.6l-2.4 2.4-2.1-2.1 2.5-2.3z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.6 5.2L4 16.6 7.4 20l5.1-5.1a4 4 0 0 0 5.2-5.6l-2.4 2.4-2.1-2.1 2.5-2.3z"/></svg>';
    },
    people: function (f) {
      return f
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM16 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.5 13.5c-3 0-5.5 1.6-5.5 3.8V19h11v-1.7c0-2.2-2.5-3.8-5.5-3.8zM16 14c-.4 0-.8 0-1.2.1 1.1.8 1.7 1.9 1.7 3.2V19H21v-1.2c0-1.8-2-3.8-5-3.8z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M3 19c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4M13.5 19c0-1.8 1.5-3.2 3.5-3.2S20.5 17.2 20.5 19"/></svg>';
    },
    gear: function (f) {
      return f
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.1 2.7-1.1-.2a6.6 6.6 0 0 0-.6-1.4l.7-.9a.8.8 0 0 0-.1-1.1l-1.4-1.4a.8.8 0 0 0-1.1-.1l-.9.7a6.6 6.6 0 0 0-1.4-.6l-.2-1.1A.8.8 0 0 0 13.3 4h-2.6a.8.8 0 0 0-.8.7l-.2 1.1a6.6 6.6 0 0 0-1.4.6l-.9-.7a.8.8 0 0 0-1.1.1L4.9 7.2a.8.8 0 0 0-.1 1.1l.7.9a6.6 6.6 0 0 0-.6 1.4l-1.1.2a.8.8 0 0 0-.7.8v2a.8.8 0 0 0 .7.8l1.1.2c.1.5.3 1 .6 1.4l-.7.9a.8.8 0 0 0 .1 1.1l1.4 1.4a.8.8 0 0 0 1.1.1l.9-.7c.4.3.9.5 1.4.6l.2 1.1a.8.8 0 0 0 .8.7h2.6a.8.8 0 0 0 .8-.7l.2-1.1c.5-.1 1-.3 1.4-.6l.9.7a.8.8 0 0 0 1.1-.1l1.4-1.4a.8.8 0 0 0 .1-1.1l-.7-.9c.3-.4.5-.9.6-1.4l1.1-.2a.8.8 0 0 0 .7-.8v-2a.8.8 0 0 0-.7-.8z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
    },
    doc: function (f) {
      return f
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-6zm-1 1.5L17.5 8H13V3.5zM8 12h8v1.5H8V12zm0 3h8v1.5H8V15zm0 3h5v1.5H8V18z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
    },
    plane: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.4 11.1 4.3 3.4a1 1 0 0 0-1.4 1.2l2 6.4H11a1 1 0 1 1 0 2H4.9l-2 6.4a1 1 0 0 0 1.4 1.2l17.1-7.7a1 1 0 0 0 0-1.8z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.7-4.7 1.4 1.4-6.1 6.1z"/></svg>',
    wheel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 4v5.5M12 14.5V20M4 12h5.5M14.5 12H20"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22zm7-6.2V11a7 7 0 0 0-5-6.7V3.5a2 2 0 1 0-4 0v.8A7 7 0 0 0 5 11v4.8L3 18v1h18v-1l-2-2.2z"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2h2.4a2 2 0 0 1 1.6.8l2.1 2.8a2 2 0 0 1 .4 1.2V16a1 1 0 0 1-1 1h-1.1a2.5 2.5 0 0 1-4.8 0H9.9a2.5 2.5 0 0 1-4.8 0H4a1 1 0 0 1-1-1V6zm3.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm10 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM15 9v4h4.2l-1.8-2.4A1 1 0 0 0 16.6 10H15z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 3.2 2.6 20.2A1.2 1.2 0 0 0 3.7 22h16.6a1.2 1.2 0 0 0 1.1-1.8L12 3.2zm0 5.3c.6 0 1 .5 1 1.1v5.2a1 1 0 1 1-2 0V9.6c0-.6.4-1.1 1-1.1zm0 10.2a1.15 1.15 0 1 1 0-2.3 1.15 1.15 0 0 1 0 2.3z"/></svg>',
    message: function (f) {
      return f
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg>';
    },
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>',
    crown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.5 5 7l4.5 4.5L12 5l2.5 6.5L19 7l2 10.5H3zM4 19h16v2H4v-2z"/></svg>',
    building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-5h6v5M8 7h2M14 7h2M8 11h2M14 11h2"/></svg>',
    dollar: function (f) {
      return f
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 3h2v2.05c1.9.25 3.4 1.45 3.4 3.3 0 1.7-1.15 2.7-3.15 3.15L11.4 12c-.95.2-1.4.55-1.4 1.15 0 .7.6 1.1 1.65 1.1.95 0 1.7-.35 2.15-.95l1.65 1.15c-.7.95-1.85 1.55-3.45 1.75V19h-2v-2.1c-1.95-.25-3.45-1.5-3.45-3.35 0-1.75 1.2-2.8 3.25-3.25l1.9-.45c.9-.2 1.3-.55 1.3-1.1 0-.6-.55-1-1.5-1-.85 0-1.5.3-1.95.85L7.4 7.7C8.15 6.7 9.4 6.05 11 5.8V3z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18M16.2 7.2c-.7-1.1-2-1.8-4.2-1.8-2.4 0-4 1.2-4 3s1.6 2.7 4.2 3.2l.6.1c2.3.5 3.7 1.2 3.7 2.9s-1.7 3-4.3 3c-2.2 0-3.6-.8-4.4-2"/></svg>';
    },
    more: function () {
      return '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/></svg>';
    }
  };

  /* —— Constants —— */
  var ROLES = [
    { id: "owner", title: "Owner" },
    { id: "office", title: "Office" },
    { id: "dispatcher", title: "Dispatcher" },
    { id: "mechanic", title: "Mechanic" },
    { id: "driver", title: "Driver" }
  ];

  var STATUS_TITLE = {
    sent: "Pending",
    accepted: "Accepted",
    atPickup: "At pickup",
    loaded: "Loaded",
    inTransit: "In transit",
    atDelivery: "At delivery",
    completed: "Completed",
    declined: "Declined"
  };

  var STATUS_CLASS = {
    sent: "st-sent",
    accepted: "st-accepted",
    atPickup: "st-pickup",
    loaded: "st-loaded",
    inTransit: "st-transit",
    atDelivery: "st-delivery",
    completed: "st-done",
    declined: "st-declined"
  };

  var STATUS_COLOR = {
    sent: "#ff9500",
    accepted: "#007aff",
    atPickup: "#af52de",
    loaded: "#5856d6",
    inTransit: "#34c759",
    atDelivery: "#30b0c7",
    completed: "#8e8e93",
    declined: "#ff3b30"
  };

  var PRIORITY_TITLE = {
    low: "Low",
    medium: "Medium",
    high: "High",
    outOfService: "OOS"
  };

  var WRITEUP_STATUS = {
    open: "Open",
    inProgress: "In progress",
    fixed: "Fixed",
    cannotRepair: "Cannot repair"
  };

  var CHECK_FLOW = ["accepted", "atPickup", "loaded", "inTransit", "atDelivery", "completed"];

  var CHECK_LABELS = {
    atPickup: "Arrived pickup",
    loaded: "Loaded",
    inTransit: "En route",
    atDelivery: "Arrived delivery",
    completed: "Complete"
  };

  var DISPATCH_COMMANDS = [
    { id: "check", label: "Check call", text: "Check call. Send your status and location." },
    { id: "roll", label: "Roll now", text: "You are clear to roll." },
    { id: "hold", label: "Hold", text: "Hold where you are until dispatch clears you." },
    { id: "scale", label: "Get scale", text: "Get a scale ticket and send the weight." },
    { id: "bol", label: "Send BOL", text: "Send the signed BOL." },
    { id: "eta", label: "Update ETA", text: "Update your ETA to the receiver." },
    { id: "call", label: "Call office", text: "Call dispatch when you can stop safely." },
    { id: "yard", label: "Back to yard", text: "After this drop, return to the yard." }
  ];

  var DRIVER_REPLIES = [
    { id: "copy", label: "Copy", text: "Copy." },
    { id: "late", label: "Running late", text: "Running about 15 minutes late." },
    { id: "gate", label: "At the gate", text: "At the gate, waiting to get in." },
    { id: "loaded", label: "Loaded", text: "Loaded and rolling." },
    { id: "scale", label: "Need a scale", text: "I need a scale nearby." },
    { id: "detention", label: "Detention", text: "Detention is starting." },
    { id: "arrived", label: "Arrived", text: "Arrived on site." }
  ];

  /* —— Demo data —— */
  function uid() {
    return "id-" + Math.random().toString(36).slice(2, 10);
  }

  function hoursAgo(h) {
    return Date.now() - h * 3600000;
  }

  function fmtAt(ts) {
    var d = new Date(ts);
    var h = d.getHours();
    var m = String(d.getMinutes());
    if (m.length < 2) m = "0" + m;
    return h + ":" + m;
  }

  function makeTimeline(status) {
    var steps = [
      { key: "sent", label: "Dispatched" },
      { key: "accepted", label: "Accepted" },
      { key: "atPickup", label: "Arrived pickup" },
      { key: "loaded", label: "Loaded" },
      { key: "inTransit", label: "In transit" },
      { key: "atDelivery", label: "Arrived delivery" },
      { key: "completed", label: "Completed" }
    ];
    if (status === "declined") {
      return [
        { label: "Dispatched", at: "08:10", done: true },
        { label: "Declined", at: "08:22", done: true }
      ];
    }
    var order = ["sent", "accepted", "atPickup", "loaded", "inTransit", "atDelivery", "completed"];
    var idx = order.indexOf(status);
    if (idx < 0) idx = 0;
    var base = hoursAgo(idx + 1);
    return steps.map(function (s, i) {
      var done = i <= idx;
      return {
        label: s.label,
        at: done ? fmtAt(base + i * 900000) : "",
        done: done
      };
    });
  }

  function makeSamples() {
    return {
      companyName: "Lone Star Freight",
      role: "dispatcher",
      delegateUserManagementToDispatcher: false,
      signedInDriverUsername: "tbrooks",
      activity: [],
      teamMembers: [
        { id: uid(), name: "Alex Rivera", username: "arivera", role: "owner", core: true, driverNumber: null, ticketSequence: 0, dutyStatus: null, locationLabel: null },
        { id: uid(), name: "Jordan Lee", username: "jlee", role: "dispatcher", core: true, driverNumber: null, ticketSequence: 0, dutyStatus: null, locationLabel: null },
        { id: uid(), name: "Sam Ortiz", username: "sortiz", role: "office", core: true, driverNumber: null, ticketSequence: 0, dutyStatus: null, locationLabel: null },
        { id: uid(), name: "Chris Nguyen", username: "cnguyen", role: "mechanic", core: true, driverNumber: null, ticketSequence: 0, dutyStatus: null, locationLabel: null },
        { id: uid(), name: "Taylor Brooks", username: "tbrooks", role: "driver", core: true, driverNumber: 1432, ticketSequence: 0, dutyStatus: "available", locationLabel: "Yard · Dallas", mapLon: -96.80, mapLat: 32.78 },
        { id: uid(), name: "Morgan Blake", username: "mblake", role: "driver", core: true, driverNumber: 1433, ticketSequence: 0, dutyStatus: "available", locationLabel: "Yard · Fort Worth", mapLon: -97.33, mapLat: 32.75 }
      ],
      dispatches: [],
      tickets: [],
      writeUps: []
    };
  }

  /* —— Session —— */
  var session = makeSamples();
  var nav = { tab: "board", screen: "home", detailId: null, sheet: null, filter: "all", msgId: null };

  function drivers() {
    return session.teamMembers.filter(function (m) { return m.role === "driver"; });
  }

  function currentDriver() {
    var list = drivers();
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].username === session.signedInDriverUsername) return list[i];
    }
    return list[0] || null;
  }

  function canManageUsers() {
    if (session.role === "owner") return true;
    if (session.role === "dispatcher") return !!session.delegateUserManagementToDispatcher;
    return false;
  }

  function findById(arr, id) {
    var i;
    for (i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function findDispatch(id) {
    return findById(session.dispatches, id);
  }

  function isMoving(st) {
    return st === "accepted" || st === "atPickup" || st === "loaded" || st === "inTransit" || st === "atDelivery";
  }

  function isLiveMap(st) {
    return st !== "completed" && st !== "declined";
  }

  function pendingJobs() {
    return session.dispatches.filter(function (d) { return d.status === "sent"; });
  }

  function movingJobs() {
    return session.dispatches.filter(function (d) { return isMoving(d.status); });
  }

  function doneJobs() {
    return session.dispatches.filter(function (d) {
      return d.status === "completed" || d.status === "declined";
    });
  }

  function ticketsAwaiting() {
    return session.tickets.filter(function (t) { return t.status === "submitted"; });
  }

  function ticketsBilled() {
    return session.tickets.filter(function (t) { return t.status === "billed"; });
  }

  function writeUpsOpen() {
    return session.writeUps.filter(function (w) {
      return w.status === "open" || w.status === "inProgress";
    });
  }

  function writeUpsInProgress() {
    return session.writeUps.filter(function (w) { return w.status === "inProgress"; });
  }

  function writeUpsNotStarted() {
    return session.writeUps.filter(function (w) { return w.status === "open"; });
  }

  function writeUpsResolved() {
    return session.writeUps.filter(function (w) {
      return w.status === "fixed" || w.status === "cannotRepair";
    });
  }

  function writeUpsOos() {
    return session.writeUps.filter(function (w) {
      return w.priority === "outOfService" && (w.status === "open" || w.status === "inProgress" || w.status === "cannotRepair");
    });
  }

  function priorityPill(priority) {
    var title = PRIORITY_TITLE[priority] || priority;
    var cls =
      priority === "outOfService" ? "pri-oos" :
      priority === "high" ? "pri-high" :
      priority === "medium" ? "pri-medium" : "pri-low";
    return '<span class="status-pill ' + cls + '">' + esc(title) + "</span>";
  }

  function writeUpStatusPill(status) {
    var title = WRITEUP_STATUS[status] || status;
    var cls =
      status === "open" ? "st-open" :
      status === "inProgress" ? "st-inProgress" :
      status === "fixed" ? "st-fixed" : "st-cannotRepair";
    return '<span class="status-pill ' + cls + '">' + esc(title) + "</span>";
  }

  function writeUpCard(w) {
    return (
      '<button type="button" class="wu-card" data-action="openWriteUp" data-id="' + esc(w.id) + '">' +
        '<div class="wu-card-top">' +
          '<span class="wu-card-title">' + esc(w.title) + "</span>" +
          priorityPill(w.priority) +
        "</div>" +
        '<div class="wu-card-meta">' +
          '<span class="wu-unit">' + esc(w.equipmentUnit) + "</span>" +
          writeUpStatusPill(w.status) +
          '<span class="wu-card-sub">' + esc(w.number) + "</span>" +
        "</div>" +
        '<div class="wu-card-sub">' + esc(w.driverName) +
          (w.description ? " · " + esc(String(w.description).length > 54 ? String(w.description).slice(0, 54) + "…" : w.description) : "") +
        "</div>" +
        '<div class="wu-card-foot">' +
          '<span class="wu-card-sub">Open work order</span>' +
          '<span class="chev">' + I.chev + "</span>" +
        "</div>" +
      "</button>"
    );
  }

  function oosBanner() {
    var oos = writeUpsOos();
    if (!oos.length) return "";
    return (
      '<div class="alert-banner">' +
        I.alert +
        '<span class="alert-copy"><strong>' + oos.length + " OOS</strong> — " +
          esc(oos.map(function (w) { return w.equipmentUnit; }).join(", ")) +
          " need shop attention</span>" +
      "</div>"
    );
  }

  function myDispatches() {
    var d = currentDriver();
    if (!d) return [];
    return session.dispatches.filter(function (j) { return j.driverUsername === d.username; });
  }

  function myPending() {
    return myDispatches().filter(function (j) { return j.status === "sent"; });
  }

  function myActive() {
    var list = myDispatches();
    var i;
    for (i = 0; i < list.length; i++) {
      if (isMoving(list[i].status)) return list[i];
    }
    return null;
  }

  function mockRevenue() {
    var sum = 0;
    var i;
    for (i = 0; i < session.tickets.length; i++) sum += Number(session.tickets[i].rateAmount) || 0;
    for (i = 0; i < session.dispatches.length; i++) {
      if (isMoving(session.dispatches[i].status) || session.dispatches[i].status === "sent") {
        sum += Number(session.dispatches[i].rateAmount) || 0;
      }
    }
    return sum;
  }

  function nextLoadRef() {
    var max = 1000;
    var i, m, n;
    for (i = 0; i < session.dispatches.length; i++) {
      m = String(session.dispatches[i].loadReference).match(/\d+/);
      n = m ? parseInt(m[0], 10) : 0;
      if (n > max) max = n;
    }
    return "LS-" + (max + 1);
  }

  function nextTicketNumber() {
    var max = 1000;
    var i, m, n;
    for (i = 0; i < session.tickets.length; i++) {
      m = String(session.tickets[i].number).match(/\d+/);
      n = m ? parseInt(m[0], 10) : 0;
      if (n > max) max = n;
    }
    return String(max + 1);
  }

  function setDriverDuty(username, status, locationLabel) {
    var list = session.teamMembers;
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].username === username && list[i].role === "driver") {
        list[i].dutyStatus = status;
        if (locationLabel != null) list[i].locationLabel = locationLabel;
      }
    }
  }

  function advanceTimeline(job, status) {
    job.timeline = makeTimeline(status);
  }

  function firstName(name) {
    var parts = String(name || "").trim().split(/\s+/);
    return parts[0] || "Driver";
  }

  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }

  function memberByRole(role) {
    var i;
    for (i = 0; i < session.teamMembers.length; i++) {
      if (session.teamMembers[i].role === role) return session.teamMembers[i];
    }
    return null;
  }

  function actorName() {
    if (session.role === "driver") {
      var d = currentDriver();
      return d ? d.name : "Driver";
    }
    var m = memberByRole(session.role);
    return m ? m.name : roleTitle(session.role);
  }

  function isDispatchRole() {
    return session.role === "dispatcher" || session.role === "owner";
  }

  function logEvent(text) {
    if (!session.activity) session.activity = [];
    session.activity.unshift({ id: uid(), text: text, at: fmtAt(Date.now()) });
    if (session.activity.length > 30) session.activity.length = 30;
  }

  function addMessage(job, partial) {
    if (!job.messages) job.messages = [];
    var msg = {
      id: uid(),
      from: partial.from,
      kind: partial.kind || (partial.from === "dispatch" ? "command" : partial.from === "system" ? "system" : "reply"),
      text: partial.text,
      at: partial.at || fmtAt(Date.now()),
      status: partial.status || null,
      byName: partial.byName || "",
      commandId: partial.commandId || null
    };
    if (msg.kind !== "command") msg.status = null;
    job.messages.push(msg);
    return msg;
  }

  function unfinishedCommands(job) {
    return (job.messages || []).filter(function (m) {
      return m.kind === "command" && m.status !== "done";
    });
  }

  function latestUnfinished(job) {
    var list = unfinishedCommands(job);
    return list.length ? list[list.length - 1] : null;
  }

  function commandStatusLabel(status) {
    if (status === "done") return "Done";
    if (status === "copied") return "Copied";
    return "Waiting";
  }

  function markCommand(job, mid, status) {
    var msgs = job.messages || [];
    var i;
    for (i = 0; i < msgs.length; i++) {
      if (msgs[i].id === mid && msgs[i].kind === "command") {
        msgs[i].status = status;
        return msgs[i];
      }
    }
    return null;
  }

  function unreadForViewer(job) {
    if (session.role === "driver") {
      var me = currentDriver();
      if (!me || job.driverUsername !== me.username) return 0;
      return job.unreadDriver || 0;
    }
    if (isDispatchRole()) return job.unreadDispatch || 0;
    return 0;
  }

  function unreadTotal() {
    var list = session.role === "driver" ? myDispatches() : session.dispatches;
    var n = 0;
    var i;
    for (i = 0; i < list.length; i++) n += unreadForViewer(list[i]);
    return n;
  }

  function clearUnread(job) {
    if (!job) return;
    if (session.role === "driver") job.unreadDriver = 0;
    else if (isDispatchRole()) job.unreadDispatch = 0;
  }

  function companyOpenCommands() {
    var n = 0;
    var i;
    for (i = 0; i < session.dispatches.length; i++) n += unfinishedCommands(session.dispatches[i]).length;
    return n;
  }

  function sumRate(list) {
    var s = 0;
    var i;
    for (i = 0; i < list.length; i++) s += Number(list[i].rateAmount) || 0;
    return s;
  }

  function roadLoads() {
    return session.dispatches.filter(function (d) {
      return d.status === "sent" || isMoving(d.status);
    });
  }

  function deliveredUnticketed() {
    return session.dispatches.filter(function (d) {
      if (d.status !== "completed") return false;
      var i;
      for (i = 0; i < session.tickets.length; i++) {
        if (session.tickets[i].loadReference === d.loadReference) return false;
      }
      return true;
    });
  }

  function driverByUsername(username) {
    var list = drivers();
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].username === username) return list[i];
    }
    return null;
  }

  function refreshDuty(username) {
    var moving = session.dispatches.filter(function (j) {
      return j.driverUsername === username && isMoving(j.status);
    });
    var person = driverByUsername(username);
    if (!person) return;
    if (moving.length) {
      setDriverDuty(username, "onLoad", moving[0].origin);
      return;
    }
    if (person.dutyStatus !== "offDuty") setDriverDuty(username, "available", person.locationLabel || "Yard");
  }

  function driverUnit(person) {
    var i;
    for (i = 0; i < session.dispatches.length; i++) {
      if (session.dispatches[i].driverUsername === person.username && session.dispatches[i].equipmentUnit) {
        return session.dispatches[i].equipmentUnit;
      }
    }
    return "Unit";
  }

  function nextWriteUpNumber() {
    var max = 100;
    var i, m, n;
    for (i = 0; i < session.writeUps.length; i++) {
      m = String(session.writeUps[i].number).match(/\d+/);
      n = m ? parseInt(m[0], 10) : 0;
      if (n > max) max = n;
    }
    return "W-" + (max + 1);
  }

  function noteDriverUpdate(job, text) {
    var who = driverByUsername(job.driverUsername);
    addMessage(job, { from: "driver", kind: "reply", text: text, byName: who ? who.name : job.driverName });
    job.unreadDispatch = (job.unreadDispatch || 0) + 1;
  }

  function placeFrom(text) {
    var key = String(text || "").split(",")[0].trim().toLowerCase();
    var city = {
      dallas: [-96.8, 32.78],
      houston: [-95.37, 29.76],
      "fort worth": [-97.33, 32.75],
      austin: [-97.74, 30.27],
      "san antonio": [-98.49, 29.42],
      waco: [-97.15, 31.55],
      tyler: [-95.3, 32.35],
      amarillo: [-101.83, 35.22],
      lubbock: [-101.85, 33.58],
      odessa: [-102.37, 31.85],
      midland: [-102.08, 31.997],
      beaumont: [-94.1, 30.08],
      shreveport: [-93.75, 32.51],
      "oklahoma city": [-97.52, 35.47],
      abilene: [-99.73, 32.45]
    };
    return city[key] || null;
  }

  function pinTo(username, place) {
    var hit = placeFrom(place);
    var person = driverByUsername(username);
    if (!person || !hit) return;
    person.mapLon = hit[0];
    person.mapLat = hit[1];
    person.locationLabel = String(place || "").split(",")[0];
  }

  /* —— Render helpers —— */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function money2(n) {
    return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function initials(name) {
    return String(name || "?")
      .split(/\s+/)
      .map(function (p) { return p.charAt(0); })
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function toast(msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("show"); }, 1800);
  }

  function statusPill(status) {
    var title = STATUS_TITLE[status] || status;
    var cls = STATUS_CLASS[status] || "st-sent";
    return '<span class="status-pill ' + cls + '">' + esc(title) + "</span>";
  }

  function kpiStrip(items, extraClass) {
    return (
      '<div class="kpi-strip' + (extraClass ? " " + extraClass : "") + '">' +
      items.map(function (it) {
        return (
          '<div class="kpi">' +
            '<div class="kpi-val">' + esc(it.value) + "</div>" +
            '<div class="kpi-lbl">' + esc(it.label) + "</div>" +
          "</div>"
        );
      }).join("") +
      "</div>"
    );
  }

  function loadRailClass(status) {
    if (status === "sent") return "rail-pending";
    if (status === "declined") return "rail-declined";
    if (status === "completed") return "rail-done";
    return "rail-moving";
  }

  function cityShort(place) {
    var s = String(place || "");
    var i = s.indexOf(",");
    return i > 0 ? s.slice(0, i) : s;
  }

  function laneBlock(job) {
    return (
      '<div class="lane">' +
        '<div class="lane-track"><span class="lane-dot pick"></span><span class="lane-dot drop"></span></div>' +
        '<div>' +
          '<div class="lane-city">' + esc(cityShort(job.origin)) + "</div>" +
          '<div class="lane-miles">' + (job.miles ? esc(String(job.miles)) + " mi" : "—") +
            (job.etaLabel && job.etaLabel !== "—" && job.etaLabel !== "TBD" && job.etaLabel !== "Done" ? " · ETA " + esc(job.etaLabel) : "") +
          "</div>" +
          '<div class="lane-city">' + esc(cityShort(job.destination)) + "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function loadCard(job) {
    return (
      '<button type="button" class="load-card ' + loadRailClass(job.status) + '" data-action="openDispatch" data-id="' + esc(job.id) + '">' +
        '<div class="load-card-top">' +
          '<span class="load-ref">' + esc(job.loadReference) + "</span>" +
          '<span class="load-cust">' + esc(job.customerName) + "</span>" +
          statusPill(job.status) +
        "</div>" +
        laneBlock(job) +
        '<div class="load-meta">' +
          "<b>" + esc(job.driverName || "Unassigned") + "</b>" +
          "<span>" + esc(job.equipmentUnit || "—") + "</span>" +
          (job.rateAmount ? "<b>" + money(job.rateAmount) + "</b>" : "") +
        "</div>" +
      "</button>"
    );
  }

  /* Lon/lat → % on the US basemap image (bbox -126..-65 lon, 23.5..50.5 lat) */
  function projectUs(lon, lat) {
    var west = -126.0;
    var east = -65.0;
    var south = 23.5;
    var north = 50.5;
    var x = ((Number(lon) - west) / (east - west)) * 100;
    var y = ((north - Number(lat)) / (north - south)) * 100;
    return {
      x: Math.max(2, Math.min(98, x)),
      y: Math.max(2, Math.min(98, y))
    };
  }

  function driverPinHtml(d, nudge) {
    var pt = projectUs(d.mapLon != null ? d.mapLon : -97.5, d.mapLat != null ? d.mapLat : 31.5);
    var duty = d.dutyStatus || "available";
    var title = d.name + (d.locationLabel ? " · " + d.locationLabel : "") + " · " + duty;
    return (
      '<button type="button" class="driver-pin' + (nudge ? " nudge-" + nudge : "") + '" data-action="openDriver" data-id="' + esc(d.id) + '" title="' + esc(title) + '" ' +
        'aria-label="' + esc(title) + '" style="left:' + pt.x.toFixed(2) + "%;top:" + pt.y.toFixed(2) + '%">' +
        '<span class="driver-pin-glyph" aria-hidden="true"></span>' +
        '<span class="driver-pin-pulse" aria-hidden="true"></span>' +
        '<span class="driver-pin-name">' + esc(firstName(d.name)) + "</span>" +
      "</button>"
    );
  }

  function mapPanel() {
    var list = drivers();
    var used = [];
    var pins = list.map(function (d) {
      var pt = projectUs(d.mapLon != null ? d.mapLon : -97.5, d.mapLat != null ? d.mapLat : 31.5);
      var nudge = 0;
      var i;
      for (i = 0; i < used.length; i++) {
        if (Math.abs(used[i].x - pt.x) < 6 && Math.abs(used[i].y - pt.y) < 8) nudge = Math.max(nudge, used[i].nudge + 1);
      }
      if (nudge > 2) nudge = 2;
      used.push({ x: pt.x, y: pt.y + nudge * 6, nudge: nudge });
      return driverPinHtml(d, nudge);
    }).join("");
    var activeCount = list.filter(function (d) { return d.dutyStatus !== "offDuty"; }).length;

    return (
      '<div class="map-panel map-us">' +
        '<img class="map-basemap" src="images/us-map.jpg" alt="" width="1400" height="800" decoding="async" draggable="false" />' +
        '<div class="map-pins" aria-label="Driver locations">' + pins + "</div>" +
        '<div class="map-live"><span class="dot"></span> LIVE</div>' +
        '<div class="map-legend">' +
          '<span class="map-chip"><span class="dot" style="background:#34c759"></span>Drivers</span>' +
          '<span class="map-chip">' + esc(String(activeCount)) + " active · " + esc(String(list.length)) + " total</span>" +
        "</div>" +
      "</div>"
    );
  }

  function timeline(job) {
    var items = job.timeline || [];
    return (
      '<div class="timeline">' +
      items.map(function (t) {
        return (
          '<div class="tl-item' + (t.done ? " is-done" : "") + '">' +
            '<span class="tl-dot"></span>' +
            '<span class="tl-body">' +
              '<span class="tl-label">' + esc(t.label) + "</span>" +
              (t.at ? '<span class="tl-at">' + esc(t.at) + "</span>" : "") +
            "</span>" +
          "</div>"
        );
      }).join("") +
      "</div>"
    );
  }

  function driverRail(driverList) {
    return (
      '<div class="driver-rail">' +
      driverList.map(function (d) {
        var duty = d.dutyStatus || "available";
        var dutyLabel = duty === "onLoad" ? "On load" : duty === "offDuty" ? "Off duty" : "Available";
        var pillClass = duty === "onLoad" ? "st-onLoad" : duty === "offDuty" ? "st-offDuty" : "st-available";
        return (
          '<button type="button" class="driver-chip duty-' + esc(duty) + '" data-action="openDriver" data-id="' + esc(d.id) + '">' +
            '<span class="team-avatar role-driver">' + esc(initials(d.name)) + "</span>" +
            '<span class="driver-info">' +
              '<span class="n">' + esc(d.name.split(" ")[0]) + "</span>" +
              '<span class="status-pill ' + pillClass + '" style="padding:2px 6px;font-size:9px">' + esc(dutyLabel) + "</span>" +
            "</span>" +
          "</button>"
        );
      }).join("") +
      "</div>"
    );
  }

  function sectionHead(label, linkLabel, linkAction) {
    return (
      '<div class="section-head">' +
        '<span class="label">' + esc(label) + "</span>" +
        (linkLabel
          ? '<button type="button" class="link" data-action="' + esc(linkAction) + '">' + esc(linkLabel) + "</button>"
          : "") +
      "</div>"
    );
  }

  function hdr(title, sub) {
    return (
      '<div class="hdr"><div class="co">' + esc(session.companyName) + "</div>" +
        "<h2>" + esc(title) + "</h2>" +
        (sub ? '<div class="sub">' + esc(sub) + "</div>" : "") +
      "</div>"
    );
  }

  function emptyState(title, sub) {
    return (
      '<div class="empty">' +
        '<div class="t">' + esc(title) + "</div>" +
        (sub ? '<div class="s">' + esc(sub) + "</div>" : "") +
      "</div>"
    );
  }

  function segFilters() {
    var filters = [
      { id: "all", label: "All" },
      { id: "pending", label: "Pending" },
      { id: "moving", label: "Moving" },
      { id: "done", label: "Done" }
    ];
    return (
      '<div class="seg" role="tablist">' +
      filters.map(function (f) {
        return (
          '<button type="button" class="seg-btn' + (nav.filter === f.id ? " is-active" : "") +
            '" data-action="setFilter" data-filter="' + f.id + '">' + esc(f.label) + "</button>"
        );
      }).join("") +
      "</div>"
    );
  }

  function filteredLoads() {
    if (nav.filter === "pending") return pendingJobs();
    if (nav.filter === "moving") return movingJobs();
    if (nav.filter === "done") return doneJobs();
    return session.dispatches.slice();
  }

  function roleTitle(role) {
    var map = { owner: "Owner", office: "Office", dispatcher: "Dispatcher", mechanic: "Mechanic", driver: "Driver" };
    return map[role] || role;
  }

  /* —— Tabs —— */
  function tabsForRole() {
    switch (session.role) {
      case "owner":
        return [
          { id: "home", title: "Home", icon: "house" },
          { id: "loads", title: "Loads", icon: "list" },
          { id: "money", title: "Money", icon: "dollar" },
          { id: "messages", title: "Messages", icon: "message" },
          { id: "more", title: "More", icon: "more" }
        ];
      case "office":
        return [
          { id: "home", title: "Home", icon: "house" },
          { id: "tickets", title: "Tickets", icon: "doc" },
          { id: "settings", title: "Settings", icon: "gear" }
        ];
      case "dispatcher":
        return [
          { id: "board", title: "Board", icon: "map" },
          { id: "loads", title: "Loads", icon: "clipboard" },
          { id: "messages", title: "Messages", icon: "message" },
          { id: "tickets", title: "Tickets", icon: "doc" },
          { id: "drivers", title: "Drivers", icon: "wheel" }
        ];
      case "mechanic":
        return [
          { id: "home", title: "Home", icon: "house" },
          { id: "shop", title: "Shop", icon: "wrench" },
          { id: "settings", title: "Settings", icon: "gear" }
        ];
      case "driver":
      default:
        return [
          { id: "home", title: "Home", icon: "house" },
          { id: "jobs", title: "Jobs", icon: "list" },
          { id: "messages", title: "Messages", icon: "message" },
          { id: "settings", title: "Settings", icon: "gear" }
        ];
    }
  }

  function ownerSubTab(tab) {
    return tab === "shop" || tab === "team" || tab === "drivers" || tab === "settings";
  }

  function defaultTabForRole(role) {
    if (role === "dispatcher") return "board";
    return "home";
  }

  function titleForScreen() {
    if (nav.sheet === "newDispatch") return "New dispatch";
    if (nav.sheet === "ticket") return "Freight ticket";
    if (nav.sheet === "addUser") return "Add user";
    if (nav.sheet === "reassign") return "Reassign";
    if (nav.sheet === "writeup") return "Report issue";
    if (nav.screen === "detail") {
      var load = findDispatch(nav.detailId);
      return load ? load.loadReference : "Load";
    }
    if (nav.screen === "thread") {
      var threaded = findDispatch(nav.detailId);
      return threaded ? threaded.loadReference : "Command";
    }
    if (nav.screen === "ticketDetail") return "Ticket";
    if (nav.screen === "writeupDetail") return "Write-up";
    if (nav.screen === "driverDetail") return "Driver";
    switch (nav.tab) {
      case "board": return "Dispatch board";
      case "loads": return "Loads";
      case "drivers": return "Drivers";
      case "jobs": return "My jobs";
      case "messages": return "Messages";
      case "tickets": return "Tickets";
      case "money": return "Money";
      case "more": return "More";
      case "shop": return "Shop";
      case "team": return "Team";
      case "settings": return "Settings";
      case "home":
        return roleTitle(session.role);
      default: return "FleetDispatch";
    }
  }

  /* —— Screens —— */
  function renderDispatcherBoard() {
    var pending = pendingJobs();
    var moving = movingJobs();
    var avail = drivers().filter(function (d) { return d.dutyStatus === "available"; });
    var urgent = pending.slice(0, 3);
    var canDispatch = session.role === "dispatcher" || session.role === "owner";

    return (
      '<div class="fab-row">' +
        hdr("Today", pending.length + " waiting · " + moving.length + " on the road") +
        (canDispatch
          ? '<button type="button" class="btn btn-primary btn-new" data-action="newDispatch">' + I.plus + " Dispatch</button>"
          : "") +
      "</div>" +
      kpiStrip([
        { value: String(pending.length), label: "Pending" },
        { value: String(moving.length), label: "Moving" },
        { value: String(avail.length), label: "Open" },
        { value: String(writeUpsOos().length), label: "OOS" }
      ]) +
      mapPanel() +
      renderCommandQueue() +
      sectionHead(pending.length ? "Needs a driver" : "Queue", pending.length ? "All loads" : null, "goLoads") +
      (urgent.length
        ? '<div class="card mb-14">' + urgent.map(function (j) { return loadCard(j); }).join("") + "</div>"
        : emptyState("No loads yet", "Tap Dispatch to send the first offer.")) +
      renderTicketPeek() +
      sectionHead("Drivers") +
      driverRail(drivers()) +
      '<div class="card">' +
        '<button type="button" class="row" data-action="goSettings"><span class="ico-blue">' + I.gear(true) + '</span><span class="body"><span class="t">Settings</span><span class="s">Crew and reset</span></span><span class="chev">' + I.chev + "</span></button>" +
      "</div>"
    );
  }

  function ticketForLoad(ref) {
    var i;
    for (i = 0; i < session.tickets.length; i++) {
      if (session.tickets[i].loadReference === ref) return session.tickets[i];
    }
    return null;
  }

  function ticketEligible(job) {
    if (!job) return false;
    return job.status !== "sent" && job.status !== "declined";
  }

  function canViewTicket(t) {
    if (!t) return false;
    if (session.role === "mechanic") return false;
    if (session.role === "driver") {
      var me = currentDriver();
      return !!(me && t.driverUsername === me.username);
    }
    return session.role === "office" || session.role === "owner" || session.role === "dispatcher";
  }

  function myTickets() {
    var me = currentDriver();
    if (!me) return [];
    return session.tickets.filter(function (t) { return t.driverUsername === me.username; });
  }

  function ticketButtonHtml(job, primary) {
    var filed = ticketForLoad(job.loadReference);
    if (filed) {
      return '<button type="button" class="btn btn-secondary btn-full" style="margin-top:8px" data-action="openTicket" data-id="' + esc(filed.id) + '">View ticket</button>';
    }
    if (!ticketEligible(job)) return "";
    var cls = primary ? "btn btn-primary btn-full" : "btn btn-secondary btn-full";
    return '<button type="button" class="' + cls + '" style="margin-top:8px" data-action="createTicket" data-id="' + esc(job.id) + '">Start ticket</button>';
  }

  function renderTicketPeek() {
    var list = ticketsAwaiting();
    if (!list.length) return "";
    return (
      sectionHead("Signed tickets", "All", "goTickets") +
      '<div class="card mb-14">' + list.slice(0, 3).map(ticketRow).join("") + "</div>"
    );
  }

  function threadPreview(job) {
    var last = job.messages && job.messages.length ? job.messages[job.messages.length - 1] : null;
    if (!last) return "No messages yet";
    if (last.kind === "command") return "Command · " + last.text;
    if (last.from === "system" || last.kind === "system") return last.text;
    var who = last.from === "driver" ? firstName(job.driverName) : "Dispatch";
    return who + ": " + last.text;
  }

  function commandQueueJobs() {
    return session.dispatches.filter(function (j) {
      return (j.unreadDispatch || 0) > 0 || unfinishedCommands(j).length > 0;
    });
  }

  function renderCommandQueue() {
    var list = commandQueueJobs();
    if (!list.length) return "";
    return (
      sectionHead("Commands", "Inbox", "goMessages") +
      '<div class="card mb-14">' +
      list.slice(0, 4).map(function (j) {
        var open = unfinishedCommands(j);
        var waiting = open.filter(function (m) { return m.status === "sent"; }).length;
        var meta = waiting ? plural(waiting, "command") + " waiting on a copy" : plural(open.length, "command") + " copied";
        if ((j.unreadDispatch || 0) > 0 && !waiting) meta = "Driver replied";
        return (
          '<button type="button" class="list-row" data-action="openThread" data-id="' + esc(j.id) + '">' +
            ((j.unreadDispatch || 0) > 0 ? '<span class="unread-pip"></span>' : '<span class="mark" style="color:var(--blue)">' + I.message(true) + "</span>") +
            '<span class="main">' +
              '<span class="top"><span class="name">' + esc(j.loadReference) + " · " + esc(firstName(j.driverName)) + "</span></span>" +
              '<span class="line">' + esc(meta) + "</span>" +
            "</span>" +
            '<span class="chev">' + I.chev + "</span>" +
          "</button>"
        );
      }).join("") +
      "</div>"
    );
  }

  function renderActivity(limit) {
    var list = (session.activity || []).slice(0, limit || 6);
    if (!list.length) return emptyState("Nothing yet", "The day starts when you dispatch a load.");
    return (
      '<div class="card">' +
      list.map(function (a) {
        return (
          '<div class="list-row">' +
            '<span class="main">' +
              '<span class="top"><span class="activity-copy">' + esc(a.text) + '</span><span class="status">' + esc(a.at) + "</span></span>" +
            "</span>" +
          "</div>"
        );
      }).join("") +
      "</div>"
    );
  }

  function attnRow(action, title, sub, tone) {
    return (
      '<button type="button" class="list-row" data-action="' + esc(action) + '">' +
        '<span class="attn-dot attn-' + esc(tone) + '"></span>' +
        '<span class="main"><span class="name">' + esc(title) + '</span><span class="line">' + esc(sub) + "</span></span>" +
        '<span class="chev">' + I.chev + "</span>" +
      "</button>"
    );
  }

  function renderLoadsList() {
    var list = filteredLoads();
    var canDispatch = session.role === "dispatcher" || session.role === "owner";
    return (
      '<div class="fab-row">' +
        hdr("Loads", list.length + " in this filter") +
        (canDispatch
          ? '<button type="button" class="btn btn-primary btn-new" data-action="newDispatch">' + I.plus + " Dispatch</button>"
          : "") +
      "</div>" +
      segFilters() +
      (list.length
        ? '<div class="card">' + list.map(function (j) { return loadCard(j); }).join("") + "</div>"
        : emptyState(nav.filter === "all" ? "No loads yet" : "No loads", nav.filter === "all" ? "Dispatch one and it shows up here." : "Nothing in this filter"))
    );
  }

  function renderDriversTab() {
    var list = drivers();
    return (
      hdr("Drivers", list.length + " on the roster") +
      driverRail(list) +
      '<div class="card mt-14">' +
      list.map(function (d) {
        var duty = d.dutyStatus || "available";
        var dutyLabel = duty === "onLoad" ? "On load" : duty === "offDuty" ? "Off duty" : "Available";
        return (
          '<button type="button" class="list-row" data-action="openDriver" data-id="' + esc(d.id) + '">' +
            '<span class="team-avatar role-driver">' + esc(initials(d.name)) + "</span>" +
            '<span class="main">' +
              '<span class="top"><span class="name">' + esc(d.name) + '</span><span class="status">' + esc(dutyLabel) + "</span></span>" +
              '<span class="line">#' + esc(String(d.driverNumber || "—")) + " · " + esc(d.locationLabel || "Yard") + "</span>" +
            "</span>" +
            '<span class="chev">' + I.chev + "</span>" +
          "</button>"
        );
      }).join("") +
      "</div>"
    );
  }

  function renderOwnerHome() {
    var billed = sumRate(ticketsBilled());
    var due = sumRate(ticketsAwaiting());
    var road = sumRate(roadLoads());
    var openCmds = companyOpenCommands();
    var avail = drivers().filter(function (d) { return d.dutyStatus === "available"; });
    var rows = [];
    if (pendingJobs().length) rows.push(attnRow("goLoads", plural(pendingJobs().length, "load") + " waiting on a driver", "Open loads to follow the offer", "warn"));
    if (ticketsAwaiting().length) rows.push(attnRow("goMoney", plural(ticketsAwaiting().length, "ticket") + " ready to bill", money(due) + " sitting with office", "money"));
    if (writeUpsOos().length) rows.push(attnRow("goShop", plural(writeUpsOos().length, "unit") + " out of service", "Shop needs a look", "hot"));
    if (openCmds) rows.push(attnRow("goMessages", plural(openCmds, "command") + " still open", "Waiting on a copy or a done", "msg"));
    var unticketed = deliveredUnticketed();
    if (unticketed.length) rows.push(attnRow("goLoads", plural(unticketed.length, "delivery") + " with no ticket", "Driver still needs to submit", "warn"));

    return (
      '<div class="fab-row">' +
        hdr("Today", "The whole company") +
        '<button type="button" class="btn btn-primary btn-new" data-action="newDispatch">' + I.plus + " Dispatch</button>" +
      "</div>" +
      kpiStrip([
        { value: money(billed), label: "Billed" },
        { value: money(due), label: "To invoice" },
        { value: money(road), label: "On the road" }
      ], "kpi-3") +
      kpiStrip([
        { value: String(movingJobs().length), label: "Moving" },
        { value: String(avail.length), label: "Open" },
        { value: String(writeUpsOos().length), label: "OOS" },
        { value: String(openCmds), label: "Commands" }
      ], "kpi-4") +
      mapPanel() +
      (rows.length
        ? sectionHead("Needs you") + '<div class="card mb-14">' + rows.join("") + "</div>"
        : emptyState("Company is clear", "Dispatch a load and the board fills in.")) +
      sectionHead("Fleet") +
      driverRail(drivers()) +
      sectionHead("Today") +
      renderActivity(6)
    );
  }

  function renderMoney() {
    var awaiting = ticketsAwaiting();
    var billed = ticketsBilled();
    var road = roadLoads();
    var missing = deliveredUnticketed();
    return (
      hdr("Money", "Billed, ready to invoice, and still moving") +
      kpiStrip([
        { value: money(sumRate(billed)), label: "Billed" },
        { value: money(sumRate(awaiting)), label: "To invoice" },
        { value: money(sumRate(road)), label: "On the road" }
      ], "kpi-3") +
      (missing.length
        ? '<div class="alert-banner alert-warn">' + I.alert +
            '<span class="alert-copy"><strong>' + missing.length + "</strong> delivered with no ticket yet</span></div>"
        : "") +
      sectionHead("Awaiting bill") +
      (awaiting.length
        ? '<div class="card mb-14">' + awaiting.map(ticketRow).join("") + "</div>"
        : emptyState("Nothing to bill", "Tickets show up after a driver delivers.")) +
      sectionHead("On the road") +
      (road.length
        ? '<div class="card mb-14">' + road.map(function (j) { return loadCard(j); }).join("") + "</div>"
        : emptyState("No live freight", "Open loads appear here with their rate.")) +
      sectionHead("Billed") +
      (billed.length
        ? '<div class="card">' + billed.map(ticketRow).join("") + "</div>"
        : emptyState("No billed tickets yet"))
    );
  }

  function ticketRow(t) {
    return (
      '<button type="button" class="list-row" data-action="openTicket" data-id="' + esc(t.id) + '">' +
        '<span class="main">' +
          '<span class="top"><span class="name">#' + esc(t.number) + '</span><span class="status">' + money(t.rateAmount) + "</span></span>" +
          '<span class="line">' + esc(t.customerName) + " · " + esc(t.driverName) + " · " + esc(t.status === "billed" ? "Billed" : "Signed") + "</span>" +
        "</span>" +
      "</button>"
    );
  }

  function renderMore() {
    return (
      hdr("More", "Shop, people, and settings") +
      '<div class="card">' +
        '<button type="button" class="row" data-action="goShop"><span class="ico-blue">' + I.wrench(true) + '</span><span class="body"><span class="t">Shop</span><span class="s">' + esc(String(writeUpsOpen().length)) + " open write-ups</span></span><span class=\"chev\">" + I.chev + "</span></button>" +
        '<button type="button" class="row" data-action="goDrivers"><span class="ico-blue">' + I.wheel + '</span><span class="body"><span class="t">Drivers</span><span class="s">Taylor and Morgan</span></span><span class="chev">' + I.chev + "</span></button>" +
        '<button type="button" class="row" data-action="goTeam"><span class="ico-blue">' + I.people(true) + '</span><span class="body"><span class="t">Team</span><span class="s">Owner, dispatch, office, shop, two drivers</span></span><span class="chev">' + I.chev + "</span></button>" +
        '<button type="button" class="row" data-action="goSettings"><span class="ico-blue">' + I.gear(true) + '</span><span class="body"><span class="t">Settings</span><span class="s">Company and reset</span></span><span class="chev">' + I.chev + "</span></button>" +
      "</div>"
    );
  }

  function renderOfficeHome() {
    var awaiting = ticketsAwaiting();
    return (
      hdr("Office", "Ticket queue") +
      kpiStrip([
        { value: String(awaiting.length), label: "Awaiting" },
        { value: String(ticketsBilled().length), label: "Billed" },
        { value: money(awaiting.reduce(function (s, t) { return s + (t.rateAmount || 0); }, 0)), label: "To invoice" }
      ]) +
      sectionHead("Needs billing", awaiting.length ? "All tickets" : null, "goTickets") +
      (awaiting.length
        ? '<div class="card">' + awaiting.map(function (t) {
            return (
              '<button type="button" class="list-row" data-action="openTicket" data-id="' + esc(t.id) + '">' +
                '<span class="mark" style="color:var(--orange)">' + I.doc(true) + "</span>" +
                '<span class="main">' +
                  '<span class="top"><span class="name">#' + esc(t.number) + '</span><span class="status">' + money(t.rateAmount) + "</span></span>" +
                  '<span class="line strong">' + esc(t.customerName) + "</span>" +
                  '<span class="line">' + esc(t.driverName) + " · " + esc(t.loadReference) + "</span>" +
                "</span>" +
              "</button>"
            );
          }).join("") + "</div>"
        : emptyState("All clear", "No tickets waiting to bill"))
    );
  }

  function renderMechanicHome() {
    var queue = writeUpsOpen().slice().sort(function (a, b) {
      var rank = { outOfService: 0, high: 1, medium: 2, low: 3 };
      return (rank[a.priority] != null ? rank[a.priority] : 9) - (rank[b.priority] != null ? rank[b.priority] : 9);
    });
    return (
      hdr("Shop floor", "Write-ups by priority") +
      kpiStrip([
        { value: String(writeUpsNotStarted().length), label: "Open" },
        { value: String(writeUpsInProgress().length), label: "Working" },
        { value: String(writeUpsOos().length), label: "OOS" },
        { value: String(writeUpsResolved().filter(function (w) { return w.status === "fixed"; }).length), label: "Fixed" }
      ], "kpi-4") +
      oosBanner() +
      sectionHead("Needs shop", "Full board", "goShop") +
      (queue.length
        ? '<div class="card mb-14">' + queue.slice(0, 5).map(writeUpCard).join("") + "</div>"
        : '<div class="card pad mb-14">' + emptyState("Shop clear", "No open write-ups") + "</div>")
    );
  }

  function nextCheckStatus(current) {
    var i = CHECK_FLOW.indexOf(current);
    if (i < 0 || i >= CHECK_FLOW.length - 1) return null;
    return CHECK_FLOW[i + 1];
  }

  function renderDriverHome() {
    var me = currentDriver();
    var pending = myPending();
    var active = myActive();
    var html = hdr(me ? me.name : "Driver", me ? "#" + me.driverNumber + " · " + (me.locationLabel || "Yard") : "");
    html +=
      '<div class="who-scroll">' +
      drivers().map(function (d) {
        var on = me && d.username === me.username;
        return '<button type="button" class="who-chip' + (on ? " is-active" : "") + '" data-action="switchDriver" data-user="' + esc(d.username) + '">' + esc(firstName(d.name)) + "</button>";
      }).join("") +
      "</div>";

    if (pending.length) {
      html += sectionHead("Offer");
      pending.forEach(function (job) {
        html +=
          '<div class="card pad outline-orange mb-14">' +
            statusPill(job.status) +
            '<div class="load-ref" style="font-size:18px;font-weight:700;margin:8px 0 4px">' + esc(job.loadReference) + "</div>" +
            '<div class="offer-cust">' + esc(job.customerName) + "</div>" +
            '<div class="load-route">' + esc(job.origin) + " → " + esc(job.destination) + "</div>" +
            '<div class="load-meta" style="margin-bottom:12px">' + esc(job.commodity) + " · " + money(job.rateAmount) + "</div>" +
            '<div class="btn-row">' +
              '<button type="button" class="btn btn-secondary" data-action="declineJob" data-id="' + esc(job.id) + '">Decline</button>' +
              '<button type="button" class="btn btn-primary" data-action="acceptJob" data-id="' + esc(job.id) + '">Accept</button>' +
            "</div>" +
          "</div>";
      });
    }

    if (active) {
      var next = nextCheckStatus(active.status);
      html += sectionHead("Active load");
      html +=
        '<div class="card pad mb-14">' +
          statusPill(active.status) +
          '<div class="load-ref" style="font-size:18px;font-weight:700;margin:8px 0 4px">' + esc(active.loadReference) + "</div>" +
          '<div class="load-route">' + esc(active.origin) + " → " + esc(active.destination) + "</div>" +
          '<div class="load-meta">ETA ' + esc(active.etaLabel || "—") + " · " + esc(active.equipmentUnit) + "</div>" +
          '<div style="height:10px"></div>' +
          timeline(active);
      if (next) {
        html +=
          '<div class="check-grid">' +
            '<button type="button" class="btn btn-primary btn-full" data-action="checkCall" data-id="' + esc(active.id) + '" data-next="' + esc(next) + '">' +
              esc(CHECK_LABELS[next] || "Update status") +
            "</button>" +
          "</div>";
      }
      html += ticketButtonHtml(active, !next);
      html +=
        '<button type="button" class="btn btn-secondary btn-full" style="margin-top:8px" data-action="openThread" data-id="' + esc(active.id) + '">Message dispatch</button>' +
        "</div>";
    }

    var needsTicket = myDispatches().filter(function (j) {
      return ticketEligible(j) && !isMoving(j.status) && !ticketForLoad(j.loadReference);
    });
    if (needsTicket.length) {
      html += sectionHead("Needs a ticket");
      needsTicket.forEach(function (job) {
        html +=
          '<div class="card pad mb-14">' +
            '<div class="load-ref" style="font-weight:700">' + esc(job.loadReference) + "</div>" +
            '<div class="load-route">' + esc(job.origin) + " → " + esc(job.destination) + "</div>" +
            ticketButtonHtml(job, true) +
          "</div>";
      });
    }

    var filed = myTickets();
    if (filed.length) {
      html += sectionHead("My tickets");
      html += '<div class="card mb-14">' + filed.map(ticketRow).join("") + "</div>";
    }

    if (!pending.length && !active && !needsTicket.length && !filed.length) {
      html += emptyState("You're clear", "Offers from dispatch land here.");
    }

    html +=
      '<button type="button" class="btn btn-secondary btn-full" data-action="reportIssue">' + I.wrench(false) + " Report a unit issue</button>";

    return html;
  }

  function renderDriverJobs() {
    var list = myDispatches();
    return (
      hdr("My jobs", "Offers, active, and history") +
      (list.length
        ? '<div class="card">' + list.map(function (j) { return loadCard(j); }).join("") + "</div>"
        : emptyState("No jobs yet"))
    );
  }

  function threadsForRole() {
    var list = session.role === "driver" ? myDispatches() : session.dispatches.slice();
    return list.filter(function (j) {
      return (j.messages && j.messages.length) || isMoving(j.status) || j.status === "sent";
    }).sort(function (a, b) {
      return unreadForViewer(b) - unreadForViewer(a);
    });
  }

  function renderMessagesList() {
    var threads = threadsForRole();
    var sub = session.role === "driver" ? "Commands from dispatch" : "Commands and driver replies";
    return (
      hdr("Messages", sub) +
      (threads.length
        ? '<div class="card">' +
          threads.map(function (j) {
            var unread = unreadForViewer(j);
            var open = unfinishedCommands(j);
            var waiting = open.filter(function (m) { return m.status === "sent"; }).length;
            var meta = waiting ? plural(waiting, "command") + " waiting" : threadPreview(j);
            return (
              '<button type="button" class="list-row" data-action="openThread" data-id="' + esc(j.id) + '">' +
                (unread ? '<span class="unread-pip"></span>' : '<span class="mark" style="color:var(--blue)">' + I.message(true) + "</span>") +
                '<span class="main">' +
                  '<span class="top"><span class="name">' + esc(j.loadReference) + " · " + esc(firstName(j.driverName)) + '</span><span class="chev">' + I.chev + "</span></span>" +
                  '<span class="line">' + esc(meta) + "</span>" +
                "</span>" +
              "</button>"
            );
          }).join("") +
          "</div>"
        : emptyState("No threads yet", session.role === "driver" ? "A command shows up after dispatch sends you a load." : "Dispatch a load, then send a command from the load."))
    );
  }

  function renderMessage(m) {
    if (!m.id) m.id = uid();
    if (m.from === "system" || m.kind === "system") {
      return '<div class="msg-system">' + esc(m.text) + (m.at ? " · " + esc(m.at) : "") + "</div>";
    }
    var mine = session.role === "driver" ? m.from === "driver" : m.from === "dispatch";
    var kicker = "";
    if (m.kind === "command") {
      kicker = '<span class="cmd-kicker">Command · ' + esc(commandStatusLabel(m.status)) + "</span>";
    }
    var who = m.byName ? firstName(m.byName) + " · " : "";
    return (
      '<div class="msg ' + (mine ? "me" : "them") + (m.kind === "command" ? " is-command" : "") + '">' +
        kicker +
        '<span class="msg-text">' + esc(m.text) + "</span>" +
        '<span class="when">' + esc(who + (m.at || "")) + "</span>" +
      "</div>"
    );
  }

  function renderThread(id) {
    var job = findDispatch(id);
    if (!job) return emptyState("Thread not found");
    var msgs = job.messages || [];
    var open = unfinishedCommands(job);
    var html =
      '<div class="card pad mb-14">' +
        '<div class="load-ref" style="font-weight:760">' + esc(job.loadReference) + " · " + esc(job.driverName) + "</div>" +
        '<div class="thread-sub">' + esc(job.origin) + " → " + esc(job.destination) + "</div>" +
        (open.length ? '<div class="thread-sub">' + esc(plural(open.length, "open command")) + "</div>" : "") +
      "</div>" +
      '<div class="msg-thread">';
    if (!msgs.length) {
      html += '<div class="msg-system">No messages yet. Send a command and the driver copies it here.</div>';
    } else {
      msgs.forEach(function (m) { html += renderMessage(m); });
    }
    html += "</div>";
    return html;
  }

  function renderComposer(job) {
    var banner = "";
    var open = latestUnfinished(job);
    if (session.role === "driver" && open && currentDriver() && job.driverUsername === currentDriver().username) {
      var extra = unfinishedCommands(job).length - 1;
      banner =
        '<div class="cmd-banner">' +
          '<div class="cmd-banner-kicker">Command · ' + esc(commandStatusLabel(open.status)) + "</div>" +
          '<div class="cmd-banner-text">' + esc(open.text) + "</div>" +
          (extra > 0 ? '<div class="cmd-banner-more">' + extra + " earlier command" + (extra === 1 ? "" : "s") + " still open</div>" : "") +
          '<div class="btn-row">' +
            (open.status === "sent"
              ? '<button type="button" class="btn btn-primary" data-action="ackCommand" data-id="' + esc(job.id) + '" data-mid="' + esc(open.id) + '" data-status="copied">Copy</button>'
              : "") +
            '<button type="button" class="btn btn-secondary" data-action="ackCommand" data-id="' + esc(job.id) + '" data-mid="' + esc(open.id) + '" data-status="done">Mark done</button>' +
          "</div>" +
        "</div>";
    }
    var chips = "";
    var placeholder = "Write a message";
    if (session.role === "driver") {
      placeholder = "Reply to dispatch";
      chips = DRIVER_REPLIES.map(function (r) {
        return '<button type="button" class="chip-btn" data-action="sendReply" data-id="' + esc(job.id) + '" data-text="' + esc(r.text) + '">' + esc(r.label) + "</button>";
      }).join("");
    } else if (isDispatchRole()) {
      placeholder = "Custom command";
      chips = DISPATCH_COMMANDS.map(function (c) {
        return '<button type="button" class="chip-btn" data-action="sendCommand" data-id="' + esc(job.id) + '" data-cmd="' + esc(c.id) + '" data-text="' + esc(c.text) + '">' + esc(c.label) + "</button>";
      }).join("");
    } else {
      return "";
    }
    return (
      banner +
      '<div class="composer">' +
        '<div class="canned">' + chips + "</div>" +
        '<div class="compose-row">' +
          '<input id="compose-text" class="compose-input" data-id="' + esc(job.id) + '" placeholder="' + esc(placeholder) + '" autocomplete="off" />' +
          '<button type="button" class="btn btn-primary compose-send" data-action="sendCompose" data-id="' + esc(job.id) + '">Send</button>' +
        "</div>" +
      "</div>"
    );
  }

  function renderTickets() {
    var awaiting = ticketsAwaiting();
    var billed = ticketsBilled();
    var sub = session.role === "dispatcher" ? "Signed tickets from drivers" : "Billing queue";
    return (
      hdr("Tickets", sub) +
      sectionHead("Awaiting bill") +
      (awaiting.length
        ? '<div class="card mb-14">' + awaiting.map(function (t) {
            return (
              '<button type="button" class="list-row" data-action="openTicket" data-id="' + esc(t.id) + '">' +
                '<span class="main">' +
                  '<span class="top"><span class="name">#' + esc(t.number) + '</span><span class="status">' + money(t.rateAmount) + "</span></span>" +
                  '<span class="line">' + esc(t.customerName) + " · " + esc(t.driverName) + "</span>" +
                "</span>" +
              "</button>"
            );
          }).join("") + "</div>"
        : emptyState("None waiting")) +
      sectionHead("Billed") +
      (billed.length
        ? '<div class="card">' + billed.map(function (t) {
            return (
              '<button type="button" class="list-row" data-action="openTicket" data-id="' + esc(t.id) + '">' +
                '<span class="main">' +
                  '<span class="top"><span class="name">#' + esc(t.number) + '</span><span class="status">Billed</span></span>' +
                  '<span class="line">' + esc(t.customerName) + " · " + money(t.rateAmount) + "</span>" +
                "</span>" +
              "</button>"
            );
          }).join("") + "</div>"
        : emptyState("No billed tickets yet"))
    );
  }

  function renderShop() {
    var active = writeUpsOpen().slice().sort(function (a, b) {
      var rank = { outOfService: 0, high: 1, medium: 2, low: 3 };
      return (rank[a.priority] != null ? rank[a.priority] : 9) - (rank[b.priority] != null ? rank[b.priority] : 9);
    });
    var resolved = writeUpsResolved();
    return (
      hdr("Shop board", "Equipment write-ups") +
      oosBanner() +
      sectionHead("Active · " + active.length) +
      '<div class="card mb-14">' +
        (active.length ? active.map(writeUpCard).join("") : '<div class="pad">' + emptyState("Shop clear", "Nothing in the queue") + "</div>") +
      "</div>" +
      sectionHead("Resolved · " + resolved.length) +
      '<div class="card">' +
        (resolved.length ? resolved.map(writeUpCard).join("") : '<div class="pad">' + emptyState("None yet") + "</div>") +
      "</div>"
    );
  }

  function renderTeam() {
    if (!canManageUsers()) return emptyState("Not allowed", "Team management is owner-only unless delegated");
    var members = session.teamMembers;
    return (
      hdr("Team", "Owner, dispatcher, office, mechanic, two drivers") +
      '<button type="button" class="btn btn-primary btn-full mb-14" data-action="addUser">' + I.plus + " Add user</button>" +
      '<div class="card">' +
      members.map(function (m) {
        var canRemove = !m.core;
        return (
          '<div class="list-row">' +
            '<span class="team-avatar">' + esc(initials(m.name)) + "</span>" +
            '<span class="main">' +
              '<span class="top"><span class="name">' + esc(m.name) + '</span><span class="status">' + esc(roleTitle(m.role)) + "</span></span>" +
              '<span class="line">@' + esc(m.username) + (m.driverNumber ? " · #" + m.driverNumber : "") + "</span>" +
            "</span>" +
            (canRemove
              ? '<button type="button" class="btn btn-danger" style="flex:0;padding:8px 10px;width:auto" data-action="removeUser" data-id="' + esc(m.id) + '">Remove</button>'
              : "") +
          "</div>"
        );
      }).join("") +
      "</div>"
    );
  }

  function renderSettings() {
    var showDelegate = session.role === "owner";
    var showTeamLink = canManageUsers();
    return (
      hdr("Settings", "Demo controls") +
      '<div class="card mb-14">' +
        '<div class="field-row"><span class="k">Company</span><span class="v">' + esc(session.companyName) + "</span></div>" +
        '<div class="field-row"><span class="k">Signed in as</span><span class="v">' + esc(actorName()) + "</span></div>" +
        '<div class="field-row"><span class="k">Role</span><span class="v">' + esc(roleTitle(session.role)) + "</span></div>" +
        '<div class="field-row"><span class="k">App</span><span class="v">FleetDispatch</span></div>' +
      "</div>" +
      (showTeamLink
        ? '<div class="card mb-14">' +
            '<button type="button" class="row" data-action="goTeam"><span class="ico-blue">' + I.people(true) + '</span><span class="body"><span class="t">Manage team</span><span class="s">Add or remove users</span></span><span class="chev">' + I.chev + "</span></button>" +
          "</div>"
        : "") +
      (showDelegate
        ? '<div class="card mb-14">' +
            '<div class="field-row">' +
              '<span class="k">Delegate team mgmt to dispatcher</span>' +
              '<button type="button" class="toggle' + (session.delegateUserManagementToDispatcher ? " is-on" : "") + '" data-action="toggleDelegate" aria-label="Toggle delegation"></button>' +
            "</div>" +
          "</div>"
        : "") +
      '<p class="group-footer">Reset clears loads, tickets, commands, and shop notes. The crew stays: one owner, one dispatcher, one office, one mechanic, and two drivers.</p>' +
      '<button type="button" class="btn btn-danger" data-action="reset">Reset demo</button>'
    );
  }

  function renderDriverDetail(id) {
    var person = findById(session.teamMembers, id);
    if (!person || person.role !== "driver") return emptyState("Driver not found");
    var duty = person.dutyStatus || "available";
    var dutyLabel = duty === "onLoad" ? "On load" : duty === "offDuty" ? "Off duty" : "Available";
    var jobs = session.dispatches.filter(function (j) { return j.driverUsername === person.username; });
    var active = null;
    var i;
    for (i = 0; i < jobs.length; i++) {
      if (isMoving(jobs[i].status) || jobs[i].status === "sent") { active = jobs[i]; break; }
    }
    return (
      hdr(person.name, "#" + person.driverNumber + " · " + dutyLabel) +
      '<div class="card mb-14">' +
        '<div class="field-row"><span class="k">Where</span><span class="v">' + esc(person.locationLabel || "Yard") + "</span></div>" +
        '<div class="field-row"><span class="k">Status</span><span class="v">' + esc(dutyLabel) + "</span></div>" +
      "</div>" +
      (active && isDispatchRole()
        ? '<button type="button" class="btn btn-primary btn-full mb-14" data-action="openThread" data-id="' + esc(active.id) + '">Send command</button>'
        : "") +
      sectionHead("Loads") +
      (jobs.length
        ? '<div class="card">' + jobs.map(function (j) { return loadCard(j); }).join("") + "</div>"
        : emptyState("No loads yet", "Dispatch one to " + firstName(person.name) + "."))
    );
  }

  function miniMap(job) {
    var ox = Number(job.ox) || 30;
    var oy = Number(job.oy) || 30;
    var dx = Number(job.dx) || 70;
    var dy = Number(job.dy) || 70;
    return (
      '<div class="map-panel map-snippet">' +
        '<svg class="map-svg" viewBox="0 0 100 48" preserveAspectRatio="xMidYMid slice">' +
          '<rect width="100" height="48" fill="#e8eef5"/>' +
          '<path d="M5 24 H95" stroke="#c5ced8" stroke-width="1.2"/>' +
          '<path d="M50 4 V44" stroke="#d0d7e0" stroke-width="1"/>' +
          '<line x1="' + ox + '" y1="' + oy * 0.68 + '" x2="' + dx + '" y2="' + dy * 0.68 + '" stroke="#007aff" stroke-width="1.5" stroke-dasharray="2 2"/>' +
          '<circle cx="' + ox + '" cy="' + (oy * 0.68) + '" r="3.5" fill="#34c759" stroke="#fff" stroke-width="1"/>' +
          '<circle cx="' + dx + '" cy="' + (dy * 0.68) + '" r="3.5" fill="#ff3b30" stroke="#fff" stroke-width="1"/>' +
        "</svg>" +
      "</div>"
    );
  }

  function renderLoadDetail(id) {
    var job = findDispatch(id);
    if (!job) return emptyState("Load not found");
    var html =
      '<div class="card pad load-hero">' +
        '<div class="load-card-top" style="margin-bottom:10px">' +
          '<span class="load-ref">' + esc(job.loadReference) + "</span>" +
          statusPill(job.status) +
        "</div>" +
        '<div style="font-size:13px;font-weight:650;color:var(--secondary);margin-bottom:10px">' + esc(job.customerName) + "</div>" +
        laneBlock(job) +
        '<div class="load-meta" style="margin-top:12px">' +
          "<span>" + esc(job.origin) + "</span>" +
          "<span>→</span>" +
          "<span>" + esc(job.destination) + "</span>" +
        "</div>" +
      "</div>" +
      '<div class="detail-grid">' +
        '<div><span class="k">Commodity</span><span class="v">' + esc(job.commodity || "—") + "</span></div>" +
        '<div><span class="k">Miles</span><span class="v">' + esc(String(job.miles || "—")) + "</span></div>" +
        '<div><span class="k">Rate</span><span class="v">' + money(job.rateAmount) + "</span></div>" +
        '<div><span class="k">ETA</span><span class="v">' + esc(job.etaLabel || "—") + "</span></div>" +
        '<div><span class="k">Pickup</span><span class="v">' + esc(job.pickupAppt || "—") + "</span></div>" +
        '<div><span class="k">Delivery</span><span class="v">' + esc(job.deliveryAppt || "—") + "</span></div>" +
        '<div><span class="k">Driver</span><span class="v">' + esc(job.driverName || "—") + "</span></div>" +
        '<div><span class="k">Unit</span><span class="v">' + esc(job.equipmentUnit || "—") + "</span></div>" +
      "</div>" +
      sectionHead("Status") +
      '<div class="card pad mb-14">' + timeline(job) + "</div>";

    if (job.notes) {
      html += '<div class="card pad mb-14"><div class="s" style="color:var(--secondary);font-size:12px;margin-bottom:4px">Notes</div>' + esc(job.notes) + "</div>";
    }

    if (session.role === "driver") {
      var mine = currentDriver() && job.driverUsername === currentDriver().username;
      if (mine && job.status === "sent") {
        html +=
          '<div class="btn-row mb-14">' +
            '<button type="button" class="btn btn-secondary" data-action="declineJob" data-id="' + esc(job.id) + '">Decline</button>' +
            '<button type="button" class="btn btn-primary" data-action="acceptJob" data-id="' + esc(job.id) + '">Accept</button>' +
          "</div>";
      }
      if (mine && isMoving(job.status)) {
        var next = nextCheckStatus(job.status);
        if (next) {
          html +=
            '<button type="button" class="btn btn-primary btn-full mb-8" data-action="checkCall" data-id="' + esc(job.id) + '" data-next="' + esc(next) + '">' +
              esc(CHECK_LABELS[next] || "Check call") +
            "</button>";
        }
        html += '<button type="button" class="btn btn-secondary btn-full mb-8" data-action="openThread" data-id="' + esc(job.id) + '">Messages</button>';
      }
      if (mine) html += ticketButtonHtml(job, true);
    }

    var filedLoad = ticketForLoad(job.loadReference);
    if (filedLoad && (session.role === "dispatcher" || session.role === "owner" || session.role === "office")) {
      html += '<button type="button" class="btn btn-secondary btn-full mb-8" data-action="openTicket" data-id="' + esc(filedLoad.id) + '">View ticket</button>';
    }

    if (session.role === "dispatcher" || session.role === "owner") {
      html +=
        '<div class="action-stack">' +
          '<button type="button" class="btn btn-primary btn-full" data-action="openThread" data-id="' + esc(job.id) + '">Send command</button>' +
          (job.status !== "completed"
            ? '<button type="button" class="btn btn-secondary btn-full" data-action="reassign" data-id="' + esc(job.id) + '">' +
                (job.status === "declined" ? "Offer to another driver" : "Reassign driver") +
              "</button>"
            : "") +
        "</div>";
    }

    return html;
  }

  function ticketField(label, value) {
    return '<div class="field-row"><span class="k">' + esc(label) + '</span><span class="v">' + esc(value || "—") + "</span></div>";
  }

  function renderTicketDetail(id) {
    var t = findById(session.tickets, id);
    if (!t || !canViewTicket(t)) return emptyState("Ticket not found");
    var canBill = (session.role === "office" || session.role === "owner") && t.status === "submitted";
    var signedLine = t.signature
      ? '<div class="sign-block"><img src="' + t.signature + '" alt="Electronic signature" /><div class="sign-caption">Electronically signed by ' + esc(t.signedBy || t.driverName) + (t.signedAt ? " · " + esc(t.signedAt) : "") + "</div></div>"
      : "";
    return (
      '<div class="pdf-ticket">' +
        '<div class="pdf-ticket-banner">' +
          '<div class="co">' + esc(session.companyName) + "</div>" +
          '<div class="doc-type">Freight ticket</div>' +
          '<div class="doc-sub">#' + esc(t.number) + " · " + esc(t.status === "billed" ? "BILLED" : "SIGNED") + "</div>" +
        "</div>" +
        '<div class="pdf-ticket-body">' +
          signedLine +
          ticketField("Customer", t.customerName) +
          ticketField("Load", t.loadReference) +
          ticketField("Commodity", t.commodity) +
          ticketField("Origin", t.origin) +
          ticketField("Destination", t.destination) +
          ticketField("Driver", t.driverName) +
          ticketField("Unit", t.equipmentUnit) +
          ticketField("Miles", t.miles ? String(t.miles) : "") +
          ticketField("Weight", t.weight && /[a-z]/i.test(t.weight) ? t.weight : (t.weight ? t.weight + " lbs" : "")) +
          ticketField("Rate", money2(t.rateAmount)) +
          ticketField("Received by", t.receiver) +
          (t.notes ? ticketField("Notes", t.notes) : "") +
        "</div>" +
      "</div>" +
      (session.role === "dispatcher"
        ? '<p class="group-footer">Office and the owner can bill this ticket.</p>'
        : "") +
      (canBill
        ? '<button type="button" class="btn btn-primary btn-full" style="margin-top:14px" data-action="billTicket" data-id="' + esc(t.id) + '">Mark as billed</button>'
        : "")
    );
  }

  function renderWriteUpDetail(id) {
    var w = findById(session.writeUps, id);
    if (!w) return emptyState("Write-up not found");
    var actions = "";
    if (session.role === "mechanic" || session.role === "owner") {
      if (w.status === "open") {
        actions =
          '<div class="action-stack">' +
            '<button type="button" class="btn btn-primary btn-full" data-action="wuStatus" data-id="' + esc(w.id) + '" data-status="inProgress">Start work</button>' +
            '<div class="btn-row">' +
              '<button type="button" class="btn btn-secondary" data-action="wuStatus" data-id="' + esc(w.id) + '" data-status="fixed">Mark fixed</button>' +
              '<button type="button" class="btn btn-danger" data-action="wuStatus" data-id="' + esc(w.id) + '" data-status="cannotRepair">Cannot repair</button>' +
            "</div>" +
          "</div>";
      } else if (w.status === "inProgress") {
        actions =
          '<div class="action-stack">' +
            '<button type="button" class="btn btn-primary btn-full" data-action="wuStatus" data-id="' + esc(w.id) + '" data-status="fixed">Mark fixed</button>' +
            '<button type="button" class="btn btn-secondary btn-full" data-action="wuStatus" data-id="' + esc(w.id) + '" data-status="cannotRepair">Cannot repair</button>' +
          "</div>";
      } else if (w.status === "fixed" || w.status === "cannotRepair") {
        actions =
          '<button type="button" class="btn btn-secondary btn-full" data-action="wuStatus" data-id="' + esc(w.id) + '" data-status="open">Reopen write-up</button>';
      }
    }
    return (
      '<div class="work-order">' +
        '<div class="work-order-kicker">' +
          '<span class="work-order-num">' + esc(w.number) + "</span>" +
          priorityPill(w.priority) +
        "</div>" +
        "<h3>" + esc(w.title) + "</h3>" +
        '<div class="wu-card-meta" style="margin-bottom:10px">' +
          '<span class="wu-unit">' + esc(w.equipmentUnit) + "</span>" +
          writeUpStatusPill(w.status) +
        "</div>" +
        '<div class="desc">' + esc(w.description) + "</div>" +
        '<div class="detail-grid" style="margin:0;padding:0;background:transparent;box-shadow:none">' +
          '<div><span class="k">Driver</span><span class="v">' + esc(w.driverName) + "</span></div>" +
          '<div><span class="k">Reported</span><span class="v">Today</span></div>' +
        "</div>" +
        (w.mechanicNotes
          ? '<div class="work-order-notes"><strong>Shop notes</strong>' + esc(w.mechanicNotes) + "</div>"
          : "") +
      "</div>" +
      actions
    );
  }

  function renderHome() {
    switch (session.role) {
      case "owner": return renderOwnerHome();
      case "office": return renderOfficeHome();
      case "dispatcher": return renderDispatcherBoard();
      case "mechanic": return renderMechanicHome();
      case "driver": return renderDriverHome();
      default: return renderOwnerHome();
    }
  }

  /* —— Sheets —— */
  function renderNewDispatchSheet() {
    var opts = drivers().map(function (d) {
      return '<option value="' + esc(d.username) + '">' + esc(d.name) + (d.dutyStatus === "available" ? " · available" : "") + "</option>";
    }).join("");
    return (
      '<div class="sheet-body">' +
        '<div class="card mb-14">' +
          '<div class="field-row"><span class="k">Load #</span><input id="nd-load" class="field-input" value="' + esc(nextLoadRef()) + '"/></div>' +
          '<div class="field-row"><span class="k">Customer</span><input id="nd-customer" class="field-input" placeholder="Customer name"/></div>' +
          '<div class="field-row"><span class="k">Commodity</span><input id="nd-commodity" class="field-input" placeholder="Commodity"/></div>' +
          '<div class="field-row"><span class="k">Origin</span><input id="nd-origin" class="field-input" placeholder="City, ST"/></div>' +
          '<div class="field-row"><span class="k">Destination</span><input id="nd-dest" class="field-input" placeholder="City, ST"/></div>' +
          '<div class="field-row"><span class="k">Driver</span><select id="nd-driver">' + opts + "</select></div>" +
          '<div class="field-row"><span class="k">Unit</span><input id="nd-unit" class="field-input" placeholder="Unit 12"/></div>' +
          '<div class="field-row"><span class="k">Rate</span><input id="nd-rate" class="field-input" type="number" placeholder="0"/></div>' +
          '<div class="field-row"><span class="k">Miles</span><input id="nd-miles" class="field-input" type="number" placeholder="0"/></div>' +
          '<div class="field-row"><span class="k">Notes</span><input id="nd-notes" class="field-input" placeholder="Optional notes"/></div>' +
        "</div>" +
        '<p class="group-footer">Send pushes this load to the driver’s offer queue.</p>' +
        '<button type="button" class="btn btn-primary btn-full" data-action="sendDispatch">Send dispatch</button>' +
      "</div>"
    );
  }

  function renderAddUserSheet() {
    return (
      '<div class="sheet-body">' +
        '<div class="card mb-14">' +
          '<div class="field-row"><span class="k">Full name</span><input id="au-name" class="field-input" placeholder="Full name"/></div>' +
          '<div class="field-row"><span class="k">Username</span><input id="au-username" class="field-input" placeholder="username"/></div>' +
          '<div class="field-row"><span class="k">Role</span>' +
            '<select id="au-role">' +
              '<option value="driver">Driver</option>' +
              '<option value="dispatcher">Dispatcher</option>' +
              '<option value="office">Office</option>' +
              '<option value="mechanic">Mechanic</option>' +
            "</select>" +
          "</div>" +
        "</div>" +
        '<button type="button" class="btn btn-primary btn-full" data-action="addUserSubmit">Add user</button>' +
      "</div>"
    );
  }

  function renderReassignSheet() {
    var job = findDispatch(nav.detailId);
    if (!job) return emptyState("Load not found");
    var opts = drivers().map(function (d) {
      var mark = d.username === job.driverUsername ? " · current" : (d.dutyStatus === "available" ? " · available" : "");
      return '<option value="' + esc(d.username) + '"' + (d.username === job.driverUsername ? " selected" : "") + ">" + esc(d.name) + mark + "</option>";
    }).join("");
    return (
      '<div class="sheet-body">' +
        '<div class="card mb-14">' +
          '<div class="field-row"><span class="k">Load</span><span class="v">' + esc(job.loadReference) + "</span></div>" +
          '<div class="field-row"><span class="k">Driver</span><select id="ra-driver">' + opts + "</select></div>" +
        "</div>" +
        '<p class="group-footer">The new driver gets this offer. A declined load is sent again.</p>' +
        '<button type="button" class="btn btn-primary btn-full" data-action="reassignSubmit" data-id="' + esc(job.id) + '">Save driver</button>' +
      "</div>"
    );
  }

  function renderWriteUpSheet() {
    var me = currentDriver();
    var unit = me ? driverUnit(me) : "";
    if (unit === "Unit") unit = "";
    return (
      '<div class="sheet-body">' +
        '<div class="card mb-14">' +
          '<div class="field-row"><span class="k">Unit</span><input id="wu-unit" class="field-input" placeholder="Unit 12" value="' + esc(unit) + '"/></div>' +
          '<div class="field-row"><span class="k">Issue</span><input id="wu-title" class="field-input" placeholder="What is wrong"/></div>' +
          '<div class="field-row"><span class="k">Priority</span>' +
            '<select id="wu-priority">' +
              '<option value="low">Low</option>' +
              '<option value="medium" selected>Medium</option>' +
              '<option value="high">High</option>' +
              '<option value="outOfService">Out of service</option>' +
            "</select>" +
          "</div>" +
          '<div class="field-row"><span class="k">Notes</span><input id="wu-notes" class="field-input" placeholder="What you saw"/></div>' +
        "</div>" +
        '<p class="group-footer">This goes straight to the shop board.</p>' +
        '<button type="button" class="btn btn-primary btn-full" data-action="submitWriteUp">Send to shop</button>' +
      "</div>"
    );
  }

  function tkInput(id, label, value, placeholder, type) {
    return (
      '<div class="field-row"><span class="k">' + esc(label) + "</span>" +
        '<input id="' + id + '" class="field-input" type="' + (type || "text") + '" value="' + esc(value || "") + '"' +
        (placeholder ? ' placeholder="' + esc(placeholder) + '"' : "") +
        " /></div>"
    );
  }

  function renderTicketSheet(jobId) {
    var job = findDispatch(jobId);
    if (!job) return emptyState("Load not found");
    var num = nextTicketNumber();
    return (
      '<div class="sheet-body">' +
        '<div class="pdf-ticket">' +
          '<div class="pdf-ticket-banner">' +
            '<div class="co">' + esc(session.companyName) + "</div>" +
            '<div class="doc-type">Freight ticket</div>' +
            '<div class="doc-sub">Draft · #' + esc(num) + "</div>" +
          "</div>" +
          '<div class="pdf-ticket-body">' +
            '<div class="field-row"><span class="k">Load</span><span class="v">' + esc(job.loadReference) + "</span></div>" +
            tkInput("tk-customer", "Customer", job.customerName, "Customer") +
            tkInput("tk-commodity", "Commodity", job.commodity, "Commodity") +
            tkInput("tk-origin", "Origin", job.origin, "City, ST") +
            tkInput("tk-dest", "Destination", job.destination, "City, ST") +
            tkInput("tk-unit", "Unit", job.equipmentUnit, "Unit") +
            tkInput("tk-miles", "Miles", job.miles ? String(job.miles) : "", "0", "number") +
            tkInput("tk-weight", "Weight", "", "lbs") +
            tkInput("tk-rate", "Rate", String(job.rateAmount || 0), "0", "number") +
            tkInput("tk-receiver", "Received by", "", "Name at the dock") +
            tkInput("tk-notes", "Notes", job.notes, "Seal, gate, exceptions") +
            '<div class="sign-label">Driver signature</div>' +
            '<div class="sign-wrap">' +
              '<canvas id="sign-pad" class="sign-pad" aria-label="Sign the ticket"></canvas>' +
              '<div class="sign-hint">Sign with your finger</div>' +
            "</div>" +
            '<div class="sign-tools"><span class="k">Required</span><button type="button" class="sign-clear" data-action="clearSignature">Clear</button></div>' +
          "</div>" +
        "</div>" +
        '<input type="hidden" id="tk-job" value="' + esc(job.id) + '"/>' +
        '<input type="hidden" id="tk-number" value="' + esc(num) + '"/>' +
        '<p class="group-footer">Signing and submitting closes the load. Office, dispatch, and the owner can open the ticket.</p>' +
        '<button type="button" class="btn btn-primary btn-full" data-action="submitTicketSheet">Submit ticket</button>' +
      "</div>"
    );
  }

  /* —— Main render —— */
  function renderTabBar() {
    var bar = document.getElementById("tabbar");
    if (!bar) return;
    if (nav.sheet) {
      bar.style.display = "none";
      return;
    }
    bar.style.display = "flex";
    var tabs = tabsForRole();
    bar.innerHTML = tabs.map(function (t) {
      var active = !nav.sheet && (nav.tab === t.id || (t.id === "more" && session.role === "owner" && ownerSubTab(nav.tab)));
      var iconFn = I[t.icon];
      var icon = typeof iconFn === "function" ? iconFn(active) : (iconFn || I.house(active));
      var badge = badgeForTab(t.id);
      var badgeHtml = badge ? '<i class="tab-badge">' + (badge > 9 ? "9+" : badge) + "</i>" : "";
      return (
        '<button type="button" class="tab' + (active ? " is-active" : "") + '" data-tab="' + esc(t.id) + '" aria-label="' + esc(t.title) + '">' +
          '<span class="tab-ico">' + icon + badgeHtml + "</span><span>" + esc(t.title) + "</span>" +
        "</button>"
      );
    }).join("");
  }

  function badgeForTab(id) {
    if (id === "messages") return unreadTotal();
    if (id === "home" && session.role === "driver") return myPending().length;
    if ((id === "money" && session.role === "owner") || (id === "tickets" && (session.role === "office" || session.role === "dispatcher"))) return ticketsAwaiting().length;
    if (id === "more" && session.role === "owner") return writeUpsOos().length;
    if (id === "shop" && session.role === "mechanic") return writeUpsOos().length;
    return 0;
  }

  function inOwnerHub() {
    return session.role === "owner" && nav.screen === "home" && ownerSubTab(nav.tab);
  }

  function inDispatchTeam() {
    return session.role === "dispatcher" && nav.tab === "team" && nav.screen === "home";
  }

  function inDispatchSettings() {
    return session.role === "dispatcher" && nav.tab === "settings" && nav.screen === "home";
  }

  function renderChips() {
    var el = document.getElementById("role-chips");
    if (!el) return;
    el.innerHTML = ROLES.map(function (r) {
      return (
        '<button type="button" class="role-chip' + (session.role === r.id ? " is-active" : "") + '" data-role="' + esc(r.id) + '">' +
          esc(r.title) +
        "</button>"
      );
    }).join("");
  }

  function renderTopBar() {
    var bar = document.getElementById("top-bar");
    var title = document.getElementById("top-title");
    var back = document.getElementById("nav-back");
    var right = document.getElementById("nav-right");
    if (!bar || !title) return;

    title.textContent = titleForScreen();
    var hasBack = (nav.screen !== "home" && !nav.sheet) || !!nav.sheet || inOwnerHub() || inDispatchTeam() || inDispatchSettings();
    bar.classList.toggle("has-back", hasBack);
    if (back) back.textContent = nav.sheet ? "Cancel" : "Back";

    var rightLabel = "";
    var rightAction = "";
    if (nav.sheet === "newDispatch") {
      rightLabel = "Send";
      rightAction = "sendDispatch";
    } else if (!nav.sheet && nav.screen === "home" && (nav.tab === "board" || nav.tab === "loads") &&
        (session.role === "dispatcher" || session.role === "owner")) {
      rightLabel = "New";
      rightAction = "newDispatch";
    } else if (nav.sheet === "ticket") {
      rightLabel = "Submit";
      rightAction = "submitTicketSheet";
    } else if (nav.sheet === "addUser") {
      rightLabel = "Add";
      rightAction = "addUserSubmit";
    } else if (nav.screen === "ticketDetail") {
      var t = findById(session.tickets, nav.detailId);
      if (t && t.status === "submitted" && (session.role === "office" || session.role === "owner")) {
        rightLabel = "Bill";
        rightAction = "billTicket";
      }
    }

    bar.classList.toggle("has-right", !!rightLabel);
    if (right) {
      right.textContent = rightLabel || "Send";
      right.classList.toggle("is-emphasis", !!rightLabel);
      right.setAttribute("data-action", rightAction || "");
      if (rightAction === "billTicket" && nav.detailId) {
        right.setAttribute("data-id", nav.detailId);
      } else {
        right.removeAttribute("data-id");
      }
    }
  }

  function renderContent() {
    var root = document.getElementById("content");
    if (!root) return;
    var html = "";

    if (nav.screen === "detail") {
      html = renderLoadDetail(nav.detailId);
    } else if (nav.screen === "thread") {
      html = renderThread(nav.detailId);
    } else if (nav.screen === "ticketDetail") {
      html = renderTicketDetail(nav.detailId);
    } else if (nav.screen === "writeupDetail") {
      html = renderWriteUpDetail(nav.detailId);
    } else if (nav.screen === "driverDetail") {
      html = renderDriverDetail(nav.detailId);
    } else {
      switch (nav.tab) {
        case "board": html = renderDispatcherBoard(); break;
        case "loads": html = renderLoadsList(); break;
        case "drivers": html = renderDriversTab(); break;
        case "jobs": html = renderDriverJobs(); break;
        case "messages": html = renderMessagesList(); break;
        case "tickets": html = renderTickets(); break;
        case "money": html = renderMoney(); break;
        case "more": html = renderMore(); break;
        case "shop": html = renderShop(); break;
        case "team": html = renderTeam(); break;
        case "settings": html = renderSettings(); break;
        case "home":
        default:
          html = renderHome();
      }
    }

    root.innerHTML = html;
    if (nav.screen !== "thread") root.scrollTop = 0;
  }

  function renderSheet() {
    var sheet = document.getElementById("sheet");
    if (!sheet) return;
    if (!nav.sheet) {
      sheet.hidden = true;
      sheet.innerHTML = "";
      return;
    }
    sheet.hidden = false;
    if (nav.sheet === "newDispatch") sheet.innerHTML = renderNewDispatchSheet();
    else if (nav.sheet === "ticket") sheet.innerHTML = renderTicketSheet(nav.detailId);
    else if (nav.sheet === "addUser") sheet.innerHTML = renderAddUserSheet();
    else if (nav.sheet === "reassign") sheet.innerHTML = renderReassignSheet();
    else if (nav.sheet === "writeup") sheet.innerHTML = renderWriteUpSheet();
    else sheet.innerHTML = "";
  }

  function renderDock() {
    var dock = document.getElementById("dock");
    var root = document.getElementById("content");
    if (!dock) return;
    var job = nav.screen === "thread" && !nav.sheet ? findDispatch(nav.detailId) : null;
    var canCompose = job && (session.role === "driver" || isDispatchRole());
    if (!canCompose) {
      dock.hidden = true;
      dock.innerHTML = "";
      if (root) root.style.paddingBottom = "";
      return;
    }
    dock.hidden = false;
    dock.innerHTML = renderComposer(job);
    if (root) {
      var desktop = document.documentElement.getAttribute("data-device") === "windows";
      root.style.paddingBottom = desktop ? "" : (dock.offsetHeight + 86) + "px";
      root.scrollTop = root.scrollHeight;
    }
  }

  function renderAll() {
    var app = document.getElementById("app");
    if (app) app.classList.toggle("has-sheet", !!nav.sheet);
    renderChips();
    renderTopBar();
    renderContent();
    renderTabBar();
    renderSheet();
    renderDock();
    if (nav.sheet === "ticket") requestAnimationFrame(function () { bindSignaturePad(0); });
  }

  function bindSignaturePad(tries) {
    var canvas = document.getElementById("sign-pad");
    if (!canvas || canvas.dataset.bound === "1") return;
    if (!canvas.clientWidth) {
      if (tries > 8) return;
      requestAnimationFrame(function () { bindSignaturePad(tries + 1); });
      return;
    }
    canvas.dataset.bound = "1";
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth;
    var h = canvas.clientHeight || 110;
    canvas.width = Math.max(1, Math.floor(w * ratio));
    canvas.height = Math.max(1, Math.floor(h * ratio));
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0e1a2b";
    var drawing = false;
    var last = { x: 0, y: 0 };

    function point(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function markSigned() {
      canvas.dataset.signed = "1";
      var hint = canvas.parentNode ? canvas.parentNode.querySelector(".sign-hint") : null;
      if (hint) hint.hidden = true;
    }

    canvas.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drawing = true;
      markSigned();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      last = point(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(last.x + 0.4, last.y + 0.4);
      ctx.stroke();
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drawing) return;
      var p = point(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      e.preventDefault();
    });
    function stop(e) {
      drawing = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
  }

  function clearSignaturePad() {
    var canvas = document.getElementById("sign-pad");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    canvas.dataset.signed = "";
    var hint = canvas.parentNode ? canvas.parentNode.querySelector(".sign-hint") : null;
    if (hint) hint.hidden = false;
  }

  /* —— Navigation —— */
  function goTab(tab) {
    nav.tab = tab;
    nav.screen = "home";
    nav.detailId = null;
    nav.sheet = null;
    nav.msgId = null;
    nav.threadFrom = null;
    renderAll();
  }

  function setRole(role) {
    session.role = role;
    if (role === "driver" && !currentDriver()) {
      var d = drivers()[0];
      session.signedInDriverUsername = d ? d.username : "tbrooks";
    }
    nav.tab = defaultTabForRole(role);
    nav.screen = "home";
    nav.detailId = null;
    nav.sheet = null;
    nav.filter = "all";
    nav.threadFrom = null;
    renderAll();
    toast("Signed in as " + (role === "driver" && currentDriver() ? currentDriver().name : roleTitle(role)));
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function handleAction(action, el) {
    if (!action) return;
    var id = el ? el.getAttribute("data-id") : null;

    if (action === "goLoads") return goTab("loads");
    if (action === "goTickets") return goTab("tickets");
    if (action === "goShop") return goTab("shop");
    if (action === "goTeam") return goTab("team");
    if (action === "goDrivers") return goTab("drivers");
    if (action === "goMoney") return goTab("money");
    if (action === "goMessages") return goTab("messages");
    if (action === "goMore") return goTab("more");
    if (action === "goSettings") return goTab("settings");
    if (action === "goHome") return goTab(defaultTabForRole(session.role));

    if (action === "setFilter") {
      nav.filter = el.getAttribute("data-filter") || "all";
      renderAll();
      return;
    }

    if (action === "newDispatch") {
      nav.sheet = "newDispatch";
      renderAll();
      return;
    }

    if (action === "addUser") {
      if (!canManageUsers()) { toast("Not allowed"); return; }
      nav.sheet = "addUser";
      renderAll();
      return;
    }

    if (action === "openDispatch") {
      nav.screen = "detail";
      nav.detailId = id;
      nav.sheet = null;
      renderAll();
      return;
    }

    if (action === "clearSignature") {
      clearSignaturePad();
      return;
    }

    if (action === "openTicket") {
      var ticketOpen = findById(session.tickets, id);
      if (!canViewTicket(ticketOpen)) {
        toast("You can't open this ticket");
        return;
      }
      nav.screen = "ticketDetail";
      nav.detailId = id;
      nav.sheet = null;
      renderAll();
      return;
    }

    if (action === "openWriteUp") {
      nav.screen = "writeupDetail";
      nav.detailId = id;
      nav.sheet = null;
      renderAll();
      return;
    }

    if (action === "openDriver") {
      nav.screen = "driverDetail";
      nav.detailId = id;
      nav.sheet = null;
      renderAll();
      return;
    }

    if (action === "switchDriver") {
      var user = el.getAttribute("data-user");
      if (!driverByUsername(user)) return;
      session.signedInDriverUsername = user;
      nav.screen = "home";
      nav.detailId = null;
      nav.sheet = null;
      renderAll();
      toast("Viewing as " + currentDriver().name);
      return;
    }

    if (action === "reportIssue") {
      if (session.role !== "driver") return;
      nav.sheet = "writeup";
      renderAll();
      return;
    }

    if (action === "reassign") {
      if (!isDispatchRole()) return;
      nav.sheet = "reassign";
      nav.detailId = id || nav.detailId;
      renderAll();
      return;
    }

    if (action === "openThread") {
      nav.threadFrom = { screen: nav.screen, tab: nav.tab, detailId: nav.detailId };
      nav.screen = "thread";
      nav.detailId = id;
      nav.msgId = id;
      nav.sheet = null;
      clearUnread(findDispatch(id));
      renderAll();
      return;
    }

    if (action === "acceptJob") {
      var jobA = findDispatch(id);
      if (jobA && jobA.status === "sent") {
        jobA.status = "accepted";
        advanceTimeline(jobA, "accepted");
        setDriverDuty(jobA.driverUsername, "onLoad", jobA.origin);
        pinTo(jobA.driverUsername, jobA.origin);
        noteDriverUpdate(jobA, "Accepted.");
        logEvent(firstName(jobA.driverName) + " accepted " + jobA.loadReference);
        toast("Job accepted");
        renderAll();
      }
      return;
    }

    if (action === "declineJob") {
      var jobD = findDispatch(id);
      if (jobD && jobD.status === "sent") {
        jobD.status = "declined";
        advanceTimeline(jobD, "declined");
        noteDriverUpdate(jobD, "Declined.");
        logEvent(firstName(jobD.driverName) + " declined " + jobD.loadReference);
        toast("Job declined");
        renderAll();
      }
      return;
    }

    if (action === "checkCall") {
      var jobC = findDispatch(id);
      var next = el.getAttribute("data-next");
      if (!jobC || !next) return;
      if (CHECK_FLOW.indexOf(next) < 0) return;
      jobC.status = next;
      advanceTimeline(jobC, next);
      if (next === "atPickup") {
        setDriverDuty(jobC.driverUsername, "onLoad", jobC.origin);
        pinTo(jobC.driverUsername, jobC.origin);
      } else if (next === "loaded") {
        setDriverDuty(jobC.driverUsername, "onLoad", jobC.origin);
        pinTo(jobC.driverUsername, jobC.origin);
      } else if (next === "inTransit" || next === "atDelivery") {
        setDriverDuty(jobC.driverUsername, "onLoad", next === "inTransit" ? "En route · " + jobC.destination : jobC.destination);
        pinTo(jobC.driverUsername, jobC.destination);
      } else if (next === "completed") {
        setDriverDuty(jobC.driverUsername, "available", jobC.destination);
        pinTo(jobC.driverUsername, jobC.destination);
      }
      noteDriverUpdate(jobC, (CHECK_LABELS[next] || "Updated") + ".");
      logEvent(firstName(jobC.driverName) + " · " + (CHECK_LABELS[next] || "Updated") + " · " + jobC.loadReference);
      toast(CHECK_LABELS[next] || "Updated");
      renderAll();
      return;
    }

    if (action === "sendDispatch") {
      var driverUser = val("nd-driver");
      var customer = val("nd-customer");
      var origin = val("nd-origin");
      var dest = val("nd-dest");
      var unit = val("nd-unit");
      if (!customer) { toast("Enter a customer"); return; }
      if (!origin || !dest) { toast("Enter origin and destination"); return; }
      if (!driverUser) { toast("Choose a driver"); return; }
      if (!unit) { toast("Enter a unit"); return; }
      var member = null;
      var i;
      for (i = 0; i < session.teamMembers.length; i++) {
        if (session.teamMembers[i].username === driverUser) { member = session.teamMembers[i]; break; }
      }
      if (!member) { toast("Choose a driver"); return; }
      var rate = parseFloat(val("nd-rate")) || 0;
      var miles = parseInt(val("nd-miles"), 10) || 0;
      var created = {
        id: uid(),
        loadReference: val("nd-load") || nextLoadRef(),
        customerName: customer,
        commodity: val("nd-commodity") || "Freight",
        origin: origin,
        destination: dest,
        ox: 20 + Math.floor(Math.random() * 60),
        oy: 15 + Math.floor(Math.random() * 40),
        dx: 20 + Math.floor(Math.random() * 60),
        dy: 20 + Math.floor(Math.random() * 45),
        driverName: member.name,
        driverUsername: driverUser,
        equipmentUnit: unit,
        rateAmount: rate,
        miles: miles,
        etaLabel: "TBD",
        pickupAppt: "ASAP",
        deliveryAppt: "TBD",
        status: "sent",
        notes: val("nd-notes"),
        timeline: makeTimeline("sent"),
        messages: [],
        unreadDriver: 1,
        unreadDispatch: 0
      };
      session.dispatches.unshift(created);
      addMessage(created, {
        from: "system",
        kind: "system",
        text: actorName() + " dispatched this load to " + member.name + "."
      });
      logEvent(actorName() + " sent " + created.loadReference + " to " + firstName(member.name));
      nav.sheet = null;
      nav.tab = session.role === "owner" ? "loads" : "loads";
      nav.screen = "home";
      renderAll();
      toast("Dispatch sent to " + firstName(member.name));
      return;
    }

    if (action === "createTicket") {
      if (session.role !== "driver") return;
      var jobStart = findDispatch(id);
      var meStart = currentDriver();
      if (!jobStart || !meStart || jobStart.driverUsername !== meStart.username) return;
      var already = ticketForLoad(jobStart.loadReference);
      if (already) {
        nav.screen = "ticketDetail";
        nav.detailId = already.id;
        nav.sheet = null;
        renderAll();
        return;
      }
      if (!ticketEligible(jobStart)) {
        toast("Accept the load first");
        return;
      }
      nav.sheet = "ticket";
      nav.detailId = id;
      renderAll();
      return;
    }

    if (action === "submitTicketSheet") {
      var jobId = val("tk-job");
      var jobT = findDispatch(jobId);
      var driverT = currentDriver();
      if (session.role !== "driver" || !jobT || !driverT || jobT.driverUsername !== driverT.username) return;
      if (ticketForLoad(jobT.loadReference)) {
        toast("Ticket already filed");
        return;
      }
      var customer = val("tk-customer");
      var origin = val("tk-origin");
      var dest = val("tk-dest");
      if (!customer) { toast("Enter a customer"); return; }
      if (!origin || !dest) { toast("Enter origin and destination"); return; }
      var pad = document.getElementById("sign-pad");
      if (!pad || pad.dataset.signed !== "1") {
        toast("Sign the ticket");
        return;
      }
      var signature = pad.toDataURL("image/png");
      var amount = parseFloat(val("tk-rate"));
      if (isNaN(amount)) amount = jobT.rateAmount || 0;
      var miles = parseInt(val("tk-miles"), 10);
      if (isNaN(miles)) miles = jobT.miles || 0;
      driverT.ticketSequence = (driverT.ticketSequence || 0) + 1;
      var ticketNumber = val("tk-number") || nextTicketNumber();
      session.tickets.unshift({
        id: uid(),
        number: ticketNumber,
        customerName: customer,
        loadReference: jobT.loadReference,
        origin: origin,
        destination: dest,
        driverName: driverT.name,
        driverUsername: driverT.username,
        equipmentUnit: val("tk-unit") || jobT.equipmentUnit,
        commodity: val("tk-commodity") || jobT.commodity,
        rateAmount: amount,
        miles: miles,
        weight: val("tk-weight"),
        receiver: val("tk-receiver"),
        status: "submitted",
        notes: val("tk-notes"),
        signature: signature,
        signedBy: driverT.name,
        signedAt: fmtAt(Date.now())
      });
      jobT.status = "completed";
      jobT.customerName = customer;
      jobT.origin = origin;
      jobT.destination = dest;
      jobT.commodity = val("tk-commodity") || jobT.commodity;
      jobT.equipmentUnit = val("tk-unit") || jobT.equipmentUnit;
      jobT.rateAmount = amount;
      jobT.miles = miles;
      advanceTimeline(jobT, "completed");
      setDriverDuty(driverT.username, "available", dest);
      pinTo(driverT.username, dest);
      addMessage(jobT, { from: "system", kind: "system", text: driverT.name + " signed a ticket for " + money(amount) + "." });
      logEvent(firstName(driverT.name) + " signed ticket " + jobT.loadReference);
      nav.sheet = null;
      nav.tab = "home";
      nav.screen = "home";
      renderAll();
      toast("Ticket sent to office, dispatch, and the owner");
      return;
    }

    if (action === "billTicket") {
      var ticket = findById(session.tickets, id || (el && el.getAttribute("data-id")) || nav.detailId);
      if (ticket && ticket.status === "submitted" && (session.role === "office" || session.role === "owner")) {
        ticket.status = "billed";
        logEvent(actorName() + " billed ticket " + ticket.loadReference);
        toast("Ticket billed");
        renderAll();
      }
      return;
    }

    if (action === "addUserSubmit") {
      if (!canManageUsers()) return;
      var name = val("au-name");
      var username = val("au-username").toLowerCase().replace(/\s+/g, "");
      var role = val("au-role") || "driver";
      if (!name) { toast("Enter a name"); return; }
      if (!username) { toast("Enter a username"); return; }
      for (i = 0; i < session.teamMembers.length; i++) {
        if (session.teamMembers[i].username.toLowerCase() === username) {
          toast("Username taken");
          return;
        }
      }
      var driverNumber = null;
      if (role === "driver") {
        var maxN = 1431;
        drivers().forEach(function (d) {
          if ((d.driverNumber || 0) > maxN) maxN = d.driverNumber;
        });
        driverNumber = maxN + 1;
      }
      session.teamMembers.push({
        id: uid(),
        name: name,
        username: username,
        role: role,
        driverNumber: driverNumber,
        ticketSequence: 0,
        dutyStatus: role === "driver" ? "available" : null,
        locationLabel: role === "driver" ? "Yard" : null,
        mapLon: role === "driver" ? (-96.5 - Math.random() * 4) : null,
        mapLat: role === "driver" ? (31.5 + Math.random() * 2.5) : null
      });
      nav.sheet = null;
      nav.tab = "team";
      nav.screen = "home";
      renderAll();
      toast(name + " added as " + roleTitle(role));
      return;
    }

    if (action === "removeUser") {
      if (!canManageUsers()) return;
      var member = findById(session.teamMembers, id);
      if (!member || member.core || member.role === "owner") {
        toast("The demo crew stays");
        return;
      }
      session.teamMembers = session.teamMembers.filter(function (m) { return m.id !== id; });
      if (session.signedInDriverUsername === member.username) {
        var fallback = drivers()[0];
        session.signedInDriverUsername = fallback ? fallback.username : "tbrooks";
      }
      logEvent(actorName() + " removed " + member.name);
      renderAll();
      toast(member.name + " removed");
      return;
    }

    if (action === "toggleDelegate") {
      session.delegateUserManagementToDispatcher = !session.delegateUserManagementToDispatcher;
      renderAll();
      toast(session.delegateUserManagementToDispatcher ? "Delegation on" : "Delegation off");
      return;
    }

    if (action === "sendCommand" || action === "sendReply" || action === "sendCompose" || action === "sendCanned") {
      var jobM = findDispatch(id);
      if (!jobM) return;
      var text = action === "sendCompose" ? val("compose-text") : (el.getAttribute("data-text") || "");
      if (!text) { toast(session.role === "driver" ? "Write a reply" : "Write a command"); return; }
      if (session.role === "driver") {
        var meSend = currentDriver();
        if (!meSend || jobM.driverUsername !== meSend.username) { toast("Not your load"); return; }
        addMessage(jobM, { from: "driver", kind: "reply", text: text, byName: meSend.name });
        jobM.unreadDispatch = (jobM.unreadDispatch || 0) + 1;
        var pendingCmd = null;
        var mi;
        var stack = jobM.messages || [];
        for (mi = stack.length - 1; mi >= 0; mi--) {
          if (stack[mi].kind === "command" && stack[mi].status === "sent") { pendingCmd = stack[mi]; break; }
        }
        if (pendingCmd) pendingCmd.status = "copied";
        logEvent(firstName(meSend.name) + " replied on " + jobM.loadReference);
        toast("Sent to dispatch");
      } else if (isDispatchRole()) {
        addMessage(jobM, {
          from: "dispatch",
          kind: "command",
          commandId: (el && el.getAttribute("data-cmd")) || "custom",
          text: text,
          status: "sent",
          byName: actorName()
        });
        jobM.unreadDriver = (jobM.unreadDriver || 0) + 1;
        logEvent(firstName(actorName()) + " commanded " + firstName(jobM.driverName) + " on " + jobM.loadReference);
        toast("Command sent");
      }
      renderAll();
      return;
    }

    if (action === "ackCommand") {
      var jobK = findDispatch(id);
      var mid = el.getAttribute("data-mid");
      var ack = el.getAttribute("data-status") === "done" ? "done" : "copied";
      if (!jobK || !mid) return;
      var meAck = currentDriver();
      if (!meAck || jobK.driverUsername !== meAck.username) { toast("Not your load"); return; }
      if (!markCommand(jobK, mid, ack)) return;
      addMessage(jobK, { from: "driver", kind: "reply", text: ack === "done" ? "Done." : "Copy.", byName: meAck.name });
      jobK.unreadDispatch = (jobK.unreadDispatch || 0) + 1;
      logEvent(firstName(meAck.name) + (ack === "done" ? " finished a command on " : " copied a command on ") + jobK.loadReference);
      toast(ack === "done" ? "Marked done" : "Copied");
      renderAll();
      return;
    }

    if (action === "reassignSubmit") {
      if (!isDispatchRole()) return;
      var jobR = findDispatch(id || nav.detailId);
      var nextUser = val("ra-driver");
      var nextDriver = driverByUsername(nextUser);
      if (!jobR || !nextDriver) { toast("Choose a driver"); return; }
      var prevUser = jobR.driverUsername;
      jobR.driverName = nextDriver.name;
      jobR.driverUsername = nextUser;
      if (jobR.status === "declined") {
        jobR.status = "sent";
        advanceTimeline(jobR, "sent");
      }
      jobR.unreadDriver = (jobR.unreadDriver || 0) + 1;
      addMessage(jobR, { from: "system", kind: "system", text: actorName() + " assigned this load to " + nextDriver.name + "." });
      if (isMoving(jobR.status)) setDriverDuty(nextUser, "onLoad", jobR.origin);
      if (prevUser && prevUser !== nextUser) refreshDuty(prevUser);
      logEvent(actorName() + " assigned " + jobR.loadReference + " to " + firstName(nextDriver.name));
      nav.sheet = null;
      nav.screen = "detail";
      nav.detailId = jobR.id;
      renderAll();
      toast("Assigned to " + firstName(nextDriver.name));
      return;
    }

    if (action === "submitWriteUp") {
      var reporter = currentDriver();
      if (!reporter) return;
      var issue = val("wu-title");
      var wuUnit = val("wu-unit");
      if (!wuUnit) { toast("Enter a unit"); return; }
      if (!issue) { toast("Describe the issue"); return; }
      session.writeUps.unshift({
        id: uid(),
        number: nextWriteUpNumber(),
        equipmentUnit: wuUnit,
        title: issue,
        description: val("wu-notes") || issue,
        driverName: reporter.name,
        priority: val("wu-priority") || "medium",
        status: "open"
      });
      logEvent(firstName(reporter.name) + " reported " + issue + " on " + wuUnit);
      nav.sheet = null;
      renderAll();
      toast("Sent to the shop");
      return;
    }

    if (action === "wuStatus") {
      var wu = findById(session.writeUps, id);
      if (wu) {
        wu.status = el.getAttribute("data-status");
        if (wu.status === "inProgress" && !wu.mechanicNotes) wu.mechanicNotes = actorName() + " started this.";
        if (wu.status === "fixed") wu.mechanicNotes = (wu.mechanicNotes ? wu.mechanicNotes + " " : "") + "Marked fixed.";
        if (wu.status === "cannotRepair") wu.mechanicNotes = (wu.mechanicNotes ? wu.mechanicNotes + " " : "") + "Cannot repair.";
        logEvent(actorName() + " updated " + wu.number + " · " + (WRITEUP_STATUS[wu.status] || wu.status));
        toast("Write-up updated");
        renderAll();
      }
      return;
    }

    if (action === "reset") {
      var keep = session.role;
      session = makeSamples();
      session.role = keep;
      nav = { tab: defaultTabForRole(keep), screen: "home", detailId: null, sheet: null, filter: "all", msgId: null, threadFrom: null };
      renderAll();
      toast("Cleared. Crew kept.");
      return;
    }
  }

  /* —— Events —— */
  function onActionClick(e) {
    var t = e.target.closest ? e.target.closest("[data-action]") : null;
    if (!t) return;
    e.preventDefault();
    handleAction(t.getAttribute("data-action"), t);
  }

  var contentEl = document.getElementById("content");
  if (contentEl) contentEl.addEventListener("click", onActionClick);

  var tabbar = document.getElementById("tabbar");
  if (tabbar) {
    tabbar.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-tab]") : null;
      if (!t) return;
      goTab(t.getAttribute("data-tab"));
    });
  }

  var chips = document.getElementById("role-chips");
  if (chips) {
    chips.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-role]") : null;
      if (!t) return;
      setRole(t.getAttribute("data-role"));
    });
  }

  var navBack = document.getElementById("nav-back");
  if (navBack) {
    navBack.addEventListener("click", function () {
      if (nav.sheet) {
        nav.sheet = null;
        renderAll();
        return;
      }
      if (nav.screen === "thread" && nav.threadFrom) {
        var from = nav.threadFrom;
        nav.threadFrom = null;
        nav.screen = from.screen || "home";
        nav.tab = from.tab || nav.tab;
        if (from.screen === "detail" || from.screen === "driverDetail" || from.screen === "ticketDetail" || from.screen === "writeupDetail") {
          nav.detailId = from.detailId;
        } else {
          nav.detailId = null;
          nav.screen = "home";
        }
        renderAll();
        return;
      }
      if (nav.screen !== "home") {
        nav.screen = "home";
        nav.detailId = null;
        nav.msgId = null;
        renderAll();
        return;
      }
      if (inOwnerHub()) { goTab("more"); return; }
      if (inDispatchTeam()) { goTab("settings"); return; }
      if (inDispatchSettings()) { goTab("board"); return; }
    });
  }

  var navRight = document.getElementById("nav-right");
  if (navRight) {
    navRight.addEventListener("click", function () {
      var action = navRight.getAttribute("data-action");
      if (action) handleAction(action, navRight);
    });
  }

  var sheetEl = document.getElementById("sheet");
  if (sheetEl) sheetEl.addEventListener("click", onActionClick);

  var dockEl = document.getElementById("dock");
  if (dockEl) {
    dockEl.addEventListener("click", onActionClick);
    dockEl.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var input = e.target && e.target.id === "compose-text" ? e.target : null;
      if (!input) return;
      e.preventDefault();
      handleAction("sendCompose", input);
    });
  }

  var refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      handleAction("reset", refreshBtn);
    });
  }

  /* —— Device switch —— */
  function normalizeDevice(device) {
    device = String(device || "").toLowerCase();
    if (device === "ipad" || device === "windows") return device;
    return "iphone";
  }

  function currentDevice() {
    return normalizeDevice(document.documentElement.getAttribute("data-device"));
  }

  function syncDeviceUi(device) {
    var switchEl = document.getElementById("device-switch");
    if (!switchEl) return;
    var chipList = switchEl.querySelectorAll(".device-chip");
    var i, chip, on;
    for (i = 0; i < chipList.length; i++) {
      chip = chipList[i];
      on = chip.getAttribute("data-device") === device;
      chip.classList.toggle("is-active", on);
      chip.setAttribute("aria-selected", on ? "true" : "false");
      chip.tabIndex = on ? 0 : -1;
    }
    var shell = document.getElementById("device");
    if (shell) {
      var deviceName = device === "ipad" ? "iPad" : device === "windows" ? "Windows computer" : "iPhone";
      shell.setAttribute("aria-label", deviceName + " with FleetDispatch simulator");
    }
  }

  function setDevice(device, opts) {
    opts = opts || {};
    device = normalizeDevice(device);
    if (currentDevice() === device && !opts.force) {
      syncDeviceUi(device);
      return;
    }
    document.documentElement.setAttribute("data-device", device);
    syncDeviceUi(device);
    try { localStorage.setItem("fleetdispatch-sim-device", device); } catch (e) {}
    if (!opts.skipUrl) {
      try {
        var url = new URL(window.location.href);
        url.searchParams.set("device", device);
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      } catch (e2) {}
    }
    renderAll();
  }

  function initDevice() {
    var switchEl = document.getElementById("device-switch");
    if (!switchEl) return;
    var device = "iphone";
    try {
      var params = new URLSearchParams(window.location.search);
      var q = (params.get("device") || "").toLowerCase();
      if (q === "ipad" || q === "iphone" || q === "windows") device = q;
      else {
        var stored = localStorage.getItem("fleetdispatch-sim-device");
        if (stored === "ipad" || stored === "iphone" || stored === "windows") device = stored;
      }
    } catch (e) {}
    setDevice(device, { force: true, skipUrl: false });

    switchEl.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-device]") : null;
      if (!t || !switchEl.contains(t)) return;
      setDevice(t.getAttribute("data-device"));
    });

    switchEl.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
      var order = ["iphone", "ipad", "windows"];
      var idx = order.indexOf(currentDevice());
      if (idx < 0) idx = 0;
      if (e.key === "Home") idx = 0;
      else if (e.key === "End") idx = order.length - 1;
      else if (e.key === "ArrowRight") idx = (idx + 1) % order.length;
      else if (e.key === "ArrowLeft") idx = (idx + order.length - 1) % order.length;
      e.preventDefault();
      setDevice(order[idx]);
      var focusBtn = document.getElementById("device-" + order[idx]);
      if (focusBtn) focusBtn.focus();
    });
  }

  function tickClock() {
    var d = new Date();
    var m = String(d.getMinutes());
    if (m.length < 2) m = "0" + m;
    var hm = d.getHours() + ":" + m;
    var el = document.getElementById("clock");
    if (el) el.textContent = hm;
    var winClock = document.getElementById("win-clock");
    if (winClock) {
      var h12 = d.getHours() % 12;
      if (h12 === 0) h12 = 12;
      winClock.textContent = h12 + ":" + m + (d.getHours() >= 12 ? " PM" : " AM");
    }
    var winDate = document.getElementById("win-date");
    if (winDate) winDate.textContent = (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear();
  }

  function initRole() {
    try {
      var params = new URLSearchParams(window.location.search);
      var role = (params.get("role") || "dispatcher").toLowerCase();
      if (role === "dispatch") role = "dispatcher";
      var allowed = { owner: 1, office: 1, dispatcher: 1, mechanic: 1, driver: 1 };
      session.role = allowed[role] ? role : "dispatcher";
      nav.tab = defaultTabForRole(session.role);
    } catch (e) {
      session.role = "dispatcher";
      nav.tab = "board";
    }
  }

  initRole();
  initDevice();
  tickClock();
  setInterval(tickClock, 30000);
  renderAll();
})();

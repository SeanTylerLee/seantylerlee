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
    building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-5h6v5M8 7h2M14 7h2M8 11h2M14 11h2"/></svg>'
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

  var CANNED = [
    "Running 15 min late",
    "At the gate — waiting",
    "Loaded, rolling now",
    "Need a scale ticket",
    "Detention starting"
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
    var tbrooks = "tbrooks";
    var mblake = "mblake";
    var cquinn = "cquinn";
    var rhayes = "rhayes";

    var jobs = [
      {
        id: uid(),
        loadReference: "LS-4829",
        customerName: "Gulf Coast Aggregates",
        commodity: "Crushed limestone",
        origin: "Dallas, TX",
        destination: "Houston, TX",
        ox: 42, oy: 28, dx: 58, dy: 72,
        driverName: "Taylor Brooks",
        driverUsername: tbrooks,
        equipmentUnit: "Unit 12",
        rateAmount: 1850,
        miles: 242,
        etaLabel: "4:40 PM",
        pickupAppt: "Today 7:00 AM",
        deliveryAppt: "Today 4:00 PM",
        status: "inTransit",
        notes: "Scale ticket required.",
        timeline: makeTimeline("inTransit"),
        messages: [
          { from: "dispatch", text: "Scale at exit 38 — keep ticket with BOL.", at: "09:12" },
          { from: "driver", text: "Copy. Rolling south on 45.", at: "09:18" }
        ]
      },
      {
        id: uid(),
        loadReference: "LS-4828",
        customerName: "Lone Star Steel",
        commodity: "Coil steel",
        origin: "Fort Worth, TX",
        destination: "San Antonio, TX",
        ox: 28, oy: 34, dx: 36, dy: 78,
        driverName: "Morgan Blake",
        driverUsername: mblake,
        equipmentUnit: "Unit 7",
        rateAmount: 2100,
        miles: 268,
        etaLabel: "6:15 PM",
        pickupAppt: "Today 8:30 AM",
        deliveryAppt: "Today 5:30 PM",
        status: "loaded",
        notes: "Tarps tight. Chains on corners.",
        timeline: makeTimeline("loaded"),
        messages: [
          { from: "dispatch", text: "Confirm coil count before rolling.", at: "08:40" }
        ]
      },
      {
        id: uid(),
        loadReference: "LS-4827",
        customerName: "Prairie Feed Co",
        commodity: "Bulk feed",
        origin: "Amarillo, TX",
        destination: "Oklahoma City, OK",
        ox: 18, oy: 18, dx: 62, dy: 22,
        driverName: "Casey Quinn",
        driverUsername: cquinn,
        equipmentUnit: "Unit 3",
        rateAmount: 1725,
        miles: 260,
        etaLabel: "3:20 PM",
        pickupAppt: "Today 6:00 AM",
        deliveryAppt: "Today 2:30 PM",
        status: "atPickup",
        notes: "Call before arrival.",
        timeline: makeTimeline("atPickup"),
        messages: []
      },
      {
        id: uid(),
        loadReference: "LS-4826",
        customerName: "Red River Lumber",
        commodity: "Dimensional lumber",
        origin: "Shreveport, LA",
        destination: "Tyler, TX",
        ox: 78, oy: 40, dx: 68, dy: 48,
        driverName: "Riley Hayes",
        driverUsername: rhayes,
        equipmentUnit: "Unit 19",
        rateAmount: 980,
        miles: 98,
        etaLabel: "1:10 PM",
        pickupAppt: "Today 10:00 AM",
        deliveryAppt: "Today 1:00 PM",
        status: "accepted",
        notes: "Lumber must be tarped.",
        timeline: makeTimeline("accepted"),
        messages: [
          { from: "dispatch", text: "Unit 19 ready at yard.", at: "07:55" }
        ]
      },
      {
        id: uid(),
        loadReference: "LS-4825",
        customerName: "Metro Concrete",
        commodity: "Bagged cement",
        origin: "Austin, TX",
        destination: "Waco, TX",
        ox: 40, oy: 68, dx: 44, dy: 46,
        driverName: "Taylor Brooks",
        driverUsername: tbrooks,
        equipmentUnit: "Unit 12",
        rateAmount: 1100,
        miles: 106,
        etaLabel: "—",
        pickupAppt: "Today 2:00 PM",
        deliveryAppt: "Today 5:00 PM",
        status: "sent",
        notes: "Next after Houston drop.",
        timeline: makeTimeline("sent"),
        messages: []
      },
      {
        id: uid(),
        loadReference: "LS-4824",
        customerName: "Hill Country Pipe",
        commodity: "Steel pipe",
        origin: "Odessa, TX",
        destination: "Midland, TX",
        ox: 12, oy: 55, dx: 16, dy: 52,
        driverName: "Morgan Blake",
        driverUsername: mblake,
        equipmentUnit: "Unit 7",
        rateAmount: 650,
        miles: 22,
        etaLabel: "—",
        pickupAppt: "Tomorrow 6:00 AM",
        deliveryAppt: "Tomorrow 8:00 AM",
        status: "sent",
        notes: "Urgent — cover if available.",
        timeline: makeTimeline("sent"),
        messages: []
      },
      {
        id: uid(),
        loadReference: "LS-4822",
        customerName: "Panhandle Ag",
        commodity: "Fertilizer",
        origin: "Lubbock, TX",
        destination: "Abilene, TX",
        ox: 22, oy: 42, dx: 32, dy: 50,
        driverName: "Casey Quinn",
        driverUsername: cquinn,
        equipmentUnit: "Unit 3",
        rateAmount: 1400,
        miles: 160,
        etaLabel: "Done",
        pickupAppt: "Yesterday 7:00 AM",
        deliveryAppt: "Yesterday 2:00 PM",
        status: "completed",
        notes: "",
        timeline: makeTimeline("completed"),
        messages: []
      },
      {
        id: uid(),
        loadReference: "LS-4820",
        customerName: "Bayou Plastics",
        commodity: "Resin pellets",
        origin: "Beaumont, TX",
        destination: "Dallas, TX",
        ox: 72, oy: 70, dx: 42, dy: 28,
        driverName: "Riley Hayes",
        driverUsername: rhayes,
        equipmentUnit: "Unit 19",
        rateAmount: 1550,
        miles: 275,
        etaLabel: "—",
        pickupAppt: "Mon 9:00 AM",
        deliveryAppt: "Mon 5:00 PM",
        status: "declined",
        notes: "Driver declined — hours.",
        timeline: makeTimeline("declined"),
        messages: []
      }
    ];

    return {
      companyName: "Lone Star Freight",
      role: "dispatcher",
      delegateUserManagementToDispatcher: false,
      signedInDriverUsername: tbrooks,
      teamMembers: [
        { id: uid(), name: "Alex Rivera", username: "arivera", role: "owner", driverNumber: null, ticketSequence: 0, dutyStatus: null, locationLabel: null },
        { id: uid(), name: "Jordan Lee", username: "jlee", role: "dispatcher", driverNumber: null, ticketSequence: 0, dutyStatus: null, locationLabel: null },
        { id: uid(), name: "Sam Ortiz", username: "sortiz", role: "office", driverNumber: null, ticketSequence: 0, dutyStatus: null, locationLabel: null },
        { id: uid(), name: "Chris Nguyen", username: "cnguyen", role: "mechanic", driverNumber: null, ticketSequence: 0, dutyStatus: null, locationLabel: null },
        { id: uid(), name: "Taylor Brooks", username: tbrooks, role: "driver", driverNumber: 1432, ticketSequence: 3, dutyStatus: "onLoad", locationLabel: "I-45 S · Huntsville", mapLon: -95.55, mapLat: 30.72 },
        { id: uid(), name: "Morgan Blake", username: mblake, role: "driver", driverNumber: 1433, ticketSequence: 2, dutyStatus: "onLoad", locationLabel: "FW yard · loading", mapLon: -97.33, mapLat: 32.76 },
        { id: uid(), name: "Casey Quinn", username: cquinn, role: "driver", driverNumber: 1434, ticketSequence: 1, dutyStatus: "onLoad", locationLabel: "Amarillo terminal", mapLon: -101.83, mapLat: 35.22 },
        { id: uid(), name: "Riley Hayes", username: rhayes, role: "driver", driverNumber: 1435, ticketSequence: 0, dutyStatus: "available", locationLabel: "Tyler yard", mapLon: -95.30, mapLat: 32.35 },
        { id: uid(), name: "Devon Park", username: "dpark", role: "driver", driverNumber: 1436, ticketSequence: 0, dutyStatus: "offDuty", locationLabel: "Home · Dallas", mapLon: -96.80, mapLat: 32.78 }
      ],
      dispatches: jobs,
      tickets: [
        { id: uid(), number: "1432815253", customerName: "Gulf Coast Aggregates", loadReference: "LS-4818", origin: "Dallas, TX", destination: "Houston, TX", driverName: "Taylor Brooks", driverUsername: tbrooks, equipmentUnit: "Unit 12", commodity: "Limestone", rateAmount: 1850, miles: 242, status: "submitted", notes: "Delivered clean. BOL signed." },
        { id: uid(), number: "1433815252", customerName: "Lone Star Steel", loadReference: "LS-4815", origin: "Fort Worth, TX", destination: "San Antonio, TX", driverName: "Morgan Blake", driverUsername: mblake, equipmentUnit: "Unit 7", commodity: "Coil steel", rateAmount: 2100, miles: 268, status: "submitted", notes: "Detention 1.5 hrs." },
        { id: uid(), number: "1434815251", customerName: "Prairie Feed Co", loadReference: "LS-4812", origin: "Amarillo, TX", destination: "Oklahoma City, OK", driverName: "Casey Quinn", driverUsername: cquinn, equipmentUnit: "Unit 3", commodity: "Bulk feed", rateAmount: 1725, miles: 260, status: "submitted", notes: "" },
        { id: uid(), number: "1432814252", customerName: "Red River Lumber", loadReference: "LS-4801", origin: "Shreveport, LA", destination: "Tyler, TX", driverName: "Taylor Brooks", driverUsername: tbrooks, equipmentUnit: "Unit 12", commodity: "Lumber", rateAmount: 950, miles: 98, status: "billed", notes: "Lumber tarped." },
        { id: uid(), number: "1433814251", customerName: "Metro Concrete", loadReference: "LS-4790", origin: "Austin, TX", destination: "Waco, TX", driverName: "Morgan Blake", driverUsername: mblake, equipmentUnit: "Unit 7", commodity: "Cement", rateAmount: 1100, miles: 106, status: "billed", notes: "" }
      ],
      writeUps: [
        { id: uid(), number: "W-221", equipmentUnit: "Unit 14", title: "Brake light out", description: "Right rear brake light not working on pre-trip.", driverName: "Taylor Brooks", priority: "medium", status: "open" },
        { id: uid(), number: "W-220", equipmentUnit: "Unit 7", title: "Air leak at glad hands", description: "Hissing at trailer connection after a couple hours.", driverName: "Morgan Blake", priority: "high", status: "open" },
        { id: uid(), number: "W-219", equipmentUnit: "Unit 3", title: "Check engine light", description: "CEL near Amarillo. Truck still runs.", driverName: "Casey Quinn", priority: "high", status: "inProgress", mechanicNotes: "Scanning codes." },
        { id: uid(), number: "W-218", equipmentUnit: "Trailer 44", title: "Tire wear outer dual", description: "Outer dual axle 2 low tread.", driverName: "Taylor Brooks", priority: "low", status: "open" },
        { id: uid(), number: "W-215", equipmentUnit: "Unit 12", title: "Wiper blade shredded", description: "Driver-side wiper streaking in rain.", driverName: "Morgan Blake", priority: "medium", status: "fixed", mechanicNotes: "Replaced both blades." },
        { id: uid(), number: "W-210", equipmentUnit: "Unit 9", title: "Transmission slipping", description: "Hard shift 3–4 under load.", driverName: "Casey Quinn", priority: "outOfService", status: "cannotRepair", mechanicNotes: "Needs dealer rebuild. Unit parked." }
      ]
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
    var max = 4829;
    var i, m, n;
    for (i = 0; i < session.dispatches.length; i++) {
      m = String(session.dispatches[i].loadReference).match(/\d+/);
      n = m ? parseInt(m[0], 10) : 0;
      if (n > max) max = n;
    }
    return "LS-" + (max + 1);
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

  function driverPinHtml(d) {
    var pt = projectUs(d.mapLon != null ? d.mapLon : -97.5, d.mapLat != null ? d.mapLat : 31.5);
    var duty = d.dutyStatus || "available";
    var title = d.name + (d.locationLabel ? " · " + d.locationLabel : "") + " · " + duty;
    return (
      '<button type="button" class="driver-pin" data-action="goDrivers" title="' + esc(title) + '" ' +
        'aria-label="' + esc(title) + '" style="left:' + pt.x.toFixed(2) + "%;top:" + pt.y.toFixed(2) + '%">' +
        '<span class="driver-pin-glyph" aria-hidden="true"></span>' +
        '<span class="driver-pin-pulse" aria-hidden="true"></span>' +
      "</button>"
    );
  }

  function mapPanel() {
    var list = drivers();
    var pins = list.map(driverPinHtml).join("");
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
          '<div class="driver-chip duty-' + esc(duty) + '">' +
            '<span class="team-avatar role-driver">' + esc(initials(d.name)) + "</span>" +
            '<span class="driver-info">' +
              '<span class="n">' + esc(d.name.split(" ")[0]) + "</span>" +
              '<span class="status-pill ' + pillClass + '" style="padding:2px 6px;font-size:9px">' + esc(dutyLabel) + "</span>" +
            "</span>" +
          "</div>"
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
          { id: "shop", title: "Shop", icon: "wrench" },
          { id: "team", title: "Team", icon: "people" },
          { id: "settings", title: "Settings", icon: "gear" }
        ];
      case "office":
        return [
          { id: "home", title: "Home", icon: "house" },
          { id: "tickets", title: "Tickets", icon: "doc" },
          { id: "settings", title: "Settings", icon: "gear" }
        ];
      case "dispatcher": {
        var t = [
          { id: "board", title: "Board", icon: "map" },
          { id: "loads", title: "Loads", icon: "clipboard" },
          { id: "drivers", title: "Drivers", icon: "wheel" }
        ];
        if (canManageUsers()) t.push({ id: "team", title: "Team", icon: "people" });
        t.push({ id: "settings", title: "Settings", icon: "gear" });
        return t;
      }
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

  function defaultTabForRole(role) {
    if (role === "dispatcher") return "board";
    return "home";
  }

  function titleForScreen() {
    if (nav.sheet === "newDispatch") return "New dispatch";
    if (nav.sheet === "ticket") return "Submit ticket";
    if (nav.sheet === "addUser") return "Add user";
    if (nav.screen === "detail") return "Load detail";
    if (nav.screen === "thread") return "Messages";
    if (nav.screen === "ticketDetail") return "Ticket";
    if (nav.screen === "writeupDetail") return "Write-up";
    switch (nav.tab) {
      case "board": return "Dispatch board";
      case "loads": return "Loads";
      case "drivers": return "Drivers";
      case "jobs": return "My jobs";
      case "messages": return "Messages";
      case "tickets": return "Tickets";
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
      sectionHead("Needs a driver", pending.length ? "All loads" : null, "goLoads") +
      (urgent.length
        ? '<div class="card mb-14">' + urgent.map(function (j) { return loadCard(j); }).join("") + "</div>"
        : emptyState("Queue clear", "No pending dispatches")) +
      sectionHead("Drivers") +
      driverRail(drivers())
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
        : emptyState("No loads", "Nothing in this filter"))
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
          '<div class="list-row">' +
            '<span class="team-avatar">' + esc(initials(d.name)) + "</span>" +
            '<span class="main">' +
              '<span class="top"><span class="name">' + esc(d.name) + '</span><span class="status">' + esc(dutyLabel) + "</span></span>" +
              '<span class="line">#' + esc(String(d.driverNumber || "—")) + " · " + esc(d.locationLabel || "—") + "</span>" +
            "</span>" +
          "</div>"
        );
      }).join("") +
      "</div>"
    );
  }

  function renderOwnerHome() {
    var openIssues = writeUpsOpen().length + pendingJobs().length;
    return (
      hdr("Owner overview", "Company pulse") +
      kpiStrip([
        { value: money(mockRevenue()), label: "Pipeline $" },
        { value: String(movingJobs().length), label: "Moving" },
        { value: String(ticketsAwaiting().length), label: "To bill" },
        { value: String(openIssues), label: "Open issues" }
      ]) +
      mapPanel() +
      sectionHead("Quick links") +
      '<div class="card">' +
        '<button type="button" class="row" data-action="goLoads"><span class="ico-blue">' + I.list(true) + '</span><span class="body"><span class="t">Loads</span><span class="s">Company-wide jobs</span></span><span class="chev">' + I.chev + "</span></button>" +
        '<button type="button" class="row" data-action="goShop"><span class="ico-blue">' + I.wrench(true) + '</span><span class="body"><span class="t">Shop board</span><span class="s">Write-ups & OOS</span></span><span class="chev">' + I.chev + "</span></button>" +
        '<button type="button" class="row" data-action="goTeam"><span class="ico-blue">' + I.people(true) + '</span><span class="body"><span class="t">Team</span><span class="s">Roles & access</span></span><span class="chev">' + I.chev + "</span></button>" +
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
    var html = hdr(me ? me.name : "Driver", me ? "#" + me.driverNumber + " · " + (me.locationLabel || "") : "");

    if (pending.length) {
      html += sectionHead("Offer");
      pending.forEach(function (job) {
        html +=
          '<div class="card pad outline-orange mb-14">' +
            statusPill(job.status) +
            '<div class="load-ref" style="font-size:18px;font-weight:700;margin:8px 0 4px">' + esc(job.loadReference) + "</div>" +
            '<div class="load-cust">' + esc(job.customerName) + "</div>" +
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
      } else {
        html +=
          '<button type="button" class="btn btn-primary btn-full" data-action="createTicket" data-id="' + esc(active.id) + '">Submit ticket</button>';
      }
      html +=
        '<button type="button" class="btn btn-secondary btn-full" style="margin-top:8px" data-action="openThread" data-id="' + esc(active.id) + '">Message dispatch</button>' +
        "</div>";
    }

    if (!pending.length && !active) {
      html += emptyState("You're clear", "No offers or active loads right now");
    }

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

  function renderMessagesList() {
    var threads = myDispatches().filter(function (j) {
      return (j.messages && j.messages.length) || isMoving(j.status) || j.status === "sent";
    });
    return (
      hdr("Messages", "Dispatch threads") +
      (threads.length
        ? '<div class="card">' +
          threads.map(function (j) {
            var last = (j.messages && j.messages.length) ? j.messages[j.messages.length - 1] : null;
            return (
              '<button type="button" class="list-row" data-action="openThread" data-id="' + esc(j.id) + '">' +
                '<span class="mark" style="color:var(--blue)">' + I.message(true) + "</span>" +
                '<span class="main">' +
                  '<span class="top"><span class="name">' + esc(j.loadReference) + '</span><span class="chev">' + I.chev + "</span></span>" +
                  '<span class="line">' + esc(last ? last.text : "Tap to message dispatch") + "</span>" +
                "</span>" +
              "</button>"
            );
          }).join("") +
          "</div>"
        : emptyState("No threads", "Accept a load to chat with dispatch"))
    );
  }

  function renderThread(id) {
    var job = findDispatch(id);
    if (!job) return emptyState("Thread not found");
    var msgs = job.messages || [];
    var html =
      '<div class="card pad mb-14">' +
        '<div class="load-ref" style="font-weight:700">' + esc(job.loadReference) + "</div>" +
        '<div class="load-route">' + esc(job.origin) + " → " + esc(job.destination) + "</div>" +
      "</div>" +
      '<div class="msg-thread">';

    if (!msgs.length) {
      html += '<div class="empty"><div class="s">No messages yet — send a canned reply below.</div></div>';
    } else {
      msgs.forEach(function (m) {
        var cls = m.from === "driver" ? "me" : "them";
        html +=
          '<div class="msg ' + cls + '">' +
            '<div class="bubble">' + esc(m.text) + "</div>" +
            '<div class="at">' + esc(m.at || "") + "</div>" +
          "</div>";
      });
    }
    html += "</div>";
    html += '<div class="canned">';
    CANNED.forEach(function (t) {
      html += '<button type="button" class="btn btn-secondary" data-action="sendCanned" data-id="' + esc(job.id) + '" data-text="' + esc(t) + '">' + esc(t) + "</button>";
    });
    html += "</div>";
    return html;
  }

  function renderTickets() {
    var awaiting = ticketsAwaiting();
    var billed = ticketsBilled();
    return (
      hdr("Tickets", "Billing queue") +
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
      hdr("Team", members.length + " people") +
      '<button type="button" class="btn btn-primary btn-full mb-14" data-action="addUser">' + I.plus + " Add user</button>" +
      '<div class="card">' +
      members.map(function (m) {
        var canRemove = m.role !== "owner";
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
        '<div class="field-row"><span class="k">Signed in as</span><span class="v">' + esc(roleTitle(session.role)) + "</span></div>" +
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
      '<button type="button" class="btn btn-danger" data-action="reset">Reset demo data</button>'
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
        if (job.status === "atDelivery" || job.status === "completed") {
          html += '<button type="button" class="btn btn-primary btn-full mb-8" data-action="createTicket" data-id="' + esc(job.id) + '">Submit ticket</button>';
        }
        html += '<button type="button" class="btn btn-secondary btn-full" data-action="openThread" data-id="' + esc(job.id) + '">Messages</button>';
      }
    }

    if (session.role === "dispatcher" || session.role === "owner") {
      html += '<button type="button" class="btn btn-secondary btn-full" data-action="openThread" data-id="' + esc(job.id) + '">Message thread</button>';
    }

    return html;
  }

  function renderTicketDetail(id) {
    var t = findById(session.tickets, id);
    if (!t) return emptyState("Ticket not found");
    var canBill = session.role === "office" && t.status === "submitted";
    return (
      '<div class="pdf-ticket">' +
        '<div class="pdf-ticket-banner">' +
          '<div class="co">' + esc(session.companyName) + "</div>" +
          '<div class="doc-type">Freight ticket</div>' +
          '<div class="doc-sub">#' + esc(t.number) + " · " + esc(t.status === "billed" ? "BILLED" : "SUBMITTED") + "</div>" +
        "</div>" +
        '<div class="pdf-ticket-body">' +
          '<div class="field-row"><span class="k">Customer</span><span class="v">' + esc(t.customerName) + "</span></div>" +
          '<div class="field-row"><span class="k">Load</span><span class="v">' + esc(t.loadReference) + "</span></div>" +
          '<div class="field-row"><span class="k">Route</span><span class="v">' + esc(t.origin) + " → " + esc(t.destination) + "</span></div>" +
          '<div class="field-row"><span class="k">Driver</span><span class="v">' + esc(t.driverName) + "</span></div>" +
          '<div class="field-row"><span class="k">Unit</span><span class="v">' + esc(t.equipmentUnit) + "</span></div>" +
          '<div class="field-row"><span class="k">Commodity</span><span class="v">' + esc(t.commodity || "—") + "</span></div>" +
          '<div class="field-row"><span class="k">Amount</span><span class="v">' + money2(t.rateAmount) + "</span></div>" +
          (t.notes ? '<div class="field-row"><span class="k">Notes</span><span class="v">' + esc(t.notes) + "</span></div>" : "") +
        "</div>" +
      "</div>" +
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
          '<div class="field-row"><span class="k">Customer</span><input id="nd-customer" class="field-input" placeholder="Customer name" value="Hill Country Pipe"/></div>' +
          '<div class="field-row"><span class="k">Commodity</span><input id="nd-commodity" class="field-input" placeholder="Commodity" value="Steel pipe"/></div>' +
          '<div class="field-row"><span class="k">Origin</span><input id="nd-origin" class="field-input" value="Odessa, TX"/></div>' +
          '<div class="field-row"><span class="k">Destination</span><input id="nd-dest" class="field-input" value="Midland, TX"/></div>' +
          '<div class="field-row"><span class="k">Driver</span><select id="nd-driver">' + opts + "</select></div>" +
          '<div class="field-row"><span class="k">Unit</span><input id="nd-unit" class="field-input" value="Unit 19"/></div>' +
          '<div class="field-row"><span class="k">Rate</span><input id="nd-rate" class="field-input" type="number" value="650"/></div>' +
          '<div class="field-row"><span class="k">Miles</span><input id="nd-miles" class="field-input" type="number" value="22"/></div>' +
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

  function renderTicketSheet(jobId) {
    var job = findDispatch(jobId);
    if (!job) return emptyState("Load not found");
    var me = currentDriver();
    var num = me ? String(me.driverNumber || 1400) + String(Math.floor(Date.now() / 1000) % 100000) : "T-" + Date.now();
    return (
      '<div class="sheet-body">' +
        '<div class="pdf-ticket">' +
          '<div class="pdf-ticket-banner">' +
            '<div class="co">' + esc(session.companyName) + "</div>" +
            '<div class="doc-type">Freight ticket</div>' +
            '<div class="doc-sub">Draft · #' + esc(num) + "</div>" +
          "</div>" +
          '<div class="pdf-ticket-body">' +
            '<div class="field-row"><span class="k">Customer</span><span class="v">' + esc(job.customerName) + "</span></div>" +
            '<div class="field-row"><span class="k">Load</span><span class="v">' + esc(job.loadReference) + "</span></div>" +
            '<div class="field-row"><span class="k">Route</span><span class="v">' + esc(job.origin) + " → " + esc(job.destination) + "</span></div>" +
            '<div class="field-row"><span class="k">Commodity</span><span class="v">' + esc(job.commodity || "—") + "</span></div>" +
            '<div class="field-row"><span class="k">Amount</span><input id="tk-rate" class="field-input" type="number" value="' + esc(String(job.rateAmount || 0)) + '" style="text-align:right"/></div>' +
            '<div class="field-row"><span class="k">Notes</span><input id="tk-notes" class="field-input" placeholder="Optional" value="' + esc(job.notes || "") + '"/></div>' +
          "</div>" +
        "</div>" +
        '<input type="hidden" id="tk-job" value="' + esc(job.id) + '"/>' +
        '<input type="hidden" id="tk-number" value="' + esc(num) + '"/>' +
        '<p class="group-footer">Submit sends this ticket to Office for billing.</p>' +
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
      var active = nav.tab === t.id && nav.screen === "home";
      var iconFn = I[t.icon];
      var icon = typeof iconFn === "function" ? iconFn(active) : (iconFn || I.house(active));
      return (
        '<button type="button" class="tab' + (active ? " is-active" : "") + '" data-tab="' + esc(t.id) + '" aria-label="' + esc(t.title) + '">' +
          icon + "<span>" + esc(t.title) + "</span>" +
        "</button>"
      );
    }).join("");
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
    var hasBack = (nav.screen !== "home" && !nav.sheet) || !!nav.sheet;
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
      if (t && t.status === "submitted" && session.role === "office") {
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
    } else {
      switch (nav.tab) {
        case "board": html = renderDispatcherBoard(); break;
        case "loads": html = renderLoadsList(); break;
        case "drivers": html = renderDriversTab(); break;
        case "jobs": html = renderDriverJobs(); break;
        case "messages": html = renderMessagesList(); break;
        case "tickets": html = renderTickets(); break;
        case "shop": html = renderShop(); break;
        case "team": html = renderTeam(); break;
        case "settings": html = renderSettings(); break;
        case "home":
        default:
          html = renderHome();
      }
    }

    root.innerHTML = html;
    root.scrollTop = 0;
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
    else sheet.innerHTML = "";
  }

  function renderAll() {
    var app = document.getElementById("app");
    if (app) app.classList.toggle("has-sheet", !!nav.sheet);
    renderChips();
    renderTopBar();
    renderContent();
    renderTabBar();
    renderSheet();
  }

  /* —— Navigation —— */
  function goTab(tab) {
    nav.tab = tab;
    nav.screen = "home";
    nav.detailId = null;
    nav.sheet = null;
    nav.msgId = null;
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
    renderAll();
    toast("Signed in as " + roleTitle(role));
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

    if (action === "openTicket") {
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

    if (action === "openThread") {
      nav.screen = "thread";
      nav.detailId = id;
      nav.msgId = id;
      nav.sheet = null;
      renderAll();
      return;
    }

    if (action === "acceptJob") {
      var jobA = findDispatch(id);
      if (jobA && jobA.status === "sent") {
        jobA.status = "accepted";
        advanceTimeline(jobA, "accepted");
        setDriverDuty(jobA.driverUsername, "onLoad", jobA.origin);
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
      if (next === "atPickup") setDriverDuty(jobC.driverUsername, "onLoad", jobC.origin);
      else if (next === "loaded" || next === "inTransit") setDriverDuty(jobC.driverUsername, "onLoad", "En route · " + jobC.destination);
      else if (next === "atDelivery") setDriverDuty(jobC.driverUsername, "onLoad", jobC.destination);
      else if (next === "completed") setDriverDuty(jobC.driverUsername, "available", jobC.destination);
      toast(CHECK_LABELS[next] || "Updated");
      renderAll();
      return;
    }

    if (action === "sendDispatch") {
      var driverUser = val("nd-driver");
      var member = null;
      var i;
      for (i = 0; i < session.teamMembers.length; i++) {
        if (session.teamMembers[i].username === driverUser) { member = session.teamMembers[i]; break; }
      }
      var rate = parseFloat(val("nd-rate")) || 0;
      var miles = parseInt(val("nd-miles"), 10) || 0;
      session.dispatches.unshift({
        id: uid(),
        loadReference: val("nd-load") || nextLoadRef(),
        customerName: val("nd-customer") || "Customer",
        commodity: val("nd-commodity") || "Freight",
        origin: val("nd-origin") || "Origin",
        destination: val("nd-dest") || "Destination",
        ox: 20 + Math.floor(Math.random() * 60),
        oy: 15 + Math.floor(Math.random() * 40),
        dx: 20 + Math.floor(Math.random() * 60),
        dy: 20 + Math.floor(Math.random() * 45),
        driverName: member ? member.name : "Driver",
        driverUsername: driverUser,
        equipmentUnit: val("nd-unit") || "Unit 1",
        rateAmount: rate,
        miles: miles,
        etaLabel: "TBD",
        pickupAppt: "ASAP",
        deliveryAppt: "TBD",
        status: "sent",
        notes: val("nd-notes"),
        timeline: makeTimeline("sent"),
        messages: []
      });
      nav.sheet = null;
      nav.tab = "loads";
      nav.screen = "home";
      renderAll();
      toast("Dispatch sent");
      return;
    }

    if (action === "createTicket") {
      nav.sheet = "ticket";
      nav.detailId = id;
      renderAll();
      return;
    }

    if (action === "submitTicketSheet") {
      var jobId = val("tk-job");
      var jobT = findDispatch(jobId);
      var driverT = currentDriver();
      if (!jobT || !driverT) return;
      var amount = parseFloat(val("tk-rate")) || jobT.rateAmount || 0;
      driverT.ticketSequence = (driverT.ticketSequence || 0) + 1;
      session.tickets.unshift({
        id: uid(),
        number: val("tk-number") || String(Date.now()),
        customerName: jobT.customerName,
        loadReference: jobT.loadReference,
        origin: jobT.origin,
        destination: jobT.destination,
        driverName: driverT.name,
        driverUsername: driverT.username,
        equipmentUnit: jobT.equipmentUnit,
        commodity: jobT.commodity,
        rateAmount: amount,
        miles: jobT.miles,
        status: "submitted",
        notes: val("tk-notes")
      });
      jobT.status = "completed";
      advanceTimeline(jobT, "completed");
      setDriverDuty(driverT.username, "available", jobT.destination);
      nav.sheet = null;
      nav.tab = "home";
      nav.screen = "home";
      renderAll();
      toast("Ticket submitted to Office");
      return;
    }

    if (action === "billTicket") {
      var ticket = findById(session.tickets, id || (el && el.getAttribute("data-id")));
      if (ticket && ticket.status === "submitted") {
        ticket.status = "billed";
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
      if (!member || member.role === "owner") {
        toast("Can't remove the owner");
        return;
      }
      session.teamMembers = session.teamMembers.filter(function (m) { return m.id !== id; });
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

    if (action === "sendCanned") {
      var jobM = findDispatch(id);
      if (!jobM) return;
      if (!jobM.messages) jobM.messages = [];
      var text = el.getAttribute("data-text") || "";
      var now = new Date();
      var mm = String(now.getMinutes());
      if (mm.length < 2) mm = "0" + mm;
      jobM.messages.push({
        from: session.role === "driver" ? "driver" : "dispatch",
        text: text,
        at: now.getHours() + ":" + mm
      });
      toast("Sent");
      renderAll();
      return;
    }

    if (action === "wuStatus") {
      var wu = findById(session.writeUps, id);
      if (wu) {
        wu.status = el.getAttribute("data-status");
        toast("Write-up updated");
        renderAll();
      }
      return;
    }

    if (action === "reset") {
      var keep = session.role;
      session = makeSamples();
      session.role = keep;
      nav = { tab: defaultTabForRole(keep), screen: "home", detailId: null, sheet: null, filter: "all", msgId: null };
      renderAll();
      toast("Demo reset");
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
      nav.screen = "home";
      nav.detailId = null;
      nav.msgId = null;
      renderAll();
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

  var refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      handleAction("reset", refreshBtn);
    });
  }

  /* —— Device switch —— */
  function currentDevice() {
    var d = document.documentElement.getAttribute("data-device");
    return d === "ipad" ? "ipad" : "iphone";
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
      shell.setAttribute(
        "aria-label",
        (device === "ipad" ? "iPad" : "iPhone") + " with FleetDispatch simulator"
      );
    }
  }

  function setDevice(device, opts) {
    opts = opts || {};
    if (device !== "ipad") device = "iphone";
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
      if (q === "ipad" || q === "iphone") device = q;
      else {
        var stored = localStorage.getItem("fleetdispatch-sim-device");
        if (stored === "ipad" || stored === "iphone") device = stored;
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
      var order = ["iphone", "ipad"];
      var idx = order.indexOf(currentDevice());
      if (e.key === "ArrowLeft" || e.key === "Home") idx = 0;
      if (e.key === "ArrowRight" || e.key === "End") idx = 1;
      e.preventDefault();
      setDevice(order[idx]);
      var focusBtn = document.getElementById("device-" + order[idx]);
      if (focusBtn) focusBtn.focus();
    });
  }

  function tickClock() {
    var el = document.getElementById("clock");
    if (!el) return;
    var d = new Date();
    var m = String(d.getMinutes());
    if (m.length < 2) m = "0" + m;
    el.textContent = d.getHours() + ":" + m;
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

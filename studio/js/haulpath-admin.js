(function () {
  "use strict";

  var STATES = [
    { abbr: "AL", name: "Alabama" },
    { abbr: "AZ", name: "Arizona" },
    { abbr: "AR", name: "Arkansas" },
    { abbr: "CA", name: "California" },
    { abbr: "CO", name: "Colorado" },
    { abbr: "CT", name: "Connecticut" },
    { abbr: "DE", name: "Delaware" },
    { abbr: "FL", name: "Florida" },
    { abbr: "GA", name: "Georgia" },
    { abbr: "ID", name: "Idaho" },
    { abbr: "IL", name: "Illinois" },
    { abbr: "IN", name: "Indiana" },
    { abbr: "IA", name: "Iowa" },
    { abbr: "KS", name: "Kansas" },
    { abbr: "KY", name: "Kentucky" },
    { abbr: "LA", name: "Louisiana" },
    { abbr: "ME", name: "Maine" },
    { abbr: "MD", name: "Maryland" },
    { abbr: "MA", name: "Massachusetts" },
    { abbr: "MI", name: "Michigan" },
    { abbr: "MN", name: "Minnesota" },
    { abbr: "MS", name: "Mississippi" },
    { abbr: "MO", name: "Missouri" },
    { abbr: "MT", name: "Montana" },
    { abbr: "NE", name: "Nebraska" },
    { abbr: "NV", name: "Nevada" },
    { abbr: "NH", name: "New Hampshire" },
    { abbr: "NJ", name: "New Jersey" },
    { abbr: "NM", name: "New Mexico" },
    { abbr: "NY", name: "New York" },
    { abbr: "NC", name: "North Carolina" },
    { abbr: "ND", name: "North Dakota" },
    { abbr: "OH", name: "Ohio" },
    { abbr: "OK", name: "Oklahoma" },
    { abbr: "OR", name: "Oregon" },
    { abbr: "PA", name: "Pennsylvania" },
    { abbr: "RI", name: "Rhode Island" },
    { abbr: "SC", name: "South Carolina" },
    { abbr: "SD", name: "South Dakota" },
    { abbr: "TN", name: "Tennessee" },
    { abbr: "TX", name: "Texas" },
    { abbr: "UT", name: "Utah" },
    { abbr: "VT", name: "Vermont" },
    { abbr: "VA", name: "Virginia" },
    { abbr: "WA", name: "Washington" },
    { abbr: "WV", name: "West Virginia" },
    { abbr: "WI", name: "Wisconsin" },
    { abbr: "WY", name: "Wyoming" }
  ];

  var FIELD_GROUPS = [
    {
      title: "Legal thresholds",
      fields: [
        { id: "legalWidth", label: "Width" },
        { id: "legalHeight", label: "Height" },
        { id: "legalLength", label: "Length" },
        { id: "legalAxle", label: "Axle weight" },
        { id: "legalGvw", label: "GVW" }
      ]
    },
    {
      title: "Pilot / escort",
      fields: [
        { id: "pilotWidthOne", label: "Width — one escort" },
        { id: "pilotWidthTwo", label: "Width — two escorts" },
        { id: "pilotLengthOne", label: "Length — one escort" },
        { id: "pilotLengthTwo", label: "Length — two escorts" }
      ]
    },
    {
      title: "High pole",
      fields: [
        { id: "highPole", label: "High pole height" }
      ]
    }
  ];

  var root = null;
  var selectedAbbr = "KS";
  var search = "";

  function el(name) {
    return root ? root.querySelector('[data-el="' + name + '"]') : null;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function hideSave() {
    var btn = document.getElementById("global-save");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.disabled = true;
  }
  function stateByAbbr(abbr) {
    var i;
    for (i = 0; i < STATES.length; i += 1) {
      if (STATES[i].abbr === abbr) return STATES[i];
    }
    return STATES[0];
  }
  function filteredStates() {
    var q = String(search || "").trim().toLowerCase();
    if (!q) return STATES;
    return STATES.filter(function (st) {
      return st.name.toLowerCase().indexOf(q) !== -1 || st.abbr.toLowerCase().indexOf(q) !== -1;
    });
  }

  function shell() {
    return (
      '<div class="ops-workspace hp-admin">' +
        '<div class="ops-header">' +
          "<h1>HaulPath Admin</h1>" +
          "<p>Edit state thresholds here later. The iOS and Android apps still keep their own tables.</p>" +
        "</div>" +
        '<p class="status ops-banner is-on" data-el="banner">Studio shell only. Nothing is stored yet, and the apps still use their own tables.</p>' +
        '<div class="hp-admin-layout">' +
          '<aside class="hp-admin-rail">' +
            '<input class="hp-admin-search" data-el="search" type="search" placeholder="Find a state" autocomplete="off" />' +
            '<div class="hp-admin-states" data-el="states"></div>' +
          "</aside>" +
          '<div class="hp-admin-body" data-el="body"></div>' +
        "</div>" +
      "</div>"
    );
  }

  function fieldHtml(field) {
    return (
      '<label class="hp-admin-field">' +
        "<span>" + esc(field.label) + "</span>" +
        '<input type="text" disabled placeholder="—" data-field="' + esc(field.id) + '" />' +
      "</label>"
    );
  }

  function groupHtml(group) {
    return (
      '<section class="hp-admin-card">' +
        "<h3>" + esc(group.title) + "</h3>" +
        '<div class="hp-admin-fields">' +
          group.fields.map(fieldHtml).join("") +
        "</div>" +
      "</section>"
    );
  }

  function renderStates() {
    var box = el("states");
    if (!box) return;
    var list = filteredStates();
    if (!list.length) {
      box.innerHTML = '<p class="hp-admin-empty">No states match.</p>';
      return;
    }
    box.innerHTML = list.map(function (st) {
      var on = st.abbr === selectedAbbr ? " is-on" : "";
      return (
        '<button type="button" class="hp-admin-state' + on + '" data-state="' + esc(st.abbr) + '">' +
          "<strong>" + esc(st.abbr) + "</strong>" +
          "<span>" + esc(st.name) + "</span>" +
        "</button>"
      );
    }).join("");
  }

  function renderBody() {
    var box = el("body");
    if (!box) return;
    var st = stateByAbbr(selectedAbbr);
    box.innerHTML =
      '<div class="hp-admin-detail-head">' +
        "<h2>" + esc(st.name) + " <span>" + esc(st.abbr) + "</span></h2>" +
        "<p>These fields will hold legal, escort, and high-pole numbers for this state. Values are empty until the backend is connected.</p>" +
      "</div>" +
      FIELD_GROUPS.map(groupHtml).join("");
  }

  function render() {
    renderStates();
    renderBody();
  }

  function bindShell() {
    var searchEl = el("search");
    if (searchEl) {
      searchEl.addEventListener("input", function () {
        search = searchEl.value || "";
        renderStates();
      });
    }
    var statesEl = el("states");
    if (statesEl) {
      statesEl.addEventListener("click", function (ev) {
        var btn = ev.target.closest ? ev.target.closest("[data-state]") : null;
        if (!btn) return;
        selectedAbbr = btn.getAttribute("data-state") || selectedAbbr;
        render();
      });
    }
  }

  window.STLHaulPathAdmin = {
    mount: function (host) {
      root = host;
      var panel = host && host.closest ? host.closest(".panel") : null;
      if (panel) panel.classList.add("ops-wide");
      root.innerHTML = shell();
      hideSave();
      bindShell();
      render();
    },
    unmount: function () {
      var panel = root && root.closest ? root.closest(".panel") : null;
      if (panel) panel.classList.remove("ops-wide");
      root = null;
    }
  };
})();

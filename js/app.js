/**
 * Tx permit route assistant
 * PDF.js → heuristic segments → Mapbox Geocoding → Mapbox Map Matching (snap) → Directions/OSRM fallback.
 * Permit text is messy; waypoints are guesses — the line cannot equal TxPROS legal corridor.
 *
 * Loaded via pdf.min.js (global pdfjsLib) — not ES modules — so script runs when opened
 * from file:// or without module support.
 */

/* global pdfjsLib */
var pdfjsLibRef = typeof window !== "undefined" ? window.pdfjsLib : undefined;

const PDF_WORKER_SRC =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

const MAX_BYTES = 15 * 1024 * 1024;
/** Texas bbox for Photon bias: minLon, minLat, maxLon, maxLat */
/** Mapbox Geocoding bbox: minLon, minLat, maxLon, maxLat (Texas) */
const MAPBOX_TX_BBOX = "-106.65,25.84,-93.51,36.5";
/** Texas centroid for proximity bias (lon, lat) */
const MAPBOX_PROXIMITY = "-99.3,31.5";
const GEO_DELAY_MS = 120;
const MAX_WAYPOINTS_DIRECTIONS = 25;
/** Google allows up to 25 intermediate waypoints (origin and destination are separate). */
const GOOGLE_MAX_INTERMEDIATE_WAYPOINTS = 25;
const SAMPLE_COORDS_CAP = 18;

function hasSupabaseParserConfig() {
  return Boolean(
    typeof window !== "undefined" &&
      window.SUPABASE_URL &&
      window.SUPABASE_ANON_KEY &&
      window.SUPABASE_PARSE_FUNCTION
  );
}

function supabaseParserConfigNote() {
  if (!hasSupabaseParserConfig()) return "Supabase parser config: missing";
  return "Supabase parser config: loaded (" + window.SUPABASE_PARSE_FUNCTION + ")";
}

function readSupabaseParsedSegments(obj) {
  const segs = Array.isArray(obj?.segments)
    ? obj.segments
    : Array.isArray(obj?.route_segments)
      ? obj.route_segments
      : [];
  return segs
    .map(function (s) {
      const text = (s.text || s.road || s.route || "").toString().trim();
      const displayText = (s.displayText || s.display_text || text).toString().trim();
      if (!text && !displayText) return null;
      const legRaw =
        s.leg_miles_to_next ??
        s.legMilesToNext ??
        s.leg_miles ??
        null;
      const cumRaw =
        s.cumulative_permit_mi ??
        s.cumulativePermitMi ??
        s.permit_odometer_mi ??
        s.permitOdometerMi ??
        null;
      const leg =
        legRaw != null && legRaw !== "" && !isNaN(Number(legRaw)) ? Number(legRaw) : null;
      const cumulative =
        cumRaw != null && cumRaw !== "" && !isNaN(Number(cumRaw)) ? Number(cumRaw) : null;
      const row = {
        label: s.label || "Route",
        text: text || displayText.slice(0, 48),
        displayText: displayText || text,
        queries: Array.isArray(s.queries) ? s.queries : [],
      };
      if (leg != null) row.legMilesToNext = leg;
      if (cumulative != null) row.cumulativePermitMi = cumulative;
      return row;
    })
    .filter(Boolean);
}

async function parsePermitViaSupabase(file) {
  if (!hasSupabaseParserConfig()) return null;
  const fnUrl =
    String(window.SUPABASE_URL).replace(/\/+$/, "") +
    "/functions/v1/" +
    encodeURIComponent(String(window.SUPABASE_PARSE_FUNCTION));
  const fd = new FormData();
  fd.append("file", file, file.name || "permit.pdf");
  const key = String(window.SUPABASE_ANON_KEY || "");
  const headers = {
    apikey: key,
    Authorization: "Bearer " + key,
  };
  let res;
  try {
    res = await fetch(fnUrl, {
      method: "POST",
      headers: headers,
      body: fd,
    });
  } catch (err) {
    const why = err && err.message ? String(err.message) : "Network/CORS error";
    throw new Error(
      "Supabase parser request failed (" +
        why +
        "). Check function URL, deployment, and CORS on " +
        fnUrl
    );
  }
  if (!res.ok) {
    const t = await res.text().catch(function () {
      return "";
    });
    throw new Error("Supabase parser failed: " + (t || res.status));
  }
  const payload = await res.json();
  const out = payload?.result || payload || {};
  const parseText =
    out.parse_text ||
    out.route_text_clean ||
    out.routeTextClean ||
    out.extracted_text ||
    "";
  const segments = readSupabaseParsedSegments(out);
  return {
    parseText: parseText,
    segments: segments,
    permitNumber: out.permit_number || out.permitNumber || null,
    parserVersion: out.parser_version || out.parserVersion || null,
  };
}

/** TXPROS official route breadcrumbs (PermitDetails QR / map). */
const TXPROS_ROUTE_SERVICE_URL =
  "https://txpros.txdmv.gov/Services/RouteService.asmx/GetLatLonForPermitBody";

function isTxprosHtmlErrorResponse(text) {
  if (!text || typeof text !== "string") return true;
  if (/<!DOCTYPE/i.test(text) && /Error\s+Encountered/i.test(text)) return true;
  if (/<form[^>]+action="[^"]*Error\.aspx"/i.test(text)) return true;
  return false;
}

/**
 * @param {string} input — digits, full TXPROS URL, or text containing PermitID=
 * @returns {string | null}
 */
function extractTxprosPermitId(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  if (/^\d{4,14}$/.test(s)) return s;
  try {
    const u = new URL(s, "https://txpros.txdmv.gov");
    const id = u.searchParams.get("PermitID") || u.searchParams.get("permitID");
    if (id && /^\d+$/.test(String(id))) return String(id);
  } catch (_) {}
  const m = s.match(/PermitID=(\d+)/i) || s.match(/permitID[=:]\s*(\d+)/i);
  return m ? m[1] : null;
}

/**
 * Walk parsed JSON for the largest array of { Lat, Lon }-style points.
 * @returns {{ lat: number, lon: number }[]}
 */
function extractBreadcrumbsFromTxprosJson(data) {
  /** @type {{ lat: number, lon: number }[]} */
  let best = [];

  function scoreRow(o) {
    if (!o || typeof o !== "object") return null;
    const lat =
      o.Lat ?? o.lat ?? o.Latitude ?? o.latitude ?? o.LAT ?? null;
    const lon =
      o.Lon ?? o.lng ?? o.Lng ?? o.Longitude ?? o.longitude ?? o.LNG ?? o.LON ?? null;
    const la = typeof lat === "string" ? parseFloat(lat) : Number(lat);
    const lo = typeof lon === "string" ? parseFloat(lon) : Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
    return { lat: la, lon: lo };
  }

  function considerArray(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return;
    const row0 = scoreRow(arr[0]);
    if (!row0) return;
    const pts = [];
    for (let i = 0; i < arr.length; i++) {
      const p = scoreRow(arr[i]);
      if (p) pts.push(p);
    }
    if (pts.length > best.length) best = pts;
  }

  function walk(o, depth) {
    if (depth > 20) return;
    if (Array.isArray(o)) {
      considerArray(o);
      for (let i = 0; i < Math.min(o.length, 400); i++) {
        if (o[i] && typeof o[i] === "object") walk(o[i], depth + 1);
      }
      return;
    }
    if (o && typeof o === "object") {
      for (const k of Object.keys(o)) walk(o[k], depth + 1);
    }
  }

  walk(data, 0);
  return best;
}

/**
 * @param {string} xmlText — SOAP/XML body from RouteService
 * @returns {{ coordinates: number[][], pointCount: number, rawJson: unknown }}
 */
function parseTxprosRouteXmlResponse(xmlText) {
  if (isTxprosHtmlErrorResponse(xmlText)) {
    throw new Error(
      "TXPROS returned an HTML error page (invalid permit, server issue, or session required). Open the QR link in a tab and try again."
    );
  }

  let jsonText = "";
  const cdata = xmlText.match(/<GetLatLonForPermitResult[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/GetLatLonForPermitResult>/i);
  if (cdata) jsonText = cdata[1].trim();
  if (!jsonText) {
    const m = xmlText.match(/<GetLatLonForPermitResult[^>]*>([\s\S]*?)<\/GetLatLonForPermitResult>/i);
    if (m) jsonText = m[1].trim();
  }
  if (!jsonText) {
    try {
      const doc = new DOMParser().parseFromString(xmlText, "text/xml");
      const all = doc.getElementsByTagName("*");
      for (let i = 0; i < all.length; i++) {
        const loc = all[i].localName || "";
        if (loc === "GetLatLonForPermitResult") {
          jsonText = (all[i].textContent || "").trim();
          break;
        }
      }
    } catch (_) {}
  }

  if (!jsonText) {
    throw new Error(
      "Could not find GetLatLonForPermitResult in TXPROS response. Response may be an unexpected format."
    );
  }

  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    throw new Error("TXPROS JSON inside XML could not be parsed.");
  }

  const pts = extractBreadcrumbsFromTxprosJson(data);
  if (pts.length < 2) {
    console.warn("TXPROS JSON (unrecognized shape):", data);
    throw new Error(
      "TXPROS JSON had fewer than 2 Lat/Lon breadcrumbs. Check console for logged payload shape."
    );
  }

  const coordinates = pts.map(function (p) {
    return [p.lon, p.lat];
  });
  return { coordinates: coordinates, pointCount: coordinates.length, rawJson: data };
}

/**
 * POST to TXPROS RouteService; tries url-encoded and FormData parameter names.
 * May fail from the browser due to CORS — then use a same-origin proxy.
 */
async function fetchTxprosRoute(permitId) {
  const id = extractTxprosPermitId(permitId);
  if (!id) {
    throw new Error("Need a numeric Permit ID or a txpros.txdmv.gov link with PermitID=…. ");
  }

  const url = TXPROS_ROUTE_SERVICE_URL;
  /** @type {{ body: BodyInit | null; headers: Record<string, string> }[]} */
  const attempts = [];

  const up1 = new URLSearchParams();
  up1.set("permitID", id);
  attempts.push({ body: up1, headers: { "Content-Type": "application/x-www-form-urlencoded" } });

  const up2 = new URLSearchParams();
  up2.set("PermitID", id);
  attempts.push({ body: up2, headers: { "Content-Type": "application/x-www-form-urlencoded" } });

  const fd = new FormData();
  fd.append("permitID", id);
  attempts.push({ body: fd, headers: {} });

  const fd2 = new FormData();
  fd2.append("PermitID", id);
  attempts.push({ body: fd2, headers: {} });

  let lastProblem = null;
  for (let a = 0; a < attempts.length; a++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "omit",
        mode: "cors",
        headers: Object.assign(
          { Accept: "application/xml, text/xml, text/plain, */*" },
          attempts[a].headers
        ),
        body: attempts[a].body,
      });
      const text = await res.text();
      if (isTxprosHtmlErrorResponse(text)) {
        lastProblem = new Error("txpros_error_page");
        continue;
      }
      try {
        return parseTxprosRouteXmlResponse(text);
      } catch (parseErr) {
        lastProblem = parseErr;
      }
    } catch (e) {
      lastProblem = e;
      const msg = e && e.message ? String(e.message) : String(e);
      if (/NetworkError|Failed to fetch|Load failed|network/i.test(msg)) {
        throw new Error(
          "Browser blocked the TXPROS request (often CORS). Add a small proxy on your own origin (e.g. Supabase Edge Function) that POSTs to RouteService.asmx and returns the XML body."
        );
      }
    }
  }

  if (lastProblem && lastProblem.message === "txpros_error_page") {
    throw new Error(
      "TXPROS declined the request (error page). The permit ID may be wrong, expired, or the service may require cookies from opening the QR page first."
    );
  }
  throw lastProblem instanceof Error
    ? lastProblem
    : new Error("Could not load official route from TXPROS.");
}

/** Map Matching API allows up to 100 coordinates per request */
const MAPBOX_MATCHING_MAX = 100;
/** Chunk long traces; overlap keeps continuity between chunks */
const MAPBOX_MATCHING_CHUNK = 72;
const MAPBOX_MATCHING_OVERLAP = 12;
/**
 * Per-point uncertainty (meters) for matching — lower snaps tighter to the trace;
 * typical highway geocode error ~ tens of meters.
 */
/** Slightly loose so rural / median-offset geocodes still snap to the intended roadway */
const MAPBOX_MATCH_RADIUS_METERS = 56;

/**
 * Lines starting these headings end the route narrative block on page 1.
 * Do not use "Destination" — Tx permits put Destination before Route Conditions, which would
 * drop the Miles Route To turn-by-turn table on later pages (extracted separately).
 */
const ROUTE_SECTION_STOP_RE =
  /^\s*(Route\s+Conditions|Dimension|Dimensions|Vehicle|Load\s+description|Escort|Special\s+condition|Certification|Fee|Billing|Comments|General\s+information|Permit\s+number|Permit\s+no\.?|Effective\s+date|Expiration|Operating\s+time|Weight|Height|Width|Length)\b/i;

const ROUTE_PATTERNS = [
  { label: "Interstate", re: /\bI\s*[-–]?\s*(\d{1,3})\b/gi },
  /** IH20SFR-style frontage / ramp tokens */
  { label: "IH", re: /\bIH\s*[-–]?\s*(\d{1,3})(?:[A-Za-z]+)?\b/gi },
  /** TxDMV PDFs often use US0385 / SH0115 (leading zeros) */
  { label: "US Highway", re: /\bUS\s*[-–]?\s*0*(\d{1,3})([A-Za-z]?)\b/gi },
  { label: "State Hwy", re: /\b(?:SH|TX|State\s+Hwy\.?)\s*[-–]?\s*0*(\d{1,4})([A-Za-z]?)\b/gi },
  { label: "Farm / Ranch", re: /\b(?:FM|RM)\s*[-–]?\s*0*(\d{1,4})([A-Za-z]?)\b/gi },
  { label: "Loop", re: /\bLOOP\s*[-–]?\s*(\d{1,4}[A-Za-z]?)\b/gi },
  { label: "State Loop", re: /\bSL\s*[-–]?\s*(\d{1,4}[A-Za-z]?)\b/gi },
  { label: "Business US", re: /\b(?:BU|BUS)\s*[-–]?\s*(\d{1,3})\b/gi },
];

/** Collapse spaces within a line but keep newlines (helps route lists in PDFs). */
function normalizeWs(s) {
  return s
    .replace(/\r/g, "")
    .split("\n")
    .map(function (line) {
      return line.replace(/[ \t\f\v]+/g, " ").trim();
    })
    .join("\n")
    .trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLibRef.getDocument({ data: buf }).promise;
  const parts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const strings = tc.items.map((it) => ("str" in it ? it.str : "")).filter(Boolean);
    parts.push(strings.join(" "));
  }
  return normalizeWs(parts.join("\n"));
}

/**
 * Texas OS/OW permits usually label the drivable path under "Origin", then stop at Destination / dimensions / etc.
 * We only parse highway tokens from this slice when found.
 */
function extractRouteSection(fullText) {
  if (!fullText || typeof fullText !== "string") {
    return { routeText: "", routeSource: "none", sectionFound: false };
  }

  const lines = fullText.split(/\n/);

  /** Start after one of these headings; capture same-line text after ":" if present */
  const START_PATTERNS = [
    { key: "origin", re: /^\s*Origin\b\s*:?\s*(.*)$/i },
    { key: "point_of_origin", re: /^\s*Point\s+of\s+origin\s*:?\s*(.*)$/i },
    { key: "route_description", re: /^\s*Route\s+description\s*:?\s*(.*)$/i },
    { key: "approved_route", re: /^\s*Approved\s+route\s*:?\s*(.*)$/i },
    { key: "itinerary", re: /^\s*Itinerary\s*:?\s*(.*)$/i },
  ];

  let startIdx = -1;
  let sameLineRest = "";
  let matchedKey = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const sp of START_PATTERNS) {
      const m = line.match(sp.re);
      if (m) {
        startIdx = i;
        sameLineRest = (m[1] || "").trim();
        matchedKey = sp.key;
        break;
      }
    }
    if (startIdx >= 0) break;
  }

  if (startIdx < 0) {
    const inline = extractRouteSectionInlineOrigin(fullText);
    if (inline) return inline;
    return {
      routeText: fullText.trim(),
      routeSource: "full",
      sectionFound: false,
    };
  }

  const body = [];
  if (sameLineRest.length > 1) {
    body.push(sameLineRest);
  }

  for (let j = startIdx + 1; j < lines.length; j++) {
    const line = lines[j];
    if (ROUTE_SECTION_STOP_RE.test(line)) break;
    body.push(line);
  }

  let routeText = body.join("\n").trim();

  if (routeText.length < 12) {
    return {
      routeText: fullText.trim(),
      routeSource: "full",
      sectionFound: false,
    };
  }

  return {
    routeText,
    routeSource: matchedKey,
    sectionFound: true,
  };
}

/**
 * TxDMV PDFs put turn-by-turn under "Miles Route To" (often page 3), separate from the Route Description block.
 */
function extractTxdmvTurnByTurnBlock(fullText) {
  if (!fullText || typeof fullText !== "string") return "";
  const lines = fullText.split(/\n/).map(function (l) {
    return l.replace(/\s+/g, " ").trim();
  });
  let hdrIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*Miles\s+Route\s+To\b/i.test(lines[i])) {
      hdrIdx = i;
      break;
    }
  }
  if (hdrIdx < 0) return "";
  let start = hdrIdx;
  if (hdrIdx > 0 && /^\s*Origin\s*:/i.test(lines[hdrIdx - 1])) {
    start = hdrIdx - 1;
  }
  const out = [];
  for (let j = start; j < lines.length; j++) {
    const line = lines[j];
    if (/^\s*Texas\s+Oversize\b/i.test(line)) continue;
    if (/PAGE\s+\d+\s+of\s+\d+/i.test(line)) continue;
    out.push(line);
    if (/Arrive at destination/i.test(line)) break;
    if (/^\s*Final Destination\s*:/i.test(line)) break;
  }
  return out.join("\n").trim();
}

/** Combine heading-based slice with Miles Route To table when present (dedupe). */
function mergeParseTextWithTurnByTurn(routeSlice, fullText) {
  const base = (routeSlice || "").trim();
  const tt = extractTxdmvTurnByTurnBlock(fullText || "");
  if (!tt) return base || (fullText || "").trim();
  if (base.includes(tt)) return base;
  return base ? base + "\n\n" + tt : tt;
}

/** When PDF flattens layout, "Origin" may not be on its own line — slice after first Origin match */
function extractRouteSectionInlineOrigin(fullText) {
  const m = fullText.match(/\bOrigin\s*:?\s*/i);
  if (!m || m.index === undefined) return null;
  const rest = fullText.slice(m.index + m[0].length);
  const lines = rest.split(/\n/);
  const body = [];
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    if (ROUTE_SECTION_STOP_RE.test(line)) break;
    body.push(line);
  }
  const routeText = body.join("\n").trim();
  if (routeText.length < 12) return null;
  return { routeText, routeSource: "origin", sectionFound: true };
}

function routeSourceLabel(key) {
  if (key === "origin") return "Origin → …";
  if (key === "point_of_origin") return "Point of origin → …";
  if (key === "route_description") return "Route description";
  if (key === "approved_route") return "Approved route";
  if (key === "itinerary") return "Itinerary";
  if (key === "full") return "Full PDF (no section heading found)";
  return key || "—";
}

function normalizeCardinalDir(word) {
  if (!word) return "";
  const w = String(word).toLowerCase();
  if (w.startsWith("north")) return "north";
  if (w.startsWith("south")) return "south";
  if (w.startsWith("east")) return "east";
  if (w.startsWith("west")) return "west";
  return "";
}

/** TxDMV table rows use n, se, etc. after the route token */
function expandDirAbbrev(x) {
  const k = String(x || "").toLowerCase();
  const map = {
    n: "north",
    s: "south",
    e: "east",
    w: "west",
    ne: "northeast",
    nw: "northwest",
    se: "southeast",
    sw: "southwest",
    nb: "north",
    sb: "south",
    eb: "east",
    wb: "west",
  };
  return map[k] || "";
}

/** First explicit direction on this line (carry across lines for next highway). */
function extractPrimaryDirection(line) {
  if (!line) return "";
  let m = /\b(northbound|southbound|eastbound|westbound)\b/i.exec(line);
  if (m) return normalizeCardinalDir(m[1]);
  m = /\s([nsew]{1,2})\s+(?:Turn|Continue|Merge|Take|Bear)\b/i.exec(line);
  if (m) return expandDirAbbrev(m[1]);
  m = /\b([nsew]{1,2})\s+of\b/i.exec(line);
  if (m) return expandDirAbbrev(m[1]);
  m = /\b(?:go|head|travel|proceed|continue|run|turn)\s+(north|south|east|west)\b/i.exec(line);
  if (m) return m[1].toLowerCase();
  m = /\b(north|south|east|west)\s+(?:on|along|via)\b/i.exec(line);
  if (m) return m[1].toLowerCase();
  m = /\b(?:NB|SB|EB|WB)\b/i.exec(line);
  if (m) {
    const map = { NB: "north", SB: "south", EB: "east", WB: "west" };
    return map[m[1].toUpperCase()] || "";
  }
  return "";
}

/** Mile range like 12 to 25 or 12-25 mi */
function extractMileRange(line) {
  if (!line) return null;
  let m = line.match(
    /\b(\d+(?:\.\d+)?)\s*(?:-|–|to|through)\s*(\d+(?:\.\d+)?)\s*(?:mi(?:le)?s?|mm)?\b/i
  );
  if (m) return { from: parseFloat(m[1]), to: parseFloat(m[2]) };
  m = line.match(/\bmile(?:post|marker)?s?\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*mile(?:post|marker)?s?\s*(\d+(?:\.\d+)?)/i);
  if (m) return { from: parseFloat(m[1]), to: parseFloat(m[2]) };
  return null;
}

/** Standalone mile mentions (exclude small integers that are route numbers — heuristic: require mi/mm/mp context or decimals) */
function extractReferencedMiles(line) {
  if (!line) return [];
  const out = [];
  const re =
    /\b(?:milepost|mile\s*marker|mile|mm\.?|mp\.?|sta\.?)\s*(\d+(?:\.\d+)?)\b|\b(\d+\.\d+)\s*(?:mi|miles?)\b|\b(?:at|@)\s*(?:mile|mm)?\s*(\d+(?:\.\d+)?)\b/gi;
  let x;
  while ((x = re.exec(line)) !== null) {
    const v = parseFloat(x[1] || x[2] || x[3]);
    if (!isNaN(v) && v > 0 && v < 10000) out.push(v);
  }
  return out;
}

/** City / place hints after via, through, near, in */
function extractCityHints(line) {
  if (!line) return [];
  const places = [];
  const re =
    /\b(?:via|through|near|toward|towards|from|to|at|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    places.push(m[1]);
  }
  return places;
}

/** Normalize TxDMV-style tokens (US0385, SH0115, IH20SFR) for geocode queries */
function normalizePrintedRouteToken(raw) {
  if (!raw) return raw;
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/\bUS\s*[-–]?\s*0*(\d{1,3})([A-Za-z]?)\b/gi, function (_, n, suf) {
    return "US " + String(parseInt(n, 10)) + (suf || "");
  });
  s = s.replace(/\b(?:SH|TX)\s*[-–]?\s*0*(\d{1,4})([A-Za-z]?)\b/gi, function (_, n, suf) {
    return "SH " + String(parseInt(n, 10)) + (suf || "");
  });
  s = s.replace(/\bFM\s*[-–]?\s*0*(\d{1,4})([A-Za-z]?)\b/gi, function (_, n, suf) {
    return "FM " + String(parseInt(n, 10)) + (suf || "");
  });
  s = s.replace(/\bRM\s*[-–]?\s*0*(\d{1,4})([A-Za-z]?)\b/gi, function (_, n, suf) {
    return "RM " + String(parseInt(n, 10)) + (suf || "");
  });
  s = s.replace(/\bIH\s*[-–]?\s*(\d{1,3})([A-Za-z]*)\b/gi, function (_, n) {
    return "IH " + String(parseInt(n, 10));
  });
  return s;
}

function findHighwaysOnLine(line) {
  const raw = [];
  for (const { label, re } of ROUTE_PATTERNS) {
    const rx = new RegExp(re.source, re.flags);
    let m;
    while ((m = rx.exec(line)) !== null) {
      const token = normalizePrintedRouteToken(m[0].replace(/\s+/g, " ").trim());
      raw.push({
        label,
        text: token,
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const nonOverlap = [];
  let lastEnd = -1;
  for (const r of raw) {
    if (r.start < lastEnd) continue;
    nonOverlap.push(r);
    lastEnd = r.end;
  }
  return nonOverlap;
}

function interstateSpoken(highwayText) {
  const ih = highwayText.match(/\b(?:IH|I)\s*[-–]?\s*(\d{1,3})(?:[A-Za-z]+)?\b/i);
  if (ih) return "Interstate " + String(parseInt(ih[1], 10));
  return highwayText;
}

function dedupeStrings(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    const k = s.replace(/\s+/g, " ").trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s.replace(/\s+/g, " ").trim());
  }
  return out;
}

/**
 * Build ordered geocode query lists using road name + direction + miles + city when present.
 */
function buildGeocodeQueryList(highwayText, direction, city, mileRange, extraMiles) {
  const road = highwayText.trim();
  const spoken = interstateSpoken(road);
  const dir = direction || "";
  const cityPart = city ? city.trim() : "";
  const queries = [];

  if (mileRange && mileRange.from != null && mileRange.to != null) {
    queries.push(
      `${spoken} mile ${mileRange.from} ${dir} Texas`,
      `${spoken} mile ${mileRange.to} ${dir} Texas`,
      `${road} mile ${mileRange.from} Texas`,
      `${road} mile ${mileRange.to} Texas`
    );
  } else {
    const mile = extraMiles && extraMiles.length ? extraMiles[0] : null;
    const core = [spoken];
    if (dir) core.push(dir);
    if (cityPart) core.push(cityPart);
    if (mile != null) core.push(`mile ${mile}`);
    core.push("Texas");
    queries.push(core.join(" "));
    queries.push(`${road} ${dir} ${cityPart} Texas`.replace(/\s+/g, " ").trim());
    queries.push(`${spoken} ${cityPart} Texas`.replace(/\s+/g, " ").trim());
    queries.push(`${road}, Texas`);
  }

  return dedupeStrings(queries);
}

function formatStopSummary(hw, direction, mileRange, city, extraMiles) {
  const bits = [hw.text];
  if (direction) bits.push(direction);
  if (city) bits.push("@" + city);
  if (mileRange) bits.push("mi " + mileRange.from + "–" + mileRange.to);
  else if (extraMiles && extraMiles.length) bits.push("mi " + extraMiles[0]);
  return bits.join(" ");
}

/** FM-51 / TX-171 style → spaced tokens for regex */
function normalizeHyphensForMatching(line) {
  return line.replace(/\b(FM|RM|SH|US|TX)-(\d+)\b/gi, "$1 $2");
}

/** Canonical key so we can merge repeated IH 20 / US 385 rows */
function normalizeRouteKey(text) {
  if (!text) return "";
  const s = normalizePrintedRouteToken(text).replace(/\s+/g, " ").trim().toLowerCase();
  const ih = s.match(/\b(?:ih|i)\s*[-–]?\s*(\d{1,3})\b/);
  if (ih) return "ih:" + parseInt(ih[1], 10);
  const us = s.match(/\bus\s*[-–]?\s*(\d{1,3})\b/);
  if (us) return "us:" + parseInt(us[1], 10);
  const sh = s.match(/\bsh\s*[-–]?\s*(\d{1,4})\b/);
  if (sh) return "sh:" + parseInt(sh[1], 10);
  const fm = s.match(/\bfm\s*[-–]?\s*(\d{1,4})\b/);
  if (fm) return "fm:" + parseInt(fm[1], 10);
  const lp = s.match(/\bloop\s*[-–]?\s*(\d{1,4})\b/);
  if (lp) return "loop:" + lp[1];
  const sl = s.match(/\bsl\s*[-–]?\s*(\d{1,4})\b/);
  if (sl) return "sl:" + sl[1];
  return s.replace(/\s/g, "");
}

function parseDirAfterHighway(fullLine, hw) {
  const after = fullLine.slice(hw.end);
  const dm = /^\s*([nsew]{1,2})\b/i.exec(after);
  return dm ? expandDirAbbrev(dm[1]) : "";
}

function extractExitNumber(line) {
  const m = /\bExit\s+(\d+)\b/i.exec(line);
  return m ? m[1] : "";
}

/** Last slash segment in "toward …" is usually a city (e.g. …/GRANBURY) */
function extractTowardCityFromLine(line) {
  const m = /\btoward\s+([^[\n]+)/i.exec(line);
  if (!m) return "";
  let chunk = m[1].trim();
  chunk = chunk.replace(/\s+\d+\.\d+\s+\d+:\d+\s*$/, "").trim();
  const parts = chunk.split("/").map(function (p) {
    return p.replace(/\[[^\]]*\]/g, "").trim();
  }).filter(Boolean);
  if (!parts.length) return "";
  const last = parts[parts.length - 1];
  if (/^[A-Za-z]/.test(last) && last.length > 2 && !/^\d/.test(last)) {
    return last.replace(/\s+/g, " ").trim();
  }
  return "";
}

function enrichQueriesForTxRow(queries, hw, dir, line, legMiles, _cumulativeMi) {
  const spoken = interstateSpoken(hw.text);
  const isIH =
    /\bIH\b/i.test(hw.text) ||
    /\bI\s*[-–]?\s*\d{1,3}\b/i.test(hw.text) ||
    spoken.indexOf("Interstate ") === 0;
  let out = queries.slice();
  const exitNum = extractExitNumber(line);
  if (isIH && exitNum) {
    out = dedupeStrings([
      `${spoken} Exit ${exitNum} Texas`,
      `${spoken} Exit ${exitNum} ${dir || ""} Texas`.replace(/\s+/g, " ").trim(),
    ]).concat(out);
  }
  const toward = extractTowardCityFromLine(line);
  if (isIH && toward) {
    out = dedupeStrings([`${spoken} near ${toward} Texas`, `${spoken} ${toward} Texas`]).concat(
      out
    );
  }
  if (dir && legMiles != null && legMiles > 0 && legMiles < 500) {
    out = dedupeStrings([
      `${hw.text} ${dir} Texas highway`,
      `${spoken} ${dir} Texas`,
    ]).concat(out);
  }
  return dedupeStrings(out);
}

/** TxDMV table: first column = miles on this road until next maneuver (not necessarily milepost). */
function extractLeadingLegMiles(line) {
  if (!line) return null;
  const m = line.match(/^\s*(?:<[\s]*([\d.]+)|([\d.]+))\s+/);
  if (!m) return null;
  const v = parseFloat(m[1] || m[2]);
  return !isNaN(v) && v >= 0 ? v : null;
}

/**
 * When TxDMV slices start at "Origin" we often only keep text after the colon, so the first
 * line has no "Origin:" label — still treat it as the permit start for geocoding.
 */
function extractPermitOriginFallbackFirstLine(routeText) {
  if (!routeText) return "";
  const lines = routeText
    .split(/\n/)
    .map(function (l) {
      return l.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
  for (let i = 0; i < Math.min(lines.length, 28); i++) {
    const line = normalizeHyphensForMatching(lines[i]);
    if (shouldParseAsTxdmvTableRow(line)) continue;
    if (/^\s*Miles\s+Route\s+To\b/i.test(line)) continue;
    if (/^\s*Origin\s*:/i.test(line)) continue;
    if (/^\s*Destination\s*:/i.test(line)) continue;
    if (/^\s*\[Loaded Route/i.test(line)) continue;
    if (/^\s*Texas\s+Oversize\b/i.test(line)) continue;
    if (/PAGE\s+\d+\s+of\s+\d+/i.test(line)) continue;
    if (line.length < 12) continue;
    if (/^(Continue|Turn|Merge|Take|Bear)\b/i.test(line)) continue;
    if (
      /\b(TX|Texas)\b/i.test(line) ||
      /,\s*[A-Z]{2}\b/.test(line) ||
      /\b(US|SH|FM|IH)\s*\d/i.test(line) ||
      /\bInterstate\b/i.test(line)
    ) {
      return line.trim();
    }
  }
  return "";
}

function routeOriginLineMatchesNarrative(lineNorm, narrNorm) {
  if (!lineNorm || !narrNorm) return false;
  if (lineNorm === narrNorm) return true;
  if (lineNorm.length >= 12 && narrNorm.length >= 12) {
    if (lineNorm.indexOf(narrNorm) === 0 || narrNorm.indexOf(lineNorm) === 0) return true;
  }
  return false;
}

/** Longest Origin narrative on the permit (page 1 or table header). */
function extractPermitOriginNarrative(routeText) {
  if (!routeText) return "";
  const lines = routeText
    .split(/\n/)
    .map(function (l) {
      return l.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
  let best = "";
  for (let i = 0; i < lines.length; i++) {
    const m = /\bOrigin\s*:\s*(.+)$/i.exec(lines[i]);
    if (m) {
      const rest = m[1].trim();
      if (rest.length > best.length) best = rest;
    }
  }
  best = normalizeHyphensForMatching(best).trim();
  if (!best || best.length < 6) {
    const fb = extractPermitOriginFallbackFirstLine(routeText);
    if (fb) best = fb;
  }
  return best;
}

function extractPermitDestinationNarrative(routeText) {
  if (!routeText) return "";
  const lines = routeText
    .split(/\n/)
    .map(function (l) {
      return l.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
  let best = "";
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*Destination\s*:\s*(.+)$/i.exec(lines[i]);
    if (m) {
      const rest = m[1].trim();
      if (rest.length > best.length) best = rest;
    }
    const mFinal = /^\s*Final Destination\s*:\s*(.+)$/i.exec(lines[i]);
    if (mFinal) {
      const restFinal = mFinal[1].trim();
      if (restFinal.length > best.length) best = restFinal;
    }
    const mLoaded = /^\s*\[Loaded Route Destination\s*:\s*(.+?)\s*\]?\s*$/i.exec(lines[i]);
    if (mLoaded) {
      const restLoaded = mLoaded[1].trim();
      if (restLoaded.length > best.length) best = restLoaded;
    }
  }
  return normalizeHyphensForMatching(best).trim();
}

/** Single high-priority stop so the route starts where the permit says (not first table token). */
function buildPermitAnchorStop(kind, narrativeBody) {
  const normalized = normalizeHyphensForMatching(narrativeBody).trim();
  if (!normalized || normalized.length < 6) return null;
  const highways = findHighwaysOnLine(normalized);
  const hw0 = highways[0];
  const token = hw0 ? hw0.text : normalized.slice(0, 48);
  const queries = dedupeStrings([
    normalized + " Texas",
    normalized + " TX",
    "Texas " + normalized,
    normalized + " United States",
    token + " Texas",
  ]);
  return {
    label: kind === "destination" ? "Destination" : "Origin",
    text: token,
    displayText:
      (kind === "destination" ? "End · " : "Start · ") + normalized.slice(0, 140),
    queries: queries,
    permitAnchor: kind,
    skipCollapse: true,
  };
}

function shouldParseAsTxdmvTableRow(line) {
  if (/^\s*Miles\s+Route\s+To\b/i.test(line)) return false;
  if (/^\s*\[Loaded Route/i.test(line)) return false;
  if (/^\s*Final Destination\s*:/i.test(line)) return false;
  if (/^\s*Texas\s+Oversize\b/i.test(line)) return false;
  return (
    /^\s*(?:<[\s]*[\d.]+|[\d.]+\s+)\S/.test(line) &&
    /\b(Turn|Continue|Merge|Take|Bear|Arrive)\b/i.test(line)
  );
}

function isPermitNoiseLine(line) {
  if (!line) return true;
  if (/^\s*Texas\s+Oversize\/Overweight\b/i.test(line)) return true;
  if (/^\s*PAGE\s+\d+\s+of\s+\d+\b/i.test(line)) return true;
  if (/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/i.test(line)) return true;
  if (/^\s*Name:\s+.+\s+Permit Number\b/i.test(line)) return true;
  if (/^\s*General Conditions(?:\(Continued\))?\s*:/i.test(line)) return true;
  return false;
}

function isLikelyWrappedTableContinuation(line) {
  if (!line) return false;
  if (/^\s*(?:<[\s]*[\d.]+|[\d.]+)\s+\S/.test(line)) return false;
  if (/^\s*(Origin|Destination|Final Destination|Miles\s+Route\s+To)\b/i.test(line)) return false;
  if (/^\s*\[Loaded Route/i.test(line)) return false;
  if (isPermitNoiseLine(line)) return false;
  if (/^\s*\*\*/.test(line)) return false;
  if (/^\s*\d+\s/.test(line)) return false;
  if (line.length < 2) return false;
  return true;
}

function coalescePermitRouteLines(routeText) {
  if (!routeText) return [];
  const src = routeText
    .split(/\n/)
    .map(function (l) {
      return l.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const line = normalizeHyphensForMatching(src[i]);
    if (isPermitNoiseLine(line)) continue;
    if (isLikelyWrappedTableContinuation(line) && out.length) {
      const prev = out[out.length - 1];
      const prevLooksTable =
        /^\s*(?:<[\s]*[\d.]+|[\d.]+)\s+\S/.test(prev) ||
        /\b(Turn|Continue|Merge|Take|Bear|Arrive|DETOUR)\b/i.test(prev);
      if (prevLooksTable) {
        out[out.length - 1] = (prev + " " + line).replace(/\s+/g, " ").trim();
        continue;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * One turn-by-turn row: segment mileage column + "US385 n Turn … onto LOOP 1910 se".
 * Direction after each road token applies to that road only (not a global pending dir).
 * @param cumulativeAfterRow — approximate miles from start along permit odometer column after this leg
 */
function parseTableRowStops(line, cumulativeBeforeRow, legMiles, cumulativeAfterRow) {
  const normalizedLine = normalizeHyphensForMatching(line);
  let work = normalizedLine.replace(/^\s*(?:<[\s]*[\d.]+|[\d.]+\s+)/, "");
  work = work.replace(/^\[[^\]]*\]\s*/, "").trim();
  if (!work) return [];

  const mileRange = extractMileRange(normalizedLine);
  const extraMiles = extractReferencedMiles(normalizedLine);
  const cities = extractCityHints(normalizedLine);
  const city = cities[0] || "";
  const mileForSegment =
    mileRange || !extraMiles.length ? [] : [extraMiles[0]];

  const highways = findHighwaysOnLine(work);
  const stops = [];
  const seenKey = new Set();

  const legBit =
    legMiles != null && !isNaN(legMiles)
      ? " · " + legMiles + " mi to next turn"
      : "";
  const cumBit =
    cumulativeAfterRow != null && cumulativeAfterRow > 0
      ? " · ~" + Math.round(cumulativeAfterRow) + " mi from start (permit)"
      : "";

  /** Prefer the current-road token and the immediate "onto/on" road to avoid noisy bracket alternates. */
  const preferred = [];
  if (highways.length) preferred.push(highways[0]);
  const ontoMatch = /\b(?:onto|on)\s+(.+)$/i.exec(work);
  if (ontoMatch) {
    const nextRoads = findHighwaysOnLine(ontoMatch[1]);
    if (nextRoads.length) preferred.push(nextRoads[0]);
  }
  const chosen = preferred.length ? preferred : highways.slice(0, 2);

  for (const hw of chosen) {
    const rk = normalizeRouteKey(hw.text);
    if (seenKey.has(rk)) continue;
    seenKey.add(rk);

    const dir = parseDirAfterHighway(work, hw);
    let queries = buildGeocodeQueryList(hw.text, dir, city, null, mileForSegment);
    queries = enrichQueriesForTxRow(
      queries,
      hw,
      dir,
      normalizedLine,
      legMiles,
      cumulativeAfterRow
    );
    stops.push({
      label: hw.label,
      text: hw.text,
      displayText:
        formatStopSummary(hw, dir, null, city, mileForSegment) + legBit + cumBit,
      queries: queries,
      legMilesToNext: legMiles != null ? legMiles : null,
      cumulativePermitMi: cumulativeAfterRow != null ? cumulativeAfterRow : null,
    });
  }
  return stops;
}

/**
 * Repeating highway tokens on the permit (e.g. many IH 20 rows) are distinct maneuvers.
 * Collapsing them to first+last drops intermediate exits and wrecks the driving route.
 * Only drop consecutive rows that are true duplicates (same queries + same row label).
 */
function collapseSameRoadRuns(stops) {
  if (stops.length < 2) return stops;
  const out = [];
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (s.skipCollapse || s.permitAnchor) {
      out.push(s);
      continue;
    }
    const prev = out[out.length - 1];
    if (
      prev &&
      !prev.skipCollapse &&
      !prev.permitAnchor &&
      normalizeRouteKey(prev.text) === normalizeRouteKey(s.text) &&
      (prev.displayText || "") === (s.displayText || "") &&
      JSON.stringify(prev.queries || []) === JSON.stringify(s.queries || [])
    ) {
      continue;
    }
    out.push(s);
  }
  return out;
}

/**
 * Line-order structured stops with rich queries (fallback to regex-only if empty).
 */
function parseStructuredWaypoints(routeText) {
  if (!routeText || routeText.length < 8) return [];

  const lines = coalescePermitRouteLines(routeText);

  const stops = [];

  const originNarr = extractPermitOriginNarrative(routeText);
  let originPrepended = false;
  if (originNarr) {
    const oStop = buildPermitAnchorStop("origin", originNarr);
    if (oStop) {
      stops.push(oStop);
      originPrepended = true;
    }
  }

  const destNarr = extractPermitDestinationNarrative(routeText);
  const willAppendDest = Boolean(destNarr);

  let liStart = 0;
  if (originPrepended && originNarr && lines.length > 0) {
    const fl = normalizeHyphensForMatching(lines[0]);
    if (routeOriginLineMatchesNarrative(fl, originNarr)) {
      liStart = 1;
    }
  }

  let pendingDir = "";
  let tableCumulativeMi = 0;
  let inTurnTable = false;
  let sawTurnTable = false;

  for (let li = liStart; li < lines.length; li++) {
    const line = normalizeHyphensForMatching(lines[li]);

    if (/^\s*Origin\s*:/i.test(line) && originPrepended) {
      continue;
    }
    if (/^\s*Destination\s*:/i.test(line) && willAppendDest) {
      continue;
    }

    if (/^\s*Miles\s+Route\s+To\b/i.test(line)) {
      inTurnTable = true;
      sawTurnTable = true;
      continue;
    }
    if (/^\s*Final Destination\s*:/i.test(line)) {
      inTurnTable = false;
      continue;
    }

    if (sawTurnTable && !inTurnTable) {
      continue;
    }

    if (shouldParseAsTxdmvTableRow(line)) {
      const legMiles = extractLeadingLegMiles(line);
      const cumBefore = tableCumulativeMi;
      if (legMiles != null && !isNaN(legMiles)) {
        tableCumulativeMi += legMiles;
      }
      const rowStops = parseTableRowStops(
        line,
        cumBefore,
        legMiles,
        tableCumulativeMi
      );
      for (let ri = 0; ri < rowStops.length; ri++) {
        stops.push(rowStops[ri]);
      }
      continue;
    }

    if (sawTurnTable) {
      continue;
    }

    const dirLine = extractPrimaryDirection(line);
    if (dirLine) pendingDir = dirLine;

    const mileRange = extractMileRange(line);
    const extraMiles = extractReferencedMiles(line);
    const cities = extractCityHints(line);
    const city = cities[0] || "";

    const highways = findHighwaysOnLine(line);
    if (!highways.length) continue;

    const mileForSegment =
      !mileRange && extraMiles.length ? [extraMiles[0]] : [];

    const seenHwKey = new Set();
    for (const hw of highways) {
      const rk = normalizeRouteKey(hw.text);
      if (!mileRange && seenHwKey.has(rk)) continue;
      if (!mileRange) seenHwKey.add(rk);

      const spoken = interstateSpoken(hw.text);
      const dirAfter = parseDirAfterHighway(line, hw);
      const dirUse = dirAfter || pendingDir;

      if (mileRange && mileRange.from != null && mileRange.to != null) {
        const dir = dirUse || "";
        const qFrom = dedupeStrings([
          `${spoken} mile ${mileRange.from} ${dir} Texas`,
          `${hw.text} mile ${mileRange.from} ${dir} Texas`,
          `${spoken} mile ${mileRange.from} Texas`,
        ]);
        const qTo = dedupeStrings([
          `${spoken} mile ${mileRange.to} ${dir} Texas`,
          `${hw.text} mile ${mileRange.to} ${dir} Texas`,
          `${spoken} mile ${mileRange.to} Texas`,
        ]);
        stops.push({
          label: hw.label,
          text: hw.text,
          displayText:
            hw.text + " mi " + mileRange.from + (city ? " @" + city : ""),
          queries: qFrom,
        });
        stops.push({
          label: hw.label,
          text: hw.text,
          displayText:
            hw.text + " mi " + mileRange.to + (city ? " @" + city : ""),
          queries: qTo,
        });
        continue;
      }

      let queries = buildGeocodeQueryList(
        hw.text,
        dirUse,
        city,
        null,
        mileForSegment
      );
      queries = enrichQueriesForTxRow(
        queries,
        hw,
        dirUse,
        line,
        undefined,
        undefined
      );
      const displayText = formatStopSummary(
        hw,
        dirUse,
        null,
        city,
        mileForSegment
      );
      stops.push({
        label: hw.label,
        text: hw.text,
        displayText: displayText,
        queries: queries,
      });
    }
  }

  if (willAppendDest && destNarr) {
    const dStop = buildPermitAnchorStop("destination", destNarr);
    if (dStop) {
      dStop.skipCollapse = true;
      stops.push(dStop);
    }
  }

  return collapseSameRoadRuns(stops);
}

/**
 * Collect route tokens in PDF order; skip overlapping regex hits; drop consecutive duplicates.
 */
function extractRouteHints(text) {
  const raw = [];

  for (const { label, re } of ROUTE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const token = normalizePrintedRouteToken(m[0].replace(/\s+/g, " ").trim());
      raw.push({
        label,
        text: token,
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  raw.sort((a, b) => a.start - b.start || b.end - a.end);

  const nonOverlap = [];
  let lastEnd = -1;
  for (const r of raw) {
    if (r.start < lastEnd) continue;
    nonOverlap.push(r);
    lastEnd = r.end;
  }

  return nonOverlap.map((r) => ({
    label: r.label,
    text: r.text,
    index: r.start,
  }));
}

function guessPermitMeta(text) {
  const permitNo =
    text.match(/\b(?:permit|perm\.?)\s*#?\s*:?\s*([A-Z0-9][A-Z0-9\-]{4,})\b/i) ||
    text.match(/\b([A-Z]{2,4}\d{6,12})\b/);
  return {
    permitNumber: permitNo ? permitNo[1] : null,
    extractedChars: text.length,
  };
}

function photonQuery(h) {
  return `${h.text}, Texas, United States`;
}

/**
 * Mapbox Geocoding — US + Texas bbox; better highway handling than raw Photon for many tokens.
 * @param {{ lon: number, lat: number } | null} proximityPrior — bias toward previous waypoint so
 *   sequential “IH 20 …” rows land farther east/west along the corridor instead of the same marker.
 */
async function geocodeMapboxPlaces(query, accessToken, proximityPrior) {
  if (!accessToken || !query) return null;
  const base =
    "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
    encodeURIComponent(query) +
    ".json";
  const prox =
    proximityPrior &&
    typeof proximityPrior.lon === "number" &&
    typeof proximityPrior.lat === "number"
      ? `${proximityPrior.lon},${proximityPrior.lat}`
      : MAPBOX_PROXIMITY;
  const params = new URLSearchParams({
    access_token: accessToken,
    country: "us",
    limit: "1",
    proximity: prox,
    bbox: MAPBOX_TX_BBOX,
  });
  const res = await fetch(base + "?" + params.toString());
  if (!res.ok) return null;
  const data = await res.json();
  const f = data.features?.[0];
  if (!f?.center || f.center.length < 2) return null;
  const [lon, lat] = f.center;
  const label = f.place_name || f.text || query;
  return { lat, lon, label };
}

/**
 * Geocode one stop: prefers structured `queries` from permit parsing, then defaults.
 * @param {{ lon: number, lat: number } | null} proximityPrior — last successful point along the permit.
 */
async function geocodeSegment(h, accessToken, proximityPrior) {
  const legacy = [
    `${h.text}, Texas`,
    h.text + " highway Texas",
    photonQuery(h),
  ];

  const attempts =
    Array.isArray(h.queries) && h.queries.length > 0
      ? h.queries.concat(legacy)
      : legacy;

  if (accessToken) {
    for (let i = 0; i < attempts.length; i++) {
      const q = attempts[i];
      if (!q) continue;
      const r = await geocodeMapboxPlaces(q, accessToken, proximityPrior);
      if (r) return { ...r, source: "mapbox", matchedQuery: q };
      if (i < 4) await sleep(40);
    }
  }

  await sleep(GEO_DELAY_MS);
  try {
    const fallbackQ = attempts[0] || legacy[0];
    let url =
      `https://photon.komoot.io/api/?q=${encodeURIComponent(fallbackQ)}` +
      `&limit=3&bbox=${encodeURIComponent("-106.7,25.8,-93.5,36.6")}`;
    if (
      proximityPrior &&
      typeof proximityPrior.lon === "number" &&
      typeof proximityPrior.lat === "number"
    ) {
      url += `&lon=${proximityPrior.lon}&lat=${proximityPrior.lat}`;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const f = data.features?.[0];
    if (!f?.geometry?.coordinates) return null;
    const [lon, lat] = f.geometry.coordinates;
    const name = f.properties?.name || f.properties?.street || fallbackQ;
    return { lat, lon, label: name, source: "photon", matchedQuery: fallbackQ };
  } catch (_) {
    return null;
  }
}

function sampleEvenly(coords, max) {
  if (coords.length <= max) return coords;
  const out = [];
  const n = coords.length;
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * (n - 1)) / (max - 1));
    out.push(coords[idx]);
  }
  return out;
}

function dedupeConsecutiveCoords(coords) {
  const out = [];
  for (const c of coords) {
    const prev = out[out.length - 1];
    if (
      prev &&
      Math.abs(prev.lat - c.lat) < 1e-5 &&
      Math.abs(prev.lon - c.lon) < 1e-5
    ) {
      continue;
    }
    out.push(c);
  }
  return out;
}

/** Encoded polyline → [[lng, lat], …] for GeoJSON (fallback if overview_path missing). */
function decodeEncodedPolyline(encoded) {
  if (!encoded || typeof encoded !== "string") return [];
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    coordinates.push([lng / 1e5, lat / 1e5]);
  }
  return coordinates;
}

let googleMapsScriptPromise = null;

function loadGoogleMapsJs(apiKey) {
  if (!apiKey) return Promise.reject(new Error("Missing Google Maps API key"));
  if (typeof google !== "undefined" && google.maps && google.maps.DirectionsService) {
    return Promise.resolve();
  }
  if (googleMapsScriptPromise) return googleMapsScriptPromise;
  googleMapsScriptPromise = new Promise(function (resolve, reject) {
    const s = document.createElement("script");
    s.src =
      "https://maps.googleapis.com/maps/api/js?key=" +
      encodeURIComponent(apiKey);
    s.async = true;
    s.defer = true;
    s.onload = function () {
      resolve();
    };
    s.onerror = function () {
      googleMapsScriptPromise = null;
      reject(new Error("Google Maps JS failed to load"));
    };
    document.head.appendChild(s);
  });
  return googleMapsScriptPromise;
}

/**
 * Google Directions — one request within waypoint limits.
 */
async function routeGoogleDirectionsSingle(coords, apiKey) {
  if (!apiKey || coords.length < 2) return null;
  try {
    await loadGoogleMapsJs(apiKey);
  } catch (e) {
    console.warn(e);
    return null;
  }

  const clean = dedupeConsecutiveCoords(coords);
  if (clean.length < 2) return null;

  const maxTotal = GOOGLE_MAX_INTERMEDIATE_WAYPOINTS + 2;
  if (clean.length > maxTotal) return null;

  const origin = clean[0];
  const destination = clean[clean.length - 1];
  let middle = clean.slice(1, -1);
  if (middle.length > GOOGLE_MAX_INTERMEDIATE_WAYPOINTS) {
    middle = middle.slice(0, GOOGLE_MAX_INTERMEDIATE_WAYPOINTS);
  }

  const svc = new google.maps.DirectionsService();
  const request = {
    origin: new google.maps.LatLng(origin.lat, origin.lon),
    destination: new google.maps.LatLng(destination.lat, destination.lon),
    travelMode: google.maps.TravelMode.DRIVING,
    optimizeWaypoints: false,
    waypoints: middle.map(function (c) {
      return {
        location: new google.maps.LatLng(c.lat, c.lon),
        stopover: true,
      };
    }),
  };

  return new Promise(function (resolve) {
    svc.route(request, function (result, status) {
      if (status !== google.maps.DirectionsStatus.OK || !result?.routes?.[0]) {
        if (status !== google.maps.DirectionsStatus.ZERO_RESULTS) {
          console.warn("Google Directions:", status);
        }
        resolve(null);
        return;
      }
      const route = result.routes[0];
      let coordinates = [];

      if (route.overview_path && route.overview_path.length) {
        route.overview_path.forEach(function (ll) {
          coordinates.push([ll.lng(), ll.lat()]);
        });
      }

      if (!coordinates.length) {
        let enc = null;
        if (route.overview_polyline) {
          enc =
            typeof route.overview_polyline === "string"
              ? route.overview_polyline
              : route.overview_polyline.points;
        }
        if (enc) {
          coordinates = decodeEncodedPolyline(enc);
        }
      }

      if (!coordinates.length) {
        resolve(null);
        return;
      }

      resolve({
        type: "LineString",
        coordinates: coordinates,
      });
    });
  });
}

/**
 * Long permits — chain Google requests with overlapping endpoints (no subsampling).
 */
async function routeGoogleDirections(coords, apiKey) {
  if (!apiKey || coords.length < 2) return null;
  const clean = dedupeConsecutiveCoords(coords);
  if (clean.length < 2) return null;

  const maxTotal = GOOGLE_MAX_INTERMEDIATE_WAYPOINTS + 2;
  if (clean.length <= maxTotal) {
    return await routeGoogleDirectionsSingle(clean, apiKey);
  }

  const geoms = [];
  let start = 0;
  while (start < clean.length - 1) {
    const end = Math.min(start + maxTotal, clean.length);
    const slice = clean.slice(start, end);
    const g = await routeGoogleDirectionsSingle(slice, apiKey);
    if (!g) return null;
    geoms.push(g);
    if (end >= clean.length) break;
    start = end - 1;
  }
  return stitchLineStringGeometries(geoms);
}

/**
 * Mapbox Directions — one request (≤ max waypoints). Driving profile (not OS/OW legal).
 */
async function routeMapboxDirectionsSingle(coords, accessToken) {
  if (!accessToken || coords.length < 2) return null;
  const path = coords.map((c) => `${c.lon},${c.lat}`).join(";");
  const params = new URLSearchParams({
    access_token: accessToken,
    geometries: "geojson",
    overview: "full",
    alternatives: "false",
  });
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${path}?` +
    params.toString();
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.routes?.[0]?.geometry) {
    if (data.message) console.warn("Mapbox Directions:", data.message);
    return null;
  }
  return data.routes[0].geometry;
}

/**
 * Chain requests when the permit has many rows — never subsample waypoints (that skipped exits).
 */
async function routeMapboxDirections(coords, accessToken) {
  if (!accessToken) return null;
  const clean = dedupeConsecutiveCoords(coords);
  if (clean.length < 2) return null;
  if (clean.length <= MAX_WAYPOINTS_DIRECTIONS) {
    return await routeMapboxDirectionsSingle(clean, accessToken);
  }
  const geoms = [];
  let start = 0;
  while (start < clean.length - 1) {
    const end = Math.min(start + MAX_WAYPOINTS_DIRECTIONS, clean.length);
    const slice = clean.slice(start, end);
    const g = await routeMapboxDirectionsSingle(slice, accessToken);
    if (!g) return null;
    geoms.push(g);
    if (end >= clean.length) break;
    start = end - 1;
  }
  return stitchLineStringGeometries(geoms);
}

async function routeOsrmSingle(coords) {
  if (coords.length < 2) return null;
  const coordPath = coords.map((c) => `${c.lon},${c.lat}`).join(";");
  const url =
    `https://router.project-osrm.org/route/v1/driving/${coordPath}` +
    `?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.[0]?.geometry) return null;
  return data.routes[0].geometry;
}

/** OSRM public demo — fallback if Mapbox Directions fails (quota, NoRoute, etc.). */
async function routeOsrm(coords) {
  const clean = dedupeConsecutiveCoords(coords);
  if (clean.length < 2) return null;
  if (clean.length <= MAX_WAYPOINTS_DIRECTIONS) {
    return await routeOsrmSingle(clean);
  }
  const geoms = [];
  let start = 0;
  while (start < clean.length - 1) {
    const end = Math.min(start + MAX_WAYPOINTS_DIRECTIONS, clean.length);
    const slice = clean.slice(start, end);
    const g = await routeOsrmSingle(slice);
    if (!g) return null;
    geoms.push(g);
    if (end >= clean.length) break;
    start = end - 1;
  }
  return stitchLineStringGeometries(geoms);
}

function stitchLineStringGeometries(geoms) {
  if (!geoms.length) return null;
  const all = [];
  for (let g = 0; g < geoms.length; g++) {
    const coords = geoms[g].coordinates || [];
    if (!coords.length) continue;
    if (g === 0) {
      for (let i = 0; i < coords.length; i++) all.push(coords[i]);
      continue;
    }
    let start = 0;
    if (all.length && coords.length) {
      const a = all[all.length - 1];
      const b = coords[0];
      if (
        Math.abs(a[0] - b[0]) < 1e-6 &&
        Math.abs(a[1] - b[1]) < 1e-6
      ) {
        start = 1;
      }
    }
    for (let i = start; i < coords.length; i++) all.push(coords[i]);
  }
  if (all.length < 2) return null;
  return { type: "LineString", coordinates: all };
}

/**
 * Snap ordered geocode points to the driving network (chunked for long hauls).
 */
async function routeMapboxMatching(coords, accessToken) {
  if (!accessToken || coords.length < 2) return null;
  const clean = dedupeConsecutiveCoords(coords);
  if (clean.length < 2) return null;

  async function matchChunk(chunk) {
    if (chunk.length < 2) return null;
    const path = chunk.map((c) => `${c.lon},${c.lat}`).join(";");
    const radiuses = chunk.map(() => String(MAPBOX_MATCH_RADIUS_METERS)).join(";");
    const params = new URLSearchParams({
      access_token: accessToken,
      geometries: "geojson",
      overview: "full",
      radiuses: radiuses,
    });
    const url =
      `https://api.mapbox.com/matching/v5/mapbox/driving/${path}?` +
      params.toString();
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.matchings?.[0]?.geometry) {
      if (data.message) console.warn("Mapbox Matching:", data.message);
      return null;
    }
    return data.matchings[0].geometry;
  }

  if (clean.length <= MAPBOX_MATCHING_MAX) {
    return await matchChunk(clean);
  }

  const parts = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + MAPBOX_MATCHING_CHUNK, clean.length);
    const slice = clean.slice(start, end);
    const g = await matchChunk(slice);
    if (!g) return null;
    parts.push(g);
    if (end >= clean.length) break;
    start = Math.max(0, end - MAPBOX_MATCHING_OVERLAP);
  }
  return stitchLineStringGeometries(parts);
}

/**
 * Prefer ordered Directions through waypoints (permit = intentional stops). Map Matching is for
 * noisy GPS traces and can shortcut wrong ramps if run first; use it only as a fallback.
 */
async function routeDrivingLine(coords, mapboxToken) {
  const googleKey =
    typeof window !== "undefined" ? window.GOOGLE_MAPS_API_KEY || "" : "";
  let geometry = null;
  let provider = null;

  if (mapboxToken) {
    geometry = await routeMapboxDirections(coords, mapboxToken);
    provider = geometry ? "mapbox" : null;
  }
  if (!geometry && googleKey) {
    geometry = await routeGoogleDirections(coords, googleKey);
    provider = geometry ? "google" : null;
  }
  if (!geometry) {
    geometry = await routeOsrm(coords);
    provider = geometry ? "osrm" : null;
  }
  if (!geometry && mapboxToken) {
    geometry = await routeMapboxMatching(coords, mapboxToken);
    provider = geometry ? "mapbox-match" : null;
  }
  return { geometry, provider };
}

function buildGoogleMapsFromCoords(coords) {
  if (!coords?.length) return null;
  if (coords.length === 1) {
    const c = coords[0];
    return `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lon}`;
  }
  const parts = coords.map((c) => `${c.lat},${c.lon}`);
  return `https://www.google.com/maps/dir/${parts.map(encodeURIComponent).join("/")}`;
}

function buildAppleMapsFromCoords(coords) {
  if (!coords?.length) return null;
  const last = coords[coords.length - 1];
  return `https://maps.apple.com/?daddr=${last.lat},${last.lon}&dirflg=d`;
}

function buildWazeFromCoords(coords) {
  if (!coords?.length) return null;
  const last = coords[coords.length - 1];
  return `https://waze.com/ul?ll=${last.lat},${last.lon}&navigate=yes`;
}

function hintDisplay(h) {
  return (h && (h.displayText || h.text)) || "";
}

/**
 * GeoJSON for external tools (QGIS, your own DB `points_json` column, etc.).
 * Line is optional when routing failed; waypoints use current Route checkboxes / coords.
 */
function buildRouteGeoJSON(lineGeometry, waypointRows, geoOpts) {
  geoOpts = geoOpts || {};
  const lineNote =
    geoOpts.lineNote ||
    "Approximate driving geometry from geocoded waypoints — not an official TxDOT corridor.";
  const features = [];
  if (
    lineGeometry &&
    lineGeometry.type === "LineString" &&
    lineGeometry.coordinates &&
    lineGeometry.coordinates.length >= 2
  ) {
    features.push({
      type: "Feature",
      properties: {
        kind: "route_line",
        note: lineNote,
      },
      geometry: lineGeometry,
    });
  }
  let order = 0;
  waypointRows.forEach(function (h) {
    if (!h.geocodeOk || typeof h.lat !== "number" || typeof h.lon !== "number") {
      return;
    }
    order += 1;
    features.push({
      type: "Feature",
      properties: {
        kind: "waypoint",
        order: order,
        label: h.label || "",
        detail: hintDisplay(h),
      },
      geometry: {
        type: "Point",
        coordinates: [h.lon, h.lat],
      },
    });
  });
  return {
    type: "FeatureCollection",
    features: features,
  };
}

function triggerDownloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/geo+json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildGoogleMapsSearchFallback(hints) {
  if (!hints.length) return null;
  const q = hints
    .slice(0, 12)
    .map((h) => hintDisplay(h))
    .join(", ");
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent("Texas " + q)}`;
}

function initMap() {
  const el = document.getElementById("map");
  if (!el || typeof mapboxgl === "undefined") return null;

  const token = typeof window !== "undefined" ? window.MAPBOX_ACCESS_TOKEN : "";
  if (!token) {
    console.error("MAPBOX_ACCESS_TOKEN is not set");
    return null;
  }

  mapboxgl.accessToken = token;

  const map = new mapboxgl.Map({
    container: el,
    style: "mapbox://styles/mapbox/streets-v12",
    center: [-98.5, 31.2],
    zoom: 6,
    attributionControl: true,
  });

  map.addControl(new mapboxgl.NavigationControl(), "top-right");

  map.on("error", (e) => {
    console.warn("Mapbox error:", e?.error || e);
  });

  return map;
}

let mapInstance = null;
/** @type {mapboxgl.Marker[]} */
let mapMarkers = [];
/** Start/end markers for official TXPROS polyline */
let txprosMarkers = [];

function clearTxprosOverlay() {
  txprosMarkers.forEach(function (m) {
    m.remove();
  });
  txprosMarkers = [];
  if (!mapInstance) return;
  if (mapInstance.getLayer("txpros-line")) mapInstance.removeLayer("txpros-line");
  if (mapInstance.getSource("txpros-line-src")) mapInstance.removeSource("txpros-line-src");
}

function clearRouteOverlay() {
  mapMarkers.forEach(function (m) {
    m.remove();
  });
  mapMarkers = [];

  clearTxprosOverlay();

  if (!mapInstance) return;

  if (mapInstance.getLayer("route-line")) mapInstance.removeLayer("route-line");
  if (mapInstance.getSource("route-line-src")) mapInstance.removeSource("route-line-src");
}

/**
 * Official TXPROS breadcrumbs: blue line, green start / red end, fit bounds.
 * @param {number[][]} lngLatCoords — [lng, lat] pairs
 * @param {string} permitId
 */
function drawTxprosOfficialRoute(lngLatCoords, permitId) {
  if (!mapInstance || !lngLatCoords || lngLatCoords.length < 2) return;

  const paint = function () {
    try {
      if (mapInstance.getLayer("txpros-line")) mapInstance.removeLayer("txpros-line");
      if (mapInstance.getSource("txpros-line-src")) mapInstance.removeSource("txpros-line-src");
    } catch (_) {}

    mapInstance.addSource("txpros-line-src", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: { permitId: permitId, source: "txpros.txdmv.gov" },
        geometry: { type: "LineString", coordinates: lngLatCoords },
      },
    });
    mapInstance.addLayer({
      id: "txpros-line",
      type: "line",
      source: "txpros-line-src",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#0066ff",
        "line-width": 8,
        "line-opacity": 0.85,
      },
    });

    const startEl = document.createElement("div");
    startEl.className = "map-marker-txpros map-marker-txpros--start";
    startEl.title = "TXPROS route start";
    const endEl = document.createElement("div");
    endEl.className = "map-marker-txpros map-marker-txpros--end";
    endEl.title = "TXPROS route end";

    const first = lngLatCoords[0];
    const last = lngLatCoords[lngLatCoords.length - 1];
    txprosMarkers.push(
      new mapboxgl.Marker({ element: startEl, anchor: "center" })
        .setLngLat(first)
        .addTo(mapInstance)
    );
    txprosMarkers.push(
      new mapboxgl.Marker({ element: endEl, anchor: "center" })
        .setLngLat(last)
        .addTo(mapInstance)
    );

    const bounds = new mapboxgl.LngLatBounds();
    lngLatCoords.forEach(function (c) {
      bounds.extend(c);
    });
    try {
      if (!bounds.isEmpty()) {
        mapInstance.fitBounds(bounds, { padding: 64, maxZoom: 12, duration: 900 });
      }
    } catch (_) {
      mapInstance.setCenter(first);
      mapInstance.setZoom(8);
    }
    mapInstance.resize();
  };

  if (mapInstance.loaded()) paint();
  else mapInstance.once("load", paint);
}

function showMapNotice(message) {
  const banner = document.getElementById("map-banner");
  if (banner) banner.textContent = message;
}

function showRouteProgress(message) {
  const el = document.getElementById("route-progress");
  if (el) el.textContent = message || "";
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function formatRouteProviderNote(routeProvider) {
  if (routeProvider === "txpros-official") return "TXPROS official breadcrumbs";
  if (routeProvider === "mapbox-match") return "Mapbox Map Matching";
  if (routeProvider === "google") return "Google Directions";
  if (routeProvider === "mapbox") return "Mapbox Directions";
  if (routeProvider === "osrm") return "OSRM fallback (open demo)";
  return "route";
}

function main() {
  const upload = document.getElementById("pdf-upload");
  const rawPanel = document.getElementById("raw-text");
  const hintsList = document.getElementById("route-hints");
  const metaPanel = document.getElementById("meta-panel");
  const verifyCb = document.getElementById("verify-permit");
  const exportBtns = document.querySelectorAll("[data-requires-verify]");
  const confidence = document.getElementById("confidence-note");
  const statusEl = document.getElementById("upload-status");
  const recalcBtn = document.getElementById("recalc-route");
  const downloadGeoBtn = document.getElementById("download-geojson");
  const recalcHintEl = document.getElementById("recalc-hint");
  const txprosInput = document.getElementById("txpros-permit-input");
  const txprosLoadBtn = document.getElementById("txpros-load-btn");
  const txprosScanBtn = document.getElementById("txpros-scan-btn");
  const txprosStopScanBtn = document.getElementById("txpros-stop-scan-btn");
  const txprosStatusEl = document.getElementById("txpros-import-status");
  const txprosQrRegion = document.getElementById("txpros-qr-reader");
  /** @type {unknown} */
  let txprosScanner = null;

  let runGeneration = 0;
  /** Last successful parse — used for “Recalculate route” / GeoJSON export */
  let routeSession = null;

  mapInstance = initMap();

  if (recalcHintEl) {
    recalcHintEl.textContent =
      "Drag pins or edit lat/lon, toggle Route, then recalculate. GeoJSON = line + waypoints for your own tools.";
  }

  function updateDownloadGeoBtn() {
    if (!downloadGeoBtn) return;
    const hasPts =
      routeSession &&
      routeSession.enriched &&
      routeSession.enriched.some(function (h) {
        return h.geocodeOk;
      });
    downloadGeoBtn.disabled = !hasPts;
  }

  function setExportEnabled(on) {
    exportBtns.forEach((btn) => {
      if (btn.tagName === "A") {
        btn.classList.toggle("is-disabled", !on);
        btn.setAttribute("aria-disabled", String(!on));
      } else {
        btn.disabled = !on;
        btn.setAttribute("aria-disabled", String(!on));
      }
    });
  }

  function updateVerifyState() {
    setExportEnabled(verifyCb.checked);
  }

  verifyCb.addEventListener("change", updateVerifyState);
  updateVerifyState();

  exportBtns.forEach((el) => {
    el.addEventListener("click", (ev) => {
      if (!verifyCb.checked) {
        ev.preventDefault();
        if (statusEl) statusEl.textContent = "Confirm the verification checkbox first.";
      }
    });
  });

  async function recalculateRouteFromSegments() {
    if (routeSession && routeSession.isTxprosOfficial) {
      if (statusEl) {
        statusEl.textContent =
          "Recalculate is for PDF routes. Load TXPROS again to change the official line.";
      }
      return;
    }
    if (!routeSession?.enriched?.length) return;
    runGeneration += 1;
    const myRun = runGeneration;
    const accessToken = window.MAPBOX_ACCESS_TOKEN || "";
    const { coords, displayEnriched } = collectSegmentsFromList(routeSession.enriched);
    if (coords.length < 2) {
      if (statusEl) {
        statusEl.textContent =
          "Need at least 2 segments included with valid lat/lon.";
      }
      return;
    }
    showRouteProgress("Matching / routing…");
    await sleep(80);
    if (myRun !== runGeneration) return;

    let geometry = null;
    let routeProvider = null;
    try {
      const routed = await routeDrivingLine(coords, accessToken);
      geometry = routed && routed.geometry;
      routeProvider = routed && routed.provider;
    } catch (err) {
      console.warn(err);
    }
    if (myRun !== runGeneration) return;

    drawMap(displayEnriched, geometry);
    routeSession.geometry = geometry || null;
    routeSession.routeProvider = routeProvider || null;
    updateDownloadGeoBtn();

    const sampledForLinks =
      coords.length > SAMPLE_COORDS_CAP ? sampleEvenly(coords, SAMPLE_COORDS_CAP) : coords;
    setExportLinks(sampledForLinks.length >= 2 ? sampledForLinks : coords, routeSession.hints);

    const routeNote = formatRouteProviderNote(routeProvider);
    if (coords.length >= 2 && geometry) {
      showRouteProgress(`Done (${routeNote}). ${coords.length} anchors`);
      if (statusEl) statusEl.textContent = "OK";
    } else if (coords.length >= 2 && !geometry) {
      showRouteProgress("Routing failed.");
      if (statusEl) statusEl.textContent = "Markers only";
    }
  }

  if (recalcBtn) {
    recalcBtn.addEventListener("click", function () {
      recalculateRouteFromSegments();
    });
  }

  if (downloadGeoBtn) {
    downloadGeoBtn.addEventListener("click", function () {
      if (!routeSession?.enriched?.length) return;
      const { displayEnriched } = collectSegmentsFromList(routeSession.enriched);
      if (!displayEnriched.length) {
        if (statusEl) {
          statusEl.textContent =
            "Turn on Route for at least one segment, or fix coordinates.";
        }
        return;
      }
      const geoOpts =
        routeSession && routeSession.isTxprosOfficial
          ? {
              lineNote:
                "Official TXPROS breadcrumb polyline from txpros.txdmv.gov (state-issued route geometry).",
            }
          : {};
      const fc = buildRouteGeoJSON(routeSession.geometry, displayEnriched, geoOpts);
      if (!fc.features.length) return;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
      triggerDownloadJson(`permit-route-${stamp}.geojson`, fc);
      if (statusEl) statusEl.textContent = "GeoJSON downloaded.";
    });
  }

  async function geocodeAndRoute(hints, generation) {
    if (!mapInstance || !hints.length) {
      showRouteProgress("");
      return { coords: [], enriched: [], routeProvider: null };
    }

    const accessToken = window.MAPBOX_ACCESS_TOKEN || "";

    showRouteProgress("Geocoding…");
    const enriched = [];
    const coords = [];
    /** Bias each highway hit toward the previous stop so IH/US rows advance along the corridor. */
    let proximityPrior = null;

    for (let i = 0; i < hints.length; i++) {
      if (generation !== runGeneration) {
        return { coords: [], enriched: [], aborted: true, routeProvider: null };
      }

      if (i > 0) await sleep(GEO_DELAY_MS);

      const h = hints[i];
      showRouteProgress(
        `Geocoding ${i + 1}/${hints.length}: ${hintDisplay(h)}…`
      );

      let geoHint = h;
      if (
        (h.legMilesToNext != null && Number.isFinite(h.legMilesToNext)) ||
        (h.cumulativePermitMi != null && Number.isFinite(h.cumulativePermitMi))
      ) {
        geoHint = {
          ...h,
          queries: enrichQueriesForTxRow(
            h.queries || [],
            { text: h.text },
            "",
            h.displayText || h.text || "",
            h.legMilesToNext != null && Number.isFinite(h.legMilesToNext) ? h.legMilesToNext : null,
            h.cumulativePermitMi != null && Number.isFinite(h.cumulativePermitMi)
              ? h.cumulativePermitMi
              : null
          ),
        };
      }

      let pt = null;
      try {
        pt = await geocodeSegment(geoHint, accessToken, proximityPrior);
      } catch (e) {
        console.warn(e);
      }

      if (generation !== runGeneration) {
        return { coords: [], enriched: [], aborted: true, routeProvider: null };
      }

      if (pt) {
        coords.push({ lat: pt.lat, lon: pt.lon });
        proximityPrior = { lon: pt.lon, lat: pt.lat };
        enriched.push({
          ...h,
          lat: pt.lat,
          lon: pt.lon,
          geocodeOk: true,
          includeInRoute: true,
          geocodeLabel: pt.label,
          geocodeSource: pt.source || "?",
          geocodeQuery: pt.matchedQuery || null,
        });
      } else {
        enriched.push({ ...h, geocodeOk: false, includeInRoute: false });
      }
    }

    if (generation !== runGeneration) {
      return { coords: [], enriched: [], aborted: true, routeProvider: null };
    }

    if (coords.length < 2) {
      showRouteProgress(coords.length === 1 ? "Need 2+ geocoded segments." : "Geocode failed.");
      return { coords, enriched, routeProvider: null };
    }

    showRouteProgress("Routing…");
    await sleep(150);

    if (generation !== runGeneration) {
      return { coords: [], enriched: [], aborted: true, routeProvider: null };
    }

    let geometry = null;
    let routeProvider = null;
    try {
      const routed = await routeDrivingLine(coords, accessToken);
      geometry = routed && routed.geometry;
      routeProvider = routed && routed.provider;
    } catch (e) {
      console.warn(e);
    }

    if (generation !== runGeneration) {
      return { coords: [], enriched: [], aborted: true, routeProvider: null };
    }

    return { coords, enriched, geometry, routeProvider };
  }

  function renderHintList(enriched) {
    hintsList.innerHTML = "";
    enriched.forEach((h, i) => {
      const li = document.createElement("li");
      li.dataset.segIndex = String(i);
      const shown = hintDisplay(h);
      const qNote =
        h.geocodeQuery && h.geocodeOk
          ? ` · q: ${escapeHtml(h.geocodeQuery)}`
          : "";
      if (h.geocodeOk) {
        li.className = "ok";
        const src = h.geocodeSource ? ` · ${escapeHtml(h.geocodeSource)}` : "";
        const main = document.createElement("div");
        main.innerHTML =
          `<span class="hint-num">${i + 1}.</span> <span class="badge">${escapeHtml(h.label)}</span> ${escapeHtml(shown)} ` +
          `<small>→ ${h.lat.toFixed(4)}, ${h.lon.toFixed(4)}${src}${qNote}</small>`;
        li.appendChild(main);

        const controls = document.createElement("div");
        controls.className = "seg-controls";
        const useLabel = document.createElement("label");
        useLabel.className = "seg-use";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "seg-include";
        cb.checked = h.includeInRoute !== false;
        useLabel.appendChild(cb);
        useLabel.appendChild(document.createTextNode(" Route"));
        controls.appendChild(useLabel);

        const coordWrap = document.createElement("span");
        coordWrap.className = "seg-coord-edit";
        const latLab = document.createElement("label");
        latLab.textContent = "Lat ";
        const latIn = document.createElement("input");
        latIn.type = "text";
        latIn.className = "seg-lat";
        latIn.setAttribute("inputmode", "decimal");
        latIn.value = String(h.lat);
        latLab.appendChild(latIn);
        const lonLab = document.createElement("label");
        lonLab.textContent = "Lon ";
        const lonIn = document.createElement("input");
        lonIn.type = "text";
        lonIn.className = "seg-lon";
        lonIn.setAttribute("inputmode", "decimal");
        lonIn.value = String(h.lon);
        lonLab.appendChild(lonIn);
        coordWrap.appendChild(latLab);
        coordWrap.appendChild(lonLab);
        controls.appendChild(coordWrap);
        li.appendChild(controls);
      } else {
        li.className = "fail";
        li.innerHTML =
          `<span class="hint-num">${i + 1}.</span> <span class="badge">${escapeHtml(h.label)}</span> ${escapeHtml(shown)} ` +
          `<small>(not geocoded)</small>`;
      }
      hintsList.appendChild(li);
    });
  }

  function collectSegmentsFromList(enrichedBase) {
    const coords = [];
    const displayEnriched = [];
    enrichedBase.forEach(function (h, i) {
      if (!h.geocodeOk) return;
      const li = hintsList.querySelector(`li[data-seg-index="${i}"]`);
      if (!li) return;
      const inc = li.querySelector(".seg-include");
      if (inc && !inc.checked) return;
      const latIn = li.querySelector(".seg-lat");
      const lonIn = li.querySelector(".seg-lon");
      let lat = h.lat;
      let lon = h.lon;
      if (latIn && lonIn && latIn.value.trim() !== "") {
        const lt = parseFloat(latIn.value);
        const ln = parseFloat(lonIn.value);
        if (!isNaN(lt) && !isNaN(ln)) {
          lat = lt;
          lon = ln;
        }
      }
      coords.push({ lat, lon });
      displayEnriched.push({ ...h, lat, lon });
    });
    return { coords, displayEnriched };
  }

  function drawMap(enriched, geometry) {
    clearRouteOverlay();
    if (!mapInstance) return;

    const paint = function () {
      let hasPoints = false;
      const bounds = new mapboxgl.LngLatBounds();

      let waypointNum = 0;
      enriched.forEach(function (h, segIdx) {
        if (!h.geocodeOk) return;
        hasPoints = true;
        waypointNum += 1;
        const num = waypointNum;
        const el = document.createElement("div");
        el.className = "map-marker-pin";
        el.setAttribute("aria-label", "Waypoint " + num);
        el.textContent = String(num);

        const popup = new mapboxgl.Popup({ offset: 18, maxWidth: "280px" }).setHTML(
          "<strong>#" +
            num +
            "</strong> " +
            escapeHtml(hintDisplay(h)) +
            "<br><small>" +
            h.lat.toFixed(5) +
            ", " +
            h.lon.toFixed(5) +
            "</small>"
        );

        const marker = new mapboxgl.Marker({
          element: el,
          anchor: "bottom",
          draggable: true,
        })
          .setLngLat([h.lon, h.lat])
          .setPopup(popup)
          .addTo(mapInstance);

        marker.on("dragend", function () {
          const ll = marker.getLngLat();
          const row = hintsList.querySelector(`li[data-seg-index="${segIdx}"]`);
          if (row) {
            const la = row.querySelector(".seg-lat");
            const lo = row.querySelector(".seg-lon");
            if (la) la.value = ll.lat.toFixed(5);
            if (lo) lo.value = ll.lng.toFixed(5);
          }
        });

        mapMarkers.push(marker);
        bounds.extend([h.lon, h.lat]);
      });

      if (geometry && geometry.type === "LineString" && geometry.coordinates?.length) {
        mapInstance.addSource("route-line-src", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: geometry,
          },
        });
        mapInstance.addLayer({
          id: "route-line",
          type: "line",
          source: "route-line-src",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#c2410c",
            "line-width": 5,
            "line-opacity": 0.88,
          },
        });
        geometry.coordinates.forEach(function (c) {
          bounds.extend(c);
        });
      }

      if (!hasPoints && !(geometry && geometry.coordinates?.length)) return;

      try {
        if (!bounds.isEmpty()) {
          mapInstance.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 800 });
        }
      } catch (_) {
        mapInstance.setCenter([-98.5, 31.2]);
        mapInstance.setZoom(6);
      }

      mapInstance.resize();
    };

    if (mapInstance.loaded()) {
      paint();
    } else {
      mapInstance.once("load", paint);
    }
  }

  function setExportLinks(coords, hints) {
    const gBtn = document.getElementById("open-google");
    const aBtn = document.getElementById("open-apple");
    const wBtn = document.getElementById("open-waze");

    const gUrl = coords.length >= 2 ? buildGoogleMapsFromCoords(coords) : buildGoogleMapsSearchFallback(hints);
    if (gBtn) gBtn.href = gUrl || "#";

    if (aBtn) {
      aBtn.href =
        coords.length >= 1 ? buildAppleMapsFromCoords(coords) || "#" : "#";
    }

    if (wBtn) {
      wBtn.href = coords.length >= 1 ? buildWazeFromCoords(coords) || "#" : "#";
    }
  }

  async function runTxprosImport(rawInput) {
    const permitId = extractTxprosPermitId(rawInput);
    if (!permitId) {
      if (txprosStatusEl) {
        txprosStatusEl.textContent = "Enter a numeric Permit ID or paste the full TXPROS URL.";
      }
      return;
    }

    runGeneration += 1;
    const myRun = runGeneration;

    if (txprosStatusEl) txprosStatusEl.textContent = "Loading official route from TXPROS…";
    showRouteProgress("Fetching TXPROS breadcrumbs…");
    rawPanel.textContent = "";
    hintsList.innerHTML = "";
    metaPanel.innerHTML = "";
    verifyCb.checked = false;
    updateVerifyState();
    clearRouteOverlay();
    showMapNotice("Official TXPROS route (state-issued breadcrumbs).");
    routeSession = null;
    if (recalcBtn) recalcBtn.disabled = true;
    updateDownloadGeoBtn();
    if (confidence) confidence.textContent = "";

    try {
      const { coordinates, pointCount, rawJson } = await fetchTxprosRoute(permitId);
      if (myRun !== runGeneration) return;

      const geom = { type: "LineString", coordinates: coordinates };
      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];
      const enriched = [
        {
          label: "Origin",
          text: "TXPROS start",
          displayText: "TXPROS route start · Permit " + permitId,
          geocodeOk: true,
          includeInRoute: true,
          lat: first[1],
          lon: first[0],
          geocodeSource: "txpros",
          geocodeQuery: null,
        },
        {
          label: "Destination",
          text: "TXPROS end",
          displayText: "TXPROS route end · Permit " + permitId,
          geocodeOk: true,
          includeInRoute: true,
          lat: last[1],
          lon: last[0],
          geocodeSource: "txpros",
          geocodeQuery: null,
        },
      ];

      routeSession = {
        hints: [],
        enriched: enriched,
        geometry: geom,
        routeProvider: "txpros-official",
        isTxprosOfficial: true,
        txprosPermitId: permitId,
        txprosBreadcrumbCount: pointCount,
        txprosRawJson: rawJson,
      };

      if (recalcBtn) recalcBtn.disabled = true;

      metaPanel.innerHTML = [
        `<p><strong>Source:</strong> TXPROS (txpros.txdmv.gov)</p>`,
        `<p><strong>Permit ID:</strong> ${escapeHtml(permitId)}</p>`,
        `<p><strong>Breadcrumbs:</strong> ${pointCount} points</p>`,
      ].join("");

      rawPanel.textContent =
        "TXPROS import · Permit " + permitId + " · " + pointCount + " coordinates (see GeoJSON export for full line).";

      renderHintList(enriched);
      drawTxprosOfficialRoute(coordinates, permitId);

      const linkCoords = coordinates.map(function (c) {
        return { lat: c[1], lon: c[0] };
      });
      const sampledForLinks =
        linkCoords.length > SAMPLE_COORDS_CAP ? sampleEvenly(linkCoords, SAMPLE_COORDS_CAP) : linkCoords;
      setExportLinks(sampledForLinks.length >= 2 ? sampledForLinks : linkCoords, []);

      updateDownloadGeoBtn();
      if (txprosStatusEl) {
        txprosStatusEl.textContent = "Loaded " + pointCount + " breadcrumb points.";
      }
      showRouteProgress("TXPROS route on map (" + pointCount + " pts).");
      if (statusEl) statusEl.textContent = "OK (TXPROS)";
      updateVerifyState();
    } catch (err) {
      console.error(err);
      if (myRun !== runGeneration) return;
      if (txprosStatusEl) txprosStatusEl.textContent = String(err.message || err);
      showRouteProgress("");
      showMapNotice("");
      if (statusEl) statusEl.textContent = "TXPROS import failed.";
    }
  }

  if (txprosLoadBtn && txprosInput) {
    txprosLoadBtn.addEventListener("click", function () {
      void runTxprosImport(txprosInput.value);
    });
    txprosInput.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        void runTxprosImport(txprosInput.value);
      }
    });
  }

  if (txprosScanBtn && txprosQrRegion) {
    txprosScanBtn.addEventListener("click", function () {
      void (async function () {
        if (typeof Html5Qrcode === "undefined") {
          if (txprosStatusEl) {
            txprosStatusEl.textContent =
              "QR library failed to load. Paste the TXPROS URL or Permit ID instead.";
          }
          return;
        }
        if (txprosScanner) {
          if (txprosStatusEl) txprosStatusEl.textContent = "Scanner already running.";
          return;
        }
        try {
          txprosQrRegion.classList.remove("is-hidden");
          if (txprosStopScanBtn) txprosStopScanBtn.disabled = false;
          const h = new Html5Qrcode("txpros-qr-reader");
          txprosScanner = h;
          const box = Math.min(260, Math.max(160, window.innerWidth - 48));
          let decodedOnce = false;
          await h.start(
            { facingMode: "environment" },
            { fps: 8, qrbox: { width: box, height: box } },
            function (decodedText) {
              if (decodedOnce) return;
              decodedOnce = true;
              void (async function () {
                try {
                  await h.stop();
                } catch (_) {}
                try {
                  if (typeof h.clear === "function") h.clear();
                } catch (_) {}
                txprosScanner = null;
                txprosQrRegion.classList.add("is-hidden");
                if (txprosStopScanBtn) txprosStopScanBtn.disabled = true;
                const id = extractTxprosPermitId(decodedText);
                if (txprosInput) txprosInput.value = id || decodedText.trim();
                if (txprosStatusEl) txprosStatusEl.textContent = "QR read — loading route…";
                await runTxprosImport(decodedText);
              })();
            },
            function () {}
          );
          if (txprosStatusEl) txprosStatusEl.textContent = "Point the camera at the permit QR code.";
        } catch (e) {
          console.warn(e);
          txprosScanner = null;
          txprosQrRegion.classList.add("is-hidden");
          if (txprosStopScanBtn) txprosStopScanBtn.disabled = true;
          if (txprosStatusEl) {
            txprosStatusEl.textContent =
              "Camera not available: " + (e && e.message ? e.message : String(e)) + " — paste the link instead.";
          }
        }
      })();
    });
  }

  if (txprosStopScanBtn && txprosQrRegion) {
    txprosStopScanBtn.addEventListener("click", function () {
      void (async function () {
        if (!txprosScanner) return;
        try {
          await txprosScanner.stop();
        } catch (_) {}
        try {
          if (typeof txprosScanner.clear === "function") txprosScanner.clear();
        } catch (_) {}
        txprosScanner = null;
        txprosQrRegion.classList.add("is-hidden");
        txprosStopScanBtn.disabled = true;
        if (txprosStatusEl) txprosStatusEl.textContent = "Scan cancelled.";
      })();
    });
  }

  upload.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    runGeneration += 1;
    const myRun = runGeneration;

    if (file.type !== "application/pdf") {
      statusEl.textContent = "Please choose a PDF file.";
      return;
    }
    if (file.size > MAX_BYTES) {
      statusEl.textContent = "File is too large (max 15 MB for this demo).";
      return;
    }

    if (!hasSupabaseParserConfig()) {
      statusEl.textContent = "Parser not configured. Connect Supabase parser settings.";
      confidence.textContent = "Supabase parser required";
      return;
    }

    statusEl.textContent = "Uploading to parser…";
    showRouteProgress("");
    if (txprosScanner) {
      const sc = txprosScanner;
      txprosScanner = null;
      void sc
        .stop()
        .catch(function () {})
        .then(function () {
          try {
            if (typeof sc.clear === "function") sc.clear();
          } catch (_) {}
        });
      if (txprosQrRegion) txprosQrRegion.classList.add("is-hidden");
      if (txprosStopScanBtn) txprosStopScanBtn.disabled = true;
    }
    rawPanel.textContent = "";
    hintsList.innerHTML = "";
    metaPanel.textContent = "";
    verifyCb.checked = false;
    updateVerifyState();
    clearRouteOverlay();
    showMapNotice("");
    routeSession = null;
    if (recalcBtn) recalcBtn.disabled = true;
    updateDownloadGeoBtn();

    try {
      let parseText = "";
      let serverHints = [];
      let serverPermitNo = null;
      let parserVersion = null;

      const remote = await parsePermitViaSupabase(file);
      if (myRun !== runGeneration) return;
      if (remote) {
        parseText = (remote.parseText || "").trim();
        serverHints = Array.isArray(remote.segments) ? remote.segments : [];
        serverPermitNo = remote.permitNumber || null;
        parserVersion = remote.parserVersion || null;
      }

      if (!parseText && !serverHints.length) {
        throw new Error("Parser failed: Supabase returned no route output.");
      }

      if (!parseText || parseText.length < 40) {
        confidence.textContent = "Low text (scan/OCR?)";
        statusEl.textContent = "Weak text";
      } else if (serverHints.length || parserVersion) {
        confidence.textContent = "Supabase parser" + (parserVersion ? " · " + parserVersion : "");
        statusEl.textContent = "Geocoding…";
      } else {
        confidence.textContent = "Supabase parser";
        statusEl.textContent = "Geocoding…";
      }

      rawPanel.textContent = parseText || "(no text returned)";

      const structuredStops = parseStructuredWaypoints(parseText);
      const hints = serverHints.length
        ? serverHints
        : structuredStops.length > 0
            ? structuredStops.map(function (s) {
                return {
                  label: s.label,
                  text: s.text,
                  displayText: s.displayText,
                  queries: s.queries,
                };
              })
            : extractRouteHints(parseText).map(function (h) {
                return { ...h, displayText: h.text };
              });
      const parsingMode =
        structuredStops.length > 0
          ? "structured (road + direction + miles)"
          : "regex (highway tokens only)";
      const meta = { permitNumber: serverPermitNo };

      metaPanel.innerHTML = [
        `<p><strong>Parse from:</strong> Supabase Edge Function</p>`,
        `<p><strong>Turn-by-turn table:</strong> ${
          serverHints.length ? "provided by Supabase parser" : "not returned"
        }</p>`,
        `<p><strong>Waypoints:</strong> ${escapeHtml(parsingMode)}</p>`,
        meta.permitNumber
          ? `<p><strong>Guess permit ref:</strong> ${escapeHtml(meta.permitNumber)} <span class="badge">unverified</span></p>`
          : `<p><strong>Permit ID:</strong> not detected automatically.</p>`,
        `<p><strong>Parse text chars:</strong> ${parseText.length}</p>`,
        `<p><strong>Segments:</strong> ${hints.length}</p>`,
      ].join("");

      if (hints.length === 0) {
        hintsList.innerHTML = '<li class="muted">No highway-style tokens found.</li>';
        statusEl.textContent = "No route tokens to geocode.";
        showRouteProgress("");
        setExportLinks([], []);
        updateVerifyState();
        updateDownloadGeoBtn();
        return;
      }

      const { coords, enriched, geometry, aborted, routeProvider } = await geocodeAndRoute(
        hints,
        myRun
      );
      if (aborted || myRun !== runGeneration) return;

      routeSession = {
        hints: hints.map(function (x) {
          return { ...x };
        }),
        enriched: enriched.map(function (x) {
          return { ...x };
        }),
        geometry: geometry || null,
        routeProvider: routeProvider || null,
        isTxprosOfficial: false,
      };
      if (recalcBtn) recalcBtn.disabled = coords.length < 2;
      updateDownloadGeoBtn();

      renderHintList(enriched);
      drawMap(enriched, geometry);

      const sampledForLinks =
        coords.length > SAMPLE_COORDS_CAP ? sampleEvenly(coords, SAMPLE_COORDS_CAP) : coords;
      setExportLinks(sampledForLinks.length >= 2 ? sampledForLinks : coords, hints);

      const routeNote = formatRouteProviderNote(routeProvider);

      if (coords.length >= 2 && geometry) {
        showRouteProgress(`Done (${routeNote}). ${coords.length} pts`);
        statusEl.textContent = "OK";
      } else if (coords.length >= 2 && !geometry) {
        showRouteProgress("Routing failed.");
        statusEl.textContent = "Markers only";
      } else {
        statusEl.textContent = "Done";
      }

      updateVerifyState();
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Parser failed.";
      confidence.textContent = String(err?.message || err || "Supabase parser failed");
      showRouteProgress("");
    }
  });
}

function initApp() {
  pdfjsLibRef = window.pdfjsLib;
  const bootStatus = document.getElementById("upload-status");

  if (typeof mapboxgl === "undefined") {
    if (bootStatus) {
      bootStatus.textContent =
        "Mapbox GL JS failed to load. Check your internet connection or disable blocking for this page.";
    }
    return;
  }

  if (!window.MAPBOX_ACCESS_TOKEN) {
    if (bootStatus) {
      bootStatus.textContent =
        "Mapbox token missing. Ensure js/mapbox-config.js is loaded and sets MAPBOX_ACCESS_TOKEN.";
    }
    return;
  }

  if (!hasSupabaseParserConfig()) {
    if (bootStatus) {
      bootStatus.textContent =
        "PDF parser: set js/supabase-config.js. TXPROS link/QR import works without Supabase.";
    }
  } else if (bootStatus && !bootStatus.textContent) {
    bootStatus.textContent = supabaseParserConfigNote();
  }

  if (pdfjsLibRef) {
    pdfjsLibRef.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  }
  main();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

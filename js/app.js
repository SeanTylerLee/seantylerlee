/**
 * Tx permit route assistant
 * PDF.js → heuristic segments → Mapbox Geocoding (+ Photon for tricky intersections) → Mapbox Directions → OSRM / Map Matching fallback.
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
      const dh = (s.dir_hint || s.dirHint || "").toString().trim();
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
      if (dh) row.dirHint = dh;
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
    origin_structured: out.origin_structured ?? out.originStructured ?? null,
    origin_text: (out.origin_text || out.originText || "").toString().trim() || null,
  };
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
  /^\s*(Route\s+Conditions|General\s+Conditions|Dimension|Dimensions|Vehicle|Load\s+description|Escort|Special\s+condition|Certification|Fee|Billing|Comments|General\s+information|Permit\s+number|Permit\s+no\.?|Effective\s+date|Expiration|Operating\s+time|Weight|Height|Width|Length)\b/i;

const ROUTE_PATTERNS = [
  /** Leading zeros in narratives, e.g. I-0410 */
  { label: "Interstate", re: /\bI\s*[-–]?\s*0*(\d{1,3})\b/gi },
  /** IH0410 vs IH410; IH20SFR, IH10NFR — optional letter suffix */
  { label: "IH", re: /\bIH\s*[-–]?\s*0*(\d{1,3})(?:[A-Za-z]+)?\b/gi },
  /** Business interstate frontage, e.g. BI35B, BI020J */
  { label: "Business IH", re: /\bBI\s*[-–]?\s*0*(\d{1,3})(?:[A-Za-z]+)?\b/gi },
  /** TxDMV PDFs: US0084, US90A, US69EFR (US + digits + optional letter) */
  { label: "US Highway", re: /\bUS\s*[-–]?\s*0*(\d{1,3})([A-Za-z]*)\b/gi },
  /** State hwy / TX; glued SH0132 in narratives */
  { label: "State Hwy", re: /\b(?:SH|TX|State\s+Hwy\.?)\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi },
  /** Farm / ranch; PDFs use fm1472 with no space */
  { label: "Farm / Ranch", re: /\b(?:FM|RM)\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi },
  /** County road, e.g. CR2034 */
  { label: "County Road", re: /\bCR\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi },
  { label: "Loop", re: /\bLOOP\s*[-–]?\s*(\d{1,4}[A-Za-z]?)\b/gi },
  /** Spur / loop numeric, e.g. SL480, SL79 — match before generic Loop */
  { label: "State Loop", re: /\bSL\s*[-–]?\s*(\d{1,4})([A-Za-z]*)\b/gi },
  /** State spur, e.g. SS0422, SS216 */
  { label: "State Spur", re: /\bSS\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi },
  /** Spur markers in detours, e.g. SP317 */
  { label: "Spur", re: /\bSP\s*[-–]?\s*0*(\d{1,3})([A-Za-z]*)\b/gi },
  /** Business US / business route, e.g. BU0287P */
  { label: "Business US", re: /\b(?:BU|BUS)\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi },
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
  let milesHeaderSeen = false;
  for (let j = start; j < lines.length; j++) {
    const line = lines[j];
    if (/^\s*Texas\s+Oversize\b/i.test(line)) continue;
    if (/PAGE\s+\d+\s+of\s+\d+/i.test(line)) continue;
    if (/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/i.test(line)) continue;
    if (/^\s*Miles\s+Route\s+To\b/i.test(line)) {
      if (milesHeaderSeen) continue;
      milesHeaderSeen = true;
    }
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
  s = s.replace(/\bBU(?:S)?\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi, function (_, n, suf) {
    const sufSp = suf ? String(suf).replace(/\s+/g, "").toUpperCase() : "";
    return "BU " + String(parseInt(n, 10)) + (sufSp || "");
  });
  s = s.replace(/\bBI\s*[-–]?\s*0*(\d{1,3})([A-Za-z]*)\b/gi, function (_, n, suf) {
    return "BI " + String(parseInt(n, 10)) + (suf || "").replace(/\s+/g, "");
  });
  s = s.replace(/\bSS\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi, function (_, n, suf) {
    return "SS " + String(parseInt(n, 10)) + (suf || "").replace(/\s+/g, "");
  });
  s = s.replace(/\bSP\s*[-–]?\s*0*(\d{1,3})([A-Za-z]*)\b/gi, function (_, n, suf) {
    return "SP " + String(parseInt(n, 10)) + (suf || "").replace(/\s+/g, "");
  });
  s = s.replace(/\bCR\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi, function (_, n, suf) {
    return "CR " + String(parseInt(n, 10)) + (suf || "");
  });
  s = s.replace(/\bUS\s*[-–]?\s*0*(\d{1,3})([A-Za-z]*)\b/gi, function (_, n, suf) {
    const sufClean = (suf || "").replace(/\s+/g, "");
    return "US " + String(parseInt(n, 10)) + sufClean;
  });
  s = s.replace(/\b(?:SH|TX)\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi, function (_, n, suf) {
    const sufClean = (suf || "").replace(/\s+/g, "");
    return "SH " + String(parseInt(n, 10)) + sufClean;
  });
  s = s.replace(/\bFM\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi, function (_, n, suf) {
    return "FM " + String(parseInt(n, 10)) + (suf || "");
  });
  s = s.replace(/\bRM\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi, function (_, n, suf) {
    return "RM " + String(parseInt(n, 10)) + (suf || "");
  });
  s = s.replace(/\bSL\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi, function (_, n, suf) {
    return "SL " + String(parseInt(n, 10)) + (suf || "").replace(/\s+/g, "");
  });
  s = s.replace(/\bIH\s*[-–]?\s*0*(\d{1,3})([A-Za-z]*)\b/gi, function (_, n) {
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
  const bi = highwayText.match(/\bBI\s*[-–]?\s*(\d{1,3})(?:[A-Za-z]+)?\b/i);
  if (bi) return "Business Interstate " + String(parseInt(bi[1], 10));
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

/** Primary route numbers for matching Mapbox labels (e.g. BU 287P → 287; FM 1187 → 1187). */
function significantRouteNumbersFromToken(road) {
  const u = String(road || "").toUpperCase();
  const m = u.match(
    /\b(?:IH|I|BI|BU|US|SH|FM|RM|CR|SS|SP|SL|LOOP)\s*[-–]?\s*0*(\d{1,4})([A-Z]{0,3})\b/
  );
  if (!m) return [];
  const n = String(parseInt(m[1], 10));
  return m[2] ? dedupeStrings([n, n + String(m[2]).toLowerCase()]) : [n];
}

function geocodeLabelReferencesBothRoads(label, roadA, roadB) {
  const hay = String(label || "").toLowerCase();
  const numsA = significantRouteNumbersFromToken(roadA);
  const numsB = significantRouteNumbersFromToken(roadB);
  if (!numsA.length || !numsB.length) return false;
  const hasNum = function (nums) {
    for (let i = 0; i < nums.length; i++) {
      const n = String(nums[i]);
      if (new RegExp("\\b" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(hay)) {
        return true;
      }
    }
    return false;
  };
  return hasNum(numsA) && hasNum(numsB);
}

/** County / city tokens from the origin line (matches Edge `extractOriginPlaceHints`). */
function extractOriginPlaceHintsClient(originLine) {
  if (!originLine) return [];
  const o = normalizePrintedRouteToken(
    normalizeWs(String(originLine).replace(/^Start\s*[·.]\s*/i, "").trim())
  );
  if (!o) return [];
  const hints = [];
  const countyRe = /\b([A-Za-z][A-Za-z\s]{1,40}?)\s+County\b/gi;
  let m;
  while ((m = countyRe.exec(o)) !== null) {
    const name = m[1].replace(/\s+/g, " ").trim();
    if (name.length > 2 && name.length < 42 && !/\b(?:the|and|or)\b/i.test(name)) {
      hints.push(name + " County");
    }
  }
  const cityTx = /\b([A-Za-z][A-Za-z\s]{1,30}?)\s*,\s*TX\b/gi;
  while ((m = cityTx.exec(o)) !== null) {
    const name = m[1].replace(/\s+/g, " ").trim();
    if (name.length > 2 && name.length < 36 && !/\bCounty\b/i.test(name)) hints.push(name);
  }
  return dedupeStrings(hints);
}

/** When Supabase omits usable `origin_structured`, infer junction roads from raw origin narrative. */
function parseOriginJunctionMileOfClient(originLine) {
  if (!originLine) return null;
  const o = normalizePrintedRouteToken(
    normalizeWs(String(originLine).replace(/^Start\s*[·.]\s*/i, "").trim())
  );
  const reJunction =
    /^(?:([^,]+?)\s*,\s*)?([\d.]+)\s*mi(?:le)?s?\s+(nb|sb|eb|wb|[nsew]{1,2}|north|south|east|west|northeast|northwest|southeast|southwest)\s+of\s+(.+)$/i;
  const mj = reJunction.exec(o);
  if (!mj) return null;
  const junctionBlob = mj[4].trim();
  let loaded = null;
  if (mj[1]) {
    const hPref = findHighwaysOnLine(normalizeHyphensForMatching(mj[1].trim()));
    loaded = hPref.length ? hPref[0].text : null;
  }
  let parts = junctionBlob.split(/\s*&\s*/).map(function (p) {
    return p.trim();
  }).filter(Boolean);
  if (parts.length < 2 && /\band\b/i.test(junctionBlob)) {
    parts = junctionBlob.split(/\s+and\s+/i).map(function (p) {
      return p.trim();
    }).filter(Boolean);
  }
  const roads = [];
  for (let pi = 0; pi < parts.length; pi++) {
    const hs = findHighwaysOnLine(normalizeHyphensForMatching(parts[pi]));
    if (hs.length) roads.push(hs[0].text);
  }
  let roadsDedup = dedupeStrings(roads);
  if (roadsDedup.length < 2 && loaded) {
    if (roadsDedup.length === 1) roadsDedup = dedupeStrings([loaded, roadsDedup[0]]);
    else if (roadsDedup.length === 0 && parts.length > 0) {
      const rhs = parts[parts.length - 1];
      const hs = findHighwaysOnLine(normalizeHyphensForMatching(rhs));
      if (hs.length) roadsDedup = dedupeStrings([loaded, hs[0].text]);
    }
  }
  if (roadsDedup.length < 2) return null;
  return {
    mode: "junction_offset",
    offset_mi: parseFloat(mj[2]),
    bearing: null,
    roads: roadsDedup,
    loaded_route_road: loaded,
    place_hints: extractOriginPlaceHintsClient(originLine),
  };
}

function parseOriginAmpersandOnlyClient(originLine) {
  if (!originLine) return null;
  const o = normalizePrintedRouteToken(
    normalizeWs(String(originLine).replace(/^Start\s*[·.]\s*/i, "").trim())
  );
  if (!/\s&\s/.test(o) && !/\s+and\s+/i.test(o)) return null;
  const parts = (/\s&\s/.test(o) ? o.split(/\s*&\s*/) : o.split(/\s+and\s+/i))
    .map(function (p) {
      return p.trim();
    })
    .filter(Boolean);
  if (parts.length < 2) return null;
  const roads = [];
  for (let i = 0; i < parts.length; i++) {
    const hs = findHighwaysOnLine(normalizeHyphensForMatching(parts[i]));
    if (hs.length) roads.push(hs[0].text);
  }
  const roadsDedup = dedupeStrings(roads);
  if (roadsDedup.length < 2) return null;
  return {
    mode: "junction_offset",
    offset_mi: null,
    bearing: null,
    roads: roadsDedup,
    loaded_route_road: roadsDedup[0],
    place_hints: extractOriginPlaceHintsClient(originLine),
  };
}

function parseClientOriginStructured(originLine) {
  return parseOriginJunctionMileOfClient(originLine) || parseOriginAmpersandOnlyClient(originLine);
}

/**
 * Prefer server `origin_structured`; if it lacks a geocodable pair, derive from `origin_text` /
 * the first segment display line (same heuristics as the Edge parser).
 */
function resolveEffectiveOriginStructured(structured, narrativeLine, displayFallback) {
  if (resolveOriginIntersectionRoads(structured)) return structured;
  const lines = [];
  if (narrativeLine) lines.push(narrativeLine);
  if (displayFallback && displayFallback !== narrativeLine) lines.push(displayFallback);
  for (let i = 0; i < lines.length; i++) {
    const c = parseClientOriginStructured(lines[i]);
    if (resolveOriginIntersectionRoads(c)) return c;
  }
  return structured || null;
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

/** FM-51 / TX-171 / BU-287 style; fm1472 → FM 1472 */
function normalizeHyphensForMatching(line) {
  return line
    .replace(/\b(FM|RM|SH|US|TX|BU|BI|SS|SP|CR)-(\d+)\b/gi, "$1 $2")
    .replace(/\b(fm|rm|sh|us)(\d{2,4})([a-z]*)\b/gi, function (_, abbr, n, suf) {
      return String(abbr).toUpperCase() + " " + n + (suf || "");
    });
}

/** Canonical key so we can merge repeated IH 20 / US 385 rows */
function normalizeRouteKey(text) {
  if (!text) return "";
  const s = normalizePrintedRouteToken(text).replace(/\s+/g, " ").trim().toLowerCase();
  const ih = s.match(/\b(?:ih|i)\s*[-–]?\s*(\d{1,3})\b/);
  if (ih) return "ih:" + parseInt(ih[1], 10);
  const bi = s.match(/\bbi\s*[-–]?\s*(\d{1,3})\b/);
  if (bi) return "bi:" + parseInt(bi[1], 10);
  const us = s.match(/\bus\s*[-–]?\s*(\d{1,3})\b/);
  if (us) return "us:" + parseInt(us[1], 10);
  const bu = s.match(/\bbu\s*[-–]?\s*(\d{1,4})\b/);
  if (bu) return "bu:" + parseInt(bu[1], 10);
  const sh = s.match(/\bsh\s*[-–]?\s*(\d{1,4})\b/);
  if (sh) return "sh:" + parseInt(sh[1], 10);
  const fm = s.match(/\bfm\s*[-–]?\s*(\d{1,4})\b/);
  if (fm) return "fm:" + parseInt(fm[1], 10);
  const cr = s.match(/\bcr\s*[-–]?\s*(\d{1,4})\b/);
  if (cr) return "cr:" + parseInt(cr[1], 10);
  const ss = s.match(/\bss\s*[-–]?\s*(\d{1,4})\b/);
  if (ss) return "ss:" + parseInt(ss[1], 10);
  const sp = s.match(/\bsp\s*[-–]?\s*(\d{1,3})\b/);
  if (sp) return "sp:" + parseInt(sp[1], 10);
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
    /\bBI\b/i.test(hw.text) ||
    /\bI\s*[-–]?\s*\d{1,3}\b/i.test(hw.text) ||
    spoken.indexOf("Interstate ") === 0 ||
    spoken.indexOf("Business Interstate ") === 0;
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

/** Align with Supabase `parse-permit` origin / destination boundaries (client-side PDF path). */
var ORIGIN_BLOCK_STOP_CLIENT =
  /^\s*(Destination|Final\s+Destination|Route\s+Conditions|General\s+Conditions|Miles\s+Route\s+To|Dimension|Dimensions|Vehicle|Load\s+description|Escort|Certification|Point\s+of\s+origin)\b/i;
var DEST_BLOCK_STOP_CLIENT =
  /^\s*(Route\s+Conditions|General\s+Conditions|Miles\s+Route\s+To|Dimension|Dimensions|Vehicle|Origin\s*:|Effective\s+date|Expiration|Certification)\b/i;

/** Longest Origin narrative on the permit (page 1 or table header). */
function extractPermitOriginNarrative(routeText) {
  if (!routeText) return "";
  var norm = normalizeWs(routeText);
  var candidates = [];

  var br;
  var reLoadedO = /\[\s*Loaded\s+Route\s+Origin\s*:\s*([^\]\n]+)/gi;
  while ((br = reLoadedO.exec(norm)) !== null) {
    var frag = br[1].replace(/\s+/g, " ").trim();
    if (frag.length > 1) candidates.push(frag);
  }

  var lines = norm
    .split(/\n/)
    .map(function (l) {
      return l.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
  for (var i = 0; i < lines.length; i++) {
    if (!/\bOrigin\s*:/i.test(lines[i])) continue;
    var afterColon = lines[i].replace(/^.*?\bOrigin\s*:/i, "").trim();
    var chunk = afterColon;
    var inlineDest = /\bDestination\s*:/i.exec(chunk);
    if (inlineDest) {
      chunk = chunk.slice(0, inlineDest.index).replace(/[,;]\s*$/, "").trim();
    }
    var parts = [];
    if (chunk) parts.push(chunk);
    var j = i + 1;
    while (j < lines.length) {
      var L = lines[j];
      if (ORIGIN_BLOCK_STOP_CLIENT.test(L)) break;
      if (/^\s*Origin\s*:/i.test(L)) break;
      parts.push(L);
      j++;
    }
    var block = parts.join(" ").replace(/\s+/g, " ").trim();
    if (block.length > 1) candidates.push(block);
  }

  var best = "";
  var bestSc = -1;
  for (var k = 0; k < candidates.length; k++) {
    var c = normalizeHyphensForMatching(candidates[k]).trim();
    var sc = Math.min(c.length, 320);
    if (/\b(US|SH|FM|RM|IH|BI|BU|CR|SS|SP|SL)\s*[-–]?\s*\d/i.test(c)) sc += 120;
    if (/\d+(?:\.\d+)?\s*mi(?:le)?s?\b/i.test(c)) sc += 75;
    if (/junction|intersection|\s&\s|\s+and\s+/i.test(c)) sc += 40;
    if (/\[\s*Loaded\s+Route/i.test(c)) sc += 25;
    if (sc > bestSc) {
      bestSc = sc;
      best = c;
    }
  }
  best = best.trim();
  if (!best || best.length < 6) {
    var fb = extractPermitOriginFallbackFirstLine(routeText);
    if (fb) best = normalizeHyphensForMatching(fb).trim();
  }
  return best;
}

function extractPermitDestinationNarrative(routeText) {
  if (!routeText) return "";
  var norm = normalizeWs(routeText);
  var candidates = [];

  var brd;
  var reLoadedD = /\[\s*Loaded\s+Route\s+Destination\s*:\s*([^\]\n]+)/gi;
  while ((brd = reLoadedD.exec(norm)) !== null) {
    var fd = brd[1].replace(/\s+/g, " ").trim();
    if (fd.length > 1) candidates.push(fd);
  }

  var linesD = norm
    .split(/\n/)
    .map(function (l) {
      return l.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
  for (var ii = 0; ii < linesD.length; ii++) {
    if (!/^\s*(?:Final\s+)?Destination\s*:/i.test(linesD[ii])) continue;
    var afterC = linesD[ii].replace(/^.*?\b(?:Final\s+)?Destination\s*:/i, "").trim();
    var partsD = [];
    if (afterC) partsD.push(afterC);
    var jj = ii + 1;
    while (jj < linesD.length) {
      var LD = linesD[jj];
      if (DEST_BLOCK_STOP_CLIENT.test(LD)) break;
      if (/^\s*(?:Final\s+)?Destination\s*:/i.test(LD)) break;
      partsD.push(LD);
      jj++;
    }
    var blockD = partsD.join(" ").replace(/\s+/g, " ").trim();
    if (blockD.length > 1) candidates.push(blockD);
  }

  var bestD = "";
  var bestScD = -1;
  for (var kk = 0; kk < candidates.length; kk++) {
    var cD = normalizeHyphensForMatching(candidates[kk]).trim();
    var scD = Math.min(cD.length, 320);
    if (/\b(US|SH|FM|RM|IH|BI|BU|CR|SS|SP|SL)\s*[-–]?\s*\d/i.test(cD)) scD += 120;
    if (
      /\b\d{2,5}\s+\w[\w\s]{2,24}\b(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|blvd|hwy|fm)\b/i.test(
        cD
      )
    ) {
      scD += 60;
    }
    if (scD > bestScD) {
      bestScD = scD;
      bestD = cD;
    }
  }
  return bestD.trim();
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
    /\b(Turn|Continue|Merge|Take|Bear|Arrive|DETOUR)\b/i.test(line)
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
      dirHint: dir || "",
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
          dirHint: dir || "",
        });
        stops.push({
          label: hw.label,
          text: hw.text,
          displayText:
            hw.text + " mi " + mileRange.to + (city ? " @" + city : ""),
          queries: qTo,
          dirHint: dir || "",
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
        dirHint: dirUse || "",
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
function haversineMi(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function bearingBetweenDeg(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad);
  const br = (Math.atan2(y, x) * 180) / Math.PI;
  return (br + 360) % 360;
}

function smallestAngleDiffDeg(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Match expanded travel dir from the permit (north, southeast, …) to ideal compass bearing */
function idealBearingFromTravelDir(dirWord) {
  const w = (dirWord || "").toLowerCase();
  const map = {
    north: 0,
    northeast: 45,
    east: 90,
    southeast: 135,
    south: 180,
    southwest: 225,
    west: 270,
    northwest: 315,
  };
  return map[w] !== undefined ? map[w] : null;
}

/**
 * Resolved [roadA, roadB] for Mapbox intersection search from Supabase `origin_structured`.
 * Start pin uses the intersection only (no mile offset from the permit).
 */
function resolveOriginIntersectionRoads(originStructured) {
  if (!originStructured || typeof originStructured !== "object") return null;
  const mode = originStructured.mode;
  const lrRaw = originStructured.loaded_route_road || originStructured.loadedRouteRoad || "";
  const lr = String(lrRaw || "").trim();
  let roads = Array.isArray(originStructured.roads)
    ? originStructured.roads.map(function (r) {
        return String(r || "").trim();
      }).filter(Boolean)
    : [];
  const seen = {};
  roads = roads.filter(function (r) {
    if (seen[r]) return false;
    seen[r] = true;
    return true;
  });

  if (mode === "semicolon" && roads.length >= 2) {
    return [roads[0], roads[1]];
  }
  if (mode !== "junction_offset") return null;

  if (roads.length >= 2) {
    return [roads[0], roads[1]];
  }
  if (roads.length === 1 && lr && roads[0] !== lr) {
    return [lr, roads[0]];
  }
  return null;
}

function scoreMapboxIntersectionCandidateRefined(f, mentionsBothRoads) {
  if (!f || typeof f.lat !== "number" || typeof f.lon !== "number") return -Infinity;
  const name = String(f.label || "").toLowerCase();
  let score = typeof f.relevance === "number" ? f.relevance : 0;
  /** Without this, Mapbox often returns unrelated addresses that happen to match weak heuristics. */
  if (mentionsBothRoads) score += 50;
  if (name.includes("intersection")) score += 12;
  if (name.includes("junction")) score += 6;
  const pt = f.placeType || [];
  if (pt.indexOf("address") >= 0) score += 2;
  return score;
}

/** Furthest a verified “both roads” geocode may be from the first turn-table point and still win. */
const MAX_ORIGIN_CORRIDOR_ANCHOR_MI = 175;

function expandQueriesWithOriginPlaceHints(queries, hints) {
  if (!hints || !hints.length) return dedupeStrings(queries);
  const base = dedupeStrings(queries);
  const out = base.slice();
  for (let i = 0; i < base.length; i++) {
    const qt = base[i].trim();
    if (!qt) continue;
    for (let hi = 0; hi < hints.length; hi++) {
      const hint = String(hints[hi] || "").trim();
      if (!hint) continue;
      if (/\bTexas\b/i.test(qt)) {
        out.push(qt.replace(/\bTexas\b/i, hint + " Texas"));
      } else {
        out.push(qt + " " + hint);
      }
    }
  }
  return dedupeStrings(out);
}

function dedupeIntersectionLatLon(cands) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    const k = String(Math.round(c.lat * 1e4)) + "," + String(Math.round(c.lon * 1e4));
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/**
 * Candidates whose labels reference both highway numbers — prefer the one nearest the first
 * table row (same crossing the permit uses, not another FM/US with the same digits).
 */
function pickDualRoadHitNearCorridor(dualHits, proximityPrior) {
  const list = dedupeIntersectionLatLon(dualHits);
  if (!list.length) return null;
  if (
    !proximityPrior ||
    typeof proximityPrior.lat !== "number" ||
    typeof proximityPrior.lon !== "number"
  ) {
    return list[0];
  }
  list.sort(function (x, y) {
    return (
      haversineMi(proximityPrior.lat, proximityPrior.lon, x.lat, x.lon) -
      haversineMi(proximityPrior.lat, proximityPrior.lon, y.lat, y.lon)
    );
  });
  for (let i = 0; i < list.length; i++) {
    const d = haversineMi(proximityPrior.lat, proximityPrior.lon, list[i].lat, list[i].lon);
    if (d <= MAX_ORIGIN_CORRIDOR_ANCHOR_MI) return list[i];
  }
  return list[0];
}

/**
 * Loaded route origin: pin at **intersection of the two roads** (permit "A & B" / loaded route + junction).
 * Collects every Mapbox/Photon hit whose **label** mentions both route numbers, then picks the one
 * **nearest the first turn row** so duplicate FM/US numbers elsewhere in Texas lose.
 * @param {{ lat: number, lon: number } | null} proximityPrior — geocode of first table row after origin.
 */
async function geocodeLoadedOriginIntersection(accessToken, originStructured, proximityPrior) {
  if (!originStructured || typeof originStructured !== "object") {
    return null;
  }
  const pair = resolveOriginIntersectionRoads(originStructured);
  if (!pair) return null;
  const a = String(pair[0]).trim();
  const b = String(pair[1]).trim();
  if (!a || !b || a === b) return null;
  /**
   * Do not pass the first table row as Mapbox/Photon proximity here: it biases hits **along** one
   * highway toward that row (e.g. FM 1187 milepoints toward the next turn) instead of the true
   * crossing with the other origin road. Use Texas-wide default proximity; use `proximityPrior` only
   * in `pickDualRoadHitNearCorridor` to disambiguate duplicate route numbers.
   */
  const statewideProximityBias = null;

  const placeHintsRaw = originStructured.place_hints || originStructured.placeHints || [];
  const placeHints = Array.isArray(placeHintsRaw)
    ? placeHintsRaw
        .map(function (x) {
          return String(x || "").trim();
        })
        .filter(Boolean)
    : [];

  const queries = [
    `${a} and ${b} intersection Texas`,
    `${b} and ${a} intersection Texas`,
    `${a} and ${b} junction Texas`,
    `${b} and ${a} junction Texas`,
    `${a} ${b} intersection Texas`,
  ];
  function addFmRmSpoken(road, other) {
    const fm = /^FM\s+(\d{1,4})/i.exec(road);
    if (fm) {
      const n = fm[1];
      queries.push(`Farm to Market Road ${n} and ${other} Texas`);
      queries.push(`Farm Road ${n} and ${other} Texas`);
    }
    const rm = /^RM\s+(\d{1,4})/i.exec(road);
    if (rm) {
      queries.push(`Ranch Road ${rm[1]} and ${other} Texas`);
    }
  }
  addFmRmSpoken(a, b);
  addFmRmSpoken(b, a);

  if (/^BU\s/i.test(a)) {
    const biz = a.replace(/^BU\s+/i, "Business US ");
    queries.push(`${biz} and ${b} intersection Texas`, `${b} and ${biz} intersection Texas`);
    const m = a.match(/^BU\s+(\d{1,4})/i);
    if (m) {
      const n = m[1];
      queries.push(`US ${n} and ${b} intersection Texas`, `${b} and US ${n} intersection Texas`);
    }
  }
  if (/^BU\s/i.test(b)) {
    const bizB = b.replace(/^BU\s+/i, "Business US ");
    queries.push(`${a} and ${bizB} intersection Texas`, `${bizB} and ${a} intersection Texas`);
    const m = b.match(/^BU\s+(\d{1,4})/i);
    if (m) {
      const n = m[1];
      queries.push(`${a} and US ${n} intersection Texas`, `US ${n} and ${a} intersection Texas`);
    }
  }

  const allQueries = expandQueriesWithOriginPlaceHints(dedupeStrings(queries), placeHints);

  const dualHits = [];
  let bestDualMapbox = null;
  let bestDualScore = -Infinity;

  if (accessToken) {
    for (let qi = 0; qi < allQueries.length; qi++) {
      const q = allQueries[qi];
      const feats = await geocodeMapboxPlacesFeatures(q, accessToken, statewideProximityBias);
      for (let fi = 0; fi < feats.length; fi++) {
        const feat = feats[fi];
        const both = geocodeLabelReferencesBothRoads(feat.label, a, b);
        if (both) {
          dualHits.push({
            lat: feat.lat,
            lon: feat.lon,
            label: feat.label,
            matchedQuery: q,
            source: "mapbox",
          });
          const sc = scoreMapboxIntersectionCandidateRefined(feat, true);
          if (sc > bestDualScore) {
            bestDualScore = sc;
            bestDualMapbox = {
              lat: feat.lat,
              lon: feat.lon,
              label: feat.label,
              matchedQuery: q,
            };
          }
        }
      }
      if (qi < allQueries.length - 1) await sleep(45);
    }
  }

  const maxPhotonQ = Math.min(allQueries.length, 14);
  for (let qi = 0; qi < maxPhotonQ; qi++) {
    const q = allQueries[qi];
    const feats = await geocodePhotonPlacesFeatures(q, statewideProximityBias);
    for (let fi = 0; fi < feats.length; fi++) {
      const feat = feats[fi];
      if (!geocodeLabelReferencesBothRoads(feat.label, a, b)) continue;
      dualHits.push({
        lat: feat.lat,
        lon: feat.lon,
        label: feat.label,
        matchedQuery: q,
        source: "photon",
      });
    }
    if (qi < maxPhotonQ - 1) await sleep(50);
  }

  const corridorPick = pickDualRoadHitNearCorridor(dualHits, proximityPrior);
  if (corridorPick) {
    return {
      lat: corridorPick.lat,
      lon: corridorPick.lon,
      label: `${a} & ${b} (${corridorPick.label || "intersection"})`,
      source: corridorPick.source || "mapbox",
      matchedQuery: corridorPick.matchedQuery,
    };
  }

  if (bestDualMapbox) {
    return {
      lat: bestDualMapbox.lat,
      lon: bestDualMapbox.lon,
      label: `${a} & ${b} (${bestDualMapbox.label || "intersection"})`,
      source: "mapbox",
      matchedQuery: bestDualMapbox.matchedQuery,
    };
  }
  return null;
}

/**
 * When Mapbox returns several Features for a highway query, re-rank using prior waypoint +
 * permit travel direction so the pin advances along the corridor instead of snapping backward.
 */
function pickBestGeocodeFeature(features, proximityPrior, dirHint) {
  if (!features || !features.length) return null;
  const first = features[0];
  if (
    !proximityPrior ||
    typeof proximityPrior.lat !== "number" ||
    typeof proximityPrior.lon !== "number"
  ) {
    return first;
  }
  const ideal = idealBearingFromTravelDir(dirHint);
  if (ideal == null) {
    return first;
  }
  let best = first;
  let bestScore = Infinity;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (!f || typeof f.lat !== "number" || typeof f.lon !== "number") continue;
    const distMi = haversineMi(proximityPrior.lat, proximityPrior.lon, f.lat, f.lon);
    if (distMi < 0.04) continue;
    const br = bearingBetweenDeg(proximityPrior.lat, proximityPrior.lon, f.lat, f.lon);
    let score = smallestAngleDiffDeg(br, ideal);
    if (distMi < 2) score += (2 - distMi) * 2;
    if (distMi > 100) score += (distMi - 100) * 0.02;
    if (score < bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best || first;
}

async function geocodeMapboxPlacesFeatures(query, accessToken, proximityPrior) {
  if (!accessToken || !query) return [];
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
    limit: "10",
    proximity: prox,
    bbox: MAPBOX_TX_BBOX,
  });
  const res = await fetch(base + "?" + params.toString());
  if (!res.ok) return [];
  const data = await res.json();
  const fs = data.features || [];
  const out = [];
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i];
    if (!f?.center || f.center.length < 2) continue;
    const [lon, lat] = f.center;
    const label = f.place_name || f.text || query;
    out.push({
      lat,
      lon,
      label,
      relevance: typeof f.relevance === "number" ? f.relevance : 0,
      placeType: Array.isArray(f.place_type) ? f.place_type : [],
    });
  }
  return out;
}

async function geocodeMapboxPlaces(query, accessToken, proximityPrior) {
  const fs = await geocodeMapboxPlacesFeatures(query, accessToken, proximityPrior);
  return fs.length ? fs[0] : null;
}

function photonLabelFromFeature(f) {
  const p = f.properties || {};
  const streetLine = [p.housenumber, p.street].filter(Boolean).join(" ");
  const bits = [p.name, streetLine, p.district, p.city, p.state, p.county].filter(Boolean);
  return bits.length ? bits.join(", ") : "";
}

/** Photon (OSM) — often better for rural TX highway crossings than Mapbox alone. */
async function geocodePhotonPlacesFeatures(query, proximityPrior) {
  if (!query) return [];
  let url =
    "https://photon.komoot.io/api/?q=" +
    encodeURIComponent(query) +
    "&limit=12&lang=en&bbox=" +
    encodeURIComponent("-106.7,25.8,-93.5,36.6");
  if (
    proximityPrior &&
    typeof proximityPrior.lon === "number" &&
    typeof proximityPrior.lat === "number"
  ) {
    url += "&lon=" + proximityPrior.lon + "&lat=" + proximityPrior.lat;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const out = [];
    const fs = data.features || [];
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      if (!f?.geometry?.coordinates) continue;
      const [lon, lat] = f.geometry.coordinates;
      const label = photonLabelFromFeature(f);
      if (!label) continue;
      const pr = f.properties || {};
      out.push({
        lat,
        lon,
        label,
        relevance: typeof pr.importance === "number" ? pr.importance : 0,
        placeType: [],
      });
    }
    return out;
  } catch (_) {
    return [];
  }
}

/**
 * Same highway enrichment as the main route loop (direction + mile-aware queries for table rows).
 */
function prepareSegmentForGeocode(h) {
  const dirWord =
    (h.dirHint && String(h.dirHint).trim()) ||
    extractPrimaryDirection(h.displayText || h.text || "") ||
    "";
  const isRouteSeg = String(h.label || "")
    .toLowerCase()
    .includes("route");
  if (isRouteSeg) {
    return {
      ...h,
      dirHint: dirWord || h.dirHint,
      queries: enrichQueriesForTxRow(
        h.queries || [],
        { text: h.text },
        dirWord,
        h.displayText || h.text || "",
        h.legMilesToNext != null && Number.isFinite(h.legMilesToNext) ? h.legMilesToNext : null,
        h.cumulativePermitMi != null && Number.isFinite(h.cumulativePermitMi)
          ? h.cumulativePermitMi
          : null
      ),
    };
  }
  return h;
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

  const dirHint =
    (h.dirHint && String(h.dirHint).trim()) ||
    extractPrimaryDirection(h.displayText || h.text || "") ||
    "";

  if (accessToken) {
    for (let i = 0; i < attempts.length; i++) {
      const q = attempts[i];
      if (!q) continue;
      const feats = await geocodeMapboxPlacesFeatures(q, accessToken, proximityPrior);
      const pick = pickBestGeocodeFeature(feats, proximityPrior, dirHint);
      if (pick) return { ...pick, source: "mapbox", matchedQuery: q };
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
    const list = [];
    const feats = data.features || [];
    for (let fi = 0; fi < feats.length; fi++) {
      const f = feats[fi];
      if (!f?.geometry?.coordinates) continue;
      const [lon, lat] = f.geometry.coordinates;
      const name = f.properties?.name || f.properties?.street || fallbackQ;
      list.push({ lat, lon, label: name });
    }
    const pick = pickBestGeocodeFeature(list, proximityPrior, dirHint);
    if (pick) return { ...pick, source: "photon", matchedQuery: fallbackQ };
  } catch (_) {
    return null;
  }
  return null;
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
  let geometry = null;
  let provider = null;

  if (mapboxToken) {
    geometry = await routeMapboxDirections(coords, mapboxToken);
    provider = geometry ? "mapbox" : null;
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
function buildRouteGeoJSON(lineGeometry, waypointRows) {
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
        note:
          "Approximate driving geometry from geocoded waypoints — not an official TxDOT corridor.",
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

function clearRouteOverlay() {
  mapMarkers.forEach(function (m) {
    m.remove();
  });
  mapMarkers = [];

  if (mapInstance) {
    if (mapInstance.getLayer("route-line")) mapInstance.removeLayer("route-line");
    if (mapInstance.getSource("route-line-src")) mapInstance.removeSource("route-line-src");
  }
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
  if (routeProvider === "mapbox-match") return "Mapbox Map Matching";
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
      const fc = buildRouteGeoJSON(routeSession.geometry, displayEnriched);
      if (!fc.features.length) return;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
      triggerDownloadJson(`permit-route-${stamp}.geojson`, fc);
      if (statusEl) statusEl.textContent = "GeoJSON downloaded.";
    });
  }

  async function geocodeAndRoute(hints, generation, originStructured) {
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
    let precomputedSeg1Pt = null;
    const canBiasOriginWithSeg2 =
      hints.length >= 2 &&
      accessToken &&
      originStructured &&
      resolveOriginIntersectionRoads(originStructured);
    if (canBiasOriginWithSeg2) {
      try {
        precomputedSeg1Pt = await geocodeSegment(
          prepareSegmentForGeocode(hints[1]),
          accessToken,
          null
        );
      } catch (e) {
        console.warn(e);
      }
    }
    const proximityForOrigin =
      precomputedSeg1Pt &&
      typeof precomputedSeg1Pt.lat === "number" &&
      typeof precomputedSeg1Pt.lon === "number"
        ? { lat: precomputedSeg1Pt.lat, lon: precomputedSeg1Pt.lon }
        : null;

    for (let i = 0; i < hints.length; i++) {
      if (generation !== runGeneration) {
        return { coords: [], enriched: [], aborted: true, routeProvider: null };
      }

      if (i > 0) await sleep(GEO_DELAY_MS);

      const h = hints[i];
      showRouteProgress(
        `Geocoding ${i + 1}/${hints.length}: ${hintDisplay(h)}…`
      );

      const geoHint = prepareSegmentForGeocode(h);

      let pt = null;
      try {
        if (i === 1 && precomputedSeg1Pt) {
          pt = precomputedSeg1Pt;
          precomputedSeg1Pt = null;
        } else {
          const isFirstOrigin =
            i === 0 &&
            String(h.label || "")
              .trim()
              .toLowerCase() === "origin";
          if (isFirstOrigin && originStructured) {
            pt = await geocodeLoadedOriginIntersection(
              accessToken,
              originStructured,
              proximityForOrigin
            );
          }
          if (!pt) {
            pt = await geocodeSegment(geoHint, accessToken, proximityPrior);
          }
        }
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
      const originStructuredRaw = remote?.origin_structured ?? null;
      const originTextFromServer = remote?.origin_text ?? null;
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

      const originStructured = resolveEffectiveOriginStructured(
        originStructuredRaw,
        originTextFromServer,
        hints[0] ? (hints[0].displayText || hints[0].text || "") : null
      );

      const { coords, enriched, geometry, aborted, routeProvider } = await geocodeAndRoute(
        hints,
        myRun,
        originStructured
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
        origin_structured: originStructured,
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
        "Supabase parser not configured. Set js/supabase-config.js values.";
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

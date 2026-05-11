import pdfParse from "npm:pdf-parse@1.1.1";

type ParsedStep = {
  /** Miles on the Route column road until this maneuver (Miles column). */
  leg_miles: number | null;
  /** Running total from the loaded-route table (Distance column) when present. */
  permit_odometer_mi: number | null;
  estimated_time: string | null;
  /** Sum of leg_miles through this row — for checking against permit_odometer_mi. */
  cumulative_mi: number | null;
  from_road: string | null;
  from_dir: string | null;
  maneuver: string | null;
  to_road: string | null;
  to_dir: string | null;
  raw_row: string;
};

type SegmentOut = {
  label: string;
  text: string;
  displayText: string;
  queries: string[];
  /** Expanded travel direction (north, west, …) for downstream geocode scoring */
  dir_hint?: string | null;
  leg_miles_to_next?: number | null;
  /** Same as permit Distance column when parsed (odometer from start of loaded route). */
  cumulative_permit_mi?: number | null;
};

type OriginStructured = {
  mode: "junction_offset" | "semicolon" | "state_line" | "unknown";
  offset_mi: number | null;
  bearing: string | null;
  roads: string[];
  /**
   * TxDMV `[Loaded Route Origin: BU0287P, 2.6mi NW of BU0287P & FM1187]` — the highway the load
   * is on at start (comma before the offset clause), normalized e.g. `BU 287P`.
   */
  loaded_route_road?: string | null;
  /**
   * Local place names from the origin narrative (e.g. `Wise County`, `Decatur`) to disambiguate
   * duplicate FM/US numbers elsewhere in Texas when geocoding the crossing.
   */
  place_hints?: string[];
};

type ParseResult = {
  parse_text: string;
  permit_number: string | null;
  origin_text: string | null;
  destination_text: string | null;
  parser_version: string;
  steps: ParsedStep[];
  segments: SegmentOut[];
  origin_structured: OriginStructured | null;
  warnings: string[];
};

const PARSER_VERSION = "tx-turntable-v2.7.5";

const ODOMETER_TOLERANCE_MI = 0.2;

/** Keep in sync with client `js/app.js` ROUTE_PATTERNS (TxDMV PDF tokens). */
const ROUTE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "Interstate", re: /\bI\s*[-–]?\s*0*(\d{1,3})\b/gi },
  { label: "IH", re: /\bIH\s*[-–]?\s*0*(\d{1,3})(?:[A-Za-z]+)?\b/gi },
  { label: "Business IH", re: /\bBI\s*[-–]?\s*0*(\d{1,3})(?:[A-Za-z]+)?\b/gi },
  { label: "US Highway", re: /\bUS\s*[-–]?\s*0*(\d{1,3})([A-Za-z]*)\b/gi },
  { label: "State Hwy", re: /\b(?:SH|TX|State\s+Hwy\.?)\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi },
  { label: "Farm / Ranch", re: /\b(?:FM|RM)\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi },
  { label: "County Road", re: /\bCR\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi },
  { label: "Loop", re: /\bLOOP\s*[-–]?\s*(\d{1,4}[A-Za-z]?)\b/gi },
  { label: "State Loop", re: /\bSL\s*[-–]?\s*(\d{1,4})([A-Za-z]*)\b/gi },
  { label: "State Spur", re: /\bSS\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi },
  { label: "Spur", re: /\bSP\s*[-–]?\s*0*(\d{1,3})([A-Za-z]*)\b/gi },
  { label: "Business US", re: /\b(?:BU|BUS)\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi },
];

function corsHeaders(extra: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...extra,
  };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders({ "Content-Type": "application/json" }),
  });
}

function normalizeWs(s: string): string {
  return s
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .trim();
}

function cleanLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeCommonOcrTypos(s: string): string {
  return cleanLine(s)
    // Preserve true "of", but recover common OCR "0f"/"0F".
    .replace(/\b0f\b/gi, "of")
    // OCR often reads US0### / USO###.
    .replace(/\bUS[O0]\s*(\d{2,4})\b/gi, "US $1")
    // SHO### should be SH ###.
    .replace(/\bSH[O0]\s*(\d{2,4})\b/gi, "SH $1")
    // 1H20 / lH20 -> IH20
    .replace(/\b[1lI]H\s*([0-9]{1,3})\b/g, "IH $1")
    // Keep service-road variants parseable.
    .replace(/\bIH\s*([0-9]{1,3})\s*SFR\b/gi, "IH $1 SFR");
}

function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const v = cleanLine(x);
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** Normalize TxDMV-style tokens (US69EFR, BU0287P, fm1472, IH0410) — parity with `js/app.js`. */
function normalizePrintedRouteToken(raw: string): string {
  if (!raw) return raw;
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/\bBU(?:S)?\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi, (_, n, suf) => {
    const sufSp = suf ? String(suf).replace(/\s+/g, "").toUpperCase() : "";
    return `BU ${parseInt(n, 10)}${sufSp || ""}`;
  });
  s = s.replace(/\bBI\s*[-–]?\s*0*(\d{1,3})([A-Za-z]*)\b/gi, (_, n, suf) =>
    `BI ${parseInt(n, 10)}${(suf || "").replace(/\s+/g, "")}`);
  s = s.replace(/\bSS\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi, (_, n, suf) =>
    `SS ${parseInt(n, 10)}${(suf || "").replace(/\s+/g, "")}`);
  s = s.replace(/\bSP\s*[-–]?\s*0*(\d{1,3})([A-Za-z]*)\b/gi, (_, n, suf) =>
    `SP ${parseInt(n, 10)}${(suf || "").replace(/\s+/g, "")}`);
  s = s.replace(/\bCR\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi, (_, n, suf) =>
    `CR ${parseInt(n, 10)}${suf || ""}`);
  s = s.replace(/\bUS\s*[-–]?\s*0*(\d{1,3})([A-Za-z]*)\b/gi, (_, n, suf) => {
    const sufClean = (suf || "").replace(/\s+/g, "");
    return `US ${parseInt(n, 10)}${sufClean}`;
  });
  s = s.replace(/\b(?:SH|TX)\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi, (_, n, suf) => {
    const sufClean = (suf || "").replace(/\s+/g, "");
    return `SH ${parseInt(n, 10)}${sufClean}`;
  });
  s = s.replace(/\bFM\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi, (_, n, suf) =>
    `FM ${parseInt(n, 10)}${suf || ""}`);
  s = s.replace(/\bRM\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi, (_, n, suf) =>
    `RM ${parseInt(n, 10)}${suf || ""}`);
  s = s.replace(/\bSL\s*[-–]?\s*0*(\d{1,4})([A-Za-z]*)\b/gi, (_, n, suf) =>
    `SL ${parseInt(n, 10)}${(suf || "").replace(/\s+/g, "")}`);
  s = s.replace(/\bIH\s*[-–]?\s*0*(\d{1,3})([A-Za-z]*)\b/gi, (_, n) => `IH ${parseInt(n, 10)}`);
  return s;
}

function normalizeRouteToken(raw: string): string {
  return normalizePrintedRouteToken(normalizeCommonOcrTypos(raw));
}

function normalizeHyphensForMatching(line: string): string {
  return line
    .replace(/\b(FM|RM|SH|US|TX|BU|BI|SS|SP|CR)-(\d+)\b/gi, "$1 $2")
    .replace(/\b(fm|rm|sh|us)(\d{2,4})([a-z]*)\b/gi, (_, abbr, n, suf) =>
      `${String(abbr).toUpperCase()} ${n}${suf || ""}`);
}

type HighwayHit = { label: string; text: string; start: number; end: number };

function findHighwaysOnLine(line: string): HighwayHit[] {
  const raw: HighwayHit[] = [];
  for (const p of ROUTE_PATTERNS) {
    const rx = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : `${p.re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = rx.exec(line)) !== null) {
      const token = normalizePrintedRouteToken(m[0].replace(/\s+/g, " ").trim());
      raw.push({ label: p.label, text: token, start: m.index, end: m.index + m[0].length });
    }
  }
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const nonOverlap: HighwayHit[] = [];
  let lastEnd = -1;
  for (const r of raw) {
    if (r.start < lastEnd) continue;
    nonOverlap.push(r);
    lastEnd = r.end;
  }
  return nonOverlap;
}

function interstateSpoken(highwayText: string): string {
  const ih = highwayText.match(/\b(?:IH|I)\s*[-–]?\s*(\d{1,3})(?:[A-Za-z]+)?\b/i);
  if (ih) return `Interstate ${parseInt(ih[1], 10)}`;
  const bi = highwayText.match(/\bBI\s*[-–]?\s*(\d{1,3})(?:[A-Za-z]+)?\b/i);
  if (bi) return `Business Interstate ${parseInt(bi[1], 10)}`;
  return highwayText;
}

function extractExitNumber(line: string): string {
  const m = /\bExit\s+(\d+)\b/i.exec(line);
  return m ? m[1] : "";
}

function extractTowardCityFromLine(line: string): string {
  const m = /\btoward\s+([^[\n]+)/i.exec(line);
  if (!m) return "";
  let chunk = m[1].trim();
  chunk = chunk.replace(/\s+\d+\.\d+\s+\d{1,2}:\d{2}\s*$/, "").trim();
  const parts = chunk
    .split("/")
    .map((p) => p.replace(/\[[^\]]*\]/g, "").trim())
    .filter(Boolean);
  if (!parts.length) return "";
  const last = parts[parts.length - 1];
  if (/^[A-Za-z]/.test(last) && last.length > 2 && !/^\d/.test(last)) {
    return last.replace(/\s+/g, " ").trim();
  }
  return "";
}

function enrichQueriesForTxRow(
  queries: string[],
  road: string,
  dir: string | null,
  line: string,
  legMiles: number | null,
): string[] {
  const spoken = interstateSpoken(road);
  const isIH =
    /\bIH\b/i.test(road) ||
    /\bBI\b/i.test(road) ||
    /\bI\s*[-–]?\s*\d{1,3}\b/i.test(road) ||
    spoken.startsWith("Interstate ") ||
    spoken.startsWith("Business Interstate ");
  let out = [...queries];
  const exitNum = extractExitNumber(line);
  if (isIH && exitNum) {
    out = dedupeStrings(
      [`${spoken} Exit ${exitNum} Texas`, `${spoken} Exit ${exitNum} ${dir || ""} Texas`.replace(/\s+/g, " ").trim()]
        .concat(out),
    );
  }
  const toward = extractTowardCityFromLine(line);
  if (isIH && toward) {
    out = dedupeStrings([`${spoken} near ${toward} Texas`, `${spoken} ${toward} Texas`].concat(out));
  }
  const dirWord = dir || "";
  if (dirWord && legMiles != null && legMiles > 0 && legMiles < 500) {
    out = dedupeStrings([`${road} ${dirWord} Texas highway`, `${spoken} ${dirWord} Texas`].concat(out));
  }
  return dedupeStrings(out);
}

/** Stop collecting a multi-line Origin block */
const ORIGIN_BLOCK_STOP =
  /^\s*(Destination|Final\s+Destination|Route\s+Conditions|General\s+Conditions|Miles\s+Route\s+To|Dimension|Dimensions|Vehicle|Load\s+description|Escort|Certification|Point\s+of\s+origin)\b/i;

/** Stop collecting a multi-line Destination block */
const DEST_BLOCK_STOP =
  /^\s*(Route\s+Conditions|General\s+Conditions|Miles\s+Route\s+To|Dimension|Dimensions|Vehicle|Origin\s*:|Effective\s+date|Expiration|Certification)\b/i;

function scoreAnchorText(s: string, kind: "origin" | "dest"): number {
  const t = s.trim();
  if (t.length < 2) return -1;
  let sc = Math.min(t.length, 320);
  if (/\b(US|SH|FM|RM|IH|BI|BU|CR|SS|SP|SL)\s*[-–]?\s*\d/i.test(t)) sc += 120;
  if (/\d+(?:\.\d+)?\s*mi(?:le)?s?\b/i.test(t)) sc += 75;
  if (/junction|intersection|\s&\s|\s+and\s+/i.test(t)) sc += 40;
  if (/\[\s*Loaded\s+Route/i.test(t)) sc += 25;
  if (
    kind === "dest" &&
    /\b\d{2,5}\s+\w[\w\s]{2,24}\b(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|blvd|hwy|fm)\b/i.test(
      t,
    )
  ) {
    sc += 60;
  }
  return sc;
}

function extractLoadedBracketField(text: string, label: "Origin" | "Destination"): string[] {
  const out: string[] = [];
  const re =
    label === "Origin"
      ? /\[\s*Loaded\s+Route\s+Origin\s*:\s*([^\]\n]+)/gi
      : /\[\s*Loaded\s+Route\s+Destination\s*:\s*([^\]\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const s = cleanLine(m[1]);
    if (s.length > 1) out.push(s);
  }
  return out;
}

function extractPermitNumber(text: string): string | null {
  const m =
    text.match(/\bPermit Number:\s*([A-Z0-9-]{6,})\b/i) ||
    text.match(/\bPermit Number\s+([A-Z0-9-]{6,})\b/i);
  return m ? m[1] : null;
}

function pickBestAnchor(candidates: string[], kind: "origin" | "dest"): string | null {
  const list = candidates.map((c) => cleanLine(c)).filter((c) => c.length > 1);
  if (!list.length) return null;
  let best = list[0];
  let bestSc = scoreAnchorText(best, kind);
  for (let k = 1; k < list.length; k++) {
    const sc = scoreAnchorText(list[k], kind);
    if (sc > bestSc) {
      bestSc = sc;
      best = list[k];
    }
  }
  return best;
}

function extractOrigin(text: string): string | null {
  const norm = normalizeWs(text);
  const candidates: string[] = [];
  candidates.push(...extractLoadedBracketField(norm, "Origin"));

  const lines = norm.split("\n").map(cleanLine).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\bOrigin\s*:/i.test(line)) continue;
    const afterColon = line.replace(/^.*?\bOrigin\s*:/i, "").trim();
    let chunk = afterColon;
    const inlineDest = /\bDestination\s*:/i.exec(chunk);
    if (inlineDest) {
      chunk = chunk.slice(0, inlineDest.index).replace(/[,;]\s*$/, "").trim();
    }
    const parts: string[] = [];
    if (chunk) parts.push(chunk);
    let j = i + 1;
    while (j < lines.length) {
      const L = lines[j];
      if (ORIGIN_BLOCK_STOP.test(L)) break;
      if (/^\s*Origin\s*:/i.test(L)) break;
      parts.push(L);
      j++;
    }
    const block = cleanLine(parts.join(" "));
    if (block.length > 1) candidates.push(block);
  }

  const best = pickBestAnchor(candidates, "origin");
  return best ? normalizeCommonOcrTypos(best) : null;
}

function extractDestination(text: string): string | null {
  const norm = normalizeWs(text);
  const candidates: string[] = [];
  candidates.push(...extractLoadedBracketField(norm, "Destination"));

  const lines = norm.split("\n").map(cleanLine).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*(?:Final\s+)?Destination\s*:/i.test(line)) continue;
    const afterColon = line.replace(/^.*?\b(?:Final\s+)?Destination\s*:/i, "").trim();
    const parts: string[] = [];
    if (afterColon) parts.push(afterColon);
    let j = i + 1;
    while (j < lines.length) {
      const L = lines[j];
      if (DEST_BLOCK_STOP.test(L)) break;
      if (/^\s*(?:Final\s+)?Destination\s*:/i.test(L)) break;
      parts.push(L);
      j++;
    }
    const block = cleanLine(parts.join(" "));
    if (block.length > 1) candidates.push(block);
  }

  const best = pickBestAnchor(candidates, "dest");
  return best ? normalizeCommonOcrTypos(best) : null;
}

function isNoise(line: string): boolean {
  if (!line) return true;
  if (/^\s*Texas\s+Oversize\/Overweight\b/i.test(line)) return true;
  if (/^\s*PAGE\s+\d+\s+of\s+\d+\b/i.test(line)) return true;
  if (/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/i.test(line)) return true;
  if (/^\s*General Conditions(?:\(Continued\))?\s*:/i.test(line)) return true;
  if (/^\s*Name:\s+.+Permit Number/i.test(line)) return true;
  return false;
}

function isTableHeader(line: string): boolean {
  return /^\s*Miles\s+Route\s+To\b/i.test(line);
}

function isTableRowStart(line: string): boolean {
  return /^\s*(?:<\s*[\d.]+|[\d.]+)\s+\S/.test(line);
}

function isLikelyTableContinuation(line: string): boolean {
  if (!line) return false;
  if (isNoise(line)) return false;
  if (isTableHeader(line)) return false;
  if (/^\s*(Origin|Destination|Final Destination)\s*:/i.test(line)) return false;
  if (/^\s*\[Loaded Route/i.test(line)) return false;
  if (/^\s*\*\*/.test(line)) return false;
  if (isTableRowStart(line)) return false;
  return true;
}

function extractTurnTableBlock(text: string): string[] {
  const lines = normalizeWs(text).split("\n").map(cleanLine);

  let hdrIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*Miles\s+Route\s+To\b/i.test(lines[i] || "")) {
      hdrIdx = i;
      break;
    }
  }
  if (hdrIdx < 0) return [];

  let start = hdrIdx;
  if (hdrIdx > 0 && /^\s*Origin\s*:/i.test(lines[hdrIdx - 1] || "")) {
    start = hdrIdx - 1;
  }

  const out: string[] = [];
  let milesHeaderSeen = false;

  for (let j = start; j < lines.length; j++) {
    const line = lines[j];
    if (!line) continue;
    if (/^\s*Texas\s+Oversize\b/i.test(line)) continue;
    if (/PAGE\s+\d+\s+of\s+\d+/i.test(line)) continue;
    if (/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/i.test(line)) continue;

    if (/^\s*Miles\s+Route\s+To\b/i.test(line)) {
      if (milesHeaderSeen) continue;
      milesHeaderSeen = true;
    }

    if (isNoise(line)) continue;

    out.push(line);

    if (/Arrive at destination/i.test(line)) break;
    if (/^\s*Final Destination\s*:/i.test(line)) break;
  }

  const merged: string[] = [];
  for (const line of out) {
    if (isLikelyTableContinuation(line) && merged.length) {
      merged[merged.length - 1] = cleanLine(`${merged[merged.length - 1]} ${line}`);
    } else {
      merged.push(line);
    }
  }

  return merged;
}

function parseLeadingLegMiles(line: string): number | null {
  const m = /^\s*(?:<\s*([\d.]+)|([\d.]+))\s+/.exec(line);
  if (!m) return null;
  const v = parseFloat(m[1] || m[2]);
  return Number.isFinite(v) ? v : null;
}

/** Strip " … 4.60 00:05" style trailing odometer + est. time from a merged table row. */
function stripTrailingOdometerTime(s: string): {
  body: string;
  odometer: number | null;
  estTime: string | null;
} {
  const t = cleanLine(s);
  const m = /\s+([\d.]+)\s+(\d{1,2}:\d{2})\s*$/i.exec(t);
  if (!m) {
    return { body: t, odometer: null, estTime: null };
  }
  const odom = parseFloat(m[1]);
  return {
    body: cleanLine(t.slice(0, m.index)),
    odometer: Number.isFinite(odom) ? odom : null,
    estTime: m[2],
  };
}

function stripLeadingLegPrefix(line: string): { leg: number | null; rest: string } {
  const leg = parseLeadingLegMiles(line);
  if (leg == null) {
    return { leg: null, rest: cleanLine(line) };
  }
  const rest = cleanLine(line.replace(/^\s*(?:<\s*[\d.]+|[\d.]+)\s+/, ""));
  return { leg, rest };
}

function parseDirectionAbbrev(dir: string | null): string | null {
  if (!dir) return null;
  const k = dir.toLowerCase();
  const map: Record<string, string> = {
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
    north: "north",
    south: "south",
    east: "east",
    west: "west",
    northeast: "northeast",
    northwest: "northwest",
    southeast: "southeast",
    southwest: "southwest",
  };
  return map[k] || null;
}

function findRoadToken(str: string): string | null {
  const hay = normalizeHyphensForMatching(normalizeCommonOcrTypos(str));
  const hws = findHighwaysOnLine(hay);
  return hws.length ? hws[0].text : null;
}

function extractRoadsFromJunctionBlob(blob: string): string[] {
  const b = cleanLine(blob);
  if (!b) return [];
  let parts = b.split(/\s*&\s*/).map((p) => cleanLine(p)).filter(Boolean);
  /** OCR / typography sometimes uses "and" instead of "&" between road names */
  if (parts.length < 2 && /\band\b/i.test(b)) {
    parts = b.split(/\s+and\s+/i).map((p) => cleanLine(p)).filter(Boolean);
  }
  const roads: string[] = [];
  for (const p of parts) {
    const t = findRoadToken(p);
    if (t) roads.push(t);
    else {
      const n = normalizeRouteToken(p);
      const t2 = findRoadToken(n);
      if (t2) roads.push(t2);
    }
  }
  return dedupeStrings(roads);
}

/** e.g. `[Loaded Route Origin: BU0287P, 2.6mi NW of BU0287P & FM1187 ]` */
function parseLoadedRouteRoadFromOriginPrefix(raw: string): string | null {
  const t = cleanLine(raw);
  if (!t) return null;
  const tok = findRoadToken(t);
  if (tok) return tok;
  const n = normalizeRouteToken(t);
  const t2 = findRoadToken(n);
  return t2 || (n.length > 2 && n.length < 56 ? n : null);
}

/** County / city tokens from the origin block — narrows duplicate highway numbers at geocode time. */
function extractOriginPlaceHints(origin: string): string[] {
  const o = normalizeCommonOcrTypos(origin);
  if (!o) return [];
  const hints = new Set<string>();
  const countyRe = /\b([A-Za-z][A-Za-z\s]{1,40}?)\s+County\b/gi;
  let m: RegExpExecArray | null;
  while ((m = countyRe.exec(o)) !== null) {
    const name = cleanLine(m[1]);
    if (name.length > 2 && name.length < 42 && !/\b(?:the|and|or)\b/i.test(name)) {
      hints.add(`${name} County`);
    }
  }
  const cityTx = /\b([A-Za-z][A-Za-z\s]{1,30}?)\s*,\s*TX\b/gi;
  while ((m = cityTx.exec(o)) !== null) {
    const name = cleanLine(m[1]);
    if (name.length > 2 && name.length < 36 && !/\bCounty\b/i.test(name)) hints.add(name);
  }
  return dedupeStrings([...hints]);
}

function expandOriginQueriesWithPlaceHints(queries: string[], hints: string[]): string[] {
  if (!hints.length) return dedupeStrings(queries);
  const out = [...queries];
  for (const q of queries) {
    const qt = q.trim();
    if (!qt) continue;
    for (const h of hints) {
      const hint = cleanLine(h);
      if (!hint) continue;
      if (/\bTexas\b/i.test(qt)) {
        out.push(qt.replace(/\bTexas\b/i, `${hint} Texas`));
      } else {
        out.push(`${qt} ${hint}`);
      }
    }
  }
  return dedupeStrings(out);
}

/** Generic Tx permit origin: junction + mile offset, semicolon triples, or state-line phrasing. */
function parseOriginStructured(origin: string): OriginStructured {
  const o = normalizeCommonOcrTypos(origin);
  const place_hints = extractOriginPlaceHints(o);
  if (!o) {
    return { mode: "unknown", offset_mi: null, bearing: null, roads: [], place_hints };
  }

  const reJunction =
    /^(?:([^,]+?)\s*,\s*)?([\d.]+)\s*mi(?:le)?s?\s+(nb|sb|eb|wb|[nsew]{1,2}|north|south|east|west|northeast|northwest|southeast|southwest)\s+of\s+(.+)$/i;
  const mj = reJunction.exec(o);
  if (mj) {
    const offset_mi = parseFloat(mj[2]);
    const bearing = parseDirectionAbbrev(mj[3]);
    const junctionBlob = cleanLine(mj[4]);
    let loaded_route_road: string | null = null;
    if (mj[1]) {
      loaded_route_road = parseLoadedRouteRoadFromOriginPrefix(mj[1]);
    }
    let roads = extractRoadsFromJunctionBlob(junctionBlob);
    /** e.g. "… of BU0287P & FM1187" often yields one token if both sides normalize the same; pair with loaded route. */
    if (roads.length < 2 && loaded_route_road) {
      if (roads.length === 1) {
        roads = dedupeStrings([loaded_route_road, roads[0]]);
      } else if (roads.length === 0 && /\s*&\s*/.test(junctionBlob)) {
        const parts = junctionBlob.split(/\s*&\s*/).map((p) => cleanLine(p)).filter(Boolean);
        const rhs = parts.length > 1 ? parts[parts.length - 1] : "";
        const tok =
          findRoadToken(rhs) ||
          findRoadToken(normalizeRouteToken(rhs)) ||
          (cleanLine(normalizeRouteToken(rhs)).length > 1 ? cleanLine(normalizeRouteToken(rhs)) : "");
        if (tok) roads = dedupeStrings([loaded_route_road, tok]);
      }
    }
    return {
      mode: "junction_offset",
      offset_mi: Number.isFinite(offset_mi) ? offset_mi : null,
      bearing,
      roads,
      loaded_route_road,
      place_hints,
    };
  }

  if (/;/.test(o)) {
    const segs = o.split(/;/).map((s) => cleanLine(s)).filter(Boolean);
    const roads: string[] = [];
    for (const s of segs) {
      const t = findRoadToken(s);
      roads.push(t ? t : normalizeRouteToken(s));
    }
    return {
      mode: "semicolon",
      offset_mi: null,
      bearing: null,
      roads: dedupeStrings(roads),
      place_hints,
    };
  }

  const reLine =
    /\b(?:IH|I|BI|BU|US|SH|FM)\s*[-–]?\s*0*(\d{1,4}[A-Za-z]?)\s+(OK|NM|LA|AR)\s+Line\b/i;
  if (reLine.test(o)) {
    const tok = findRoadToken(o);
    return {
      mode: "state_line",
      offset_mi: null,
      bearing: null,
      roads: tok ? [tok] : [],
      place_hints,
    };
  }

  return { mode: "unknown", offset_mi: null, bearing: null, roads: [], place_hints };
}

function structuredOriginQueries(s: OriginStructured): string[] {
  const q: string[] = [];
  if (s.mode === "junction_offset" && s.roads.length >= 2) {
    const [a, b] = [s.roads[0], s.roads[1]];
    const off = s.offset_mi != null && Number.isFinite(s.offset_mi) ? s.offset_mi : null;
    const bear = s.bearing || "";
    /**
     * Start pin is the **crossing** of the two roads after "of" (e.g. BU 287P & FM 1187). List plain
     * intersection queries first; offset-from-junction strings are secondary for tools that search verbatim.
     */
    q.push(`${a} and ${b} intersection Texas`);
    q.push(`${b} and ${a} intersection Texas`);
    q.push(`${a} ${b} junction Texas`);
    /** Permit narrative: offset along/across from that intersection in `bear`. */
    if (off != null && bear) {
      q.push(`${off} miles ${bear} of ${a} and ${b} intersection Texas`);
      q.push(`${off} miles ${bear} of ${a} and ${b} junction Texas`);
      q.push(`${a} and ${b} intersection ${off} miles ${bear} Texas`);
    }
    if (s.loaded_route_road && off != null && bear) {
      q.push(`${s.loaded_route_road} ${bear} ${off} miles from ${a} and ${b} intersection Texas`);
      q.push(`${s.loaded_route_road} ${bear} ${off} miles from ${a} and ${b} junction Texas`);
    }
    if (bear && off != null) {
      q.push(`${a} ${bear} ${off} miles from ${b} Texas`);
      q.push(`${a} from ${b} ${bear} Texas`);
    }
  }
  if (s.mode === "semicolon" && s.roads.length) {
    q.push(`${s.roads.join(" ")} Texas`);
    if (s.roads.length >= 2) {
      q.push(`${s.roads[0]} ${s.roads[s.roads.length - 1]} Texas`);
    }
  }
  if (s.mode === "state_line" && s.roads.length) {
    q.push(`${s.roads[0]} Texas state line`);
    q.push(`${s.roads[0]} Texas border`);
  }
  return expandOriginQueriesWithPlaceHints(dedupeStrings(q), s.place_hints ?? []);
}

function collectOriginWarnings(s: OriginStructured): string[] {
  const w: string[] = [];
  if (s.mode === "junction_offset" && s.roads.length < 2) {
    w.push("origin_junction_incomplete");
  }
  if (s.mode === "state_line" && !s.roads.length) {
    w.push("origin_state_line_no_road");
  }
  return w;
}

function parseFromRoadAndDir(body: string): { fromRoad: string | null; fromDir: string | null } {
  const b = normalizeCommonOcrTypos(body);
  const m =
    /^\s*([A-Za-z0-9\s\-]+?)\s+([nsew]{1,2})\s+(?:Turn|Continue|Merge|Take|Bear|Arrive|DETOUR)\b/i.exec(
      b,
    );
  if (m) {
    return { fromRoad: normalizeRouteToken(m[1].trim()), fromDir: parseDirectionAbbrev(m[2]) };
  }
  const m2 =
    /^\s*((?:[A-Za-z0-9\-]|\/)+)\s+(nb|sb|eb|wb|[nsew]{1,2})\s+(?:Turn|Continue|Merge|Take|Bear|Arrive|DETOUR)\b/i.exec(
      b,
    );
  if (m2) {
    return { fromRoad: normalizeRouteToken(m2[1].trim()), fromDir: parseDirectionAbbrev(m2[2]) };
  }
  const hay = normalizeHyphensForMatching(b);
  const hits = findHighwaysOnLine(hay);
  if (hits.length) {
    const tail = hay.slice(hits[0].end);
    const dm = /^\s*(nb|sb|eb|wb|[nsew]{1,2})\b/i.exec(tail);
    if (dm) {
      return { fromRoad: hits[0].text, fromDir: parseDirectionAbbrev(dm[1]) };
    }
    return { fromRoad: hits[0].text, fromDir: null };
  }
  return { fromRoad: findRoadToken(b), fromDir: null };
}

function parseManeuver(body: string): string | null {
  const b = normalizeCommonOcrTypos(body).replace(/\bTurn\s+leit\b/gi, "Turn left");
  const m =
    /\b(Turn left|Turn right|Continue straight|Continue Straight|Merge|Take Exit|Take|Bear left|Bear right|Arrive at destination|DETOUR)\b/i.exec(
      b,
    );
  return m ? m[1] : null;
}

function parseToRoadAndDir(body: string): { toRoad: string | null; toDir: string | null } {
  const b = normalizeCommonOcrTypos(body).replace(/\b(?:toward|towards)\b/gi, "toward");
  const m = /\b(?:onto|on|toward)\s+(.+)$/i.exec(b);
  if (!m) return { toRoad: null, toDir: null };
  const tail = m[1];
  const toRoad = findRoadToken(tail);
  const d = /\b([nsew]{1,2})\b/i.exec(tail);
  return { toRoad, toDir: d ? parseDirectionAbbrev(d[1]) : null };
}

function buildStepFromRow(
  row: string,
  cumulativeBefore: number,
): { step: ParsedStep; cumulativeAfter: number; odometerWarn: string | null } {
  const rawNorm = normalizeCommonOcrTypos(row);
  const { leg, rest: afterLeg } = stripLeadingLegPrefix(rawNorm);
  const afterBracket = cleanLine(afterLeg.replace(/^\[[^\]]+\]\s*/, ""));
  const { body, odometer, estTime } = stripTrailingOdometerTime(afterBracket);
  const normBody = normalizeCommonOcrTypos(body).replace(/\bTurn\s+leit\b/gi, "Turn left");

  const { fromRoad, fromDir } = parseFromRoadAndDir(normBody);
  const maneuver = parseManeuver(normBody);
  const { toRoad, toDir } = parseToRoadAndDir(normBody);

  const computedAfter = leg != null ? cumulativeBefore + leg : cumulativeBefore;

  let odometerWarn: string | null = null;
  if (
    leg != null &&
    odometer != null &&
    Number.isFinite(cumulativeBefore + leg) &&
    Math.abs(cumulativeBefore + leg - odometer) > ODOMETER_TOLERANCE_MI
  ) {
    odometerWarn = `odometer_mismatch expected ~${(cumulativeBefore + leg).toFixed(2)} mi got ${odometer.toFixed(2)} mi`;
  }

  return {
    step: {
      leg_miles: leg,
      permit_odometer_mi: odometer,
      estimated_time: estTime,
      cumulative_mi: leg != null ? computedAfter : null,
      from_road: fromRoad,
      from_dir: fromDir,
      maneuver,
      to_road: toRoad,
      to_dir: toDir,
      raw_row: row,
    },
    cumulativeAfter: odometer != null ? odometer : computedAfter,
    odometerWarn,
  };
}

function stepToSegments(step: ParsedStep): SegmentOut[] {
  const odo = step.permit_odometer_mi ?? step.cumulative_mi;
  const odoLabel =
    odo != null && Number.isFinite(odo) ? ` · ~${odo.toFixed(1)} mi (permit odometer)` : "";
  const out: SegmentOut[] = [];

  if (step.from_road) {
    let queries = dedupeStrings([
      `${step.from_road} ${step.from_dir || ""} Texas`.trim(),
      `${step.from_road} highway Texas`,
      `${step.from_road} Texas`,
    ]);
    if (odo != null && Number.isFinite(odo) && odo > 1) {
      const mi = Math.round(odo * 10) / 10;
      const spoken = interstateSpoken(step.from_road);
      queries = dedupeStrings([
        `${spoken} Texas around mile ${mi}`,
        `${step.from_road} Texas approximately mile ${mi}`,
      ]).concat(queries);
    }
    queries = enrichQueriesForTxRow(queries, step.from_road, step.from_dir, step.raw_row, step.leg_miles);
    out.push({
      label: "Route",
      text: step.from_road,
      displayText: cleanLine(`${step.from_road}${odoLabel} · ${step.raw_row}`.replace(/\s+·\s+·/g, " · ")),
      dir_hint: step.from_dir || null,
      queries,
      leg_miles_to_next: step.leg_miles,
      cumulative_permit_mi: odo,
    });
  }

  if (step.to_road && step.to_road !== step.from_road) {
    let queries = dedupeStrings([
      `${step.to_road} ${step.to_dir || ""} Texas`.trim(),
      `${step.to_road} highway Texas`,
      `${step.to_road} Texas`,
    ]);
    if (odo != null && Number.isFinite(odo) && odo > 1) {
      const mi = Math.round(odo * 10) / 10;
      const spoken = interstateSpoken(step.to_road);
      queries = dedupeStrings([
        `${spoken} Texas around mile ${mi}`,
        `${step.to_road} Texas approximately mile ${mi}`,
      ]).concat(queries);
    }
    const dirUse = step.to_dir || step.from_dir || null;
    queries = enrichQueriesForTxRow(queries, step.to_road, dirUse, step.raw_row, step.leg_miles);
    out.push({
      label: "Route",
      text: step.to_road,
      displayText: cleanLine(`${step.to_road}${odoLabel} · ${step.raw_row}`.replace(/\s+·\s+·/g, " · ")),
      dir_hint: dirUse,
      queries,
      leg_miles_to_next: step.leg_miles,
      cumulative_permit_mi: odo,
    });
  }

  return out;
}

async function parsePermit(pdfBytes: Uint8Array): Promise<ParseResult> {
  const parsed = await pdfParse(pdfBytes);
  const fullText = normalizeWs(parsed?.text || "");
  const permit_number = extractPermitNumber(fullText);

  const parse_text = fullText;
  let origin_text = extractOrigin(fullText);
  let destination_text = extractDestination(fullText);

  const rows = extractTurnTableBlock(fullText)
    .filter((line) => {
      if (/^\s*Miles\s+Route\s+To\b/i.test(line)) return false;
      if (/^\s*Origin\s*:/i.test(line)) return false;
      const norm = normalizeHyphensForMatching(normalizeCommonOcrTypos(line)).replace(
        /\bTurn\s+leit\b/gi,
        "Turn left",
      );
      return (
        isTableRowStart(norm) &&
        /\b(Turn|Continue|Merge|Take|Bear|Arrive at destination|DETOUR)\b/i.test(norm)
      );
    });

  const steps: ParsedStep[] = [];
  const segments: SegmentOut[] = [];
  const warnings: string[] = [];

  let cumulative = 0;

  for (const row of rows) {
    const { step, cumulativeAfter, odometerWarn } = buildStepFromRow(row, cumulative);
    if (odometerWarn) warnings.push(odometerWarn);
    cumulative = cumulativeAfter;
    steps.push(step);
    segments.push(...stepToSegments(step));
  }

  if (!destination_text && steps.length > 0) {
    const last = steps[steps.length - 1];
    if (last?.maneuver && /Arrive\s+at\s+destination/i.test(last.maneuver)) {
      const endR = last.to_road || last.from_road;
      if (endR) {
        destination_text = endR;
        warnings.push("destination_inferred_from_arrive_row");
      }
    }
  }

  const origin_structured = origin_text ? parseOriginStructured(origin_text) : null;
  if (origin_structured) {
    warnings.push(...collectOriginWarnings(origin_structured));
  }

  const narrativeOrigin = origin_text;

  if (narrativeOrigin) {
    const structuredQ = origin_structured ? structuredOriginQueries(origin_structured) : [];
    const originRoad = findRoadToken(narrativeOrigin);
    const fullO = narrativeOrigin.trim();
    const originPrimary = cleanLine(
      origin_structured?.loaded_route_road || originRoad || fullO.slice(0, 96),
    );
    segments.unshift({
      label: "Origin",
      text: originPrimary,
      displayText: `Start · ${fullO.slice(0, 220)}`,
      dir_hint: origin_structured?.bearing || null,
      queries: dedupeStrings([
        ...structuredQ,
        `${fullO} Texas`,
        `${fullO} TX`,
        `${fullO} United States`,
        ...(originRoad ? [`${originRoad} Texas`, `${originRoad} highway Texas`] : []),
      ]),
    });
  } else if (steps.length > 0 && steps[0].from_road) {
    const s0 = steps[0];
    const oRoad = s0.from_road as string;
    origin_text = oRoad;
    warnings.push("origin_inferred_from_first_table_row");
    segments.unshift({
      label: "Origin",
      text: oRoad,
      displayText: `Start · ${s0.raw_row}`.slice(0, 240),
      dir_hint: s0.from_dir || null,
      queries: dedupeStrings([
        `${oRoad} ${s0.from_dir || ""} Texas`.trim(),
        `${oRoad} Texas`,
        `${oRoad} highway Texas`,
      ]),
    });
  }

  if (destination_text) {
    const destinationRoad = findRoadToken(destination_text);
    const fullD = destination_text.trim();
    const destPrimary = (destinationRoad || fullD.slice(0, 96).trim()).trim();
    segments.push({
      label: "Destination",
      text: destPrimary,
      displayText: `End · ${fullD.slice(0, 220)}`,
      queries: dedupeStrings([
        ...(destinationRoad ? [`${destinationRoad} Texas`, `${destinationRoad} highway Texas`] : []),
        `${fullD} Texas`,
        `${fullD} TX`,
        `${fullD} United States`,
      ]),
    });
  }

  if (segments.length && steps.length > 0) {
    const oSeg = segments[0];
    if (oSeg?.label === "Origin") {
      const st = narrativeOrigin || "";
      const weak =
        st.length > 0 &&
        (st.length < 14 ||
          (!/\d/.test(st) && !/\b(US|SH|FM|RM|IH|BI|BU|CR)\s*[-–]?\s*\d/i.test(st)));
      if (weak && steps[0]?.from_road) {
        const s0 = steps[0];
        const fr = s0.from_road as string;
        const q = `${fr} ${s0.from_dir || ""} Texas`.trim();
        oSeg.queries = dedupeStrings([q, `${fr} Texas`, ...(oSeg.queries || [])]);
        if (!findRoadToken(st) || st.length < 12) {
          oSeg.text = fr;
        }
        if (s0.from_dir) oSeg.dir_hint = s0.from_dir;
      }
    }
    const dSeg = segments[segments.length - 1];
    if (dSeg?.label === "Destination" && steps.length) {
      const fullD = destination_text || "";
      const weakD =
        fullD.length > 0 &&
        (fullD.length < 10 ||
          (!/\d/.test(fullD) && !/\b(US|SH|FM|RM|IH|BI|BU)\s*[-–]?\s*\d/i.test(fullD)));
      const last = steps[steps.length - 1];
      if (weakD && last) {
        const endR = last.to_road || last.from_road;
        if (endR) {
          const endD = last.to_dir || last.from_dir || "";
          const q = `${endR} ${endD} Texas`.trim();
          dSeg.queries = dedupeStrings([q, `${endR} Texas`, ...(dSeg.queries || [])]);
          if (!findRoadToken(fullD) || fullD.length < 8) {
            dSeg.text = endR;
          }
          if (endD) dSeg.dir_hint = endD;
        }
      }
    }
  }

  return {
    parse_text,
    permit_number,
    origin_text,
    destination_text,
    parser_version: PARSER_VERSION,
    steps,
    segments,
    origin_structured: origin_structured ?? null,
    warnings,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let bytes: Uint8Array | null = null;
    let filename = "permit.pdf";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return json(400, { error: "Missing file field `file`" });
      filename = file.name || filename;
      bytes = new Uint8Array(await file.arrayBuffer());
    } else if (contentType.includes("application/pdf")) {
      bytes = new Uint8Array(await req.arrayBuffer());
    } else {
      return json(400, { error: "Unsupported content-type" });
    }

    if (!bytes || !bytes.length) {
      return json(400, { error: "Empty PDF payload" });
    }

    const result = await parsePermit(bytes);

    return json(200, {
      ok: true,
      filename,
      result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { ok: false, error: msg, parser_version: PARSER_VERSION });
  }
});

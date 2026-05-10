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
  leg_miles_to_next?: number | null;
  /** Same as permit Distance column when parsed (odometer from start of loaded route). */
  cumulative_permit_mi?: number | null;
};

type OriginStructured = {
  mode: "junction_offset" | "semicolon" | "state_line" | "unknown";
  offset_mi: number | null;
  bearing: string | null;
  roads: string[];
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

const PARSER_VERSION = "tx-turntable-v2.4.0";

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

function extractPermitNumber(text: string): string | null {
  const m =
    text.match(/\bPermit Number:\s*([A-Z0-9-]{6,})\b/i) ||
    text.match(/\bPermit Number\s+([A-Z0-9-]{6,})\b/i);
  return m ? m[1] : null;
}

function extractOrigin(text: string): string | null {
  const lines = text.split("\n");
  let best = "";
  for (const line of lines) {
    const m1 = /\bOrigin\s*:\s*(.+)$/i.exec(line);
    const m2 = /^\s*\[Loaded Route Origin\s*:\s*(.+?)\s*[\]\)]?\s*$/i.exec(line);
    const m = m1 || m2;
    if (m && m[1].trim().length > best.length) best = m[1].trim();
  }
  return best ? normalizeCommonOcrTypos(best) : null;
}

function extractDestination(text: string): string | null {
  const lines = text.split("\n");
  let best = "";
  for (const line of lines) {
    const m1 = /^\s*Destination\s*:\s*(.+)$/i.exec(line);
    const m2 = /^\s*Final Destination\s*:\s*(.+)$/i.exec(line);
    const m3 = /^\s*\[?Loaded\s+Route\s+Destination\s*:\s*(.+?)\s*[\]\)]?\s*$/i.exec(line);
    for (const m of [m1, m2, m3]) {
      if (m && m[1].trim().length > best.length) best = m[1].trim();
    }
  }
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
  };
  return map[k] || null;
}

function findRoadToken(str: string): string | null {
  const hay = normalizeHyphensForMatching(normalizeCommonOcrTypos(str));
  const hws = findHighwaysOnLine(hay);
  return hws.length ? hws[0].text : null;
}

function extractRoadsFromJunctionBlob(blob: string): string[] {
  const parts = blob.split(/\s*&\s*/).map((p) => cleanLine(p)).filter(Boolean);
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

/** Generic Tx permit origin: junction + mile offset, semicolon triples, or state-line phrasing. */
function parseOriginStructured(origin: string): OriginStructured {
  const o = normalizeCommonOcrTypos(origin);
  if (!o) {
    return { mode: "unknown", offset_mi: null, bearing: null, roads: [] };
  }

  const reJunction =
    /^(?:([^,]+?)\s*,\s*)?([\d.]+)\s*mi\s+([nsew]{1,2})\s+of\s+(.+)$/i;
  const mj = reJunction.exec(o);
  if (mj) {
    const offset_mi = parseFloat(mj[2]);
    const bearing = parseDirectionAbbrev(mj[3]);
    const junctionBlob = cleanLine(mj[4]);
    const roads = extractRoadsFromJunctionBlob(junctionBlob);
    return {
      mode: "junction_offset",
      offset_mi: Number.isFinite(offset_mi) ? offset_mi : null,
      bearing,
      roads,
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
    };
  }

  return { mode: "unknown", offset_mi: null, bearing: null, roads: [] };
}

function structuredOriginQueries(s: OriginStructured): string[] {
  const q: string[] = [];
  if (s.mode === "junction_offset" && s.roads.length >= 2) {
    const [a, b] = [s.roads[0], s.roads[1]];
    q.push(`${a} and ${b} intersection Texas`);
    q.push(`${a} ${b} junction Texas`);
    if (s.bearing && s.offset_mi != null && Number.isFinite(s.offset_mi)) {
      q.push(`${a} ${s.bearing} ${s.offset_mi} miles from ${b} Texas`);
      q.push(`${a} from ${b} ${s.bearing} Texas`);
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
  return q;
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
    return { fromRoad: normalizeRouteToken(m[1]), fromDir: parseDirectionAbbrev(m[2]) };
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
    queries = enrichQueriesForTxRow(queries, step.from_road, step.from_dir, step.raw_row, step.leg_miles);
    out.push({
      label: "Route",
      text: step.from_road,
      displayText: cleanLine(`${step.from_road}${odoLabel} · ${step.raw_row}`.replace(/\s+·\s+·/g, " · ")),
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
    queries = enrichQueriesForTxRow(queries, step.to_road, step.to_dir, step.raw_row, step.leg_miles);
    out.push({
      label: "Route",
      text: step.to_road,
      displayText: cleanLine(`${step.to_road}${odoLabel} · ${step.raw_row}`.replace(/\s+·\s+·/g, " · ")),
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
  const origin_text = extractOrigin(fullText);
  const destination_text = extractDestination(fullText);

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

  const origin_structured = origin_text ? parseOriginStructured(origin_text) : null;
  if (origin_structured) {
    warnings.push(...collectOriginWarnings(origin_structured));
  }

  if (origin_text) {
    const structuredQ = origin_structured ? structuredOriginQueries(origin_structured) : [];
    const originRoad = findRoadToken(origin_text);
    segments.push({
      label: "Origin",
      text: origin_text.slice(0, 64),
      displayText: `Start · ${origin_text}`,
      queries: dedupeStrings([
        ...structuredQ,
        ...(originRoad ? [`${originRoad} Texas`] : []),
        `${origin_text} Texas`,
        `${origin_text} TX`,
      ]),
    });
  }

  for (const row of rows) {
    const { step, cumulativeAfter, odometerWarn } = buildStepFromRow(row, cumulative);
    if (odometerWarn) warnings.push(odometerWarn);
    cumulative = cumulativeAfter;
    steps.push(step);
    segments.push(...stepToSegments(step));
  }

  if (destination_text) {
    const destinationRoad = findRoadToken(destination_text);
    segments.push({
      label: "Destination",
      text: destination_text.slice(0, 64),
      displayText: `End · ${destination_text}`,
      queries: dedupeStrings([
        ...(destinationRoad ? [`${destinationRoad} Texas`] : []),
        `${destination_text} Texas`,
        `${destination_text} TX`,
      ]),
    });
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

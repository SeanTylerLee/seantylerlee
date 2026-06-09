// Validate the EXACT resolver functions shipped in js/app.js by loading them
// from the source (so we test the real code, not a re-implementation).
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");

// Pull the self-contained resolver helpers (haversineMi + the OSM block) out of
// app.js and eval them in a clean scope with the few globals they reference.
function extract(name, kind) {
  const re =
    kind === "const"
      ? new RegExp(`\\nconst ${name}\\b[\\s\\S]*?;\\n`)
      : new RegExp(`\\n(?:async )?function ${name}\\b[\\s\\S]*?\\n}\\n`);
  const m = re.exec(src);
  if (!m) throw new Error("not found: " + name);
  return m[0];
}

const pieces = [
  "function haversineMi",
  "const OVERPASS_ENDPOINTS",
  "const OSM_TX_BBOX",
  "const OSM_GEOM_CACHE",
  "function isInterstateToken",
  "function permitRefToOsmCandidates",
  "async function overpassQuery",
  "async function fetchRefGeometry",
  "function geomBounds",
  "function geomCentroid",
  "function lineBounds",
  "function boundsOverlap",
  "function segIntersectLL",
  "function polylineCrossings",
  "function nearestApproach",
  "function resolvePairViaOsm",
  "async function resolveRouteViaOsm",
];

const names = [
  ["haversineMi", "fn"],
  ["OVERPASS_ENDPOINTS", "const"],
  ["OSM_TX_BBOX", "const"],
  ["OSM_GEOM_CACHE", "const"],
  ["isInterstateToken", "fn"],
  ["permitRefToOsmCandidates", "fn"],
  ["overpassProxyUrl", "fn"],
  ["overpassQuery", "fn"],
  ["fetchRefGeometry", "fn"],
  ["fetchSharedNodes", "fn"],
  ["wayRefMatchesToken", "fn"],
  ["fetchRefsGeometryBatch", "fn"],
  ["maxRouteMilesFromHints", "fn"],
  ["clampTexasBbox", "fn"],
  ["corridorBboxFromSeed", "fn"],
  ["bboxAroundPointMiles", "fn"],
  ["numericHintOdometer", "fn"],
  ["resetOsmGeometryCache", "fn"],
  ["unambiguousSeedFromNodes", "fn"],
  ["geomBounds", "fn"],
  ["geomCentroid", "fn"],
  ["lineBounds", "fn"],
  ["boundsOverlap", "fn"],
  ["segIntersectLL", "fn"],
  ["polylineCrossings", "fn"],
  ["nearestApproach", "fn"],
  ["resolvePairViaOsm", "fn"],
  ["resolveRouteViaOsm", "fn"],
];

globalThis.window = {
  SUPABASE_URL: "http://localhost:8000",
  SUPABASE_PARSE_FUNCTION: "parse-permit",
  SUPABASE_ANON_KEY: "test",
};

let code = "const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));\nconst window = globalThis.window;\n";
for (const [n, k] of names) code += extract(n, k === "const" ? "const" : "fn") + "\n";
code += "\nreturn { resolveRouteViaOsm, resolvePairViaOsm, permitRefToOsmCandidates, isInterstateToken, polylineCrossings, segIntersectLL };";

const mod = new Function("console", code)(console);

// --- 1) pure-math sanity: two crossing unit segments ---
const cross = mod.segIntersectLL([0, 0], [2, 2], [0, 2], [2, 0]);
console.log("segIntersect diag:", cross, "(expect ~1,1)");

// --- 2) ref mapping ---
for (const t of ["SH 115", "IH 20", "SL 323", "SS 156", "FM 16", "US 385"]) {
  console.log("  ref", t, "->", mod.permitRefToOsmCandidates(t), "interstate?", mod.isInterstateToken(t));
}

// --- 3) live end-to-end against the real permit waypoints ---
const hints = [
  { label: "Origin", roads: ["US 385", "SH 115"] },
  { label: "Turn", roads: ["US 385", "LOOP 1910"], cumulativePermitMi: 0.6 },
  { label: "Turn", roads: ["LOOP 1910", "SH 115"], cumulativePermitMi: 4.6 },
  { label: "Turn", roads: ["SH 115", "SH 176"], cumulativePermitMi: 5.1 },
  { label: "Turn", roads: ["SH 176", "SH 137"], cumulativePermitMi: 43.0 },
  { label: "Turn", roads: ["SH 137", "IH 20"], cumulativePermitMi: 54.8 },
  { label: "Turn", roads: ["IH 20", "SH 171"], cumulativePermitMi: 305.6 },
  { label: "Turn", roads: ["SH 171", "US 377"], cumulativePermitMi: 323.4 },
  { label: "Turn", roads: ["US 377", "IH 20"], cumulativePermitMi: 337.9 },
  { label: "Turn", roads: ["IH 20", "FM 314"], cumulativePermitMi: 448.7 },
  { label: "Turn", roads: ["FM 314", "FM 16"], cumulativePermitMi: 450.0 },
  { label: "Turn", roads: ["FM 16", "SH 110"], cumulativePermitMi: 450.3 },
  { label: "Turn", roads: ["SH 110", "SL 323"], cumulativePermitMi: 473.0 },
  { label: "Turn", roads: ["SL 323", "US 271"], cumulativePermitMi: 477.7 },
  { label: "Turn", roads: ["US 271", "IH 20"], cumulativePermitMi: 486.9 },
  { label: "Destination", roads: ["IH 20", "SS 156"] },
];

console.log("\nResolving full route via OSM (live)...");
const t0 = Date.now();
const pts = await mod.resolveRouteViaOsm(hints, (m) => process.stdout.write("\r" + m + "          "));
process.stdout.write("\n");
let ok = 0;
hints.forEach((h, i) => {
  const p = pts[i];
  if (p) ok++;
  console.log(
    `  ${String(i).padStart(2)} [${h.label}] ${h.roads.join(" & ")}: ` +
      (p ? `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` : "UNRESOLVED")
  );
});
console.log(`\nResolved ${ok}/${hints.length} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

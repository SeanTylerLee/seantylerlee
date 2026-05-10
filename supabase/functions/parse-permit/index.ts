/**
 * Supabase Edge Function: TXPROS official route for Mapbox.
 *
 * 1. If BROWSERLESS_TOKEN is set, calls Browserless `/function` (hosted Chromium) to load the permit page
 *    and run the same GetLatLonForPermit call the live site uses (TxDMV often blocks non-browser callers).
 *    Use BROWSERLESS_SESSION_TIMEOUT_MS so the run can exceed Browserless’s default 60s session cap (else HTTP 408).
 * 2. Otherwise falls back to direct fetch from the Edge network (often fails).
 *
 * Clients POST { permitID } with Supabase anon key. No PDF parsing.
 */

const SERVICE_VERSION = "txpros-proxy-v1.3.2";

/** Hosted browser API — https://www.browserless.io/ — set BROWSERLESS_TOKEN on this function. */
const BROWSERLESS_TOKEN = Deno.env.get("BROWSERLESS_TOKEN") || "";
const BROWSERLESS_URL =
  (Deno.env.get("BROWSERLESS_URL") || "https://production-sfo.browserless.io").replace(/\/+$/, "");

/**
 * Max duration (ms) for the entire Browserless `/function` run (query param `timeout`).
 * Browserless defaults to 60000; government pages often exceed that → HTTP 408 before our code finishes.
 */
function browserlessSessionTimeoutMs(): number {
  const raw = parseInt(Deno.env.get("BROWSERLESS_SESSION_TIMEOUT_MS") || "180000", 10);
  if (!Number.isFinite(raw) || raw < 45000) return 180000;
  return Math.min(raw, 300000);
}

function browserlessFunctionEndpoint(): string {
  const qs = new URLSearchParams();
  qs.set("token", BROWSERLESS_TOKEN);
  qs.set("timeout", String(browserlessSessionTimeoutMs()));
  const preset = (Deno.env.get("BROWSERLESS_PROXY_PRESET") || "").trim();
  if (preset) qs.set("proxyPreset", preset);
  return `${BROWSERLESS_URL}/function?${qs}`;
}

/** Legacy HTTP POST target (often returns Error.aspx; kept as fallback). */
const TXPROS_ROUTE_BODY_URL =
  "https://txpros.txdmv.gov/Services/RouteService.asmx/GetLatLonForPermitBody";

/** What the live permit page calls (see RouteService.asmx/js + PermitDetails02 showMap). */
const TXPROS_ROUTE_JSON_URL =
  "https://txpros.txdmv.gov/Services/RouteService.asmx/GetLatLonForPermit";

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

function cleanLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Accept digits or URL / QR payload containing PermitID */
function extractPermitId(input: string): string | null {
  let s = cleanLine(input)
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!s) return null;
  try {
    s = decodeURIComponent(s);
  } catch {
    /* ignore */
  }

  function permitIdFromQueryLike(str: string): string | null {
    const patterns = [
      /PermitID[=:](\d+)/i,
      /permitID[=:]\s*(\d+)/i,
      /permit_id[=:]\s*(\d+)/i,
      /[?&#]PermitID=(\d+)/i,
      /[?&#]permitID=(\d+)/i,
    ];
    for (const p of patterns) {
      const m = str.match(p);
      if (m && /^\d+$/.test(m[1])) return m[1];
    }
    return null;
  }

  if (/^\d{3,18}$/.test(s)) return s;

  let id = permitIdFromQueryLike(s);
  if (id) return id;

  try {
    const u = new URL(s, "https://txpros.txdmv.gov");
    const q =
      u.searchParams.get("PermitID") ||
      u.searchParams.get("permitID") ||
      u.searchParams.get("permit_id");
    if (q && /^\d+$/.test(String(q))) return String(q);
    if (u.hash && u.hash.length > 1) {
      const h = u.hash.slice(1);
      id = permitIdFromQueryLike(h) || permitIdFromQueryLike("?" + h);
      if (id) return id;
    }
  } catch {
    /* ignore */
  }

  if (/^\s*\{/.test(s)) {
    try {
      const j = JSON.parse(s) as Record<string, unknown>;
      const raw =
        j.PermitID ?? j.permitID ?? j.permitId ?? j.PermitId ?? j.permit_id;
      if (raw != null && /^\d+$/.test(String(raw))) return String(raw);
    } catch {
      /* ignore */
    }
  }

  return null;
}

function isHtmlErrorPage(text: string): boolean {
  if (!text) return true;
  if (/<!DOCTYPE/i.test(text) && /Error\s+Encountered/i.test(text)) return true;
  if (/<form[^>]+action="[^"]*Error\.aspx"/i.test(text)) return true;
  return false;
}

/** Match browser calls — referer should be the permit page for RouteService. */
function txprosHeadersForPermit(permitId: string, extra: Record<string, string> = {}): Record<string, string> {
  const ref = `https://txpros.txdmv.gov/PermitDetails02.aspx?PermitID=${encodeURIComponent(permitId)}`;
  return {
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Referer: ref,
    Origin: "https://txpros.txdmv.gov",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ...extra,
  };
}

/** Collect Set-Cookie lines for a follow-up request (Deno has no shared cookie jar). */
function cookieHeaderFromSetCookie(res: Response): string | null {
  const any = res.headers as Headers & { getSetCookie?: () => string[] };
  const list = typeof any.getSetCookie === "function" ? any.getSetCookie() : [];
  if (list.length) {
    return list.map((c) => c.split(";")[0]).join("; ");
  }
  const single = res.headers.get("set-cookie");
  if (!single) return null;
  return single.split(/,(?=[^;]+?=)/).map((p) => p.split(";")[0].trim()).join("; ");
}

/** Load public permit details — sets ASP.NET_SessionId same as clicking a QR link. */
async function establishTxprosSession(permitId: string): Promise<string | null> {
  try {
    const url =
      `https://txpros.txdmv.gov/PermitDetails02.aspx?PermitID=${encodeURIComponent(permitId)}`;
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: txprosHeadersForPermit(permitId, {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }),
    });
    return cookieHeaderFromSetCookie(res);
  } catch {
    return null;
  }
}

type LatLon = { lat: number; lon: number };

/** Points from GetLatLonForPermit JSON use Lat / Lon (see PermitDetails02 handleGetMapPoints). */
function latLonsFromTxprosMapPayload(o: unknown): LatLon[] {
  if (!o || typeof o !== "object") return [];
  const root = o as Record<string, unknown>;
  const list = root.LatLons ?? root.latLons;
  if (!Array.isArray(list)) return [];
  const pts: LatLon[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const laRaw = r.Lat ?? r.lat ?? r.Latitude ?? null;
    const loRaw = r.Lon ?? r.lng ?? r.Lng ?? r.Longitude ?? null;
    const la = typeof laRaw === "string" ? parseFloat(laRaw) : Number(laRaw);
    const lo = typeof loRaw === "string" ? parseFloat(loRaw) : Number(loRaw);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;
    if (la === -1 && lo === -1) continue;
    if (la <= 0) continue;
    pts.push({ lat: la, lon: lo });
  }
  return pts;
}

function unwrapAspNetAjaxJson(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "d" in (raw as object)) {
    let inner = (raw as { d: unknown }).d;
    if (typeof inner === "string") {
      try {
        inner = JSON.parse(inner);
      } catch {
        return inner;
      }
    }
    return inner;
  }
  return raw;
}

function scoreRow(o: unknown): LatLon | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const lat =
    r.Lat ?? r.lat ?? r.Latitude ?? r.latitude ?? r.LAT ?? null;
  const lon =
    r.Lon ?? r.lng ?? r.Lng ?? r.Longitude ?? r.longitude ?? r.LNG ?? r.LON ?? null;
  const la = typeof lat === "string" ? parseFloat(lat) : Number(lat);
  const lo = typeof lon === "string" ? parseFloat(lon) : Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return { lat: la, lon: lo };
}

/** Longest array of Lat/Lon objects inside TXPROS JSON. */
function extractBreadcrumbs(data: unknown): LatLon[] {
  let best: LatLon[] = [];

  function considerArray(arr: unknown[]) {
    if (!Array.isArray(arr) || arr.length < 2) return;
    const pts: LatLon[] = [];
    for (const item of arr) {
      const p = scoreRow(item);
      if (p) pts.push(p);
    }
    if (pts.length > best.length) best = pts;
  }

  function walk(o: unknown, depth: number) {
    if (depth > 20) return;
    if (Array.isArray(o)) {
      considerArray(o);
      for (let i = 0; i < Math.min(o.length, 500); i++) walk(o[i], depth + 1);
      return;
    }
    if (o && typeof o === "object") {
      for (const k of Object.keys(o as object)) {
        walk((o as Record<string, unknown>)[k], depth + 1);
      }
    }
  }

  walk(data, 0);
  return best;
}

function parseRouteXml(xmlText: string): { coordinates: number[][]; pointCount: number } {
  if (isHtmlErrorPage(xmlText)) {
    throw new Error(
      "TXPROS returned an error page (invalid permit, expired, or server declined the request).",
    );
  }

  let jsonText = "";
  const cdata = xmlText.match(
    /<GetLatLonForPermitResult[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/GetLatLonForPermitResult>/i,
  );
  if (cdata) jsonText = cdata[1].trim();
  if (!jsonText) {
    const m = xmlText.match(/<GetLatLonForPermitResult[^>]*>([\s\S]*?)<\/GetLatLonForPermitResult>/i);
    if (m) jsonText = m[1].trim();
  }
  if (!jsonText) {
    throw new Error("Response missing GetLatLonForPermitResult (unexpected TXPROS XML).");
  }

  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error("TXPROS JSON inside XML could not be parsed.");
  }

  const pts = extractBreadcrumbs(data);
  if (pts.length < 2) {
    throw new Error(
      "TXPROS JSON contained fewer than 2 coordinate points (layout may have changed).",
    );
  }

  const coordinates = pts.map((p) => [p.lon, p.lat] as number[]);
  return { coordinates, pointCount: coordinates.length };
}

function parseCoordsFromJsonResponse(text: string): { coordinates: number[][]; pointCount: number } | null {
  const t = text.trim();
  if (!t.startsWith("{")) return null;
  let data: unknown;
  try {
    data = JSON.parse(t);
  } catch {
    return null;
  }
  const inner = unwrapAspNetAjaxJson(data);
  let pts = latLonsFromTxprosMapPayload(inner);
  if (pts.length < 2) {
    pts = extractBreadcrumbs(inner);
  }
  if (pts.length < 2) return null;
  return {
    coordinates: pts.map((p) => [p.lon, p.lat]),
    pointCount: pts.length,
  };
}

async function tryFetchJsonLatLon(
  permitId: string,
  cookie: string | null,
): Promise<{ coordinates: number[][]; pointCount: number } | null> {
  const idNum = parseInt(permitId, 10);
  if (!Number.isFinite(idNum)) return null;

  const payload = JSON.stringify({
    PermitID: idNum,
    UseHistoryDB: false,
    AuditPermitID: -1,
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json; charset=UTF-8",
        Accept: "application/json, text/javascript, */*;q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        ...txprosHeadersForPermit(permitId),
      };
      if (cookie) headers.Cookie = cookie;

      const res = await fetch(TXPROS_ROUTE_JSON_URL, {
        method: "POST",
        headers,
        body: payload,
      });
      const text = await res.text();
      const parsed = parseCoordsFromJsonResponse(text);
      if (parsed) return parsed;
    } catch {
      /* next attempt */
    }
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }
  return null;
}

async function fetchRouteXmlFromBody(
  permitId: string,
  cookie: string | null,
): Promise<string> {
  const attempts = [
    new URLSearchParams({ permitID: permitId }),
    new URLSearchParams({ PermitID: permitId }),
  ];

  let lastErr: Error | null = null;
  for (const body of attempts) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/xml, text/xml, text/plain, */*",
        ...txprosHeadersForPermit(permitId),
      };
      if (cookie) headers.Cookie = cookie;

      const res = await fetch(TXPROS_ROUTE_BODY_URL, {
        method: "POST",
        headers,
        body,
      });
      const text = await res.text();

      if (!res.ok) {
        lastErr = new Error(`txpros_http_${res.status}`);
        continue;
      }
      if (isHtmlErrorPage(text)) {
        lastErr = new Error("txpros_html_error");
        continue;
      }
      return text;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }

  if (lastErr?.message === "txpros_html_error") {
    throw new Error("txpros_html_error");
  }
  if (lastErr?.message?.startsWith("txpros_http_")) {
    throw lastErr;
  }
  throw lastErr || new Error("Could not reach TXPROS RouteService.");
}

/** Runs in Browserless Node/Puppeteer worker — sent as JSON `code` to their REST API. */
const BROWSERLESS_TXPROS_FUNCTION = `export default async ({ page, context }) => {
  const permitId = context.permitId;
  if (!permitId) {
    return { data: { error: "missing_permitId" }, type: "application/json" };
  }
  try {
    const url =
      "https://txpros.txdmv.gov/PermitDetails02.aspx?PermitID=" + encodeURIComponent(String(permitId));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await new Promise((r) => setTimeout(r, 1000));
    const result = await page.evaluate(async (pid) => {
      const r = await fetch("https://txpros.txdmv.gov/Services/RouteService.asmx/GetLatLonForPermit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          Accept: "application/json, text/javascript, */*;q=0.01",
          "X-Requested-With": "XMLHttpRequest",
          Referer: window.location.href,
        },
        body: JSON.stringify({
          PermitID: parseInt(String(pid), 10),
          UseHistoryDB: false,
          AuditPermitID: -1,
        }),
      });
      const text = await r.text();
      return { status: r.status, body: text.length > 600000 ? text.slice(0, 600000) : text };
    }, permitId);
    return { data: result, type: "application/json" };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    return { data: { error: "browserless_exception", message: msg }, type: "application/json" };
  }
}`;

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n) + "…";
}

/** null = Browserless not configured; ok false = ran but no coordinates; ok true = success */
type BrowserlessRouteAttempt =
  | null
  | { ok: true; coordinates: number[][]; pointCount: number }
  | { ok: false; detail: string };

function normalizeBrowserlessDataNode(data: Record<string, unknown>): Record<string, unknown> {
  const inner = data.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const o = inner as Record<string, unknown>;
    if (typeof o.status === "number" && typeof o.body === "string") {
      return o;
    }
  }
  return data;
}

async function fetchRouteViaBrowserless(permitId: string): Promise<BrowserlessRouteAttempt> {
  if (!BROWSERLESS_TOKEN) return null;
  try {
    const res = await fetch(browserlessFunctionEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: BROWSERLESS_TXPROS_FUNCTION,
        context: { permitId },
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        detail: `Browserless HTTP ${res.status}: ${clip(text, 400)}`,
      };
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        detail: `Browserless response not JSON: ${clip(text, 400)}`,
      };
    }
    let data = payload.data as Record<string, unknown> | undefined;
    if (!data || typeof data !== "object") {
      return {
        ok: false,
        detail: `Browserless payload missing data: ${clip(text, 400)}`,
      };
    }
    data = normalizeBrowserlessDataNode(data);

    if ("error" in data && data.error != null) {
      const msg = data.message != null ? String(data.message) : "";
      return {
        ok: false,
        detail: `Browserless worker: ${String(data.error)}${msg ? ` (${msg})` : ""}`,
      };
    }

    const status = data.status;
    const body = data.body;
    if (typeof status !== "number" || typeof body !== "string") {
      return {
        ok: false,
        detail: `Browserless worker returned unexpected shape: ${clip(JSON.stringify(data), 500)}`,
      };
    }
    if (status !== 200) {
      return {
        ok: false,
        detail: `TxPROS GetLatLon HTTP ${status} from browser: ${clip(body, 320)}`,
      };
    }

    const parsed = parseCoordsFromJsonResponse(body);
    if (!parsed) {
      return {
        ok: false,
        detail: `Could not parse route JSON from browser (invalid permit or empty route): ${clip(body, 320)}`,
      };
    }
    return { ok: true, ...parsed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, detail: `Browserless fetch error: ${msg}` };
  }
}

function isLikelyBrowserlessTimeout(detail: string): boolean {
  return /\b408\b|Request timed out|request timed out|session.*timed|ETIMEDOUT/i.test(detail);
}

/** Extra hint when Browserless returns 408 (their default session cap is 60s). */
function explainBrowserlessFailure(detail: string): string {
  if (!isLikelyBrowserlessTimeout(detail)) return detail;
  return (
    `${detail} ` +
    "408 here is usually Browserless closing the run at its default ~60s session cap, not a wrong permit. " +
    "This function passes a longer timeout on the /function URL (default 180000 ms via BROWSERLESS_SESSION_TIMEOUT_MS). " +
    "Raise that secret if TxPROS is still slow, redeploy parse-permit, and confirm your Browserless plan allows that duration."
  );
}

async function fetchRouteFromTxpros(permitId: string): Promise<{
  coordinates: number[][];
  pointCount: number;
  via: "browserless" | "json" | "body_xml";
}> {
  const bl = await fetchRouteViaBrowserless(permitId);
  if (bl?.ok) {
    const { coordinates, pointCount } = bl;
    return { coordinates, pointCount, via: "browserless" };
  }

  const sessionCookie = await establishTxprosSession(permitId);

  const jsonResult = await tryFetchJsonLatLon(permitId, sessionCookie);
  if (jsonResult) {
    return { ...jsonResult, via: "json" };
  }

  try {
    const xml = await fetchRouteXmlFromBody(permitId, sessionCookie);
    const { coordinates, pointCount } = parseRouteXml(xml);
    return { coordinates, pointCount, via: "body_xml" };
  } catch (e) {
    if (e instanceof Error && e.message === "txpros_html_error") {
      const rawDetail = bl && !bl.ok ? bl.detail : "";
      const blDetail = rawDetail ? explainBrowserlessFailure(rawDetail) : "";
      const permitHint = isLikelyBrowserlessTimeout(blDetail || rawDetail)
        ? "If the permit opens in your browser, the ID is probably fine — focus on Browserless timeout/quota above."
        : "Use the Permit ID from the QR link (?PermitID=…) — same label as on the printed permit (not the permit number when they differ). If that TxPROS URL fails in a normal browser, the ID is wrong.";
      const hint = BROWSERLESS_TOKEN
        ? (blDetail
          ? `Browserless attempt failed first: ${blDetail}`
          : "Browserless was not invoked or returned no detail; check BROWSERLESS_URL matches your Browserless region, token quota, and redeploy parse-permit.")
        : "TxDMV often blocks server-side calls. Add Edge Function secret BROWSERLESS_TOKEN (Browserless.io), optionally BROWSERLESS_URL (default https://production-sfo.browserless.io), redeploy parse-permit.";
      throw new Error(
        [
          `Could not load TXPROS route for permit ${permitId}.`,
          permitHint,
          hint,
        ].join(" "),
      );
    }
    throw e;
  }
}

type TxprosResult = {
  permit_id: string;
  coordinates: number[][];
  point_count: number;
  parser_version: string;
  warnings: string[];
};

async function handlePermitId(permitId: string): Promise<TxprosResult> {
  const warnings: string[] = [];
  const { coordinates, pointCount, via } = await fetchRouteFromTxpros(permitId);
  if (via === "browserless") {
    warnings.push("route_via_browserless");
  }
  if (via === "body_xml") {
    warnings.push("route_via_legacy_GetLatLonForPermitBody");
  }
  return {
    permit_id: permitId,
    coordinates,
    point_count: pointCount,
    parser_version: SERVICE_VERSION,
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
    let permitId: string | null = null;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null) as Record<string, unknown> | null;
      const raw =
        body?.permitID ?? body?.permitId ?? body?.PermitID ?? body?.permit_id ?? "";
      permitId = extractPermitId(String(raw));
    }

    if (!permitId && contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const raw =
        form.get("permitID") ?? form.get("PermitID") ?? form.get("permitId") ?? "";
      permitId = extractPermitId(String(raw));
    }

    if (!permitId && contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      const raw = params.get("permitID") || params.get("PermitID") || "";
      permitId = extractPermitId(raw || text);
    }

    if (!permitId) {
      return json(400, {
        ok: false,
        error:
          "Send permitID: JSON {\"permitID\":\"14925257\"}, form field permitID, or x-www-form-urlencoded permitID=…. PDF upload is no longer supported on this function.",
        parser_version: SERVICE_VERSION,
      });
    }

    const result = await handlePermitId(permitId);

    return json(200, {
      ok: true,
      result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, {
      ok: false,
      error: msg,
      parser_version: SERVICE_VERSION,
    });
  }
});

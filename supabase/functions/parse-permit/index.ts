/**
 * Supabase Edge Function: TXPROS official route proxy.
 * Forwards permit ID to TxDMV RouteService (server-side, no browser CORS).
 * No PDF parsing — clients send Permit ID from QR / permit details URL.
 */

const SERVICE_VERSION = "txpros-proxy-v1.0.0";

const TXPROS_ROUTE_URL =
  "https://txpros.txdmv.gov/Services/RouteService.asmx/GetLatLonForPermitBody";

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

/** Accept digits or URL containing PermitID= */
function extractPermitId(input: string): string | null {
  const s = cleanLine(input);
  if (!s) return null;
  if (/^\d{4,14}$/.test(s)) return s;
  try {
    const u = new URL(s, "https://txpros.txdmv.gov");
    const id = u.searchParams.get("PermitID") || u.searchParams.get("permitID");
    if (id && /^\d+$/.test(id)) return id;
  } catch {
    /* ignore */
  }
  const m = s.match(/PermitID=(\d+)/i) || s.match(/permitID[=:]\s*(\d+)/i);
  return m ? m[1] : null;
}

function isHtmlErrorPage(text: string): boolean {
  if (!text) return true;
  if (/<!DOCTYPE/i.test(text) && /Error\s+Encountered/i.test(text)) return true;
  if (/<form[^>]+action="[^"]*Error\.aspx"/i.test(text)) return true;
  return false;
}

type LatLon = { lat: number; lon: number };

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

async function fetchRouteFromTxpros(permitId: string): Promise<string> {
  const attempts = [
    new URLSearchParams({ permitID: permitId }),
    new URLSearchParams({ PermitID: permitId }),
  ];

  let lastErr: Error | null = null;
  for (const body of attempts) {
    try {
      const res = await fetch(TXPROS_ROUTE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/xml, text/xml, */*",
          "User-Agent":
            "Mozilla/5.0 (compatible; TxPermitRouteAssistant/1.0; +https://seantylerlee.com)",
        },
        body,
      });
      const text = await res.text();
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
    throw new Error(
      "TXPROS rejected the request or returned an error page. Check Permit ID or try again later.",
    );
  }
  throw lastErr || new Error("Could not reach TXPROS RouteService.");
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
  const xml = await fetchRouteFromTxpros(permitId);
  const { coordinates, pointCount } = parseRouteXml(xml);
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

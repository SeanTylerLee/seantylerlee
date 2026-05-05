# Texas oversize / overweight permit → route preview (assistive)

Assistive tool: user uploads a Texas OS/OW permit PDF (TxDMV / TxPROS-style), we extract embedded text in the browser, surface heuristic route tokens and a **verification-first** UI. Not a permitting system; official PDF always controls.

## What’s implemented (client-only MVP)

- PDF.js **embedded text** extraction (no upload to *this* repo’s server; third-party geocoding/routing APIs are called from the browser).
- Heuristic **Texas highway** token detection (I, IH, US, SH, FM, etc.) in document order, with **overlap** handling when multiple patterns hit the same span.
- **Mapbox Geocoding** (primary) with US + Texas bbox + proximity; **Photon** fallback.
- **Mapbox Directions** `driving` profile between waypoints (max 25 sampled); **OSRM** demo fallback if Directions fails.
- PDF text keeps **newlines** where possible. **Route slice**: text between **`Origin`** (or Route description / Approved route / Itinerary / Point of origin) and the next section (**Destination**, **Dimensions**, etc.) is used for highway token parsing; if no heading matches, the full PDF text is used.
- **Mapbox GL JS** (`streets-v12`): numbered waypoint markers + orange route polyline when OSRM returns geometry. Token in `js/mapbox-config.js` — **restrict URLs** in your Mapbox dashboard.
- **Export**: Google Maps multi-point `dir` URL from coordinates when possible; Apple Maps / Waze use end or single-point where the platform limits stops.
- Checkbox gate before “Open in Google / Apple / Waze”; Privacy & Terms stubs; in-app disclaimers.

**Limits:** Public Photon/OSRM are for **light / demo** use, not high volume. Consumer routing does **not** enforce OS/OW legal corridors. Scanned PDFs without embedded text still need **OCR** (backend).

## Not in this client MVP (typical follow-ons)

- OCR for scanned PDFs; parser versioning when TxPROS PDF layouts change.
- User accounts, paid tier, upload retention, job queues; keys in **server** env.
- Official TxPROS / state GIS corridor parity; QR as verified lookup.

## Suggested production stack

| Layer | Options |
|-------|---------|
| API | Node or Python (PDF, OCR queue, geocode, route) |
| Storage | Object storage for uploads; DB for accounts / history |
| Maps | MapLibre / Mapbox GL / Google Maps JS / native SDKs |
| Secrets | Geocoding, OCR, routing keys in environment — never ship to client |

## Local use

Open **`http://localhost:…`** so CDN scripts (PDF.js, Leaflet) load and `fetch` for Photon/OSRM works.

```bash
cd /path/to/repo
python3 -m http.server 8080
# open http://localhost:8080
```

Double-clicking `index.html` (**`file://`**) often blocked scripts or ES modules before; the app now uses classic `<script>` tags, but **Photon/OSRM still need network access**, so use localhost anyway for a realistic test.

## Success criteria (from brief)

v1 succeeds when typical Tx PDFs with good embedded text yield a **reasonable first-pass token list** and clear fallback messaging when confidence is low — with explicit human verification against the permit.

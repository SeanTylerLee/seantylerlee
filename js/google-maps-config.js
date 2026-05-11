/**
 * Optional Google Maps JavaScript API key — enables (1) Google Directions as a routing fallback
 * after Mapbox/OSRM in `routeDrivingLine`, and (2) the comparison map under Mapbox with the same
 * geocoded pins and a green line from Google Directions.
 *
 * In Google Cloud Console: enable "Maps JavaScript API" and "Directions API", restrict the key
 * by HTTP referrer, and avoid exposing an unrestricted key in public repos.
 */
window.GOOGLE_MAPS_API_KEY = "";

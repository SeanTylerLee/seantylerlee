/**
 * Edge function parse-permit: set secrets on parse-permit, then `supabase functions deploy parse-permit`
 *   BROWSERLESS_TOKEN = API token from https://www.browserless.io/
 *   BROWSERLESS_URL = optional; default https://production-sfo.browserless.io (your Browserless region)
 *   BROWSERLESS_SESSION_TIMEOUT_MS = optional; default 60000 (many plans reject values above their max with HTTP 400)
 *   BROWSERLESS_PROXY_PRESET = optional; e.g. px_gov01 for some government sites (Browserless docs / your plan)
 */
window.SUPABASE_URL = "https://vbonpfrcidaxueumzcve.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZib25wZnJjaWRheHVldW16Y3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5ODIyMzAsImV4cCI6MjA5MzU1ODIzMH0.Xtk0B0zyNI758raaWX8XeH2EAHqJC7oDrV6elG47E2Q";
window.SUPABASE_PARSE_FUNCTION = "parse-permit";

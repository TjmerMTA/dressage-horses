// Where the Cloudflare Worker API lives — the one place for the whole site.
//
// Precedence:
//   1. PUBLIC_API_BASE at build time (e.g. `PUBLIC_API_BASE=http://127.0.0.1:8787 npm run dev`)
//   2. a page opened on localhost / 127.0.0.1 talks to `npx wrangler dev` on port 8787
//   3. otherwise the deployed Worker below.
//
// After `npx wrangler deploy`, put the address it prints here (no trailing slash).
const PRODUCTION_API = "https://dressage-horses-api.REPLACE-WITH-SUBDOMAIN.workers.dev";

const fromBuild = (import.meta.env && import.meta.env.PUBLIC_API_BASE) || "";
const isLocal = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

export const API_BASE = String(fromBuild || (isLocal ? "http://127.0.0.1:8787" : PRODUCTION_API)).replace(/\/+$/, "");
export const API_CONFIGURED = !API_BASE.includes("REPLACE-WITH-SUBDOMAIN");

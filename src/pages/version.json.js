// /version.json — which commit the live site was built from.
// The admin panel polls it after a save, so it only says "published" once the site
// really serves that commit. GITHUB_SHA is set by GitHub Actions on every run.
export const prerender = true;

export function GET() {
  const env = (globalThis.process && globalThis.process.env) || {};
  const commit = /^[0-9a-f]{40}$/.test(env.GITHUB_SHA || "") ? env.GITHUB_SHA : null;
  return new Response(JSON.stringify({ commit, builtAt: new Date().toISOString() }), {
    headers: { "Content-Type": "application/json" },
  });
}

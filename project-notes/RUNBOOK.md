# Runbook — how this site is published

Notebook v1 — updated 2026-11-04

## The public site
GitHub repo `TjmerMTA/dressage-horses`, branch `main` → GitHub Actions builds Astro →
GitHub Pages → https://dev.siteboosty.com (CNAME file in `public/`).
A push to `main` republishes the site in about a minute.

## The API behind the admin panel
Cloudflare Worker `dressage-horses-api`, account `Nazar82666@gmail.com's Account`
(`4139ee0d913603091e05c132e3baee2f`). Source in `worker/`, deployed from that folder
with `npx wrangler deploy`.

- KV namespace `DH_KV`, id `51c18230e345443eafb8d84cbcf71bc9` (leads, sessions,
  rate-limit counters). Not a secret.
- Secrets, set by the person with `npx wrangler secret put <NAME>` — never stored here:
  `ADMIN_PASSWORD_HASH`, `GITHUB_TOKEN`.

Only this Worker and this KV namespace belong to the project. Nothing else in the
Cloudflare account is ours; do not deploy to, change or delete anything else.

## What the director cannot do from the session
The permission guard refuses these; the person runs them:
- creating a GitHub repository (`gh repo create`)
- writing a Cloudflare secret (`wrangler secret put`)

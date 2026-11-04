# Task card — piece `api-worker` (size L) — Viktor

Rows covered: R02 (the back half of it)

## Goal

A Cloudflare Worker that is the brain behind the admin panel: it logs the owner in,
stores the leads the website's quiz produces, and writes content changes back into the
GitHub repository so the static site rebuilds itself.

## Where

Build it in `/Users/nazar/dressage-horses/worker/` (your own copy of the repo) as a
self-contained Wrangler project: `worker/wrangler.toml`, `worker/src/index.ts`,
`worker/package.json`. It must be deployable with `npx wrangler deploy` from that
folder. Do not deploy it yourself — the director will.

Wrangler is available through `npx wrangler` and the person is already logged in
(account `4139ee0d913603091e05c132e3baee2f`). The token has `workers (write)` and
`workers_kv (write)`. Assume **KV, not D1**.

## Endpoints (all JSON, all CORS-locked to https://dev.siteboosty.com)

- `POST /lead` — public. Body: name, region, budget, format, contact, plus a honeypot
  field and a timestamp. Validate hard, cap the body at 4 KB, rate-limit by IP
  (KV counter, e.g. 5 per 10 minutes). Store in KV under `lead:<iso-date>:<uuid>`.
  Returns `{ok:true}`. Never echo the stored data back.
- `POST /admin/login` — body `{password}`. Compare against a Worker secret with a
  constant-time comparison of a SHA-256 hash (secret `ADMIN_PASSWORD_HASH`). On success
  mint a random 32-byte session token, store `session:<token>` in KV with a 12-hour TTL,
  return it. Rate-limit by IP: 5 attempts per 15 minutes, then 429.
- `POST /admin/logout`
- `GET /admin/leads?from=&to=` — session required. Returns the leads, newest first.
- `GET /admin/leads.csv` — session required.
- `GET /admin/content?path=` — session required. Reads a file from the GitHub repo
  (`TjmerMTA/dressage-horses`, branch `main`) through the GitHub Contents API using the
  secret `GITHUB_TOKEN`. Returns content + sha.
- `PUT /admin/content` — session required. Body `{path, content, sha, message}`.
  Commits the file. Only paths matching `^(src/content/|src/assets/horses/|public/)`
  are allowed — reject anything else, including `..`.
- `POST /admin/upload` — session required. Multipart or base64 JPEG/PNG/WebP, max 8 MB,
  sniff the magic bytes (do not trust the content type). Commits it to
  `src/assets/horses/<slug>-<n>.<ext>` and returns the path.
- `GET /health`

## Rules

- No secret in the repository, in a log, or in a notebook file. `wrangler.toml` names
  the secrets, it does not contain them. Write the list of secrets that must be set,
  and the exact `wrangler secret put` commands, into `worker/README.md`.
- Every error response is a short JSON `{error}` with no internals in it.
- Write `worker/test.sh`: curl calls that exercise every endpoint against
  `npx wrangler dev`, including the failure cases (bad password, no session, oversized
  body, forbidden path, rate limit). Run it and paste the output in your report.

## Done means

`npx wrangler dev` runs, `worker/test.sh` passes in full and you show the output,
`npx wrangler deploy --dry-run` succeeds, `worker/README.md` tells the director exactly
what to set and run. Everything committed in your copy.

Report in English. Ask your questions in English.

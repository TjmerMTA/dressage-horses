# dressage-horses-api — Cloudflare Worker

The back end of the admin panel. It takes the quiz leads from the public site, logs the
owner in, and writes content changes back into `TjmerMTA/dressage-horses` (branch `main`)
through the GitHub Contents API. Every commit it makes triggers the normal site rebuild.

Plain TypeScript, no framework, one KV namespace. Source: `src/`.

## Deploy (the director runs this, once)

All commands are run from this `worker/` folder.

```sh
npm ci

# 1. KV namespace for leads, sessions and rate-limit counters
npx wrangler kv namespace create DH_KV
#    → paste the printed id into wrangler.toml, replacing REPLACE_WITH_KV_NAMESPACE_ID

# 2. Admin password. It is hashed locally; only the SHA-256 hex goes to Cloudflare.
#    `read -s` keeps the password out of shell history and off the screen.
read -rs "PW?Admin password: " && echo        # zsh   (bash: read -rsp "Admin password: " PW; echo)
printf %s "$PW" | shasum -a 256 | cut -d' ' -f1 | npx wrangler secret put ADMIN_PASSWORD_HASH
unset PW

# 3. GitHub token (paste it at the prompt; it is not echoed)
npx wrangler secret put GITHUB_TOKEN

# 4. Deploy
npx wrangler deploy
curl -s https://dressage-horses-api.<your-subdomain>.workers.dev/health   # → {"ok":true}
```

### Secrets that must be set

| Name | What it is |
|---|---|
| `ADMIN_PASSWORD_HASH` | Lowercase hex SHA-256 of the admin password (64 characters). The password itself is stored nowhere. Use a long passphrase (4+ random words): a plain SHA-256 is fast to brute-force if the hash ever leaked. |
| `GITHUB_TOKEN` | A **fine-grained** personal access token. Repository access: **only** `TjmerMTA/dressage-horses`. Permissions: **Contents: Read and write** and **Actions: Read** (Metadata: Read is added automatically). Nothing else. Actions: Read only lets the admin show "publishing… / published / build failed"; without it the panel still works and falls back to watching the live site's `/version.json`. Give it an expiry date and put a reminder in the calendar. |

`wrangler.toml` only names these. To rotate either one, run the same `secret put` again.
Changing the password hash does not end live sessions; they expire within 12 hours.

### Plain variables (in `wrangler.toml`)

| Name | Value |
|---|---|
| `ALLOWED_ORIGINS` | `https://dev.siteboosty.com`. Comma-separated if another origin is ever needed. |
| `GITHUB_REPO` | `TjmerMTA/dressage-horses` |
| `GITHUB_BRANCH` | `main` |

`GITHUB_API_BASE` exists only so the tests can point at a mock. Leave it unset in production.

## API

Every response is JSON (except the CSV) and carries `Cache-Control: no-store`. Every error
is `{"error": "<short message>"}`. A browser request whose `Origin` is not in `ALLOWED_ORIGINS`
gets a 403. Admin calls send `Authorization: Bearer <token>`.

| Method & path | Auth | Notes |
|---|---|---|
| `GET /health` | — | `{"ok":true}` |
| `POST /lead` | — | JSON, max 4 KB, 5 per IP per 10 min → 429. Reply is always exactly `{"ok":true}`. |
| `POST /admin/login` | — | `{"password"}` → `{"ok":true,"token","expiresIn":43200}`. 5 attempts per IP per 15 min (right or wrong) → 429. |
| `POST /admin/logout` | session | Ends the session. |
| `GET /admin/leads?from=YYYY-MM-DD&to=YYYY-MM-DD` | session | `{"ok","count","truncated","leads":[…]}`, newest first. Both dates optional, inclusive, UTC. |
| `GET /admin/leads.csv?from=&to=` | session | UTF-8 CSV (with BOM, for Excel). Cells that start like a formula are prefixed with `'`. |
| `GET /admin/content?path=` | session | File: `{"type":"file","path","sha","size","encoding":"utf-8"\|"base64","content"}`. Directory: `{"type":"dir","entries":[{name,path,type,sha,size}]}`. |
| `PUT /admin/content` | session | `{"path","content","sha"?,"message"?}`. Max 512 KB of text. `sha` is the one from GET (omit it to create a new file). A stale `sha` → 409. `.json` must parse. → `{"ok","path","sha","commit"}` |
| `DELETE /admin/content` | session | `{"path","sha","message"?}`. Same path rules as PUT (text files only, so photos are never deleted from the panel). → `{"ok","path","commit"}` |
| `GET /admin/raw?path=` | session | The bytes of one photo under `src/assets/horses/` (JPEG/PNG/WebP, up to 12 MB), so the panel can show photos that the site has not built yet. |
| `GET /admin/deploy-status?sha=<commit>` | session | `{"ok","available","run","latest"}`: the newest Actions run for that commit and the newest run on `main`, each `{status, conclusion, headSha, createdAt, url}`. `available:false` when the token lacks Actions: Read. |
| `POST /admin/upload` | session | `multipart/form-data` with `slug` + `file`, or JSON `{"slug","data":"<base64 or data: URL>"}`. Max 8 MB. JPEG/PNG/WebP, detected from the bytes. Commits `src/assets/horses/<slug>-<n>.<ext>` with the next free `n`. → `{"ok","path","sha"}` |

**Paths.** Read and write only under `src/content/`, `src/assets/horses/` and `public/`.
A path segment may not start with `.`, so `..` and hidden files are refused, and the
character set is `[A-Za-z0-9._-]`. `public/CNAME` is locked. Text writes accept `.md .mdx
.json .txt .yml .yaml .csv` and are refused inside `src/assets/horses/`; images go through
`/admin/upload`.

### Lead payload (for whoever wires the quiz)

```json
{
  "name": "Anna",                         // required, 2–100 chars
  "region": "Europe",                     // required, 1–100
  "budget": "€60,000 – 100,000",          // required, 1–100
  "format": "Online purchase",            // required, 1–100
  "contact": "+32 470 12 34 56",          // required: phone (7–15 digits) or e-mail.
                                          //   "whatsapp" is accepted instead, as the mock-up sends it
  "ts": 1793793337420,                    // required: Date.now() at the moment the quiz was shown
  "website": "",                          // honeypot: a hidden input that must stay empty
  "consent": true,                        // optional, must be true if present
  "page": "https://dev.siteboosty.com/",  // optional
  "sent_at": "…",                         // optional, ignored
  "utm_source": "…"                       // optional: utm_source|medium|campaign|content|term, fbclid, gclid
}
```

Any other key → 400. A filled honeypot, or a submit less than 2 s after `ts`, gets the
normal `{"ok":true}` but is not stored, so bots learn nothing.

### Notes for the admin page

- Keep the token in `sessionStorage`, not `localStorage`. On any 401, go back to the login form.
- Lead fields are whatever a stranger typed. Render them with `textContent`, never `innerHTML`.
- For the CSV, `fetch` with the Bearer header, then download the blob. A plain `<a href>` cannot send the header.
- `PUT /admin/content` and `/admin/upload` make a real commit on `main` each time, and each commit starts a site build. Save once per edit, not on every keystroke.

## Test

```sh
./test.sh
```

The script starts its own `wrangler dev` (throw-away KV state in a temp folder) and a mock
GitHub (`test/mock-github.mjs`). It creates a random one-off admin password, then calls every
endpoint, including the failure cases: wrong password, no or invalid session, oversized
bodies, forbidden and traversal paths, fake images and both rate limits. It also checks that
no password, token or hash shows up in the wrangler log. It never contacts GitHub or
Cloudflare. The exit code is the number of failed checks.

## Known limits (by design, fine at this traffic)

- **KV is eventually consistent.** The rate limits are fixed windows on KV counters. A burst
  spread across many Cloudflare locations can get a few extra requests through. A logout can
  take up to about 60 s to reach other locations.
- **KV writes on the free plan: 1,000 a day.** A lead costs 2 writes (counter + lead), a login
  costs 2 (counter + session). This is far above what the site needs. If it ever runs out, the
  rate limiter fails closed (429) rather than open.
- Sessions are stored as `session:<sha256(token)>`, not under the raw token, so a KV listing
  reveals no usable token.
- Lead IPs are not stored. The rate-limit keys hold a truncated hash of the IP and expire with
  their window. A lead stores the visitor's country code (from Cloudflare), nothing more about
  them.
- The Worker logs only an error class name and a route. It never logs bodies, headers or tokens.

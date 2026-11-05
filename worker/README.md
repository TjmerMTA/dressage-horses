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
| `NOTION_TOKEN` | *Optional.* The Notion internal integration secret (`ntn_…`) from "Notion" below. Without it, Notion is off. |
| `GITHUB_TOKEN` | A **fine-grained** personal access token. Repository access: **only** `TjmerMTA/dressage-horses`. Permissions: **Contents: Read and write** and **Actions: Read** (Metadata: Read is added automatically). Nothing else. Actions: Read only lets the admin show "publishing… / published / build failed"; without it the panel still works and falls back to watching the live site's `/version.json`. Give it an expiry date and put a reminder in the calendar. |

`wrangler.toml` only names these. To rotate either one, run the same `secret put` again.

`wrangler secret put` reads the value from a prompt. In a shell that is not interactive
it stores an **empty** secret without complaint. Pipe the value in instead
(`printf %s "$VALUE" | npx wrangler secret put NAME`), then check with
`npx wrangler secret list`. With an empty or missing `GITHUB_TOKEN`, every repository
call answers `503 {"error":"repository not configured"}`, and the admin says "the server is
missing its GitHub key". Leads and login keep working.
Changing the password hash does not end live sessions; they expire within 12 hours.

### Plain variables (in `wrangler.toml`)

| Name | Value |
|---|---|
| `ALLOWED_ORIGINS` | `https://dev.siteboosty.com`. Comma-separated if another origin is ever needed. |
| `GITHUB_REPO` | `TjmerMTA/dressage-horses` |
| `GITHUB_BRANCH` | `main` |

| `NOTION_DB` | Empty until Notion is connected. Then the id of his database (or its whole link). See "Notion" below. |
| `NOTION_STAGE_PROP` | `Face`: his status property the board is grouped by. |
| `NOTION_STAGE_VALUE` | `Lead`: the board column (status option) a new card lands in. |
| `NOTION_COMMENT_PROP` | `comment on phase`: his text property that gets every answer. |

`GITHUB_API_BASE` and `NOTION_API_BASE` exist only so the tests can point at mocks. Leave them unset in production.

## Notion: every quiz lead as a new card in the client's database

Each lead the quiz sends becomes a new card in the client's **existing** Notion database
"Підбір для клієнтів / Clients Selection", in the board column **Lead**. His columns are
the options of a status property called **Face**: a card moves between columns when Face
changes. A card sets three of his properties and nothing else:

| His property | What goes in | Setting (`wrangler.toml`) |
|---|---|---|
| the title property (whatever it is called) | the visitor's name | none |
| **Face**: the status the board is grouped by (a Select works too) | the option **Lead**, so the card lands in that column | `NOTION_STAGE_PROP = "Face"`, `NOTION_STAGE_VALUE = "Lead"` |
| **comment on phase**: a Text property | every answer, as plain text | `NOTION_COMMENT_PROP = "comment on phase"` |

If he renames the property or the column in Notion, change the setting to the new name and
run `npx wrangler deploy`. No code changes.

**How the Worker finds them.** The names he has given us have varied, so the Worker is
forgiving. Upper/lower case and spaces never count (`Face`, `face`, `FA CE` are the same).

- *The stage:* (1) the property named in `NOTION_STAGE_PROP`, if it is a Status or a Select;
  else (2) his first Status property, whatever it is called; else (3) the first Select
  called face, phase, фаза, status or статус.
- *The comment:* (1) the Text property named in `NOTION_COMMENT_PROP`; else (2) the first
  Text property whose name contains "comment".

Every card writes one log line naming what was chosen and how, for example
`notion card: title "Клієнт"; stage "Face" (status, configured name); comment "Comment on
phase" (rich_text, configured name)`. It holds property names and types only, never the
lead. After the first real lead, check it in Cloudflare (Workers → dressage-horses-api →
Logs). If it says "first status property" or "named like comment", the guess was used: put
the real names into `wrangler.toml` so it no longer depends on guessing.

**The option is never invented.** If "Face" has no option "Lead", the card is created without
a stage, and the error names the options his database actually has (e.g. `stage: "Face" has
no option "Lead"; it has: Лід, Підбір, Угода`). Copy the right one into `NOTION_STAGE_VALUE`
and deploy.

The text in "comment on phase" reads like this (one answer per line, in the quiz's order,
then the contact, the page and the time; "Horse" only when the lead came from a horse,
"Consent" only when it was given):

```
Region: Europe
Budget: €60,000 – 100,000
Buying: Online purchase
Horse: Donatello B
Contact: +32 470 12 34 56
Consent: yes
Page: https://dev.siteboosty.com/#quiz?horse=donatello-b
Received: 2026-11-05 08:23 UTC
```

- **The lead is safe first.** It is stored in KV and the visitor gets the answer; only then
  is the card created, in the background, so the visitor never waits for Notion. KV stays the
  source of truth; Notion is a copy.
- **If the stage or the comment cannot be found** by the rules above (or the option "Lead"
  is missing), nothing more is guessed and nothing is dropped. The card is still created
  with the name and whichever of the two *was* found, and **every answer is written into the
  card's page text**. The lead is marked **"In Notion, incomplete"** in the admin; hovering
  the mark says what was missing. If it was the stage, move that card into Lead by hand.
  Once the setting is fixed, the next leads land correctly. An incomplete card is not sent
  again (that would make a second card).
- **If Notion fails** (down, busy, wrong key), the Worker tries again twice, then marks the
  lead **"Not in Notion yet"**. **Send N to Notion** on the Leads screen sends every lead
  that has no card yet. That is also how the leads that arrived before Notion was connected
  get in. A lead that already has a card is never sent twice.
- **Until both `NOTION_TOKEN` and `NOTION_DB` are set, nothing happens at all.** No call, no
  log line, and nothing about Notion in the admin. The Worker behaves exactly as before.
- The Worker reads his database's list of properties to find these three. It keeps that
  list for 5 minutes, and reads it again at once when a card comes out incomplete or Notion
  refuses one.

### Connecting it: what the client does (about 10 minutes)

1. **Make the key.** Go to <https://www.notion.so/my-integrations> and click **New
   integration**. Name: `Website leads`. Workspace: the one with the database. Type:
   **Internal**. Save. On the **Configuration** tab, under **Capabilities**, tick **Read
   content** and **Insert content** (nothing else is needed). Click **Show** next to
   **Internal Integration Secret** and copy it. It starts with `ntn_`. Treat it like a
   password: send it to the developer through a password manager or another private
   channel, never in e-mail or chat.
2. **Let the key into the database.** Open "Підбір для клієнтів / Clients Selection" as a
   full page. If it sits inside another page, click its name and then **↗ Open as full
   page**. Click **•••** (top right) → **Connections** → **Connect to** → `Website leads`
   → **Confirm**. Without this step Notion answers "not found" and the admin shows
   *Notion can't see the database*.
3. **Copy the database's address.** Still on that full page: **•••** → **Copy link**. It
   looks like `https://www.notion.so/<workspace>/<32 letters and digits>?v=<32 more>`. Send
   the whole link: the database id is the 32 characters **before** `?v=`, and the Worker
   also accepts the whole link. (The part after `?v=` is the view, not the database.)
4. **Check the three names.** In the database, look at the property the board is grouped
   by (board view → **•••** → **Group** shows **Group by: …**), the exact name of the column
   new leads belong in, and the text property for the answers. Copy them from Notion rather
   than typing them. If they are not `Face`, `Lead` and `comment on phase` (case and spaces
   do not matter), send the developer the real names. "comment on phase" must be a **Text**
   property.
5. **The developer stores the key** as a Worker secret, from this `worker/` folder:

   ```sh
   read -rs "NT?Notion secret: " && echo          # zsh   (bash: read -rsp "Notion secret: " NT; echo)
   printf %s "$NT" | npx wrangler secret put NOTION_TOKEN
   unset NT
   npx wrangler secret list                        # NOTION_TOKEN must be listed
   ```

   **Pipe the value in, as above. Do not type it at the `secret put` prompt.** In a shell
   that is not interactive (an agent's, a script's, CI) `wrangler secret put` stores an
   **empty** secret without any warning. That has already cost this project a day. An empty
   token simply leaves Notion switched off.
6. **The developer puts the database into `wrangler.toml`** (plain values, not secrets),
   corrects the three names if step 4 said so, and deploys:

   ```toml
   NOTION_DB = "<the 32 characters from step 3, or the whole link>"
   NOTION_STAGE_PROP = "Face"
   NOTION_STAGE_VALUE = "Lead"
   NOTION_COMMENT_PROP = "comment on phase"
   ```

   ```sh
   npx wrangler deploy
   ```
7. **Check it.** Fill in the quiz on the site once. Within a few seconds a card with that
   name appears in the **Lead** column, with the answers in "comment on phase". In the
   admin, the lead says **In Notion**. If it says **In Notion, incomplete**, hover it: it
   names the property that was not found. Fix the name (step 4 and 6).
8. **Bring in the earlier leads.** Leads screen → **Send N to Notion**. (Choose dates first
   to send only some of them.)

To switch Notion off again, empty `NOTION_DB` and deploy, or `npx wrangler secret delete NOTION_TOKEN`.

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
| `GET /admin/leads?from=YYYY-MM-DD&to=YYYY-MM-DD` | session | `{"ok","count","truncated","leads":[…]}`, newest first. Both dates optional, inclusive, UTC. Once Notion is configured the reply also has `"notion":true`, and each lead that was tried has `notion` (`"sent"`, `"partial"` = a card without its stage or comment, `"failed"` = no card), `notionAt`, and for the last two a short `notionError` such as `"401 unauthorized"` or `stage: no status or select property "Face"`. |
| `GET /admin/leads.csv?from=&to=` | session | UTF-8 CSV (with BOM, for Excel). Cells that start like a formula are prefixed with `'`. |
| `GET /admin/content?path=` | session | File: `{"type":"file","path","sha","size","encoding":"utf-8"\|"base64","content"}`. Directory: `{"type":"dir","entries":[{name,path,type,sha,size}]}`. |
| `PUT /admin/content` | session | `{"path","content","sha"?,"message"?}`. Max 512 KB of text. `sha` is the one from GET (omit it to create a new file). A stale `sha` → 409. `.json` must parse. → `{"ok","path","sha","commit"}` |
| `DELETE /admin/content` | session | `{"path","sha","message"?}`. Same path rules as PUT (text files only, so photos are never deleted from the panel). → `{"ok","path","commit"}` |
| `GET /admin/raw?path=` | session | The bytes of one photo under `src/assets/horses/` (JPEG/PNG/WebP, up to 12 MB), so the panel can show photos that the site has not built yet. |
| `GET /admin/deploy-status?sha=<commit>` | session | `{"ok","available","run","latest"}`: the newest Actions run for that commit and the newest run on `main`, each `{status, conclusion, headSha, createdAt, url}`. `available:false` when the token lacks Actions: Read. |
| `POST /admin/notion/resend` | session | `{"id":"<lead id>"}`, or `{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}` (both optional; `{}` = every lead). Sends the leads that have no card in Notion yet, at most 10 per call, never-tried first; leads with a card (`sent` or `partial`) are skipped, and so is a lead from the last minute that may still be on its way. Stops at an error every lead would hit (bad key, no access, rate limit, outage). → `{"ok","matched","sent","partial","failed","alreadySent","pending","remaining","stopped"?}`; call again while `remaining` > 0. `503` while Notion is not configured. |
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

### Who calls this

- The quiz, through `src/scripts/lead-form.js` (`sendLead(answers)`; it adds `ts`, the
  `website` honeypot, the page address and `utm_*`).
- The admin panel at `/admin/` (`src/scripts/admin/`).
- Both find the Worker through `src/scripts/api-base.js`: put the `*.workers.dev`
  address that `npx wrangler deploy` prints into `PRODUCTION_API` there.

### Notes for the admin page

- Keep the token in `sessionStorage`, not `localStorage`. On any 401, go back to the login form.
- Lead fields are whatever a stranger typed. Render them with `textContent`, never `innerHTML`.
- For the CSV, `fetch` with the Bearer header, then download the blob. A plain `<a href>` cannot send the header.
- `PUT /admin/content` and `/admin/upload` make a real commit on `main` each time, and each commit starts a site build. Save once per edit, not on every keystroke.

## Test

```sh
./test.sh
```

The script starts its own `wrangler dev` (throw-away KV state in a temp folder), a mock
GitHub (`test/mock-github.mjs`) and a mock Notion (`test/mock-notion.mjs`, with databases shaped like
his: a title not called "Name", the stage as a Status and as a Select, odd spacing and case,
the fallbacks when the configured names are absent, and ones where the stage, its "Lead"
option or "comment on phase" is missing), and later a second Worker with Notion
switched on. It creates a random one-off
admin password, then calls every endpoint, including the failure cases: wrong password, no or
invalid session, oversized bodies, forbidden and traversal paths, fake images and both rate
limits. For Notion: no call at all while either value is missing; the exact text of a card with
every answer and of one with the optional answers missing; a long set of answers; the
partial card when a property is missing; Notion answering 401, 429 and 500; the retry; the
failure mark; the resend endpoint; his properties changing under a cached schema. It also checks that no password, token
or hash shows up in the wrangler log. It never contacts GitHub, Notion or Cloudflare. The
exit code is the number of failed checks.

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
  For Notion it logs a status and Notion's error code (`notion failed: 429 rate_limited`) or the
  name of a missing property, and one line per card naming which of his properties it used;
  never Notion's message text, which could quote the lead.
- **With Notion on, a lead costs 3 KV writes** (counter, lead, the Notion mark), plus one write
  at most every 5 minutes for his property list (one per lead while a property is missing).
  Still far inside 1,000 a day.
- **Notion API version `2022-06-28`.** It works with an ordinary database. If he ever turns
  his database into one with several data sources (a newer Notion feature), this version
  cannot write into it and every lead is marked "Not in Notion yet". The leads stay safe in
  KV; the Worker then needs the newer API.
- Notion allows about 3 requests a second. One lead is 1 to 3 requests, so only "Send N to
  Notion" over hundreds of old leads can hit it. Then it stops, says "Notion was busy", and
  the next click carries on.
- In local `wrangler dev` (not on Cloudflare), reading a lead that contains `€` back from KV
  prints a "CF-KV-Metadata contains non-ASCII characters" warning that quotes the stored lead.
  That line comes from the local KV simulator, not from this Worker. Keep local dev logs
  private, and do not paste them anywhere.

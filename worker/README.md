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
| `NOTION_TOKEN` | *Optional, and not needed any more.* Notion is set up from the admin panel ("Notion" below). A key saved there wins over this secret. |
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
| `NOTION_DB` | Empty. Only a fallback: the database is chosen in the admin panel. |
| `NOTION_STAGE_PROP` | `Face`. Fallback for "Property the board is grouped by" on the Notion screen. |
| `NOTION_STAGE_VALUE` | `Lead`. Fallback for "Column for new requests". |
| `NOTION_COMMENT_PROP` | `comment on phase`. Fallback for "Text property for the answers". |

`GITHUB_API_BASE` and `NOTION_API_BASE` exist only so the tests can point at mocks. Leave them unset in production.

## Notion: every quiz lead as a new card in the client's database

Each lead the quiz sends becomes a new card in the client's **existing** Notion database
"Підбір для клієнтів / Clients Selection", in the board column **Lead**. His columns are
the options of a status property called **Face**: a card moves between columns when Face
changes. A card sets three of his properties and nothing else:

| His property | What goes in | Field on the admin's Notion screen |
|---|---|---|
| the title property (whatever it is called) | the visitor's name | none |
| **Face**: the status the board is grouped by (a Select works too) | the option **Lead**, so the card lands in that column | "Property the board is grouped by", "Column for new requests" |
| **comment on phase**: a Text property | every answer, as plain text | "Text property for the answers" |

If he renames the property or the column in Notion, he presses **Check connection** on the
Notion screen, picks the new name from the list and saves. No deploy, no code changes.

### Where the settings live

All of it is set on the admin panel's **Notion** screen and stored in KV under one key,
`notion:config`: the key, the database id, the three names, and an on/off switch. Each field
the panel has never saved falls back to `wrangler.toml` (and the `NOTION_TOKEN` secret), so
nothing changed on the day this was deployed. A key removed from the panel stays removed:
the `NOTION_TOKEN` secret is then not used either.

**The key is a secret.** It sits in KV, which only this Worker can read, and leaves the
Worker only in the `Authorization` header of a request to `api.notion.com`. It is never
logged and never sent to the browser: the panel learns only whether a key is saved and its
last four characters. An empty key field means "keep the saved one"; removing it is its own
button with a confirmation (`{"removeToken":true}`).

A change saved in the panel reaches every Cloudflare location within about a minute (KV is
eventually consistent), so a lead in that minute can still go out with the old settings.

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
Logs). If it says "first status property" or "named like comment", the guess was used: pick
the real names on the Notion screen (Check connection, then the lists) so it no longer depends
on guessing.

**The option is never invented.** If "Face" has no option "Lead", the card is created without
a stage, and the error names the options his database actually has (e.g. `stage: "Face" has
no option "Lead"; it has: Лід, Підбір, Угода`). **Check connection** shows the same, and the
column list then offers only options that exist.

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
- **Until there is both a key and a database, or while Notion is switched off on the Notion
  screen, nothing happens at all.** No call, no log line, and no Notion marks or "Send N to
  Notion" on the Leads screen. The Worker behaves exactly as before. Switched off, the key and
  the database are kept; the leads that arrived meanwhile go in with "Send N to Notion" once it
  is on again.
- The Worker reads his database's list of properties to find these three. It keeps that
  list for 5 minutes, and reads it again at once when a card comes out incomplete or Notion
  refuses one.

### Connecting it: what the client does (about 10 minutes, all in the browser)

1. **Make the key.** Go to <https://www.notion.so/my-integrations> and click **New
   integration**. Name: `Website leads`. Workspace: the one with the database. Type:
   **Internal**. Save. On the **Configuration** tab, under **Capabilities**, tick **Read
   content** and **Insert content** (nothing else is needed). Click **Show** next to
   **Internal Integration Secret** and copy it. It starts with `ntn_`. It is a password:
   paste it only into the admin panel, never into e-mail or chat.
2. **Let the key into the database.** Open "Підбір для клієнтів / Clients Selection" as a
   full page. If it sits inside another page, click its name and then **↗ Open as full
   page**. Click **•••** (top right) → **Connections** → **Connect to** → `Website leads`
   → **Confirm**. Without this step **Check connection** says *Notion can't see this database*.
3. **Copy the database's link.** Still on that full page: **•••** → **Copy link**.
4. **In the admin panel → Notion:** paste the key and the link, press **Check connection**.
   It answers in plain English: connected to "<his database's title>", or one of *the key is
   wrong*, *Notion can't see this database* (step 2), *that is not a database* (step 3, the
   link of another page), *Notion isn't answering*.
5. **Pick the three names from the lists** that the check filled from his database: the
   property the board is grouped by (Face is pre-selected when it exists), the column for new
   requests (Lead), the text property for the answers (comment on phase). Press **Save**. The
   screen checks the connection again and says "Saved. Notion works."
6. **Check it.** Fill in the quiz on the site once. Within a few seconds a card with that
   name appears in the **Lead** column, with the answers in "comment on phase". In the
   admin, the lead says **In Notion**. If it says **In Notion, incomplete**, hover it: it
   names the property that was not found. Fix it on the Notion screen.
7. **Bring in the earlier leads.** Leads screen → **Send N to Notion**. (Choose dates first
   to send only some of them.)

To pause Notion, untick **Send new requests to Notion** and save (the key stays). To stop it
for good, **Remove the saved key**.

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
| `GET /admin/notion/config` | session | `{"ok","active","enabled","token":{"set","last4","from"},"db","dbFrom","dbValid","stageProp","stageValue","commentProp","defaults","updatedAt"?}`. Never the key: `last4` is its last four characters (null for a key under 20 characters). `from`/`dbFrom`: `"panel"`, `"server"` (wrangler.toml) or null. `active` = cards are being made. |
| `PUT /admin/notion/config` | session | Any of `{"token","removeToken":true,"db","stageProp","stageValue","commentProp","enabled"}`, max 4 KB; only what is sent changes. `token` must look like a Notion key (`ntn_…` or `secret_…`, no spaces); an empty `token` is refused, removal is `removeToken`. `db`: an id with or without dashes, or a pasted database link (the id is taken from the path, not from `?v=`); `""` clears it. A name `""` goes back to the default. → the same as GET. |
| `POST /admin/notion/check` | session | `{"token"?,"db"?,"stageProp"?,"stageValue"?,"commentProp"?}`: what is not given comes from the saved settings. Calls `GET /v1/databases/{id}`. 30 per IP per 10 min → 429. Always 200 once it has asked Notion: `{"ok":true,"database":{"id","title"},"properties":[{"name","type","options"?}],"use":{"stageProp","stageValue","commentProp"},"problems":[…],"active"}` (`use` = his exact names a card would use, `""` where nothing fits), or `{"ok":false,"cause","status","message","active"}` with `cause` `"token"` (401), `"access"` (404, or 403 without Read content), `"not_database"` (400: a page, not a database) or `"down"` (5xx, 429, timeout). `message` is a sentence for the owner; Notion's own message text is never passed on. Saves nothing. |
| `POST /admin/notion/resend` | session | `{"id":"<lead id>"}`, or `{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}` (both optional; `{}` = every lead). Sends the leads that have no card in Notion yet, at most 10 per call, never-tried first; leads with a card (`sent` or `partial`) are skipped, and so is a lead from the last minute that may still be on its way. Stops at an error every lead would hit (bad key, no access, rate limit, outage). → `{"ok","matched","sent","partial","failed","alreadySent","pending","remaining","stopped"?}`; call again while `remaining` > 0. `503` while Notion is not configured (`notion not configured`) or switched off (`notion is switched off`). |
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
failure mark; the resend endpoint; his properties changing under a cached schema. A fourth
Worker covers the Notion screen's endpoints: wrangler settings that do not work, overridden
by what the panel saves; every refused input; the masked read-back; a pasted link turned
into the id; the check's four failure causes and its success; switching off (no Notion call
at all) and on; removing the key; the check's rate limit. It also checks that no password, token
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
- **A lead that arrives while Notion is switched off** shows "Sending to Notion…" for its first
  minute (the same window as a lead that is really on its way), and "Send N to Notion" skips it
  for that minute. After that it is "Not in Notion yet" and goes in with the button.
- Notion allows about 3 requests a second. One lead is 1 to 3 requests, so only "Send N to
  Notion" over hundreds of old leads can hit it. Then it stops, says "Notion was busy", and
  the next click carries on.
- In local `wrangler dev` (not on Cloudflare), reading a lead that contains `€` back from KV
  prints a "CF-KV-Metadata contains non-ASCII characters" warning that quotes the stored lead.
  That line comes from the local KV simulator, not from this Worker. Keep local dev logs
  private, and do not paste them anywhere.

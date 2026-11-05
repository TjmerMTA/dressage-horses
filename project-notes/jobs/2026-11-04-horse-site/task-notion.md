# Task card — piece `notion` (size M) — Pavel

Added 2026-11-05. The client asked for the quiz's requests to land in Notion.

## Goal

Every lead the quiz produces appears as a row in the client's Notion database, within
seconds, without the visitor waiting for it and without a Notion outage ever losing a
lead.

## Where

`worker/` only. Do not touch the site's pages or components. Read `worker/README.md`
and `worker/src/leads.ts` first: the Worker already validates the lead, rate-limits it
and stores it in KV. KV stays the source of truth — Notion is a copy.

## What to do

1. **Send after storing, never before.** The lead is written to KV first and the
   visitor gets `{ok:true}` immediately. The Notion call goes through
   `ctx.waitUntil(...)` so it never adds to the response time and never turns a Notion
   failure into a failed submission.
2. **The call:** `POST https://api.notion.com/v1/pages`, header
   `Notion-Version: 2022-06-28`, bearer `NOTION_TOKEN` (a new Worker secret), parent
   `{ database_id: NOTION_DB }` (a new plain var in `wrangler.toml`, not a secret —
   but leave it empty in the repo and say in the README where the client finds it).
3. **The card** (rewritten 2026-11-05 after the client's answers; supersedes the earlier
   property list and the per-column mapping). We write into HIS existing database
   "Підбір для клієнтів / Clients Selection" and create no property and no option. A card
   sets three properties and nothing else:
   - his title property (whatever it is called) ← the person's name;
   - the stage: status **Face** (a select works too) ← option **Lead**, so the card lands
     in that board column (`NOTION_STAGE_PROP`, `NOTION_STAGE_VALUE` in `wrangler.toml`);
   - **comment on phase** (`NOTION_COMMENT_PROP`) ← every answer as one plain-text block,
     one labelled line each, in quiz order, then contact, page, time; horse when there is one.
   Names are found forgivingly: the configured name (case and spaces ignored); else the
   first status property; else a select called face/phase/фаза/status/статус. For the
   comment: the configured name, else a text property whose name contains "comment". The
   choice is logged by name and type. A stage option is never invented: if it is missing,
   or the stage or comment is not found, the card is created anyway, every answer goes into
   the page text, and the lead is marked `partial` (the error lists his real options).
4. **When Notion is not configured** (either value missing), do nothing at all and do
   not log an error on every lead. This must be the normal state until the client
   supplies the two values, and the Worker must behave exactly as it does today.
5. **When Notion fails:** retry twice with a short backoff, and if it still fails,
   record it on the stored lead (`notion: "failed"` plus the reason, short) so nothing
   is silently lost. Never log the token or the lead's contents.
6. **A way to catch up.** Add `POST /admin/notion/resend` (session required), which
   takes a lead id or a date range and sends those leads to Notion again, skipping the
   ones already recorded as sent. This is what the client will use for the leads that
   arrived before Notion was connected, and after any outage.
7. **In the admin** (`src/scripts/admin/` is allowed for this one, it is the one place
   outside `worker/`): show on the Leads screen whether a lead reached Notion, and a
   button to resend the ones that did not. Keep it small — a quiet mark, not a banner.
   If Notion is not configured, show nothing at all about Notion.
8. **Tests:** extend `worker/test.sh` against a local mock of Notion — a lead with
   every field, a lead with the optional fields missing, Notion returning 401, 429 and
   500, the retry, the failure mark, the resend endpoint, and the not-configured case
   where no call is made at all. Keep all 117 existing checks passing and paste the
   tail of the output.

## What the client has to do, and must be in `worker/README.md` as a numbered list

- create an internal integration at notion.so/my-integrations and copy its token
- create the database with the properties above (give the exact names and types)
- open the database → `...` → Connections → add the integration, or it gets a 404
- find the database id in the page's address
- `npx wrangler secret put NOTION_TOKEN`, piping the value in rather than typing it —
  this shell is not interactive and an empty secret has already cost us a day; say so
- put the database id into `wrangler.toml` and `npx wrangler deploy`

## Done means

`npx wrangler dev` runs, `worker/test.sh` passes in full including your new checks,
`npx wrangler deploy --dry-run` succeeds, and `worker/README.md` tells a non-programmer
exactly what to click. You cannot deploy and you have no Notion account: say plainly
what is therefore unproven against the real Notion API.

Report in English. Ask your questions in English.

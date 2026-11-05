# Task card — piece `notion-settings` (size M) — Rita

Added 2026-11-05. The client will not set this up with command-line tools.

## Why

The Notion delivery that Pavel built is configured by a Cloudflare secret and three
variables in `wrangler.toml`, and changing any of them needs `wrangler secret put` and
`wrangler deploy`. The client's answer to that was: "I'm not ready to deal with
connections right now." So it has to move into the admin panel, where he fills in two
fields and presses a button.

This is the last `wrangler deploy` of the project. After it, Notion is set up, changed
and switched off entirely from the browser.

## What to do

Read `worker/README.md` → Notion, and `worker/src/notion.ts`, before anything.

**1. The settings live in KV, not in the repository and not in `wrangler.toml`.**
One key, `notion:config`: the token, the database id, and the three names
(stage property, stage value, comment property). The Worker reads KV first and falls
back to the existing environment values, so today's behaviour is unchanged until
somebody saves something. Notion stays off while the token or the database is empty.

**The token is a secret and must behave like one.** It is never written to the
repository, never logged, and **never sent back to the browser** — the settings screen
only ever learns "set" or "not set", and the last four characters, so he can tell which
key is in there. Saving an empty token means "remove it and switch Notion off", and
that must be a deliberate, separate action, not something an empty field does by
accident.

**2. Worker endpoints**, session required, same rules as the rest of the admin API:
- `GET /admin/notion/config` — the current settings, with the token masked.
- `PUT /admin/notion/config` — save. Validate: the database id is 32 hex characters
  with or without dashes, **and accept a pasted Notion URL and pull the id out of it**,
  because that is what he will paste. Reject a token that is not shaped like one.
- `POST /admin/notion/check` — the useful one. With the given (or stored) token and
  database, call `GET /v1/databases/{id}` and answer with: whether it worked, the
  database's title, every property with its name and type, and the options of every
  status and select property. On failure, say which of the four real causes it is, in
  plain English: the token is wrong (401), the integration has not been given access to
  this database (404 — name the Connections step), the id is not a database, or Notion
  is down. This is the screen that replaces the whole README.

**3. The admin screen**, a new "Notion" item in the menu, in the panel's own style:
- a field for the token (password-style, showing "set — ends in …abcd" when one is
  stored), a field for the database link or id, and a **Check connection** button
- after a successful check, the three name fields stop being free text and become
  **drop-downs filled from his real database**: the stage property lists his status and
  select properties, the stage value lists that property's real options, the comment
  property lists his text properties. Pre-select Face / Lead / comment on phase when
  they exist. Free text stays available as a fallback if the check has not been run.
- a line saying plainly what happens: every new request becomes a card in that
  database, in that column, with all the answers as text.
- a visible **off** state: Notion delivery is off, and he can turn it off without
  deleting the token.
- after saving, re-run the check and show the result, so he never leaves the screen
  not knowing whether it works.
- the existing "send to Notion" marks and the resend button on the Leads screen stay
  as they are.

**4. Do not break what is there.** Pavel's 230 checks in `worker/test.sh` must all
still pass; add checks for the new endpoints: saving, the masked read-back, the URL
being turned into an id, each of the four failure causes, KV overriding the
environment, and the Worker making no Notion call while it is off.

## Done means

`worker/test.sh` green in full, with the tail of the output in your report.
`npx wrangler deploy --dry-run` succeeds. `npm run build` green, `npx astro check` 0
errors. You have driven the new screen in a browser against `npx wrangler dev` and a
mock Notion: saved a token, pasted a database URL, run a check that succeeded and one
of each failure, picked the names from the drop-downs, turned Notion off and on, and
seen a lead arrive as a card. Say what you did and what you saw, and say plainly what
is unproven because neither of us has a Notion account.

Report in English. Ask your questions in English.

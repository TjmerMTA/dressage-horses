# Status

Notebook v1 — updated 2026-11-05 12:10

**Last time:** the quiz was connected to Notion, and the connection was made settable
from the admin instead of the command line. Both pieces merged; the site rebuilt
(commit `e190738`, live) and the Worker deployed (version `bc1c579a`, live). The new
addresses answer. The final account is
`jobs/2026-11-04-horse-site/receipt.md`, with the Notion work in its addendum.
**Waiting on you:**
1. the client to paste the Notion key and the database link into the admin's **Notion**
   screen (or to give access by e-mail to nazar82666@gmail.com so it can be done for
   him) — the code is live, the connection is not
2. the company's own facts: registered name, legal form, registered office, enterprise
   number, VAT number, e-mail
3. the client to choose A, B or neither at https://dev.siteboosty.com/sketch/photos/
4. the client to say whether he wants the mock-up's original English back
5. the privacy policy and the imprint to be read and ticked as reviewed
**Next:** nothing is running. The team is empty.

## What exists

- https://dev.siteboosty.com — one page, plus /privacy/, /imprint/, a 404 page,
  /admin/, and the unlinked /sketch/photos/.
- `TjmerMTA/dressage-horses` — public, GitHub Actions builds on every push.
  `/version.json` on the live site reports the commit it was built from.
- Cloudflare Worker `dressage-horses-api` with KV — leads, sessions, the admin API,
  the GitHub write path, and the Notion delivery with its settings under `notion:config`.
  The leads store is empty: every test lead was deleted on 2026-11-05.
- Secrets in Cloudflare: `ADMIN_PASSWORD_HASH`, `GITHUB_TOKEN` (set and working, but the
  person's wide `gh` OAuth token — to be replaced by a fine-grained one).
  `NOTION_TOKEN` as a secret is no longer needed; the key goes in the admin.

## Pieces

Thirteen merged: skeleton-landing, photos, api-worker, catalog (later removed),
admin-panel, placeholders, speed, polish, trust, one-page, photos-sketch, acceptance,
notion, notion-settings.

## Cost

The job: estimated 8–15% of the week, 7.1% spent. The Notion addition: about 1.5% more.
The week stood at 57% when the job began, 70% when it ended, and about 75% after Notion.

# Status

Notebook v1 — updated 2026-11-09 16:00

**Last time:** 09.11 — consent checkbox under the quiz form removed, text kept as a notice; privacy page wording updated (c5cc6af). Before that: the site moved to https://koni.quest (HTTPS on, dev.siteboosty.com no longer
serves it); the thank-you page /thanks/ and the Meta Pixel setting (admin → Texts, behind a
consent banner) are live, build `c02c905`.
**Waiting on you:** the Meta Pixel id pasted in the admin; one real test lead from the site;
the client's GitHub login for moving the repository; the older items below (company facts,
photos A/B, privacy/imprint review).
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

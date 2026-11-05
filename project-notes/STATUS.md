# Status

Notebook v1 — updated 2026-11-05 09:05

**Last time:** the job finished. The site is live and one page again, at the client's
word; the tester passed it after three rounds; acceptance passed ten of eleven
scenarios. The final account is `jobs/2026-11-04-horse-site/receipt.md`.
**Waiting on you:**
1. the Cloudflare secret `GITHUB_TOKEN` is empty — nothing in the admin can save until
   it is set (dashboard → Workers & Pages → dressage-horses-api → Settings →
   Variables and Secrets → Edit)
2. the company's own facts, and the Instagram / TikTok / WhatsApp addresses
3. the client to choose A, B or neither at https://dev.siteboosty.com/sketch/photos/
4. the client to say whether he wants the mock-up's original English back
**Next:** nothing is running. The team is empty.

## What exists

- https://dev.siteboosty.com — one page, plus /privacy/, /imprint/, a 404 page,
  /admin/, and the unlinked /sketch/photos/.
- `TjmerMTA/dressage-horses` — public, GitHub Actions builds on every push.
- Cloudflare Worker `dressage-horses-api` with KV `DH_KV` — leads, sessions, admin API.
  The leads store is empty: every test lead was deleted on 2026-11-05.

## Pieces

All eleven merged: skeleton-landing, photos, api-worker, catalog (later removed),
admin-panel, placeholders, speed, polish, trust, one-page, photos-sketch, acceptance.

## Cost

Estimated 8–15% of the week, 7.1% spent. The week stood at 57% when the job began and
70% when it ended.

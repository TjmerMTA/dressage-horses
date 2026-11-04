# Status

Notebook v1 — updated 2026-11-04 14:55

**Last time:** the site went live on https://dev.siteboosty.com — landing, five inner
pages and a catalogue of 8 sample horses. Lighthouse on the live domain: 100/100/100/100
on the home page (mobile and desktop), 96–97 performance on the catalogue pages.
**Waiting on you:** the two Cloudflare secrets (`ADMIN_PASSWORD_HASH`, `GITHUB_TOKEN`) —
without them the admin panel cannot log in or save.
**Next:** Viktor finishes the admin panel; then the speed pass, then blind acceptance.

## Who does what

| Piece | Size | Who | State |
|---|---|---|---|
| skeleton-landing | L | Anna (dismissed) | merged, live |
| photos | M | Photos (dismissed) | merged |
| api-worker | L | Viktor | merged, not deployed |
| catalog | L | Boris (dismissed) | merged, live |
| admin-panel | L | Viktor | building |
| speed | M | — | planned |
| acceptance | M | — | planned |

## Still empty on the site

Company name, WhatsApp number, social links, the imprint text, and the privacy policy
needs a real review. The 8 horses are samples, marked `sample: true` in their files;
their names, pedigrees, prices and sex are invented, the colours match the photographs.

## Cost

First estimate 8–15% of the week; stop line 20%. The week stood at 57% when the job
began.

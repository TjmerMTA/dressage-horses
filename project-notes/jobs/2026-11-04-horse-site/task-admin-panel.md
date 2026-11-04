# Task card — piece `admin-panel` (size L) — Dina

Rows covered: R02

Starts after `skeleton-landing` is merged and Viktor's `worker/README.md` exists, so
you know the exact endpoints. Read CONTEXT.md in this folder and
`worker/README.md` first. Reuse Anna's CSS tokens so the admin looks like the site.

## Goal

A panel the owner of the business — not a programmer — can use to run the site.

## What to do

`/admin/` as a single Astro page with plain JavaScript, no framework, no build step of
its own, excluded from the sitemap and blocked in `robots.txt`. It talks only to the
Cloudflare Worker.

Screens:

1. **Login** — one password field, error on a wrong password, the session token kept
   in `sessionStorage` (not `localStorage`), automatic logout when the Worker answers
   401, and a visible "Log out".
2. **Leads** — newest first, with date, name, region, budget, buying format and
   contact; a date filter, a search box, "download as CSV", and a count. Make a brand
   new lead obvious. This is the screen that opens after login.
3. **Horses** — a table of everything in the catalogue with its cover photo, name,
   price and whether it is published or sold. Buttons: add, edit, duplicate, mark
   sold, publish/unpublish, delete (delete asks twice).
   The edit form covers every field of the collection schema, with real validation and
   human error messages. Photographs: drag-and-drop or pick, show a preview before
   upload, allow reordering, the first one is the cover. The form saves by writing the
   markdown file through the Worker.
4. **Texts** — edit the home page texts in `src/content/texts/home.json` through
   friendly labelled fields, not raw JSON. Also the WhatsApp number, the company name,
   and the privacy and imprint pages.
5. **After saving**, tell the truth about what happens: the change is committed and
   the site rebuilds in about a minute. Show a live "publishing…" state that polls the
   GitHub Actions run and turns into "published" when the site is live. Never pretend
   a change is live before it is.

Rules: no password or token is ever logged or put in a URL. Every destructive action
is confirmed. Every form works with the keyboard alone and every field has a label.
The panel must be usable on a phone.

## Done means

You have driven the whole panel yourself against the Worker running locally
(`npx wrangler dev`): logged in, seen a lead you posted through the public endpoint,
created a horse with two photographs, edited it, unpublished it, deleted it, and
edited a text. Say in your report what you did and what you saw. `npm run build` green.
Committed in your copy.

Report in English. Ask your questions in English.

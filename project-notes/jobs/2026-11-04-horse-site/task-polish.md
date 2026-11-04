# Task card — piece `polish` (size L) — Dmitri

Rows covered: R01, R02, R09

Read CONTEXT.md in this folder and `reports/whole-site.md` in the repo root. Findings
4, 5, 7, 8, 9, 11, 12, 13, 16, 17, 18 and 19 are yours, with their exact strings and
reproduction steps. Quote Egor's numbering in your report, and say for each one what
you did or why you left it.

**Files you own.** Clara is working at the same time on the imprint, the privacy
policy, the contact page, the horse card and the horse page, and on a message form in
`worker/`. Do not touch `src/content/pages/imprint.md`, `src/content/pages/privacy.md`,
`src/pages/contact.astro`, `src/components/HorseCard.astro`,
`src/pages/horses/[slug].astro` or `worker/src/` — if a fix of yours needs one of them,
tell the director instead of editing it. Everything else is yours.

## What to do

**Bugs**
- **4 — the admin's lead list hides the horse.** A lead sent from a horse page keeps the
  horse only inside the `page` address. Add a Horse column (or a line under the name) to
  the list and a `horse` column to the CSV, derived from the stored page address. The
  admin's JavaScript is yours; the Worker's CSV writer is not — if the column has to be
  produced there, tell the director.
- **5 — a mistyped address shows GitHub's own 404 page**, with GitHub branding and no way
  back. Add `src/pages/404.astro` in the site's own look, with links to the home page and
  the catalogue. Check it on the live site after it is deployed.
- **11 — the mobile menu will not close.** Escape must close it and return focus to the
  Menu button; a tap or click outside must close it. It is a `<details>` element today.
- **12 — quiz errors are not tied to their fields.** Give each invalid field
  `aria-invalid` and `aria-describedby` pointing at its own message, clear the message as
  soon as the field becomes valid rather than at the next submit, and mark the field
  itself, not only the text.
- **13 — arriving from "Ask about <horse>" leaves focus at the top of the page.** Move
  focus into the quiz, as the page already moves the scroll.
- **16 — the quiz box changes height between steps** and shoves the page below it. Give it
  a stable height, or animate it, so nothing jumps.
- **17 — a minimum price above the maximum** just reports "0 horses". Say what is actually
  wrong, next to the two fields.
- **18 — the CSV has no byte-order mark**, so Excel on Windows will mangle the € sign. The
  CSV is written by the Worker, which is not yours: verify the claim first (download it
  and look at the first bytes), then tell the director exactly what to change. Also, the
  list shows local time while the CSV is UTC; make the list say which zone it is showing.

**English (finding 9).** Egor listed the exact strings and where they are. Fix all of
them except the home-page H1, which is the client's own headline and stays. Watch for
"Level Level L" in the horse facts table — that is a template bug, not a typo. Keep the
tone of the mock-up: plain, confident, no marketing froth.

**7 — "Answer three questions"** appears on the catalogue and every horse page, while
everywhere else says four. The quiz has four steps. Make it four.

**8 — the sold-horse panel** says "Tell us what you liked about it and we find you a
similar one", and the button goes to a quiz with no free-text field. Clara is adding a
message form on the contact page; point this panel at something that can actually take
the sentence, and fix the grammar.

**19 — accessibility leftovers.** The footer logo is decorative, so `alt=""`. The horse
page has two `<h2>Facts</h2>`. Photo alt texts lead with the person rather than the
horse on a page that sells the horse — rewrite the ones used on horse pages so the horse
comes first, keeping them truthful to the picture (the descriptions are in
`project-notes/jobs/2026-11-04-horse-site/PHOTO-CATALOGUE.md`). And the quiz box is
empty without JavaScript, on the main conversion path: at the very least it should say
what it is and point to the contact page.

**Leave alone, and say so in your report:** findings 14 (filters push the first horse
below the fold on a phone) and 15 (uneven galleries, portrait photos in wide frames)
are design choices for the client, not yours. Do not change the look to fix them.

## Done means

`npm run build` green, `npx astro check` 0 errors, the catalogue pages still score 99+
on Lighthouse mobile locally, and you have reproduced each bug before fixing it and
re-checked it after. Drive the admin against `npx wrangler dev` for finding 4. Say what
you ran and what you saw, finding by finding. Run npm with its own `--cache` path in
your scratchpad.

Report in English. Ask your questions in English.

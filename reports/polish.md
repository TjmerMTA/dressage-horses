# Polish piece — Dmitri · 2026-11-04

Findings from `reports/whole-site.md` (Egor's numbering). Everything was reproduced on
`npx astro dev` (and the admin against a local `npx wrangler dev` with throw-away
credentials) before the change and re-checked after it. Phone checks ran in a 390 px
same-origin iframe, like Egor's; key presses were synthetic `KeyboardEvent`s, not a
real phone.

**Needs the director:** three fixes live in files that are not mine. Each one is a
ready patch in `reports/handoff/`, tested in a build and then reverted (see 4, 8, 9, 19).

## Bugs

**4 — Admin lead list hides the horse.** *Before:* a lead with
`page = https://dev.siteboosty.com/#quiz?horse=herfstvuur` showed no horse.
*Done:* `src/scripts/admin/leads.js` reads the horse from the stored page address
(`#quiz?horse=` or `?horse=`) and shows "About Herfstvuur" under the name, linked to
`/horses/herfstvuur/`. The search box finds it too. The name comes from the slug
("donatello-b" → "Donatello B"), so "belle-epoque" reads "Belle Epoque" without the
accent. The link opens the real page. *After:* checked in the admin against wrangler dev.
**CSV `horse` column → director:** the CSV is written in `worker/src/leads.ts`, so that
change is in `reports/handoff/worker-csv-horse-column.patch` (adds `horse` after `page`).
Applied temporarily, it gave `"…#quiz?horse=herfstvuur","herfstvuur"` and an empty cell
for a home-page lead, `tsc` was clean and `./test.sh` passed 117/0. Then I reverted it.

**5 — GitHub's own 404 page.** *Before (live, still today):* `/no-such-page/` → 404,
title "Page not found · GitHub Pages". *Done:* `src/pages/404.astro` in the site's look
(header, menu, footer, two mock-up buttons: home page and all horses), `noindex`, texts
in `site.json → notFound`, editable in the admin. *After:* `dist/404.html` is built and
is not in the sitemap. Checked on the dev server. **Not yet checked on live:** it has not
been deployed. After the merge, check that `https://dev.siteboosty.com/no-such-page/`
shows "This page does not exist".

**11 — Mobile menu won't close.** *Before:* Escape and a click outside left the
`<details>` open. *Done:* a small script in `SiteNav.astro`: Escape (listened on the
document) closes it and puts focus on "Menu"; a click outside closes it. Without
JavaScript it still works as before. *After (390 px iframe):* open → Escape →
closed, focus on "Menu"; open → click on page text → closed; a click inside the menu
leaves it open. CONTEXT.md says "zero client JS except the quiz and the gallery". This
script is a fourth exception, and the card asked for exactly this behaviour.

**12 — Quiz errors not tied to their fields.** *Before:* after an empty submit there was
no `aria-invalid` or `aria-describedby`, the border stayed gold, and "Please enter your
name." stayed after typing. *Done:* each field points at its own message
(`f-name → e-name`, `f-wa → h-wa e-wa`, `f-consent → e-consent`), and an invalid field
gets `aria-invalid="true"`, a red border (`--err`), and a red outline on the checkbox.
A message clears as soon as the field becomes valid, and new messages appear only on
submit. Server-side field errors are marked the same way. *After:* empty submit →
all three `aria-invalid="true"`, border `rgb(179, 38, 30)`, focus on name. One
character → message stays. "Anna Test" → message gone, `aria-invalid` removed. Same for
the number and the checkbox.

**13 — Focus left at the top after "Ask about <horse>".** *Before:*
`/#quiz?horse=herfstvuur` → `activeElement` = `<body>`. *Done:* on arrival (and on a
later hash change) focus moves to the step question, with `aria-describedby="q-horse"`.
A screen reader hears "Where are you from?" and then "Your enquiry is about Herfstvuur",
and the next Tab goes to the first answer. A plain visit to `/` still does not take
focus. *After:* `activeElement` = `H3#q-title "Where are you from?"`.

**16 — Quiz box changes height.** *Before:* 407 → 407 → 349 → 714 px. *Done:* the
answer steps area is as tall as the tallest of the three answer steps. That height is
measured in an invisible copy at the current width and measured again when the width
changes. The bigger change to and from the contact step is animated (260 ms; skipped
with reduced motion) instead of jumping. *After:* desktop 344.94 / 344.94 / 344.94 →
651.87 px; 390 px phone 492.06 ×3 → 691.65 px; with a horse note 407 / 407 / 407.

**17 — Min price above max.** *Done:* "“Price from” is higher than “Price up to”. Choose a
lower minimum or a higher maximum." appears under the price fields. Both selects get
`aria-invalid` and `aria-describedby` and a red border, and the message is a polite
live region. *After:* `/horses/?min=100000&max=25000` shows the message and
"0 horses". Max set to €250,000 → message gone, attributes removed, "1 horse".

**18 — CSV byte-order mark.** *Checked:* there is no bug in the code. `worker/src/leads.ts`
has prepended `﻿` since its first commit (`1daefdc`). The local Worker's response
starts `ef bb bf 63 72 65 61 74 …` ("created_at"), and in the browser the admin's
`res.blob()` keeps those bytes (`ef bb bf 63`). Read as text (`blob.text()`,
`TextDecoder`), the same bytes start with `63` = "c", because decoding drops the BOM.
That is probably how "first byte c" was seen. I could not log in to the live Worker, so
**director, no Worker change needed; to confirm on live:** download the CSV from the admin
and run `xxd leads-*.csv | head -1`. It should start `efbb bf`. *Time zone (mine,
done):* the list now prints the zone with each time ("4 Nov 2026, 16:54 EET"), and the
intro says "Times are in your computer’s time zone (Europe/Kiev); the CSV file uses UTC."

## Text

**9 — English.** All fixed except the home-page H1, which I left as the card says:
"at every step" (home, services, about), "We have received your request.", "How it
works", "A Grand Prix rider rides the horse for you and supports you at the tryout."
(home, services), quiz intro "Answer 4 quick questions. We'll then contact you to go
through the details and prepare your selection.", "we'll look" / "we'll search" (also
in Quintessa's description) / "we'll find", "Everything arranged, right up to your
stable." (and "right up to your stable" on About), quiz submit "FIND ME A HORSE".
Not on Egor's list but the same fault: About's "Tryouts and support by a Grand Prix
rider" → "A Grand Prix rider who rides the horse for you at the tryout".
**"Level Level L" → director:** it is the template in `src/pages/horses/[slug].astro`
(Clara's), not a typo. I added `levelValue()` to `src/lib/horses.ts`;
`reports/handoff/horse-page-level-facts-sold.patch` makes the Facts row use it.
Tested in a build: Level = L / M / S / Prix St-Georges / Grand Prix / Young horse.

**7 — "three questions".** Now "Answer four questions…" (catalogue and horse pages).

**8 — Sold-horse panel.** The text is now "This horse is sold. Tell us what you liked
about this horse and we'll find you a similar one." **Button → director:** the button is
in `[slug].astro`. The same patch points it at `/contact/` (where Clara's message form
goes) with the label "TELL US WHAT YOU LIKED" (`catalogue.json → detail.soldButton`,
added). Until that is merged, the button still goes to the quiz. If Clara's form reads a
horse from the address, change the link to `/contact/?horse=<slug>`.

## 19 — Accessibility leftovers

- Footer logo: `alt=""` (rendered as an empty `alt`). Done.
- Two "Facts" headings → **director**, same `[slug].astro` patch: the hidden heading of
  the price box becomes "At a glance" (`detail.summaryTitle`, added).
- Photo alts on horse pages now name the horse first. Rewritten from PHOTO-CATALOGUE.md
  for Moonstone, Donatello B, Quintessa, Nachtwind (2), Herfstvuur (4 of 8) and Belle
  Époque (1). The others already led with the horse. The home and footer photos were not
  changed (they are not on horse pages).
- Quiz without JavaScript: the box now says "This quiz needs JavaScript, which is
  switched off in your browser. Contact us another way" (link to `/contact/`), and
  "Step 1 of 4" is hidden without JavaScript. It is un-hidden by an inline script
  during parsing, the same pattern as the catalogue filters, so no layout shift. Texts
  are in `home.json → quiz.noScript / noScriptLink`.

## Left alone, as the card says

- **14** (filters push the first horse below the fold on a phone) and **15** (thin
  galleries, portrait photos in wide frames) are design choices for the client. I did
  not touch the look.

## Speed (Lighthouse 13.6.0 mobile, local `astro preview`)

| Page | Score | LCP |
|---|---|---|
| `/horses/` | 100, 100 | 0.76 s |
| `/horses/moonstone/` | 100 ×5 | 1.13 s |
| `/horses/quintessa/` | 100, 100 | 1.28 s |
| `/horses/belle-epoque/` | 100 ×3 | 1.58 s |
| `/horses/herfstvuur/` | 99, 99, 99 | 1.96–2.03 s |
| `/` | 100, 100 | 1.88 s |

Accessibility, best practices and SEO were 100 on every page above. `/404.html` scores
SEO 69 only because it is `noindex`, on purpose.

Herfstvuur first measured 98/98. The base commit `c1b540b`, built and measured the same
way, also gave 98/99 (LCP 2.26–2.33 s), so I did not cause it. The cause is its eight
in-view thumbnails and photo 2 competing with the LCP photo. I set
`fetchpriority="low"` on the thumbnails and on photos 2+ in `HorseGallery.astro`: 99
×3, LCP down by about 0.3 s, the look unchanged.

## What I ran

`npx astro check` → 0 errors, 0 warnings. `npm run build` → 17 pages, green.
`worker/test.sh` (with the handoff patch applied) → 117 passed, 0 failed.
npm used `--cache …/scratchpad/npmcache-dmitri`. The Worker's `npm ci` refused because
its lock file is out of sync (missing `@img/sharp-linuxmusl-arm64`), so I installed it
with `--package-lock=false` and did not commit the lock file. That needs fixing
separately.

# Task card — piece `one-page` (size L) — Dmitri

Added 2026-11-05 after the client saw the site. This overrides parts of every earlier
card: where they disagree, this one wins.

## The client's own words (Telegram, translated from Ukrainian)

> Did you make several pages? We only need one, no navigation and no menu.
> The footer has no links to Instagram, TikTok and WhatsApp.
> The second block with our horses — it is not in the mock-up, we are removing it.
> Please add some emoji like ⬛ ⬜ ⚫ so the list doesn't look so dull.

The last one came with a screenshot of the quiz's first step ("Where are you from?":
USA / Canada, Europe, GCC (Gulf countries), Asia) on an iPhone.

## What to do

**1. One page.** The site becomes the single landing page of the mock-up again.
- Remove the header navigation and the phone "Menu" button entirely. The header keeps
  only the logo, exactly as the mock-up has it.
- Remove `/horses/` and every horse page, the featured-horses strip on the home page,
  `/services/`, `/about/` and `/contact/`, and every link to them.
- **Keep `/privacy/` and `/imprint/`.** The mock-up's own footer links to them, and the
  quiz collects personal data, so they have to exist. They stay reachable from the
  footer only. Clara is rewriting both — do not touch
  `src/content/pages/imprint.md` or `src/content/pages/privacy.md`.
- Delete the code, do not comment it out; git keeps the history if the client ever
  wants the catalogue back. Leave `src/content/horses/` and the photographs in the
  repository, unreferenced — the client may yet change their mind, and the photos cost
  nothing when nothing imports them.
- The admin panel keeps working: the Horses screen now manages a collection nothing
  renders. Leave it in place but say so plainly on that screen in one sentence, and
  keep "Before you go live" honest about what is actually on the site.
- Update the sitemap, `robots.txt` and the 404 page's links to match a one-page site.

**2. The footer's social links.** The client's complaint is that Instagram, TikTok and
WhatsApp are not there. They are not there because nobody has given us a handle or a
number, and Viktor's rule hides a link with no address rather than shipping a dead one.
Keep that rule — but make the absence impossible to mistake for an oversight:
- The three icons must appear the moment the values are filled in, with no code change.
- Check that the admin's "Before you go live" screen names exactly these three, with a
  one-line note of what the visitor sees meanwhile.
Change nothing else about them, and invent no handle.

**3. Emoji in the quiz.** The client finds the option lists dull and asked for emoji.
Add one to every option of all four steps — regions, budget, buying format, and
anything else the quiz lists. Choose them so they carry meaning, not decoration: a flag
or a globe for a region, money for a budget band, a plane or a screen for how they want
to buy. Keep the mock-up's restraint: one emoji, at the start of the line, same size as
the text, never two in a row. They must not break the layout at 320 px, must be hidden
from screen readers (`aria-hidden`) so the option still reads as plain words, and the
option must stay fully usable if the font has no glyph for one of them.

## Done means

`npm run build` green, `npx astro check` 0 errors, the build contains exactly these
pages: `/`, `/privacy/`, `/imprint/`, `/404.html`, and no link anywhere points at a
page that no longer exists. Check that with
`node ~/.claude/skills/астро/scripts/проверить-сборку.mjs dist --ожидать /,/privacy/,/imprint/`.
Open the page at 390 px and at 1280 px and compare it with the mock-up at
`project-notes/sketches/mockup-original.html` — apart from the real photographs and the
emoji, the home page should be the mock-up again. Say what you compared.

Report in English. Ask your questions in English.

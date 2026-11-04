# Task card — piece `catalog` (size L) — Boris

Rows covered: R01, R04, R09

Starts only after `skeleton-landing` is merged into `main`. Read CONTEXT.md and
PHOTOS.md in this folder first, and look at how Anna built the landing — you reuse
her components, her layout and her CSS tokens. Do not invent a second design language.

## Goal

A catalogue of horses: a list page people can filter, and a real page per horse.

## What to do

1. Content collection `horses` in `src/content.config.ts`, `glob()` loader over
   `src/content/horses/*.md`. Schema, all of it typed with zod:
   `name`, `slug`, `price` (number, EUR) or `priceOnRequest` (boolean), `currency`,
   `year` (number) → age is computed, `height` (cm), `sex` (`mare|gelding|stallion`),
   `colour`, `breed`, `country` (`BE|DE|NL`), `level`
   (`young horse|L|M|S|Prix St-Georges|Grand Prix`), `sire`, `dam`, `damsire`,
   `xrays` (`clean|minor findings|not done`), `video` (optional URL),
   `photos` (array of image references, first one is the cover), `sold` (boolean,
   default false), `featured` (boolean, default false), `published` (boolean,
   default true), `description` (the markdown body).
2. `/horses/` — the list. Cards with the cover photo, name, age, height, level,
   country, price. Filters that work **without any server**: sex, country, level,
   price range, and a sort (newest / price up / price down). Do it with plain
   JavaScript over data embedded at build time, and make the page usable with
   JavaScript switched off (everything visible, filters simply absent). Unpublished
   horses must be filtered out **both in the list and in `getStaticPaths`** — a filter
   in only one place leaves the page reachable by direct link.
   Sold horses stay visible with a "Sold" ribbon, at the end of the list.
3. `/horses/<slug>/` — the horse. Photo gallery (keyboard-accessible, no library,
   first image eager and everything else lazy), the full pedigree and facts table,
   the description, the video if there is one, and a clear enquiry call to action
   that carries the horse's name into the quiz (`/#quiz?horse=<slug>`) — make the
   quiz on the home page pick that up and show it on the first step.
4. Eight sample horses, built from the photographs Photos prepared (their catalogue
   file lists what is really in each picture — match the colour and the sex to the
   actual animal, never to a picture of a different horse). Mark them clearly in the
   front matter with `sample: true` so the client can find and delete them.
5. `/horses/` and every horse page need a `<title>`, a meta description, Open Graph
   tags and `Product`/`Offer` JSON-LD.
6. Add the catalogue to the header and footer navigation, and a "featured horses"
   strip of four on the home page above the quiz.

## Done means

- `npm run build` green; `node ~/.claude/skills/астро/scripts/проверить-сборку.mjs dist
  --ожидать /horses/,/horses/<one-real-slug>/ --запретить sample-unpublished` clean.
- An unpublished horse is in neither the list nor `dist`.
- Filters tested by hand in `npm run preview`, including an empty result.
- The gallery works with the keyboard alone.
- Committed in your copy.

Report in English. Ask your questions in English.

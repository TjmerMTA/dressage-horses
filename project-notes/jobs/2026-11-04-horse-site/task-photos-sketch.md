# Task card — piece `photos-sketch` (size M) — Lena

Added 2026-11-05. This is a sketch to be looked at, not a change to the live page.

## The problem

The client sent 32 photographs. Twenty-five survived preparation. **The site uses two
of them** — the hero and the band above the footer — because the mock-up has exactly
two photo places. The block that would have shown more (the horse catalogue) was
removed yesterday on the client's own instruction: "the second block with our horses —
it is not in the mock-up, we are removing it."

So two instructions pull against each other: use the photographs, and keep to the
mock-up. That is the client's call, not ours. Your job is to make the call easy by
showing them, not describing.

## What to do

Build **one page**, `src/pages/sketch/photos.astro`, that is not linked from anywhere,
carries `noindex, nofollow`, and shows **two contrasting ways** the photographs could
live on the one-page site. Each one rendered for real, in the site's own styles, with
the real photographs — not a mock-up of a mock-up.

**Variant A — a photo band.** A new full-width section, placed where it would go on the
real page (say between "How it works" and "Services"). On a phone it scrolls sideways
one photo at a time; on a desktop it is a row. No captions, no names, no prices — this
is atmosphere, not a catalogue. Eight to twelve photographs, chosen for variety: under
saddle, in hand, indoors, outdoors, close and wide. Use
`project-notes/jobs/2026-11-04-horse-site/PHOTO-CATALOGUE.md` for what is actually in
each picture, and its alt texts.

**Variant B — photographs inside the blocks that already exist.** No new section at
all: a photograph behind or beside each of the four "How it works" steps and each of
the four "Services" cards. Eight photographs, no new block, the page's shape unchanged.
This is the conservative one; make it genuinely good rather than a straw man.

Above each variant put one short line of plain English saying what it costs: how many
more photographs it puts on the page, and what it does to the page weight and to the
largest image the phone must download. Measure that, do not estimate it.

At the top of the page, one sentence saying this is a sketch for a decision, with
today's date. Nothing on it may imply it is live.

## Rules

- Do not touch `src/pages/index.astro` or any component the live page uses. Copy a
  component and change the copy if you need to; the live page must build byte-identical
  to what it is now. Prove that.
- Keep the mock-up's design language in both variants. No new colours, no new fonts.
- Lazy-load everything on the sketch page; it is allowed to be heavier than the live
  page, but say by how much.
- Every photograph needs its real alt text from the catalogue file.

## Done means

`npm run build` green, `npx astro check` 0 errors, the live page unchanged (show the
diff of `dist/index.html` against main's build — it must be empty), and
`/sketch/photos/` opens and looks right at 390 px and 1280 px. Report the two cost
lines you measured.

Report in English. Ask your questions in English.

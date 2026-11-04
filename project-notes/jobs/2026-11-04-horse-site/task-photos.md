# Task card — piece `photos` (size M) — Photos

Rows covered: R04

## Goal

Every usable photograph from `/Users/nazar/Downloads/` prepared for the site, with an
honest description and English alt text, so other members can just pick one by name.

## What to do

Work in `/Users/nazar/dressage-horses-photos/` (create it; it is NOT inside the git
repository, so you cannot break anybody's work).

1. The file list is in
   `/Users/nazar/dressage-horses/project-notes/jobs/2026-11-04-horse-site/PHOTOS.md`.
   There are 32 of them. **Open and actually look at every one** (make a small
   `sips -Z 500` copy first so it is cheap to view).
2. Throw out anything that is not usable on a horse-dealer website (duplicates,
   blurred frames, screenshots, pictures with no horse in them). Say which you dropped
   and why.
3. For each keeper, write a row in `/Users/nazar/dressage-horses-photos/catalog.md`:
   - new file name: `horse-<two-or-three-english-words>.jpg` (e.g. `horse-grey-extended-trot.jpg`)
   - one sentence describing what is really in the picture (colour of the horse,
     what it is doing, under saddle or in hand, people present, setting, mood)
   - English alt text, 8–16 words, useful to someone who cannot see it
   - orientation (landscape / portrait) and the best use: hero, catalogue card,
     gallery, about-block, background
4. Produce for each keeper a cleaned master JPEG in
   `/Users/nazar/dressage-horses-photos/masters/`: the new name, rotated upright,
   stripped of EXIF **including GPS**, longest side capped at 2400 px, quality 82.
   `sips` is installed; `cwebp` and `avifenc` are installed; ImageMagick is **not**.
   Do not generate AVIF/WebP — the Astro build does that. Masters only.
5. Check every output file opens and has the dimensions you expect. Report the total
   size of the `masters/` folder.

Do not commit anything to the git repository — your folder is outside it. When you are
done, report the path and the list; the director copies them in.

Report in English. Ask your questions in English.

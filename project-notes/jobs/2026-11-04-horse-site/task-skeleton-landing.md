# Task card — piece `skeleton-landing` (size L) — Anna

Rows covered: R01, R03, R05, R09 (partly R04, R06, R07)

## Goal

A real Astro 7 project in this repository whose home page is the client's mock-up,
pixel-faithful, rebuilt properly, with real photographs, and a working deploy to
GitHub Pages at https://dev.siteboosty.com.

## What to do

1. `npm create astro@latest` style scaffold **inside the existing repo root**
   (`/Users/nazar/dressage-horses` — your own copy of it). Astro 7, TypeScript strict,
   `output: 'static'`, `site: 'https://dev.siteboosty.com'`, `build.format: 'directory'`.
   Do not delete `project-notes/`.
2. Port `project-notes/sketches/mockup-original.html` into components under
   `src/components/` and a layout under `src/layouts/`. Keep the markup, the CSS and
   the quiz JavaScript behaviour identical. Split the one big `<style>` block into
   a global stylesheet (tokens, resets, buttons, typography) plus per-component styles.
   The rendered page must be visually indistinguishable from the mock-up.
3. Replace the two grey photo placeholders (`#photo-hero`, `#photo-contact`) with real
   photographs through Astro's `<Image>`/`<Picture>`:
   - hero: `/Users/nazar/Downloads/DSC_0843.jpg` (grey horse in extended trot)
   - contact band: `/Users/nazar/Downloads/IMG_1444.JPG` (bay horse with a braided mane)
   Copy them into `src/assets/`, give them real English `alt` text. The hero image is
   the LCP element: `loading="eager"`, `fetchpriority="high"`, correct `widths`/`sizes`,
   AVIF + WebP + JPEG fallback. Everything else lazy.
4. Make the texts come from `src/content/texts/home.json` through a content collection
   (`file()` loader), not hard-coded in the components — the admin panel will edit that
   file later. Keep the exact wording of the mock-up as the current values.
5. Pages to create now (header/footer navigation across all of them):
   `/` (the landing), `/services/`, `/about/`, `/contact/`, `/privacy/`, `/imprint/`.
   The last four may be short but must be real pages in the mock-up's style, not
   "coming soon". `/horses/` is somebody else's piece — just link to it in the nav.
6. `public/CNAME` containing `dev.siteboosty.com`, plus `public/robots.txt` and a
   `@astrojs/sitemap` sitemap.
7. GitHub Actions workflow `.github/workflows/deploy.yml`: on push to `main`, build and
   publish to GitHub Pages (`actions/deploy-pages`). Do **not** try to push or run it —
   the director will. Just leave it correct and committed.
8. A `README.md` at the repo root: what this is, how to run it, how to deploy.

## Done means

- `npm run build` green, no new warnings.
- `node ~/.claude/skills/астро/scripts/проверить-сборку.mjs dist --ожидать /,/services/,/about/,/contact/,/privacy/,/imprint/`
  finds nothing wrong.
- `npm run preview` serves the site and the quiz works end to end (all 4 steps, back
  button, thank-you screen).
- Total blocking CSS/JS on the home page is small; no render-blocking script in `<head>`.
- You have looked at the built page yourself (screenshot or a text dump) and compared
  it with the mock-up, and you say in your report what you compared and what differs.
- Everything committed in your copy.

Report in English. Ask your questions in English.

# Dressage horses — website

The website of a Belgian company that finds dressage horses in Belgium, Germany and the
Netherlands for buyers all over the world. Built with [Astro 7](https://astro.build) as a
fully static site and published on GitHub Pages at **https://dev.siteboosty.com**.

The design comes from the client's mock-up,
`project-notes/sketches/mockup-original.html`. The site is that mock-up rebuilt as
components: one landing page with no navigation, plus the privacy policy and the imprint,
which are linked from the footer only (as in the mock-up) and reuse its styles.

## Pages

| URL | Source |
|---|---|
| `/` | `src/pages/index.astro`: hero, the 4-step quiz, how it works, services, footer |
| `/privacy/` | `src/content/pages/privacy.md` |
| `/imprint/` | `src/content/pages/imprint.md` |
| `404.html` | `src/pages/404.astro`: any address that does not exist |

Until 2026-11-05 the site also had a horse catalogue, a page per horse, and Services,
About and Contact pages. The client asked for one page again; that code is in the git
history (before the commit that removed it).

## Run it locally

Requires Node.js 22.23.4 or newer.

```bash
npm install
npm run dev       # development server, http://localhost:4321
npm run build     # static build into dist/
npm run preview   # serve the built dist/ exactly as it will be published
npm run check     # TypeScript / Astro type check
```

## Editing content

All page text lives in files in the repository (no database), so every change has a
history, and the admin panel can edit the same files through the GitHub API.

- `src/content/texts/home.json`: every text on the home page, including the quiz
  questions, answers (each with an optional single emoji, `icon`, shown before it and
  hidden from screen readers; leads store only the words), field labels, error messages
  and the thank-you screen. Also the
  hero photo, its alt text and an optional `photoPosition` (wide-screen crop focus,
  CSS `object-position`, e.g. `"10% 40%"`).
- `src/content/texts/site.json`: shared across all pages: company name (`brand`,
  shown in the footer), logo and its alt text, the Instagram / TikTok / WhatsApp
  links, the footer (closing call to action, photo, privacy and imprint links), the
  404 page's texts, and
  `endpoint`, an optional override of the address the quiz POSTs leads to. Leave it
  empty: the quiz sends leads through `src/scripts/lead-form.js` to the Worker named in
  `src/scripts/api-base.js`.
  **Empty means "not set", and nothing unset is ever shown:** a social link without a real
  profile is not rendered, the WhatsApp buttons appear only with a real number (otherwise
  visitors use the quiz, and the texts with a `…NoWhatsapp` variant switch to it), and an
  empty `brand` shows `siteTitle` instead. The rules live in `src/scripts/site-values.js`.
- `src/content/pages/privacy.md`, `imprint.md`: legal pages in Markdown. The company's
  legal facts are front-matter fields of `imprint.md` (`companyName`, `legalForm`,
  `address`, `enterpriseNumber`, `vatNumber`, `email`); empty ones are named on the page
  as "being added". `privacy.md` has `reviewed: false` until the company approves the text.
  The admin's **Before you go live** screen lists every value still unset.
- `src/content/horses/<slug>.md`: one file per horse. **Nothing on the site shows them
  at the moment** (one page, no catalogue); the files, the photos and the admin's Horses
  screen are kept so the catalogue can come back. The front matter holds the facts
  (`name`, `slug`, `price` or `priceOnRequest: true`, `year` of birth, `height` in cm,
  `sex`, `colour`, `breed`, `country`, `level`, `sire`, `dam`, `damsire`, `xrays`,
  optional `video`, `photos` with the cover first, optional `photoAlt` in the same order,
  optional `listed` date for the "Newest" sort) and the switches `sold`, `featured` and
  `published`. The Markdown below it is the description. Photos are checked as paths
  only, so no horse photo is copied into the build while nothing shows them. Horses marked `sample: true` are demo horses shipped with the site; delete those files
  (including `sample-unpublished.md`, which only tests the unpublished filter) when the
  real horses are in.

Every file is validated at build time by the schemas in `src/content.config.ts`. A
missing field or a mistyped key fails the build with a message naming the field, so
a broken edit never reaches the live site.

Photos are in `src/assets/horses/` (see
`project-notes/jobs/2026-11-04-horse-site/PHOTO-CATALOGUE.md`). Astro turns them into
AVIF, WebP and JPEG in several sizes during the build. Reference them from the JSON
files with a path relative to that file, e.g.
`"../../assets/horses/horse-grey-extended-trot.jpg"`.

## Admin panel

`/admin/` (not in the sitemap, disallowed in `robots.txt`, `noindex`). The owner logs in
with the admin password and can read the quiz leads (CSV download included), add, edit,
duplicate, hide, sell and delete horses with their photos (not shown on the site at the
moment), and edit every text file
above through labelled fields. Each save is a commit on `main`; the panel then shows
"publishing…" until `/version.json` on the live site reports that commit.

- Code: `src/pages/admin/index.astro`, `src/scripts/admin/*.js`, `src/styles/admin.css`.
- Its server is the Cloudflare Worker in `worker/` (see `worker/README.md`). The Worker's
  address is set once in `src/scripts/api-base.js` (`PRODUCTION_API`), or at build
  time with `PUBLIC_API_BASE`.
- Locally: run `npx wrangler dev` in `worker/` with `ALLOWED_ORIGINS` including your
  dev origin (e.g. `http://localhost:4321`), then `npm run dev`. A page on localhost
  talks to `http://127.0.0.1:8787` automatically.

## How it is built

- `src/styles/global.css`: the mock-up's tokens, reset, typography, buttons, tick
  lists and cards. Each component keeps its own part of the mock-up's CSS in its
  `<style>` block. Directional properties are written as logical properties.
- `src/layouts/BaseLayout.astro`: `<head>` (title, description, canonical URL,
  Open Graph), skip link, and the site footer (`ContactBand`).
- `src/components/`: `Hero`, `Quiz`, `HowItWorks`, `Services`, `ContactBand`,
  `SocialLinks`, `StickyCta` (home page), `SiteNav`, `PageHeader`, `CtaPanel`,
  `LegalPage`.
- Client JavaScript: only the quiz and the sticky phone button, both small enough
  that Astro inlines them as deferred module scripts. Nothing render-blocking.
- `@astrojs/sitemap` writes `sitemap-index.xml`; `public/robots.txt` points to it.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci`, `npm run build`,
then the `dist/` folder is published with `actions/deploy-pages`. A deploy takes
about a minute.

One-time setup in the GitHub repository (`TjmerMTA/dressage-horses`):

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Pages → Custom domain: `dev.siteboosty.com`**, then tick
   **Enforce HTTPS** once the certificate is issued. (`public/CNAME` holds the same
   domain.)
3. DNS already points `dev.siteboosty.com` (CNAME) to `tjmermta.github.io` (checked
   2026-11-04), so no DNS change is needed. But GitHub Pages serves only one
   repository per custom domain: remove the domain from the repository that uses it
   now (`pflegedienst-alno`, Settings → Pages) before adding it here. That repository
   itself stays untouched.

You can also start a deploy by hand: **Actions → Deploy to GitHub Pages → Run
workflow**.

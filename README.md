# Dressage horses — website

The website of a Belgian company that finds dressage horses in Belgium, Germany and the
Netherlands for buyers all over the world. Built with [Astro 7](https://astro.build) as a
fully static site and published on GitHub Pages at **https://dev.siteboosty.com**.

The design comes from the client's mock-up,
`project-notes/sketches/mockup-original.html`. The home page is that mock-up rebuilt as
components, and the inner pages reuse its styles.

## Pages

| URL | Source |
|---|---|
| `/` | `src/pages/index.astro`: hero, the 4-step quiz, how it works, services |
| `/services/` | `src/pages/services.astro` + `src/content/texts/services.json` |
| `/about/` | `src/pages/about.astro` + `src/content/texts/about.json` |
| `/contact/` | `src/pages/contact.astro` + `src/content/texts/contact.json` |
| `/privacy/` | `src/content/pages/privacy.md` |
| `/imprint/` | `src/content/pages/imprint.md` |
| `/horses/` | linked from the navigation; built by the catalogue piece |

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
  questions, answers, field labels, error messages and the thank-you screen. Also the
  hero photo, its alt text and an optional `photoPosition` (wide-screen crop focus,
  CSS `object-position`, e.g. `"10% 40%"`).
- `src/content/texts/site.json`: shared across all pages: company name (`brand`,
  shown in the footer), logo and its alt text, the Instagram / TikTok / WhatsApp
  links, the main navigation, the footer (closing call to action, photo, links), and
  `endpoint`, the address the quiz POSTs leads to. While it is empty, the quiz shows
  the thank-you screen but sends nothing.
- `src/content/texts/services.json`, `about.json`, `contact.json`: the inner pages.
- `src/content/pages/privacy.md`, `imprint.md`: legal pages in Markdown.

Every file is validated at build time by the schemas in `src/content.config.ts`. A
missing field or a mistyped key fails the build with a message naming the field, so
a broken edit never reaches the live site.

Photos are in `src/assets/horses/` (see
`project-notes/jobs/2026-11-04-horse-site/PHOTO-CATALOGUE.md`). Astro turns them into
AVIF, WebP and JPEG in several sizes during the build. Reference them from the JSON
files with a path relative to that file, e.g.
`"../../assets/horses/horse-grey-extended-trot.jpg"`.

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

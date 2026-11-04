# Shared context — dressage horse site (read this first)

Notebook v1 — updated 2026-11-04

## What we are building

A full website for a Belgian company (6+ years) that finds **dressage horses** in
Belgium, Germany and the Netherlands for clients worldwide. The client supplied a
single-file HTML mock-up and 32 professional horse photographs. Language: **English only**.
It will be shown to real people as a demo, so it must look finished, not like a draft.

## Where things are

- Project root: `/Users/nazar/dressage-horses` (git, branch `main`)
- Mock-up (design source of truth): `/Users/nazar/dressage-horses/project-notes/sketches/mockup-original.html`
- Original photos: `/Users/nazar/Downloads/` — see `PHOTOS.md` in this folder for the list
- Live address when done: **https://dev.siteboosty.com** (GitHub Pages, repo `TjmerMTA/dressage-horses`)

## Stack (decided, do not change without asking the director)

- **Astro 7**, `output: 'static'`, TypeScript, no UI framework. Zero client JS except the
  quiz and the gallery (plain vanilla, no libraries).
- Content as files in the repo: `src/content/horses/*.md` (content collection with
  `glob()` loader), `src/content/texts/*.json` for editable page texts.
- Images: `src/assets/` + Astro `<Image>`/`<Picture>`, AVIF + WebP, responsive `widths`,
  `loading="eager" fetchpriority="high"` for the LCP image only, everything else lazy.
- Deploy: GitHub Actions → `gh-pages` branch → GitHub Pages, custom domain
  `dev.siteboosty.com` (CNAME file in `public/`).
- Admin: a small vanilla-JS single page at `/admin/` on the same site, talking to a
  **Cloudflare Worker** API (password login, leads in KV, content written back to the
  GitHub repo through the GitHub Contents API, which triggers a rebuild).

## Astro 7 traps (this version, not the one you remember)

- Config file is `src/content.config.ts` (NOT `src/content/config.ts`).
- Every collection needs a `loader` (`glob()` / `file()` from `astro/loaders`); there is
  no `type: 'content'`.
- `getEntry()` and `entry.id` (no `getEntryBySlug`, no `entry.slug`).
- `import { render } from 'astro:content'` → `await render(entry)`; not `entry.render()`.
- `<ClientRouter />` from `astro:transitions`, not `<ViewTransitions />`.
- Component names must start with a Latin capital letter.
- `build.format: 'directory'` → URLs end in `/`.
- When unsure about an API, grep `node_modules/astro/dist/core/config/schemas/base.js`
  and `node_modules/astro/dist/core/errors/errors-data.js` instead of trusting memory.

## House rules

- Keep the mock-up's visual design: colours, the serif/sans pairing, the chunky
  3D-shadow buttons, rounded pills, the warm cream/gold/dark-brown palette. Do not
  redesign. Reuse its CSS; split it per component but keep the look identical.
- Accessibility: visible focus rings, `alt` on every image, one `<h1>` per page,
  labels on every form field.
- Logical CSS properties (`margin-inline-start`, not `margin-left`).
- Commit in your own copy, often, with clear messages. Only committed work comes back.
- `npm run build` must pass green before you say a piece is done. Report what you
  actually checked.

Report in English. Ask your questions in English.

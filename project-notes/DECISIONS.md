# Decisions

Notebook v1 — updated 2026-11-04

All of these were taken by the director, not the client, under the client's standing
rule "do not ask, choose the sensible option and say what you assumed". Any of them
can be overturned by one word from the client.

## 2026-11-04 — A new repository, `TjmerMTA/dressage-horses`
Why: the client asked to keep the old site on git. `dev.siteboosty.com` is currently
served by the repo `pflegedienst-alno` (gh-pages). A new repo takes over the domain
and leaves that repo untouched; it keeps living at its github.io address.
Revisit when: the client wants the Pflegedienst site back on that domain.

## 2026-11-04 — Astro 7, static, on GitHub Pages
Why: the client asked for git + fast on PageSpeed. A static build with no framework
and Astro's image pipeline is the cheapest route to a 95+ mobile score, and GitHub
Pages is the host their domain already points at.
Revisit when: the site needs server-rendered pages.

## 2026-11-04 — The admin panel is a page on the site plus a Cloudflare Worker
Why: GitHub Pages cannot run code, so "an admin panel" needs something behind it. The
client already has a Cloudflare account with Workers and KV. The Worker holds the
password and a GitHub token, stores leads in KV, and commits content changes back to
the repository, which rebuilds the static site in about a minute. The public site
therefore stays completely static and fast.
Revisit when: content changes need to appear instantly, or leads need a real database.

## 2026-11-04 — Content lives in the repository, not in a database
Why: it keeps the site static, gives every edit a history, and costs nothing.

## 2026-11-04 — English only for now
Why: the mock-up is in English and the audience is international buyers.
Revisit when: the client asks for German or Dutch.

## 2026-11-04 — A catalogue of horses was added, which the mock-up does not have
Why: the client asked for a "full" site rather than the one landing page, and a horse
dealer without a catalogue of horses is not a full site. The listings will be sample
entries built from the supplied photographs until the client gives real ones.
Revisit when: the client says the catalogue is unwanted, or hands over real listings.

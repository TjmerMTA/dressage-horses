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

## 2026-11-05 — The client: one page, no catalogue, no menu
Taken by the client (Danylo Shevchenko, by Telegram), overturning the director's
2026-11-04 decision to add a catalogue and inner pages. His words: "Did you make
several pages? We only need one, no navigation and no menu… The second block with our
horses — it is not in the mock-up, we are removing it."
What goes: the catalogue and every horse page, the featured strip, /services/, /about/,
/contact/, the header navigation and the phone menu.
What stays: /privacy/ and /imprint/, linked from the footer only, because the mock-up
links to them and the quiz collects personal data.
The catalogue code stays in git history and the photographs stay in the repository,
unreferenced, so it can come back cheaply.
Revisit when: the client asks for horses to be shown on the site.

## 2026-11-05 — Emoji in the quiz options
The client asked for them ("so the list doesn't look so dull"). One per option, chosen
for meaning, hidden from screen readers so the option still reads as plain words.

## 2026-11-05 — The footer's social links stay hidden until there are real values
The client's complaint was that Instagram, TikTok and WhatsApp are missing from the
footer. They are missing because nobody has given a handle or a number; the rule is to
hide a link with no address rather than ship a dead one. Kept. The three values are
waiting in the admin's "Before you go live" screen; filling them in makes the icons
appear with no code change.

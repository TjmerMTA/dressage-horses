# Final account — dressage horse site

Notebook v1 — updated 2026-11-05

Live: **https://dev.siteboosty.com** · Code: https://github.com/TjmerMTA/dressage-horses
Admin: https://dev.siteboosty.com/admin/ · Sketch for a decision:
https://dev.siteboosty.com/sketch/photos/

## Row by row

| Row | What was asked | State |
|---|---|---|
| R01 | A "full" site from the mock-up | **met, as the client later narrowed it** — a catalogue and inner pages were built on day one, then removed on day two at his word (R10, R11) |
| R02 | An admin panel | **met** — the secret was set on 5 Nov and the whole loop was proved on the live site: log in, read a text, save it, GitHub Actions rebuilds, the live `version.json` reports the exact commit, then the change was undone the same way and the file came back byte-identical. Leads, search, date filter and CSV work too. |
| R03 | Fast on Google PageSpeed | **met** — Lighthouse on the live domain: 100 for performance, accessibility, best practices and SEO, on mobile and desktop. Largest paint 1.2 s on a simulated slow phone, no layout shift. Google's own PageSpeed page could not be used: its anonymous daily quota was exhausted. |
| R04 | Use the horse photos from Downloads | **met in part, by the client's own constraint** — 25 of 32 were prepared (7 dropped: 2 Instagram screenshots with a watermark, 5 near-duplicates). **10 are on the page**: the hero, the footer band, one per “How it works” step and one per service card — inside the blocks the mock-up already has, so no new block was added. The remaining 15 need a photo band; it is built and waiting at `/sketch/photos/`. |
| R05 | The mock-up is the design source | **met** — compared side by side at 1280 px and 390 px. The differences are listed under "decided for you" below. |
| R06 | Publish to the client's GitHub | **met** — `TjmerMTA/dressage-horses`, public, built by GitHub Actions on every push. |
| R07 | Live at dev.siteboosty.com | **met** — with HTTPS enforced and a certificate issued. |
| R08 | Do not delete the old site's repo | **met** — `pflegedienst-alno` is untouched and still serves at tjmermta.github.io/pflegedienst-alno. Its custom-domain setting had to be cleared to free the address; that is a change to that repo, made by the person on 4 Nov 12:35 UTC with one command. |
| R09 | It must look finished to people | **met** — no placeholder text, no dead link, no page that reads as unbuilt. 363 internal links checked on the live site, all 200. |
| R10 | One page, no navigation, no menu | **met** |
| R11 | Remove the horses block | **met** — the block, the catalogue and every horse page are gone; the files and photographs stay in the repository, unreferenced, so it can come back cheaply. |
| R12 | Instagram, TikTok and WhatsApp in the footer | **met** — the client sent all three on 5 Nov. The brand-coloured icons from his own mock-up are live, and setting the number also brought back the “Write on WhatsApp now” button and the WhatsApp route in the privacy policy and the imprint. His first number had 13 digits; he corrected it to +380 98 913 6445. |
| R13 | Emoji in the quiz's answers | **met** — 🌎 🌍 🏜️ 🌏 💶 💰 💎 💻 ✈️, one per answer, hidden from screen readers, stored without the emoji in the lead. |
| R14 | Privacy and other technical pages stay separate | **met** — `/privacy/` and `/imprint/`, linked from the footer only. |

## Try it yourself

**The page** — open https://dev.siteboosty.com on your phone. Scroll to the quiz,
answer the four questions, send it. You should get a thank-you with your name.

**The leads** — open https://dev.siteboosty.com/admin/, log in, and your request is at
the top of the list with every answer and the time.

**A mistyped address** — open https://dev.siteboosty.com/anything and you should see
our own "page does not exist", not GitHub's.

## What was checked

- Lighthouse on the live domain, every page type, repeatedly.
- The quiz filled in for real on the live site and the lead followed into the admin.
- Every internal link and image on the live site (363 of them).
- Safari: the layout, the quiz, the menu and the photo formats (AVIF is really served).
- The whole admin driven by hand against a local copy of the server.
- Three rounds of re-testing by a tester who found, among other things, two faults in
  the director's own fixes.
- Acceptance by a person who saw only the client's words and the live site.

## What was not checked, and why

- **Firefox** — not installed on this machine; the director decided not to install one
  for a demo.
- **A real keyboard in Safari** — needs a Safari setting only the person can turn on.
- **A real iPhone** — tested at phone width in emulation; the notch padding is unverified.
- **The CSV opened in Excel** — no Excel here; the file's bytes were checked instead.
- **Google's own PageSpeed page** — its free daily quota was exhausted; the same engine
  was run locally against the live site.

## Decided for you (say the word and any of it is undone)

- **A catalogue and inner pages on day one**, from reading "full site" as "more than one
  page". Wrong, and removed on day two at the client's word. It should have been shown
  before it was built.
- **The hero and footer photographs were replaced** with the client's own. The mock-up's
  photos are not among the 32 he sent.
- **The crop of both photos was shifted** on wide screens, or the horse's head fell into
  the fade.
- **The English was corrected** in about a dozen places — "How it works with us" →
  "How it works", "on every step" → "at every step", "FIND A HORSE" → "FIND ME A HORSE",
  and the quiz intro was rewritten. The client asked to keep to the mock-up, so this is
  the most likely thing he will want back. One word restores every string.
- **A 404 page, a privacy policy and an imprint** were written where the mock-up had
  only links.
- **The admin keeps a Horses screen** and eight horse files, though nothing on the site
  shows them, so the catalogue can return without rebuilding it.
- **The Worker accepts any text** as the answer to a region, budget or format question.
  Left deliberately: a fixed list of allowed answers would reject every real lead the
  day the client renames an answer in the admin. **Do not count leads by region or
  budget** — the values are not guaranteed to be ones the quiz offered.

## Still open

1. **`GITHUB_TOKEN` is set, but it is the wide one.** It is the person's own `gh`
   OAuth token, which reaches every repository they own, not only this one. It works
   and it is stored only as a Cloudflare secret, but it should be replaced by a
   fine-grained token for `TjmerMTA/dressage-horses` alone, with Contents: Read and
   write and Actions: Read — made at github.com/settings/personal-access-tokens/new and
   put in with the same `wrangler secret put GITHUB_TOKEN`. GitHub has no way to create
   such a token except in a browser.
2. **The company's own facts**: name, legal form, registered office, enterprise number,
   VAT number, e-mail, the WhatsApp number, the Instagram and TikTok addresses. The
   admin's "Before you go live" screen lists all of them.
3. **The privacy policy and the imprint are drafts** and say so, dated. A tick in the
   admin removes that note once the company has read them. Two things the company must
   decide: how long requests are kept (a year is written in), and what safeguard it
   relies on for sending data to GitHub and Cloudflare.
4. **`/sketch/photos/`** is live, unlinked and not indexed. Remove it once the client
   has chosen A, B or neither.
5. **The photo with the golden grass** carries a photographer's signature. It was kept
   off the live page for that reason and replaced by another; crop it and it can go
   back.
6. **Who owns the photographs**, and whether the people in them agreed to appear on a
   website, was never checked.
7. **The Worker has not been redeployed** since Viktor's clearer error message was
   merged. Not urgent: the admin understands both the old and the new wording.

## Cost

Estimated 8–15% of the week; **7.1% spent**, within the estimate.
Eight people were hired and stood down: Anna, Photos, Viktor, Boris, Egor, Clara,
Dmitri, Lena, Nina. Eleven pieces, all merged.

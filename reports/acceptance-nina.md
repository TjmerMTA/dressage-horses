# Acceptance: dressage-horses, 5 November 2026 (Nina)

I checked this cold, against the client's own words and the 11 scenarios only. I used the
live site https://dev.siteboosty.com (build 452e3e6, built 06:36 UTC), the admin at /admin/,
the mock-up, his photos in ~/Downloads and GitHub. I did not read the project's notes,
reports, cards or commit messages. I fixed nothing.

Browser: Chromium via agent-browser, iPhone 14 profile (390 px) and 1440×900 desktop.

## Verdict

**Not acceptable yet.** The public page is good and fast, and the quiz → admin leads path
works. **Editing the site from the admin panel does not work at all.** Texts, horses and
photos all fail with "Repository not connected … the server is missing its GitHub key", and
every content request to the API returns HTTP 500. That fails scenario 9 and blocks
scenario 8. Scenario 11 is also not "untouched": on 4 Nov someone deleted the CNAME file
in the old repo.

## The 11 scenarios

| # | Scenario | Verdict | How I know |
|---|---|---|---|
| 1 | Phone: one page, < 2 s, like the mock-up, real photos | **met** | At 390 px the page has the mock-up's sections in the same order, with the same layout, colours and text (apart from the small copy edits listed below). Both photos are his: hero = `DSC_0843.jpg` (grey horse in extended trot), footer = `IMG_1444.jpg` (bay horse, woman in white blouse). Lighthouse mobile (slow-4G simulation), 3 runs: LCP 1.2 s, FCP 0.8–0.9 s. Deviation: the mock-up's hero is a black horse head, which is not among his Downloads photos, so the site uses a different picture there. |
| 2 | No menu, no navigation; header is just the logo | **met** | The home header holds only the logo `<img>`. It has no links. The only `<nav>` on the page is the footer's Privacy/Imprint pair. The legal and 404 pages show only the logo (linked to home). |
| 3 | No block of horses | **met** (on the page) | No horse section on the home page. `/horses/`, `/horses/herfstvuur/`, `/herfstvuur/` all return 404. But see "there unasked": the admin still has a Horses section. |
| 4 | PageSpeed mobile 90+, desktop 95+ | **met, with a caveat** | Google's PageSpeed API refused: "Quota exceeded … Queries per day". So I ran the same engine, Lighthouse 12.8.2, locally, 3× each: mobile **100/100/100**, desktop **100/100/100**, TBT 0 ms, CLS 0. That is not pagespeed.web.dev itself. He should run it once there. |
| 5 | Every quiz answer has an emoji; list not dull | **met** | All 9 answers have an emoji in front: 🌎 🌍 🏜️ 🌏 / 💶 💰 💎 / 💻 ✈️. "Not dull" is his taste to judge. Three of the four region answers are globes. |
| 6 | 4-question quiz → thank-you → request in admin with every answer and time | **met** | I sent a test request at 06:42:11 UTC (name "NINA ACCEPTANCE TEST - please ignore", Europe / €60,000 – 100,000 / in person / +32 470 00 00 00). Empty submit first showed all three error messages. Real submit: POST …workers.dev/lead → 200, then "Thank you, NINA ACCEPTANCE TEST - please ignore!" with a recap. In the admin Leads list it appears at the top: "5 Nov 2026, 08:42 EET", all three answers, name and number. **I did not delete it; it is still in his leads.** |
| 7 | Footer → privacy and imprint, own pages, honest about what is collected and what is missing | **met** | `/privacy/` and `/imprint/` return 200 and are separate pages with the logo-only header. Privacy lists exactly what the quiz sends (answers, name, WhatsApp, consent, time, page, utm, country code), says no cookies or analytics, and names GitHub, Cloudflare and Meta. Both pages state that the company name, legal form, office, enterprise number and VAT "are not yet published". |
| 8 | Socials appear as soon as he enters them in admin; nothing dead while empty | **half: second part met, first part fails** | While empty: no Instagram/TikTok/WhatsApp icons and no `#` links anywhere (0 social elements). The code hides each icon until it has a value, and the admin has fields for them. But the admin can't load or save `site.json` (500, see 9), so he cannot enter the addresses. I could not see the icons appear. |
| 9 | Admin: password login, change a text, live in ~a minute | **missing** | The password login works: a wrong password gives "That password is not right.", the right one opens the panel. After that, **Texts**, **Horses** and **Before you go live** each say "Repository not connected. The panel cannot reach the repository — the server is missing its GitHub key. Horses, texts and photos can't be loaded or saved until the developer sets it." Every `GET …/admin/content?path=src/content/…` returns **500**, also after a reload. He cannot change a single text. |
| 10 | Mistyped address shows his own page, not GitHub's | **met** | `/some-mistyped-address` returns 404 with the site's own page ("This page does not exist", logo, "GO TO THE HOME PAGE", footer). |
| 11 | Old pflegedienst-alno repo still on GitHub, untouched | **not met as worded** | The repo exists, is not archived, its `main` is unchanged since 2 Nov, and the old site still serves at https://tjmermta.github.io/pflegedienst-alno/ (200). But its `gh-pages` branch got a new commit `21ff6d1` "Delete CNAME" on **2026-11-04 12:35 UTC**, made in the GitHub web interface under the account "Tjmer". So the old site no longer answers on dev.siteboosty.com. That was probably needed to move the domain, but it was a change to the old repo. I cannot tell who did it. Nobody told him in the words I have. |

## His quoted sentences

| Sentence | Verdict | Note |
|---|---|---|
| "Make a full-featured site with an admin panel" | **missing (partly)** | The site works. The admin only works for leads. Editing content does not work (scenario 9). |
| "fast on Google PageSpeed" | **met** (local Lighthouse, see 4) | |
| "publish it to our git so we can show it to people" | **met** | https://github.com/TjmerMTA/dressage-horses is public. GitHub `main` = 452e3e6 = the build that is live. |
| "Publish it afterwards here: https://dev.siteboosty.com" | **met** | Served from GitHub Pages with that custom domain, valid HTTPS (certificate until 2026-12-20). |
| "The old site can stay on git for now" | **met**, with the change noted in 11 | |
| "We only need one, no navigation and no menu" | **met** | One page in the sitemap, plus /privacy/ and /imprint/. |
| "The footer has no links to Instagram, TikTok and WhatsApp" | **not deliverable by him yet** | The icons are built and hidden while empty, but he can't fill them in (8, 9). |
| "The second block with our horses … we are removing it" | **met on the site, not in the admin** | See below. |
| "Please add some emoji so the list doesn't look so dull" | **met** | |
| "privacy policy and such technical pages should stay as separate pages" | **met** | |

## There unasked

- **Admin "Horses" section.** He removed the horses block, but the admin still offers a horse
  editor, and the repo still holds 8 horse files plus a sample. Nothing on the site shows
  them. He can be asked to edit horses that appear nowhere.
- **Admin "Before you go live" section.** Nobody asked for it. It is currently broken like the others.
- **Lead tools beyond "every answer and the time":** CSV download, date filter, search,
  "N new since your last visit" counters, "Open in WhatsApp" links. They are small and harmless,
  but nobody ordered them.
- **Public `/version.json`** showing the commit hash and build time. Nobody asked for it.
- **Text edits to his mock-up copy** that nobody asked for:
  "How it works with us" → "How it works";
  "support on every step" → "at every step";
  quiz intro "Answer 4 quick questions so we can understand your request, get in touch for the details and prepare your selection." → "Answer 4 quick questions. We'll then contact you to go through the details and prepare your selection.";
  service 3 "Test ride and support at the tryout by a Grand Prix rider." → "A Grand Prix rider rides the horse for you and supports you at the tryout.";
  submit "FIND A HORSE" → "FIND ME A HORSE";
  thank-you "Your request is received." → "We have received your request.";
  footer "Take the quick quiz, or write directly." → "Take the quick quiz: four questions, two minutes." (this one is explained: there is no direct channel to write to yet).
  The mock-up's "Write on WhatsApp now" button after the thank-you is hidden because no number is set.
- **Test junk in his real leads list.** Of the 5 leads, all 5 are tests: "Director Test", three
  "Egor QA …" entries, and mine. One says "About Herfstvuur", a horse page that no longer exists.
  "Director Test" has the values "Belgium", "€30,000–50,000", "In person". None of these are
  quiz options, so the lead API accepts answers the quiz never offers.

## What I could not check

- **Google PageSpeed itself.** The API quota was exhausted. I used local Lighthouse instead (same engine, run on this machine's network).
- **Scenario 8, first half, and scenario 9's "live in about a minute".** The admin cannot save anything, so nothing could be published.
- **A real phone.** I used Chromium's iPhone 14 emulation, not an actual iPhone or Android.
- **Who deleted the CNAME in the old repo**, and whether he approved it.

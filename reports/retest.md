# Re-test after the one-page scope change

Tester: Egor · 2026-11-05 · live commit `9430274` (main `f87eea6` differs only in
`request.md`). My build of main is byte-identical to live on `/`, `/privacy/`,
`/imprint/`, `/admin/` and `404.html` (`cmp`). `npm run build` is green (5 pages),
`astro check` gives 0 errors.

**Result: 2 fails, everything else passes.** Both fails are text: wording that promises
something that isn't true on the live site.

| # | Item | Result |
|---|---|---|
| F1 | 19d — quiz without JavaScript points at contact details that don't exist | **FAIL** |
| F2 | Admin horse controls still promise effects on the removed pages | **FAIL** |
| 3 | Privacy policy | pass |
| 5 | 404 page | pass |
| 6 | Imprint | pass |
| 9 | English | pass |
| 12 | Quiz errors tied to fields | pass |
| 13 | Focus on arriving at the quiz | pass (as far as it still applies) |
| 16 | Quiz box height | pass |
| 18 | CSV BOM and time zone | pass (my original BOM claim was wrong) |
| 19 | Accessibility leftovers | 19a pass; 19b/19c gone; 19d **FAIL** = F1 |
| new | Emoji: 320 px, missing glyph, screen reader, stored words | pass |
| new | Nothing points at removed pages | public pass; admin **FAIL** = F2 |
| new | Admin works with the catalogue gone | pass |
| new | Whole page vs mock-up at phone width | pass, with deliberate differences listed |

The test data I created on live: one quiz lead, "Egor QA retest (home)",
+32 470 12 34 56, sent 2026-11-05 06:25:27 UTC.

## Fails, for the builders

### F1 — Without JavaScript, the quiz sends people to contact details that don't exist

- **Page:** `/`, quiz box, with JavaScript off. I tested this in a sandboxed iframe
  without script permission, so the browser really has scripting off and shows
  `<noscript>` content.
- **Saw:** "This quiz needs JavaScript, which is switched off in your browser. **The
  company's contact details are in the imprint**". The link goes to `/imprint/`.
- **The imprint says the opposite:** "no phone number, WhatsApp number or e-mail address
  of the company is published on this site, so the quiz is the one way to reach us". So a
  visitor without JavaScript is sent to a page that sends them back to the quiz they
  can't use.
- **Source:** `src/content/texts/home.json` → `quiz.noScriptLink` (line 107), rendered at
  `src/components/Quiz.astro:39`.
- **Expected:** the sentence is true in both states, like the legal pages already manage.
  I checked that in a scratch build with the links set: the imprint and privacy policy
  then gain "WhatsApp: write to us on WhatsApp" and drop the "not published" sentence. The
  no-JS line should do the same. With WhatsApp unset, it should say plainly that no other
  contact route is published yet; with it set, it should link the WhatsApp number directly.

### F2 — Admin horse controls still promise effects on pages that are gone

- **Page:** `/admin/` → Horses. With GITHUB_TOKEN empty, the live screen shows only
  "Repository not connected". So I answered the two *read* requests in the page with a
  stub (the horse folder and `moonstone.md` from the repo) and blocked every write. That
  renders the screen as it will be once the token is set.
- **Good:** the top note is honest: "The site is now a single page without a horse
  catalogue, so visitors see none of these horses…".
- **But the controls under it say the opposite.** Seen rendered:
  - **Mark sold** dialog: "It stays on the site with a 'Sold' ribbon, at the end of the
    list." (`src/scripts/admin/horses.js:111`)
  - **Unpublish** dialog: "Hide 'Moonstone' from the website? Its page and its card
    disappear from the site." (`horses.js:116`)
  - **Edit form** hints:
    - "Used for the 'Newest' sort on the site." (`horse-form.js:97`)
    - "Published — Visible on the website." (`horse-form.js:246`)
    - "Featured — Shown in the 'featured horses' strip on the home page."
      (`horse-form.js:247`)
    - "Sold — Stays on the site with a 'Sold' ribbon." (`horse-form.js:248`)
- **Same wording in code, not rendered** (it needs a real delete or save):
  - **Delete** dialog: "The horse and its page disappear from the website for good. … take
    it off the site for now…" (`horses.js:127`)
  - **Mark available** dialog: "The 'Sold' ribbon disappears from the site."
    (`horses.js:110`)
  - **After saving a horse**, the publish bar would say "'…' is live on the site"
    (`publish.js:152`).
- **Expected:** no horse control claims a visible effect on the site. Either reword each
  one to describe only what it stores (for example "Marked as sold in the stored list;
  not shown anywhere while the site has no catalogue"), or hide these actions while the
  catalogue is off.

## Passes

**3 — Privacy policy.** Pass.
- The "see the imprint" dead ends are gone. It has a dated "Last updated 5 November 2026",
  a visible draft note, and one working route for a data request (the quiz, explained step
  by step). It says what is collected, by what (a Cloudflare Worker) and where (Workers KV),
  how long it is kept (deleted by hand, at the latest 12 months after last contact), and
  consent as the basis. It keeps the Belgian DPA link.
- I checked its factual claims against `worker/src`, and they are true:
  - the IP is never stored, only `sha256(ip)` cut to 32 hex characters
    (`security.ts:51`);
  - that code expires at the end of its 10-minute window plus 60 s, so "at most
    11 minutes" holds (`security.ts:59`, `leads.ts:114`);
  - only the two-letter country is stored (`leads.ts:121-124`);
  - no public script uses cookies, localStorage, sessionStorage or IndexedDB.
- It also correctly does *not* claim EU storage: it says GitHub and Cloudflare may process
  data outside the EEA.

**6 — Imprint.** Pass. No mention of WhatsApp, Instagram or TikTok while they are unset;
the Liability section is now generic. Two dated statements ("As of 5 November 2026 … not
yet published"), no "shortly" without a date, and no invented company fact. Both quiz
links go to `/#quiz`.

**5 — 404 page.** Pass, on live.
- `curl` on `/no-such-page/`, `/horses/`, `/horses/herfstvuur/`, `/contact/` and
  `/admin/nope` gives **404** every time. The body is the site's own page: title "Page not
  found — Dressage horses", the site stylesheet, a link to `/`, and no "GitHub Pages"
  text. Its copy: "This page does not exist … Everything is on the home page.", with
  "GO TO THE HOME PAGE".
- Lighthouse refuses to score it (`ERRORED_DOCUMENT_REQUEST`), which is expected for a
  real 404 status.

**9 — English.** Pass. None of the listed strings is left anywhere in the build: "on every
step", "request is received", "How it works with us", the old Grand Prix tryout sentence,
"we look/search/find", "arranged up to your stable", "Level Level", "three questions" as
the quiz count, and the old "FIND A HORSE" submit label. ("first three questions" in the
privacy policy is correct.) I read every page in full and found no new slips. The H1 is
unchanged, as the client wants.

**12 — Quiz errors.** Pass, live, at desk width.
- Empty submit: name, number and consent each get `aria-invalid="true"` and an
  `aria-describedby` to their own message. The number also points at its hint. Each field
  turns red (`rgb(179,38,30)`), the checkbox included, and focus goes to the name.
- Typing a valid name removed its error and `aria-invalid` **before** I resubmitted.
  Ticking consent did the same.
- `12345` keeps only the number invalid until a valid number is typed, then it clears too.

**13 — Focus on arriving at the quiz.** Pass, as far as it still applies. The `#quiz?horse=`
entry from horse pages was removed with the horse pages. The remaining entry is "FIND ME A
HORSE" on `/privacy/` → `/#quiz`. There `document.activeElement` is `<body>`, which is
normal for an in-page link, and **one Tab lands on the first answer, "USA / Canada"**,
inside the quiz. The original defect, Tab going to the top of the page, is gone.

**16 — Quiz box height.** Pass.
- Desk, live: steps 1, 2 and 3 have the box at 381 px and "How it works" at 1585 px each
  time.
- Step 4 (the form) grows the box to 667 px. Sampled every animation frame, it grows
  smoothly from 325 ms to 575 ms, so there's no jump. The content below moves 285 px, but
  smoothly.

**18 — CSV BOM and time zone.** Pass, and **my original BOM claim was wrong.**
- The live CSV's raw bytes start `ef bb bf 63 72 65 61 74`, a BOM followed by
  "created_at".
- In the first review I read the file with `blob.text()`, which silently drops a BOM.
  Dmitri was right. Nothing needed fixing there.
- The list now shows the zone on every time ("5 Nov 2026, 08:25 EET"), and the intro says
  "Times are in your computer's time zone (Europe/Kiev); the CSV file uses UTC."
- Note, not a fail: "Europe/Kiev" is the browser's own zone name
  (`Intl…resolvedOptions().timeZone`, `leads.js:184`). For a Ukrainian client, "Kiev" may
  grate ("Kyiv"). Printing the offset ("UTC+2") instead would avoid it.

**19a — Footer logo `alt=""`.** Pass, on all four public pages.

**Emoji (R13).** Pass. The answers are 🌎 🌍 🏜️ 🌏 / 💶 💰 💎 / 💻 ✈️.
- **Screen reader:** the accessibility tree names the buttons "USA / Canada", "Europe",
  "GCC (Gulf countries)", "Asia", "€30,000 – 60,000", "Online purchase" and so on. The icon
  is an `aria-hidden` span, so it isn't read.
- **320 px, all three steps:** the page is exactly 320 px wide, no button overflows, and
  every answer fits on one line except "I will come to try the horse in person". That one
  wraps to two lines with the second line indented under the first, the icon beside it.
- **Missing glyph:** I replaced two icons with U+10FFFD and U+0378. Button heights and the
  text position didn't change (64/94 and 83/94 px before and after). A hollow box shows
  where the emoji was, and the words stay intact. All nine emoji date from Unicode 6–7
  (2010–2014), so a real missing glyph is unlikely on any current phone.
- **Stored words only:** the real lead's payload, the admin row and the CSV row contain
  "Europe", "€60,000 – 100,000" and "I will come to try the horse in person", with no
  pictographic character anywhere.

**Nothing public points at a removed page.** Pass.
- `/horses/`, `/horses/herfstvuur/`, `/horses/moonstone/`, `/services/`, `/about/` and
  `/contact/` all return 404 on live.
- The sitemap lists only `/`, `/imprint/` and `/privacy/`. `robots.txt` still disallows
  `/admin/`.
- The `href`s on `/`, `/privacy/`, `/imprint/` and `404.html` are only `#main`, `#quiz`,
  `/`, `/#quiz`, `/privacy/`, `/imprint/` and the DPA site.
- No `/horses/`, `/services/`, `/about/` or `/contact/` path appears anywhere in the
  public build. The admin bundle mentions horses only through its own `#/horses/…` routes;
  its labels are F2.

**Admin with the catalogue gone.** Pass, apart from F2.
- Login works. The new lead appeared at once with every answer and the time.
- The old Herfstvuur lead shows "About Herfstvuur" as plain text, with no dead link.
- CSV works. Logout returns to the login screen.
- Horses, Texts and "Before you go live" show the known "Repository not connected"
  message.
- With the read stub, the Horses screen shows the honest note.
- Texts lists only `site.json`, `home.json`, `privacy.md` and `imprint.md`, with one-page
  hints.

**Whole page vs the mock-up at 390 px.** Pass. I put the mock-up and the build side by side
in two 390 px frames and scrolled both to each section in turn.
- **Same structure:** hero, quiz, how it works, services, contact footer and sticky bar.
  Page heights are 4507 vs 4474 px.
- **Same styling, measured:** identical type, buttons, cards and sticky bar. Hero and
  footer photos have the same opacity (0.95 / 0.42), mask and height (310 / 300 px).
- **Differences, all deliberate:**
  - The hero photo: the grey horse in trot instead of the mock-up's bay head, chosen in
    `task-skeleton-landing.md:24`. The footer photo also differs.
  - The finding 9 copy fixes, and the client's emoji.
  - The footer line: "Take the quick quiz: four questions, two minutes." replaces "…or
    write directly", correct while no direct channel exists.
  - **No social icons**, because the links are unset. In a scratch build with all three
    set, the Instagram, TikTok and WhatsApp icons appear on every page, and so does the
    thank-you screen's "Write on WhatsApp now" button (done scenario 8).
  - A skip link, only visible on focus.

**Done scenario 4 (PageSpeed).** Pass on this machine's Lighthouse 13.6.0, live, 2 runs
each. Mobile: `/` 100/100, `/privacy/` 100/100, `/imprint/` 100/100, with CLS 0 in every
run. Desktop: `/` 100/100, `/privacy/` 100/100. One mobile home run had the known
machine paint stall (Speed Index 2.5 s) and still scored 100.

## Gone with the pages, confirmed in one line each

- **1** (sample horses) and **15** (galleries): every horse page and the home strip are
  gone, `/horses/…` gives 404, nothing links to it.
- **2** (contact form): `/contact/` gives 404, nothing links to it. The imprint's two old
  contact links now go to `/#quiz`.
- **4**, catalogue part (horse column): no horse pages, so no new lead can carry a horse.
  Old leads show it as text.
- **5**, catalogue part: covered by the 404 check above.
- **7** and **8**: their panels were on catalogue and horse pages only, now 404.
- **11** (mobile menu): there is no `<details>` and no header nav on any page. The only
  `<nav>` is the footer's Privacy/Imprint list.
- **14** and **17**: `/horses/` and its filters are gone (404).
- **My CLS fix from part 1**: it lived in `src/pages/horses/index.astro`, which is
  deleted. The home page measures CLS 0 without it.

## Not checked, by decision

Firefox; real keyboard in Safari; the iPhone safe area; the CSV opened in Excel itself
(I checked the bytes only).

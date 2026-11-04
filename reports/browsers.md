# Browsers — Safari and Firefox against https://dev.siteboosty.com

Tester: Egor · 2026-11-04 · live commit `c1b540b`. Nothing was fixed.

## Read this first: what I could and could not drive

**Firefox: not tested at all. It is not installed on this machine.** The card says it is,
but it isn't. I checked `/Applications` and `~/Applications`, a Spotlight search for the
bundle ids `org.mozilla.firefox` and `org.mozilla.nightly`, a Spotlight search for
`Firefox.app`, Homebrew (`/opt/homebrew/bin`, `brew list --cask`) and `geckodriver`.
None of them found anything. I did not download a browser: fetching a ~100 MB binary
from outside needs your go-ahead. There are two ways to cover Firefox:

- `brew install --cask firefox` plus `geckodriver` gives the real release Firefox.
- `npx playwright install firefox` gives Playwright's patched Firefox build. It is close,
  but it isn't the Firefox people use.

**Safari 27.0.1 (macOS 27.0.1): real engine, but not driven like a user.**

- `safaridriver` (WebDriver) refused: *"You must enable 'Allow remote automation' in the
  Developer section of Safari Settings"*.
- AppleScript `do JavaScript` refused: *"You must enable 'Allow JavaScript from Apple
  Events' in the Developer section of Safari Settings"*.
- Both are Safari security settings, and I'm not allowed to change them. Safari's disk
  cache is closed to this session ("Operation not permitted").
- If the person turns on *Safari → Settings → Advanced → Show features for web developers*,
  then *Developer → Allow remote automation*, I can re-run all of this with real WebDriver
  keyboard and pointer input.

What I did instead, without changing any setting:

1. **Local copy.** I built the site and confirmed the output is **byte-identical** to live
   (`cmp` on `/`, `/horses/`, `/horses/herfstvuur/`, `/horses/nachtwind/`, `/contact/`).
   I served it from `127.0.0.1` with a small server that logs every request Safari makes,
   including its `Accept` header.
2. **Safari window.** I opened one Safari window myself and used plain AppleScript (no
   special setting needed) only to set its URL and size. A real 390 px wide window works,
   so phone width in Safari is a true 390 px viewport.
3. **Probes.** I injected small scripts into copies of the pages. They ran in Safari's
   real engine, used **synthetic** events (`element.click()`, `change`, `keydown`) and
   reported their results back to the server. I ran the same probes in Chrome against
   the same copy, so any difference I report is the same test in both browsers.
4. **Screenshots.** I captured only that one Safari window (`screencapture -l`), and only
   while it was in front. Safari stops painting a window that sits behind another one, so
   captures taken behind the vobuda window came out empty dark grey. That is the test
   set-up, not the site.

What this setup **cannot** show:

- real Tab and Escape (synthetic keys don't trigger the browser's own actions);
- a real trackpad swipe;
- `:focus-visible` after a *real* mouse click;
- the safe area on an iPhone;
- iOS Safari, which is not the same as Safari on a Mac.

## Findings, worst first

I found **no Safari-specific defect** in what I could test. Everything below is either
untested or a platform difference.

1. **Firefox: untested.** See above. Every Firefox risk on the card (`<details>`,
   `:focus-visible`, `scroll-snap`, smooth scrolling, `content-visibility`, AVIF) is still
   open.

2. **In Safari on a Mac, Tab reaches form fields only, not links or buttons.** This is
   Safari's default unless the user turns on *Settings → Advanced → "Press Tab to highlight
   each item"* or presses ⌥-Tab. I could not confirm it here, because synthetic Tab doesn't
   move focus. But it is how Safari ships, and it means the keyboard results in my earlier
   report hold for Chrome only. A Safari user on default settings who presses Tab would
   skip the nav links, the quiz options (they are `<button>`s), "Ask about <horse>",
   the gallery arrows and the thumbnails. They would reach the filter `<select>`s, the quiz
   inputs and the photo strip (it has `tabindex="0"`). It is not a site defect and there is
   nothing to fix, but nobody has walked the site with Safari's keyboard settings, either way.

3. **Untested in Safari: Escape and a tap outside the open mobile menu.** In Chrome neither
   one closes it (item 11 of the whole-site review, which Dmitri is fixing). Synthetic events
   can't show what Safari does here. Re-test it with real input once remote automation is
   allowed, and after Dmitri's fix lands.

4. **Untested: the safe area on a real iPhone.** On a Mac, `env(safe-area-inset-*)` is 0.
   The code is set up right: `viewport-fit=cover` in the viewport tag, the root pads by
   `env(safe-area-inset-top/bottom)`, and the sticky bar adds `env(safe-area-inset-bottom)`
   to its own bottom padding. Whether the bar clears the home indicator, and whether the two
   paddings together leave a strip below it, can only be seen on a notched iPhone or in the
   iOS Simulator (not installed: no Xcode).

5. **Undecided: will the thank-you heading show a big square focus box after a real
   click?** After the script moves focus to the thank-you heading (`tabindex="-1"`), both
   Safari and Chrome draw a 3 px gold **square** outline the full width of the card. That
   happened with my synthetic click in both browsers. With a real mouse click, Chrome draws
   nothing (whole-site review, live). What Safari does after a real click I couldn't
   test. If it does draw it, it looks like a bug to a buyer. Check it with real input.

## Checked in Safari 27.0.1 and found working

All results come from the real Safari engine on the byte-identical local copy. "Synthetic"
means scripted events, not a person.

- **Images.** I logged every request over 14 page loads: 7 pages (`/`, `/horses/`,
  `/horses/nachtwind/`, `/services/`, `/about/`, `/contact/`, `/privacy/`), each at
  1280 px and at 390 px.
  - Photos: AVIF, 22 requests. Thumbnails and logo: WebP, 21 requests.
  - **No JPEG or PNG fallback was requested at all.**
  - Safari's `Accept` header for images is `image/webp,image/avif,image/jxl,image/heic,…`.
  - At 1280 px × DPR 2 the hero took the 2400w AVIF (199 KB), which is right for
    `sizes` = 1200 px at 2×.
  - Herfstvuur's first slide took the 853w AVIF. That is the largest that exists, because
    the original portrait is 853 × 1280, and it is shown about 340 px wide, so it's sharp.
- **Lazy loading in the gallery.** On `/horses/herfstvuur/`, only slides 1–2 were fetched at
  load; slides 3–8 came only when the strip reached them. The `content-visibility: auto`
  trick works in Safari as it does in Chrome.
- **Supported in Safari** (`CSS.supports`, same results in Chrome): `object-fit`,
  `:focus-visible`, `scroll-behavior`, `content-visibility`, `aspect-ratio`, `:dir()`,
  `overscroll-behavior-x`, `scrollbar-width`, logical `inset-*`, and `IntersectionObserver`.
  **`backdrop-filter` is not used anywhere** on the public site, so there's nothing to
  compare.
- **Mobile menu (`<details>`) at 390 px.** "Menu" renders with **no disclosure triangle**
  (the CSS hides `::-webkit-details-marker`). It opens to the same rounded panel with Horses,
  Services, About and Contact. A screenshot shows it identical to Chrome.
- **Quiz (synthetic).** "Step 1 of 4" with 4 options. Choosing one goes to step 2, focus
  moves to the step heading and Back appears. Back returns to step 1 with "Asia" still
  marked and hides itself. Steps 3 and 4 work and the progress bar reaches 100 %. An empty
  submit shows all three messages and focuses "Your name". The thank-you screen (lead call
  stubbed, **no real lead sent**) shows "Thank you, Safari probe!" with the region, budget
  and buying recap, and focus moves to it. The payload Safari built was complete and correct.
- **Focus ring.** It renders in Safari: 3 px gold, following the rounded corners. I saw it on
  the Sex `<select>` after "Clear filters" and on the photo strip.
- **Catalogue (synthetic, 1280 px).**
  - The shared address `?country=DE&sort=price-down` restores both selects and shows
    Nachtwind, Moonstone, Belle Époque.
  - Adding Sex = gelding leaves only Nachtwind and updates the address.
  - Max €25,000 shows the empty state and hides the grid.
  - "Clear filters" restores all 8 horses, clears the address and focuses Sex.
  - NL + price low→high shows Herfstvuur, Silver Lining, then the sold Quintessa last.
  - **Browser Back** from a real navigation to `/horses/silver-lining/` came from Safari's
    back-forward cache with the filters, results and address intact. The screenshot shows
    the scroll position restored too (`pageshow` read `scrollY=0` before Safari put it back).
  - The custom selects look the same as in Chrome.
- **Gallery (synthetic, 1280 px).** I focused the strip and sent arrow keys as synthetic
  `keydown` events. That tests the site's own key handler, not real keyboard input.
  - ArrowRight ×2 shows "Photo 3 of 8" at `scrollLeft` 1358 (exactly 2 × 679).
  - End shows "Photo 8 of 8" and the Next arrow gets `aria-disabled="true"`. Home shows
    "Photo 1 of 8".
  - Stopping a direct scroll at 3.4 photos **snaps to exactly photo 4** and the counter
    follows. That checks scroll-snap and IntersectionObserver, the nearest I can get to a
    trackpad swipe.
  - The Next button goes to photo 5.
- **Portrait photos in the 4:3 frame.** `object-fit: contain`, a 679 × 509 box, cream bars
  either side. The Safari screenshot looks the same as Chrome's.
- **Sticky "FIND ME A HORSE" bar at 390 px.** Hidden while the hero button is on screen. It
  appears below the quiz at the bottom of the viewport (`top` 732 of 808, full width),
  `padding-bottom` 11.2 px (0.7 rem plus a 0 safe-area inset on a Mac), and hides again
  back at the top. Safari's translucent toolbar doesn't cover it. Screenshot taken.
- **Smooth scrolling.** `html { scroll-behavior: smooth }` applies in Safari, and the
  gallery's smooth `scrollIntoView` animated (End took about a second to settle).

## Evidence

Screenshots of my own Safari window and the request logs are in the session scratchpad:
`/private/tmp/claude-501/-Users-nazar-dressage-horses-------egor/26a32140-a34a-4b42-b1e6-4850f9ebb757/scratchpad/safari/`
(`local-home.png`, `phone-sticky.png`, `phone-sticky-mid-s.png`, `quiz-thanks-desktop-s.png`,
`cat-after-back-s.png`, `gallery-desktop-s.png`). The probe scripts are next to them in
`…/scratchpad/probes/`. I closed the Safari window I opened. Safari's other window is the
person's own and I didn't touch it.

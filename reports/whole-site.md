# Whole-site review — https://dev.siteboosty.com

Tester: Egor · 2026-11-04 · live commit `3626068` (after Viktor's placeholder work).
Nothing in part 2 was fixed; this is a list for the director to decide on.

## How I tested

- Chrome, desktop width 1200 px. Phone width: the window could not be resized (it stays
  1200 px), so phone checks ran in a 390 × 844 same-origin iframe. That is a real
  390 px viewport (layout, media queries, scroll), but **not** touch input or a real
  phone browser. Reflow checks ran the same way at 320 px and 640 px (= a 1280 px screen
  at 200 % zoom), plus a 640 × 360 short viewport (a 1280 × 720 laptop at 200 %).
- Links: every `href`/`src`/`srcset` in every built page (363 distinct internal URLs, taken from the live HTML)
  requested with curl against the live site.
- Texts: the visible text of every page, extracted from the build and read in full.
- Quiz: filled in for real twice on the live site, with test names and numbers. Then I logged
  in to `/admin/` and checked the leads and the CSV.

## Findings, worst first

1. **The eight horses for sale are invented and nothing on the public site says so.**
   *Page:* `/horses/`, every horse page, the home-page strip. *Did:* read the catalogue as
   a buyer would. *Saw:* names, pedigrees, prices (€29,500 to €120,000), X-ray status
   ("Clean") and descriptions written as if they were real horses, under the line "Every
   horse has been seen by our team". Each "Ask about <horse>" button sends a real lead.
   The files carry `sample: true`, but that flag is shown nowhere. *Expected:* for a demo
   shown to real people (R09), either real horses or a visible "example listing" marker.
   Otherwise someone will enquire about a horse that does not exist, and the "seen by our
   team" sentence is untrue.

2. **A buyer cannot contact the company at all except by filling in the quiz.**
   *Page:* `/contact/`, `/imprint/`, footer. *Did:* looked for a phone, e-mail, WhatsApp or
   address. *Saw:* `/contact/` is headed "Talk to us about your next horse" and offers only
   the quiz. The imprint's Contact section says "Enquiries: the quick quiz or the contact
   page", and the contact page leads back to the quiz, so it's a loop. Viktor's change correctly
   removed the dead `YOUR_NUMBER` / `YOUR_HANDLE` links, so nothing is broken any more, but
   nothing is there either. *Expected:* at least one direct channel (the WhatsApp number
   the whole site talks about) before this is shown to people.

3. **The privacy policy names no data controller and no way to exercise data rights.**
   *Page:* `/privacy/`. *Saw:* "The controller of your personal data is the company named
   in the imprint". The imprint names no company ("…are being added to this page and will
   appear here shortly"). It goes on: "You can reach us … on WhatsApp or through the contact
   details listed there" and "To use any of these rights, write to us on WhatsApp or
   through the contact details in the imprint". There is no WhatsApp number and there are no
   contact details. *Expected:* GDPR Art. 13 needs the controller's identity and contact
   details on the page that collects the data. The quiz collects name and phone today,
   live. This is a legal problem, not cosmetic.

4. **The admin's lead list does not show which horse a lead is about.**
   *Page:* `/admin/` → Leads. *Did:* sent a lead from `/horses/herfstvuur/` → "Ask about
   Herfstvuur". The visitor's thank-you screen shows "Horse: Herfstvuur". *Saw:* the admin
   row for that lead has no horse, and clicking the row opens nothing. The horse survives only
   in the CSV's `page` column as `https://dev.siteboosty.com/#quiz?horse=herfstvuur`.
   *Expected:* a Horse column (or a line under the name) in the list and a `horse` column in
   the CSV. Whoever answers the lead on WhatsApp needs to know which horse it is.

5. **A mistyped address shows GitHub's own 404 page.**
   *Page:* any missing URL, e.g. `/no-such-page/`. *Saw:* "404 File not found … GitHub
   Pages", with GitHub's logo and links to GitHub Status and Twitter, and no way back to the
   site. *Expected:* a `404.html` in the site's own look with links to Home and Horses.

6. **The imprint is visibly unfinished and contradicts the site.**
   *Page:* `/imprint/`. *Saw:* the Company section says the company details "are being added
   to this page and will appear here shortly". The Liability section still says "This
   website links to external websites (for example WhatsApp, Instagram and TikTok)", but
   after Viktor's change it links to none of them. *Expected:* the company's details
   (Belgian Code of Economic Law, Book XII requires name, address, enterprise number, VAT,
   e-mail), and the Liability sentence matching what is linked.

7. **"Answer three questions" next to "4 quick questions" everywhere else.**
   *Page:* `/horses/` and all 8 horse pages ("Not quite the one?" panel). *Saw:* "Answer
   three questions and get a personal selection of 20 horses…". The hero, the quiz, the
   contact page and the footer all say "4 quick questions" / "four questions", and the quiz
   counts "Step 1 of 4". *Expected:* one number everywhere.

8. **The sold-horse page promises something the quiz can't take.**
   *Page:* `/horses/quintessa/`. *Saw:* "This horse is sold. Tell us what you liked about
   it and we find you a similar one." The button goes to the plain quiz (`/#quiz`). It
   carries no horse and has no free-text field, so the visitor cannot tell us what they
   liked. Also "we find" should be "we'll find".

9. **English a native speaker would wince at.** Exact strings:
   - "individual support on every step" (home hero, services, about: 3 places) → "at
     every step".
   - "Your request is received." (quiz thank-you) → "We have received your request."
   - "How it works with us" (home, services) → "How it works".
   - "Test ride and support at the tryout by a Grand Prix rider." (home, services) →
     e.g. "A Grand Prix rider rides the horse for you and supports you at the tryout."
   - "Answer 4 quick questions so we can understand your request, get in touch for the
     details and prepare your selection." (quiz intro): a run-on sentence; three verbs
     hang off "so we can".
   - "Take the quiz and we look for you." (`/horses/` lead), "we search our network for
     you" (empty result), "we find you a similar one" (sold page) → "we'll look", "we'll
     search", "we'll find".
   - "Everything arranged up to your stable." → "right up to your stable" / "delivered to
     your stable".
   - "Level Level L" in the Facts table of every horse with an L/M/S level (row label
     "Level", value "Level L").
   - "Find your perfectly suited dressage horse" (home H1) is understandable but stiff;
     "Find the dressage horse that suits you" reads naturally. This is the client's headline,
     so it's their call.
   - Button wording: the quiz's submit says "FIND A HORSE"; every other button says "FIND
     ME A HORSE".

10. **The quiz's budget options start at €30,000, but the catalogue sells a €29,500 horse.**
    *Page:* home quiz vs `/horses/rubicon/`. A buyer with €25,000 has no answer to pick.
    This is a business decision; I'm flagging it, not deciding it.

11. **Mobile menu: Escape and a tap outside don't close it.**
    *Page:* any page at phone width → "Menu". *Did:* opened it, pressed Escape, then
    clicked page text outside it. *Saw:* the `<details>` stays open over the hero in both
    cases. Only tapping "Menu" again closes it. *Expected:* Escape closes it and returns
    focus to "Menu", and a tap outside closes it.

12. **Quiz errors are not tied to their fields, and they don't clear.**
    *Page:* home quiz, step 4. *Did:* empty submit, then filled in the name. *Saw:* the three
    messages appear and focus goes to "Your name", which is good. But no field gets
    `aria-invalid` or `aria-describedby`, so a screen-reader user who tabs to a field is not
    told what is wrong with it. The messages are only announced as part of the whole
    live region. "Please enter your name." stays under a filled-in name until the next
    submit. The fields also get no red border; only the text is red.

13. **Arriving from "Ask about <horse>" leaves keyboard focus at the top of the page.**
    *Page:* `/#quiz?horse=herfstvuur`. *Saw:* the page scrolls to the quiz and shows "Your
    enquiry is about Herfstvuur", but `document.activeElement` is `<body>`. The next Tab
    goes to "Skip to content" at the top, not into the quiz. *Expected:* focus on the quiz
    heading or the first option.

14. **On a phone the filters push the first horse below the fold.**
    *Page:* `/horses/` at 390 px. *Saw:* six full-width selects and the count stack into
    one column about 600 px tall. A buyer scrolls past a full screen of form before seeing
    a single horse. This is a layout and design choice, so I'm only reporting it (a collapsed
    "Filter" toggle is the usual answer).

15. **Half the horses have a one-photo "gallery"; portrait photos sit in wide cream bars.**
    *Page:* `/horses/moonstone/`, `/rubicon/`, `/quintessa/`, `/donatello-b/` have 1 photo
    each; `/belle-epoque/`, `/nachtwind/`, `/silver-lining/` have 2; `/herfstvuur/` has 8.
    Herfstvuur's portrait photos are shown with `object-fit: contain` in a 4:3 frame, so on
    desktop about half the frame is empty cream on either side. Nothing is broken, but it
    looks thin next to the 8-photo page.

16. **The quiz box changes height between steps, so everything below it jumps.**
    *Page:* home quiz. Step 2 (three budget options) is taller than step 3 (two options).
    "How it works" moves up about 30 px when you answer the budget. Cosmetic.

17. **Min price above max price just says "0 horses".**
    *Page:* `/horses/`, "Price from €100,000", "Price up to €25,000". *Saw:* the empty state
    "No horse matches these filters". Correct, but it gives no hint that the two prices
    contradict each other. Low.

18. **CSV has no byte-order mark.** *Page:* admin → "Download as CSV". The file is UTF-8
    without a BOM (first byte `c`), with CRLF line ends. Excel on Windows usually opens such
    a file as ANSI, so "€60,000 – 100,000" would show as "â‚¬60,000 â€“ 100,000". I did not
    open it in Excel; this is the known behaviour, not something I saw. Also, the CSV's
    `created_at` is UTC (`2026-11-04T13:48:33.503Z`) while the list shows local time
    ("15:48") with no zone. Both are right, but they don't match side by side.

19. **Small accessibility leftovers.**
    - Footer logo image has `alt="Logo"` on all 15 pages. It is decorative, next to "© 2026
      Dressage horses", so it should be `alt=""`.
    - Horse pages have two `<h2>Facts</h2>`: a visually hidden one for the summary box and
      the visible table heading. A screen-reader heading list shows "Facts" twice.
    - Photo alt texts describe the people more than the horse ("Woman in a red jacket
      stands beside a dark bay horse…"). On a page selling the horse, the horse should come
      first.
    - Without JavaScript the quiz box is empty (only "Step 1 of 4" and an empty progress
      bar). Rare, but it is the main conversion path.

## What I checked and found working

- **Links:** all 363 internal URLs (pages, CSS, JS, every image size) return 200 on live.
  The only outbound link is dataprotectionauthority.be. No `YOUR_HANDLE`, `YOUR_NUMBER`,
  "to be confirmed", lorem or empty company name is left anywhere in the public HTML. The
  footer now reads "© 2026 Dressage horses".
- **Unpublished horse:** `/horses/sample-unpublished/` is 404 and absent from the sitemap.
  `robots.txt` disallows `/admin/`, and the admin page has `noindex, nofollow` and a CSP.
- **Quiz, desktop, live:** all four steps. Back returns to the previous step with the
  earlier answer still marked, and hides itself on step 1. The keyboard works (Tab to an
  option, Enter). The focus ring is visible (3 px gold). An empty submit shows three errors
  and focuses Name. "12345" is rejected with "Please enter a valid number with country
  code". A valid submit shows "Thank you, <name>!" with the recap and moves focus to it.
- **Leads arrive:** both test leads reached the admin within seconds:
  - 13:48:33 UTC, home page: Europe, €60,000 – 100,000, Online purchase,
    +32 470 12 34 56, consent yes.
  - 13:50:13 UTC, from Herfstvuur: GCC (Gulf countries), €100,000+, "I will come to try
    the horse in person", +971 50 123 4567, consent yes.

  Every answer, the date and the time were right; the list shows local time 15:48 and
  15:50 (UTC+2). "NEW" badges and the "3 new since your last visit" count were correct.
  Wrong password gives "That password is not right."; Log out returns to the login.
- **CSV:** "Download as CSV" produced `leads-2026-11-04.csv`, with 3 rows, every field, and
  correct quoting of commas inside "€100,000+".
- **Catalogue:** filters and sort are correct (NL + price low→high = Herfstvuur €85,000,
  Silver Lining €120,000, sold Quintessa last; "price on request" sorts after priced
  horses). The empty state and its "Clear filters" work, and focus returns to Sex. A shared
  address (`?country=DE&sort=price-down`) restores the form and the result. Back from a
  horse page restores the filters and the scroll position.
- **Gallery:** mouse arrows, thumbnails, the "Photo n of 8" counter, ← → Home End on the
  focused strip, and `aria-disabled` at both ends all work. Tab order on the horse page:
  "All horses" → photo strip → arrows → thumbnails → "Ask about …".
- **Reflow:** no page scrolls sideways at 320 px or 640 px. At 640 × 360 the sticky "FIND
  ME A HORSE" bar takes 76 of 358 px, and tabbing through the whole home page never hides
  the focused element behind it.
- **Structure:** one `<h1>` per page; every `<img>` has an `alt`; Lighthouse accessibility,
  best practices and SEO are 100 on all seven page types.

## Speed (part 1, for completeness)

Lighthouse 13.6.0 mobile, live, 2 runs each, median: `/` 99 · `/horses/` 100 ·
`/horses/moonstone/` 100 · `/services/` 100 · `/about/` 100 · `/contact/` 100 ·
`/privacy/` 99. One real defect was found and fixed in commit `d1047d8`: a layout shift
on `/horses/` (CLS 0.32, score 84 when it happens). Its explanation and the before/after
numbers are in that commit message. The other lost points come from this test machine,
not the site (see the same commit).

# Re-test plan: the 19 findings of whole-site.md

Egor's own checklist. Run it top to bottom. A finding passes only if **every** listed
condition holds; otherwise it is "not fixed" and I quote what I saw.
`B` = the built HTML in `dist/` of the fix commit. `L` = live https://dev.siteboosty.com.
"Phone" = the 390 × 844 same-origin iframe; "desk" = Chrome at 1200 px.

## 0. Set-up (once)

- [ ] `git merge main`. Note the fix commit(s). `npm run build` is green.
      `npx astro check` gives 0 errors.
- [ ] `L/version.json` → `commit` equals the fix commit. If not, wait for the deploy and
      run every live step only after that.
- [ ] Is the Worker redeployed with Clara's change? `POST /lead` with `kind:"message"` from
      an allowed origin answers `{ok:true}`, and the message appears in the admin. If not,
      finding 2's live steps are **blocked**; I say so and test the rest.
- [ ] Use test data only: name "Egor QA retest …", number `+32 470 12 34 56`. List every
      lead I create in the report.

## 1. Text and HTML checks on B, no browser (fast, run first)

- **7** — `grep -ri "three questions" dist` finds **0** matches. Every "N questions" on
  every page says 4 / four.
- **9** — each of these returns **0** matches in `dist`: `on every step`,
  `request is received`, `How it works with us`, `support at the tryout by a Grand Prix rider`,
  `we look for you`, `we search our network`, `we find you`, `arranged up to your stable`,
  `Level Level`. The submit button text equals the CTA text ("FIND ME A HORSE"), or both
  have changed to the same thing. The quiz intro is no longer the old run-on sentence.
  The home H1 is **unchanged** (the client keeps it). Then I read all visible text of every
  page (`text.py`) for new slips the fixes introduced.
- **19a** — the footer logo `<img>` has `alt=""` on all 15 public pages.
- **19b** — each horse page has exactly **one** heading with the text "Facts".
- **19c** — on horse pages, every gallery photo's `alt` starts with the horse (colour/breed
  or name), not with a person. Spot-check 5 against PHOTO-CATALOGUE.md: true to the picture.
- **6** — `/imprint/` text: contains no "WhatsApp", "Instagram" or "TikTok" unless the site
  really links to them; has a date; contains no invented company fact (name, address,
  KBO, VAT left empty or explicitly "not yet published"); no "shortly" without a date.
- **3** — `/privacy/` text: no sentence sends the reader to "the company named in the
  imprint" or "contact details listed there". It names what is collected, by what, where
  (Cloudflare Worker, KV), how long, consent as the basis, the one working route for a data
  request, the Belgian DPA link and a dated "last updated", plus a visible draft note.
  Every route it names must exist: I follow it in step 3.
- **1** — for every horse file with `sample: true`, its card in `/horses/`, its card in the
  home strip and its own page each contain the marker text. "Every horse has been seen by
  our team" (or a reworded claim) no longer asserts something false next to samples.
  **Self-removal:** copy the repo to the scratchpad, set `sample: false` on one horse, build:
  that horse has **no** marker anywhere, and the other seven still do.
- **10** — the lowest quiz budget band covers the cheapest published price, or the director
  has decided otherwise in writing. Either way I quote the decision.

## 2. Live, curl

- **5** — `curl -i L/no-such-page/` → status **404**, body is the site's own page (site title,
  stylesheet, links to `/` and `/horses/`), and **no** "GitHub Pages" text. Same for
  `/horses/no-such-horse/`.
- Regression: all internal URLs in the live HTML return 200 (the link check script). No
  `YOUR_`, "to be confirmed" or lorem in the live HTML.

## 3. Browser, Chrome, desk then phone

- **5** — open `/no-such-page/` on desk and on phone: it looks like the site; both links work.
- **11** — phone, `/`: open Menu, press **Escape** → `details.open === false` **and** focus is
  on the Menu summary. Open it again, click page text outside → closed. Open, click "About" →
  navigates. Repeat Escape on `/horses/`.
- **12** — home quiz to step 4, empty submit → each of name, number and consent has
  `aria-invalid="true"` and an `aria-describedby` pointing at its **own** message element; the
  field itself is visibly marked (border colour ≠ its normal colour). Type a valid name →
  its message disappears and `aria-invalid` is gone **before** I submit again. Bad number
  `12345` → only the number is invalid.
- **13** — from `/horses/herfstvuur/` click "Ask about Herfstvuur" → `document.activeElement`
  is inside `#quiz` (heading or first option), not `<body>`. One Tab → focus is on a quiz
  option.
- **16** — desk, home quiz: record `#quiz-box` height and the "How it works" heading's page
  `top` at steps 1, 2, 3 and 4. Pass: the heading's `top` is the same at every step (±1 px),
  or the change is animated with no jump. Phone: the same check.
- **17** — `/horses/`: price from €100,000, up to €25,000 → a message next to the two price
  fields says the minimum is above the maximum (the words, not just "0 horses"). Put the
  max back to Any → the message goes.
- **8** — `/horses/quintessa/`: the sold panel's sentence is grammatical ("we'll find"), and
  its button leads to a form with a free-text field, which I submit in step 4.
- **19d** — Chrome with JavaScript off (DevTools setting), `/`: the quiz box says what it is
  and links to the contact page. Nothing is empty.
- **2** — `/contact/` has a message form: name, contact, free-text message, consent, each with
  a `<label>`. Empty submit → errors, nothing sent. Imprint → Contact section → its link
  leads to something that exists and works (the form). No loop back to the quiz only.
- **1** — desk and phone: the marker is visible on a card, in the home strip and on the horse
  page without scrolling past the photo, and it reads as deliberate (screenshots kept).
- Regression, the catalogue: filters, sort, a shared address, Back and the empty state still
  behave as in whole-site.md "working". Gallery keys and thumbnails still work. The quiz
  still sends a lead from home and from a horse page (both done in step 4).

## 4. Live leads and admin

- **2** — send one message from `/contact/` with the text `<b>retest</b> "quote", comma; =1+1`.
  Pass: it appears in the admin within 60 s, marked as a message, not a quiz answer. The text
  shows literally (no bold, no HTML). In the CSV its cell is quoted, and a cell that starts
  with `=` is neutralised like the other cells.
- **4** — send one quiz lead from `/horses/herfstvuur/`. Pass: the admin list shows
  "Herfstvuur" for that lead **without** opening the CSV. The CSV has a `horse` column with
  `herfstvuur` (or the name) for it and empty for the home-page lead.
- **18** — the admin list says which time zone it shows. CSV first three bytes are
  `EF BB BF` (BOM). If the Worker change was handed to the director instead, I record "not
  fixed in code" and quote the hand-over. I can't verify it in Excel itself; I say so.
- Login, wrong password and logout still behave as before.

## 5. Speed regression (Part 1 must not be undone)

- [ ] `dist/horses/index.html` still contains the inline `hidden = false;` right after `</form>`.
- [ ] The slow-HTML A/B on the fix build, `/horses/` 4 runs: CLS **0.000** in all 4.
- [ ] Live, prescribed command, 2 runs each on `/`, `/horses/`, `/horses/herfstvuur/`,
      `/contact/`, `/404` page: median perf ≥ 99 on the catalogue pages, CLS 0 on all. If a
      run lands under 99 with a late first paint, I check it against the known machine stall
      (observed FCP − load > 0.7 s) before blaming the page.

## Will not verify, and why

- **14** (filters push the first horse below the fold on a phone) and **15** (uneven
  galleries, portrait photos in wide frames): design choices the client keeps. I only check
  they were **not** changed.
- **Firefox**, all of it: not installed; the director decided not to install it.
- **Real keyboard in Safari** (Tab, Escape for 11 and 13) and the focus box after a real
  click: Safari remote automation stays off. I can re-run my Safari probes for what
  synthetic events can show, and mark the rest "not checked".
- **The iPhone safe area** and anything else needing a real phone: unverified by decision.
- **18 in Excel itself**: no Excel on this machine; I check the bytes only.

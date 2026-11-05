# Re-test of F1 and F2 (commit 452e3e6)

Tester: Egor · 2026-11-05 · live `452e3e6`. My build of it is byte-identical to live on
`/`, `/privacy/`, `/imprint/`, `/admin/` and `404.html`. `npm run build` is green and
`astro check` gives 0 errors.

**F1: pass. F2: still fails.** Nothing I had passed before is broken.

## F1 — the no-JavaScript line: pass

- **Live, JavaScript really off** (a sandboxed iframe without script permission, 390 px):
  the quiz box reads "This quiz needs JavaScript, which is switched off in your browser.
  Please switch JavaScript on to send us your request — it is the only way to reach us at
  the moment." There are **0 links** in the box, and "Step 1 of 4" stays hidden.
- **The branches nobody had exercised.** I built four scratch copies of `452e3e6` and read
  the `<noscript>` line in each:

  | Set in the scratch copy | No-JS line |
  |---|---|
  | `site.json` WhatsApp `https://wa.me/32470123456` | `<a href="https://wa.me/32470123456">Write to us on WhatsApp</a>` |
  | `imprint.md` e-mail only (`sales@example-stable.be`) | `<a href="mailto:sales@example-stable.be">Write to us by e-mail</a>` |
  | both | the WhatsApp link (WhatsApp wins, as described) |
  | WhatsApp `https://wa.me/YOUR_NUMBER` (a placeholder) | the plain sentence, no link |

  In the e-mail build, the imprint and the privacy policy show the same address as a
  `mailto:` link, so the three pages agree.

## F2 — the admin horse wording: still fails

All five replacements are on live and fixed: Published, Featured, Sold, "Used to sort…",
Mark sold / Mark available, and Unpublish. I saw the dialogs rendered in the live admin,
using a stub that answers only the two read requests and blocks every write.

**Missed, and still on live** (confirmed in the live bundle
`index.astro_astro_type_script_index_0_lang.JWteCaEq.js`):

1. **The delete dialog**, `src/scripts/admin/horses.js:127`, seen rendered: "The horse and
   its page disappear from the website for good. If you only want to take it off the site
   for now, use 'Unpublish' instead." Neither half is true.
2. `src/scripts/admin/horse-form.js:100`, the description hint: "**Shown on the horse's
   page.** Empty line = new paragraph…". There is no horse page.
3. `horse-form.js:249`, the "Price on request" hint: "No price is shown; **visitors are
   asked to enquire.**" Visitors see no horse.
4. `publish.js:152`: "Published — '…' **is live on the site**." This is true for texts.
   But the same bar runs for every horse save: `trackCommit(...)` is called with the
   horse's name at `horses.js:71` (row actions), `horses.js:139` (delete) and
   `horse-form.js:384` (edit form). So after "Mark sold" it would say "'Moonstone' is live
   on the site". This one I confirmed from the code, not rendered: it needs a real save,
   and I blocked writes. A fix: a horse label such as "is saved" without "on the site", or
   a separate message for horses.
5. Lower, same family: `horse-form.js:313`, a photo-description error, says "blind visitors
   and Google rely on it". No visitor sees these photos today.

**A wording note, not a fail:** the screen's top note says "The site is now a single page
**without a horse catalogue**", and the new texts say "It stays **in the catalogue**" and
"It is hidden **from the catalogue**". The admin means its own list (the table caption is
"All horses in the catalogue"), but on one screen it reads as a contradiction. "In the list"
would avoid it.

## Did anything I had passed break? No

- **Quiz behaviour:** the quiz's script bundle (`Quiz.astro_astro_type_script_index_0_lang.C-qGTGB6.js`)
  has the same hash as in `9430274`, which I passed.
- **The home page HTML** differs only in the `<noscript>` line and in three no-JS keys in
  the quiz's embedded data. The script never reads those keys.
- **`/privacy/`, `/imprint/` and `404.html`** are byte-identical to the build I passed.
- **The admin bundle** differs by exactly 8 string literals (the replacements above) and no
  code.
- So 3, 5, 6, 9, 12, 13, 16, 18, 19a, the emoji checks and the mock-up comparison from
  `retest.md` all stand. I did not re-run Lighthouse: the only change to a public page is
  one sentence inside `<noscript>`, which isn't rendered when JavaScript is on.

## What I created

No new leads. My admin session ended with a logout and with the tab closed (the token
lives in `sessionStorage`). I couldn't read the edit form's rendered text back because the
browser tool blocked the output; the hints listed above come from the source and the live
bundle.

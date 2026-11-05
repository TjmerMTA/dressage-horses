# Final re-test of the admin wording (commit 2d2f794)

Tester: Egor · 2026-11-05.

**Live timing.** When the hand-over said "live", live `version.json` still reported
`452e3e6`. The deploy for `2d2f794` was 22 seconds in. I waited for it to finish and for
live to report `2d2f794` before testing. My build of it equals live on `/`, `/privacy/`
and `/imprint/`, and the live admin bundle `…CIvcwAHG.js` equals the one I built.

**One trap I hit and corrected.** The first live admin I opened still ran the *old*
bundle. GitHub Pages lets a browser keep the admin page for 10 minutes, and I had opened
it before the deploy. I threw those readings away and re-ran everything on `/admin/?v=2`,
which I confirmed loads `CIvcwAHG`. Anyone checking right after a deploy can see the old
wording for up to 10 minutes; that's not a site defect.

## Result: FAIL — 5 sentences are still untrue

The six things listed as fixed are true now. But replacing "catalogue" with "list" made
three sentences false in a new way. The admin's list *does* still show unpublished horses,
and it is *not* sorted by date. The whole-bundle sweep found two more false sentences, on
the Texts screen.

I rendered the Horses screen in the live admin with a stub that answers only the read
requests (two horses: Moonstone published, Rubicon **unpublished**) and blocks every write.

| # | Where | Sentence (rendered unless noted) | Why it is untrue |
|---|---|---|---|
| R1 | `src/scripts/admin/horses.js:116`, Unpublish dialog | "It is hidden from the list. You can publish it again at any time." | On the same screen, unpublished Rubicon **is in the list**, with status "HIDDEN", counted in "2 horses — 1 published, 1 hidden". Unpublishing changes a flag; the horse stays listed. |
| R2 | `horses.js:127`, Delete dialog, 2nd sentence | "If you only want to take it out of the list for now, use 'Unpublish' instead." | Same reason: Unpublish does not take it out of the list. (The 1st sentence is fixed and true, see below.) |
| R3 | `src/scripts/admin/horse-form.js:97`, the "On sale since" hint | "Used to sort the list by newest." | The list sorts by status, then by **name** (`horses.js:49`: `rank(a) - rank(b) \|\| name.localeCompare`). Nothing in the admin reads `listed`. Today the date sorts nothing. |
| R4 | `src/scripts/admin/texts.js:198`, Instagram/TikTok field hint *(code; the Texts screen needs the repository)* | "Not set yet — the Instagram icon and card are hidden on the site." | There is no card any more. The cards were on `/contact/`, which is gone. Only the footer icon exists. |
| R5 | `texts.js:347`, the privacy policy's "reviewed" tick *(code)* | "Tick this only after someone at the company … has checked the text. It is not shown to visitors." | Ticking it **removes the visible draft note** from the public privacy page (`src/pages/privacy.astro:18`: `const draft = entry.data.reviewed !== true`). An editor is told the tick has no visible effect, when it takes away a legal caveat. |

What to say instead, only as a pointer:
- R1: "It is marked as hidden. You can publish it again at any time."
- R2: "…to keep it but mark it as hidden, use 'Unpublish' instead."
- R3: "The date it went on sale." (or remove the hint).
- R4: "…the Instagram icon is hidden on the site."
- R5: "Ticking it removes the 'draft' note from the privacy policy page."

## Verified true (passes)

- **Delete dialog, step 1, 1st sentence** (rendered): "The horse and its details are
  deleted for good. Its photographs stay in the photo library." True: delete removes only
  the horse's `.md` file (`deleteFile(x.path…)`, `horses.js:138`).
- **Delete dialog, step 2** (rendered): "This can't be undone from the panel. Its photos
  stay in the photo library. Type 'Moonstone' to confirm."
- **Mark sold** (rendered): "It stays in the list, marked as sold." True: a sold horse
  stays listed, sorted after the others.
- **Edit form** (rendered): "Published, rather than a draft.", "Marked as a featured
  horse.", "Stays in the list, marked as sold." The "Price on request" hint, "No price is
  recorded; the horse is marked 'on request'.", is true: `price` is saved as `undefined`
  when it's ticked (`horse-form.js:356`). The description hint now reads "The horse's
  description. …".
- **Publish bar** (code): "Published — '…' is saved and the site has been rebuilt." True
  for texts and horses alike: every commit to `main` runs the deploy.
- **Photo description error** (code): "needed for blind visitors and for search engines".
  Acceptable; it states a requirement, not that anyone sees the photo today.
- **The screen's note and caption** (rendered): "The site is now a single page without a
  horse catalogue…" and "All horses in the list". No longer contradict each other.

## Whole-bundle sweep

I extracted all 873 string and template literals from the live admin bundle with the
TypeScript parser (a regex misses strings in minified code; mine did at first). I read
every one that mentions the site, visitors, pages, the footer, the quiz, the list,
sorting or showing and hiding: 54 sentences. Besides R1–R5, all of them are true today.
That includes the "Before you go live" texts about the footer icons and the WhatsApp
button, "Each save updates the site in about a minute", the lead-list intro, and the
build-status messages.

## Did this change break anything? No

- The two admin bundles (`452e3e6` → `2d2f794`) differ in exactly the 11 literals listed
  in the hand-over and nothing else. The four spots where my token comparison differed
  all fall inside those changed strings.
- `/`, `/privacy/` and `/imprint/` are byte-identical to my build and unchanged on live.
- The commit touches only `horses.js`, `horse-form.js` and `publish.js`. Everything I
  passed in `retest.md` and `retest-f1-f2.md` stands.

## The Worker accepting any region / budget / format

**I agree with leaving it as a named limitation, for a stronger reason than the one
given.** Checked in `worker/src/leads.ts`:

- `region`, `budget` and `format` are free strings capped at 100 characters (lines 76–78),
  the same as `name` (2–100), which has always been free text.
- The admin renders every value with `textContent`, never `innerHTML` (`ui.js:2`, and
  there is no `innerHTML` anywhere in the admin).
- The CSV neutralises formula cells (`csvCell`, lines 185–190).

So a forged answer can put junk text in the list, which a forged name can already do, but
it can't run code or break a spreadsheet. An allowlist would buy data tidiness, not
safety. **And a hard-coded allowlist would be worse than none**: the quiz answers are
editable in the admin (`home.json`), and the Worker cannot read the site's texts while
GITHUB_TOKEN is empty. The first time the client renames an answer, every real lead
would be rejected with a 400.

If it is ever fixed, the Worker should read the allowed answers from the published site,
not keep its own copy. Until then, the one thing worth saying in the hand-over is that
**answers in the lead list are not guaranteed to be ones the quiz offered**. That matters
if anyone filters or counts leads by region or budget.

## What I left behind

No new leads. The admin session ended with a visible logout ("You are logged out.") and
the tab is closed.

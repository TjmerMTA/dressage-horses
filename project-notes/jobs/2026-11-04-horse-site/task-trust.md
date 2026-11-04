# Task card — piece `trust` (size L) — Clara

Rows covered: R09 (shown to people, must not mislead), R01

Read CONTEXT.md and request.md in this folder, and `reports/whole-site.md` in the repo
root — findings 1, 2, 3, 6 and 10 are yours. Egor's numbering is the one to quote.

**Files you own.** Nobody else will touch these, and you touch nothing else without
telling the director first:
`src/content/pages/imprint.md`, `src/content/pages/privacy.md`,
`src/pages/contact.astro`, `src/components/HorseCard.astro`,
`src/pages/horses/[slug].astro`, `src/pages/horses/index.astro`, `worker/`,
plus any new component you create. Dmitri is working at the same time on everything
else, including the other text files, the quiz and the English wording — leave those
alone even when you see something wrong, and tell the director instead.

## What to do

**1. The invented horses must be honest (finding 1).**
Eight sample horses are presented as real stock, under the claim "Every horse has been
seen by our team", and every enquiry button sends a real lead. People are going to be
shown this. Every horse whose file has `sample: true` must carry a visible marker — on
its card, on its own page, and in the home-page strip — saying in plain English that it
is an example listing, not a horse for sale. Make the marker part of the design, not a
warning box bolted on: it should look deliberate. Where the "seen by our team" claim
sits next to sample horses, reword it so it is not a lie. When the client replaces the
samples with real horses and drops the flag, every marker must disappear by itself.

**2. A buyer must be able to reach a human (finding 2).**
Today the only route is the quiz, and the imprint points at the contact page which
points back at the quiz. Add a real message form on `/contact/`: name, contact
(e-mail or phone), a free-text message, and a consent checkbox, in the site's style.
It posts to the Worker the same way the quiz does, so the message lands in the admin's
lead list beside the quiz leads and is clearly marked as a message rather than a quiz
answer. That means a small, careful change in `worker/`:
- extend the stored record with an optional `message` and a `kind` (`quiz` | `message`)
- keep every existing validation, limit and rate limit, and the "answer is always
  exactly `{ok:true}`" rule
- cap the message text and treat it as untrusted: it must never be rendered as HTML
  anywhere, and it must be neutralised in the CSV like the other cells
- extend `worker/test.sh` to cover the new shape, the oversized message and the missing
  consent, and keep every existing check passing
Say clearly in your report that the Worker has to be redeployed, since you cannot.
Also make the imprint's Contact section point at something that actually exists.

**3. The privacy policy is a live legal problem (finding 3).**
The quiz is collecting real names and phone numbers right now, and the policy names no
data controller and no way to exercise data rights, because the imprint is empty.
Fix what can be fixed without inventing facts about the company:
- say plainly and accurately what is collected, by what, where it is stored (a
  Cloudflare KV store in the EU, through a Cloudflare Worker), how long it is kept, and
  that it is not sold or passed to advertisers
- state the lawful basis honestly (consent, given by the checkbox)
- for the controller's identity and contact, do not write "see the imprint" when the
  imprint is empty: write the truth, that the operator's details are not yet published
  and name the one route that does work for a data request
- keep the link to the Belgian data protection authority
- add a dated "last updated" line
This is not legal advice and you must not pretend it is complete. Add a short, visible
note that the policy is a draft awaiting the company's own details, written so a
visitor reads it as candour rather than as a broken page.

**4. The imprint contradicts the site (finding 6).**
Its liability section still says the site links to WhatsApp, Instagram and TikTok; it
links to none of them. Fix that, and make the "details coming shortly" wording read as
a deliberate, dated statement rather than an unfinished page. Keep every company fact
empty — invent nothing.

**5. The budget ladder (finding 10).**
The quiz's lowest budget band starts at €30,000 while the catalogue lists a horse at
€29,500. The quiz itself is Dmitri's file. Yours is the catalogue side: tell the
director which you think should move, with one sentence of reasoning, and change
nothing in the quiz.

## Done means

`npm run build` green, `npx astro check` 0 errors, `worker/test.sh` passes in full with
your new checks (paste the tail of the output). You have opened every page you changed
in `npm run preview` and the contact form has actually been submitted end to end
against `npx wrangler dev`, with the message arriving in the admin's lead list. Say
what you ran and what you saw. Run npm with its own `--cache` path in your scratchpad.

Report in English. Ask your questions in English.

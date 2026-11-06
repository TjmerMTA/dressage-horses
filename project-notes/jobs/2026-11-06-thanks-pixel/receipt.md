# Receipt — thank-you page + Meta Pixel

Notebook v1 — updated 2026-11-06

- R01/R03 met: /thanks/ (SUCCESS, the text, Instagram link from the admin value). Quiz → /thanks/?sent=1.
- R02 met: admin Texts → "Meta Pixel ID" (digits, validated, with a hint); also on "Before you go live".
- Consent banner only while an id is set; Accept → PageView everywhere + Lead once on /thanks/;
  Decline → nothing from Meta. Privacy page gains a Meta Pixel section only when an id is set.
- Checked (Anna, local Chrome): build/check green, worker tests 327/0, network in all three states.
  Checked (director): phone 390px screenshots of banner and /thanks/; no "facebook" in dist without an id.
- Not checked: the admin field in a logged-in browser; a real pixel id in Meta Events Manager; live site.
- Side effect: the privacy text's "When you visit the website" paragraph moved from privacy.md
  (admin-editable) into privacy.astro, because its wording depends on whether a pixel is on.
- Cost: one M piece, opus/medium.
- 2026-11-06: /thanks/ footer shortened at the client's request (no photo, heading or quiz button).

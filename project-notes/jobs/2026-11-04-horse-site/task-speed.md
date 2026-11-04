# Task card — piece `speed` (size M) — Egor, tester

Rows covered: R03, and a first full review of R01/R09

Everything is merged into `main` and live at https://dev.siteboosty.com.
Read CONTEXT.md and request.md in this folder first.

## Part 1 — the numbers

Measure **every page type** against the live site with Lighthouse mobile, twice each,
and report the median: `/`, `/horses/`, a horse page, `/services/`, `/about/`,
`/contact/`, `/privacy/`. Run it as
`npm_config_cache=<your own scratchpad path> npx --yes lighthouse <url> --quiet
--chrome-flags="--headless=new --no-sandbox"`.

Known today: home 100, `/horses/` 96, horse page 97, all four categories 100 elsewhere.
Get the catalogue pages to 99+ on mobile without changing how anything looks.
Diagnose first, then change one thing, then measure again — and say which change bought
which points. If a change would alter the design, do not make it: report it instead.

Do not touch `worker/`.

## Part 2 — review the whole site as a tester

Go through the live site the way a buyer would, on a phone width and on a desktop
width, and write `reports/whole-site.md` in the repo. Cover at least:

- every link in the header, the footer and the body — nothing 404s, nothing dead-ends
- the quiz: all four steps, Back, an empty submit, a submit from a horse page
- the catalogue: filters, sort, an empty result, a shared filtered address, Back
- a horse page: gallery with mouse and with the keyboard alone, the enquiry button
- the texts: anything still reading as a placeholder, a lorem, "to be confirmed",
  `YOUR_HANDLE`, an empty company name — list them all
- English: typos, broken sentences, anything a native speaker would wince at
- accessibility beyond the Lighthouse score: tab order, focus visibility, a page zoomed
  to 200%, images without useful alt text
- anything that looks unfinished to someone being shown this as a demo

Report findings as a numbered list, worst first, each with the page, what you did, what
you saw, what you expected. Do not fix anything in part 2 — the director decides.

## Done means

Part 1 measured, changed, measured again, committed in your copy with the numbers in
the commit message. Part 2 written and committed. Say what you ran and what you saw.

Report in English. Ask your questions in English.

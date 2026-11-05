# Lessons from this project

Notebook v1 — updated 2026-11-05

- 2026-11-04 — `dev.siteboosty.com` is not a free address: it is the custom domain of
  the repo `TjmerMTA/pflegedienst-alno` (gh-pages). Anything published there takes the
  domain away from that site. Evidence: `gh api repos/TjmerMTA/pflegedienst-alno/pages`.
- 2026-11-04 — ImageMagick is not installed on this machine. `sips`, `cwebp` and
  `avifenc` are. Evidence: `which magick convert` → not found.
- 2026-11-04 — Creating a GitHub repository from this session is refused by the
  permission guard ("Create Public Surface"). The client has to allow it or run the
  command themselves. Evidence: two refusals of `gh repo create`, public and private.
- 2026-11-04 — The shared npm cache `~/.npm/_cacache` is not writable from these
  sessions (EACCES on mkdir). Every member must run npm with its own `--cache` path
  under the scratchpad. Evidence: `npm install` failed for Anna and for the director.
- 2026-11-04 — Port 4321 is already taken on this machine by another project, so
  `astro preview` moves itself to 4322. Read the port out of its own output.
- 2026-11-04 — The site is built with `site: https://dev.siteboosty.com` and no `base`,
  so its asset links are absolute. On the fallback address
  `tjmermta.github.io/dressage-horses/` the stylesheets therefore 404 and the page
  shows unstyled. It only looks right on the real domain.
- 2026-11-05 — `npx wrangler secret put NAME` typed in this non-interactive shell reads
  empty stdin, stores nothing and still prints "Success". The admin then answered
  "server not configured" for two days. Always pipe the value in:
  `gh auth token | npx wrangler secret put GITHUB_TOKEN`. Evidence: the GITHUB_TOKEN
  secret existed and was empty; written up in `worker/README.md`.
- 2026-11-05 — A `team tell` message containing backticks inside double quotes is run by
  zsh ("command not found: phase"). Build it with `msg=$(cat <<'XX' … XX)` and pass
  `"$msg"`. Evidence: a task card for Pavel was sent mangled.

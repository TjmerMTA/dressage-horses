# Lessons from this project

Notebook v1 — updated 2026-11-04

- 2026-11-04 — `dev.siteboosty.com` is not a free address: it is the custom domain of
  the repo `TjmerMTA/pflegedienst-alno` (gh-pages). Anything published there takes the
  domain away from that site. Evidence: `gh api repos/TjmerMTA/pflegedienst-alno/pages`.
- 2026-11-04 — ImageMagick is not installed on this machine. `sips`, `cwebp` and
  `avifenc` are. Evidence: `which magick convert` → not found.
- 2026-11-04 — Creating a GitHub repository from this session is refused by the
  permission guard ("Create Public Surface"). The client has to allow it or run the
  command themselves. Evidence: two refusals of `gh repo create`, public and private.

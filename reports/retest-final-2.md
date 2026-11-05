# Last re-test of the admin wording (commit 5d8662c): PASS

Tester: Egor · 2026-11-05.

**Live timing.** When the hand-over came, live `version.json` still reported `ac3db3c`;
the deploy of `5d8662c` was running. I waited until it finished and live reported
`5d8662c`. I loaded the admin fresh (`/admin/?v=3`) and confirmed it ran the live bundle
`index.astro_astro_type_script_index_0_lang.3YPXlPsn.js`. That bundle is byte-identical
to my build of `5d8662c`. `/`, `/privacy/` and `/imprint/` are byte-identical to my build.

## The five sentences, all rendered on live

I used a read-only stub in the page (reads answered, every write blocked). The two horses
were Moonstone, published, and Rubicon, **unpublished**. For the Texts screen, the reads
of `site.json`, `privacy.md` and the photo library were answered with the repository's
real `site.json`, a trimmed `privacy.md` front matter, and an empty photo folder.

| # | Rendered text | True? |
|---|---|---|
| R1 | Unpublish: "Hide 'Moonstone'? It stays here, marked as hidden. You can publish it again at any time." | Yes. Rubicon, unpublished, is in the same list with status HIDDEN. |
| R2 | Delete, step 1: "The horse and its details are deleted for good. Its photographs stay in the photo library. / If you only want to keep it but mark it as hidden, use 'Unpublish' instead." Step 2 unchanged: "This can't be undone from the panel. Its photos stay in the photo library. Type 'Moonstone' to confirm." | Yes. Delete removes only the horse's `.md` file; Unpublish keeps it and marks it hidden. |
| R3 | "On sale since" hint: "The date the horse went on sale." | Yes. It no longer claims any sorting. |
| R4 | `site.json` editor: "Not set yet — the Instagram icon is hidden on the site." Also "…the TikTok icon is hidden on the site." and "…every WhatsApp button is hidden and visitors are sent to the quiz." | Yes. There's no card, and the footer shows none of those icons while the links are empty. |
| R5 | `privacy.md` editor: "Tick this only after someone at the company (ideally with legal advice) has checked the text. Ticking it removes the 'draft' note from the top of the public privacy page." | Yes. The draft note is the first paragraph under the heading and date on `/privacy/`, shown while `reviewed !== true` (`privacy.astro:18`). |

## Sweep of the live bundle

I extracted all string and template literals from `3YPXlPsn` with the TypeScript parser
and filtered them the same way as last round. That gives 55 sentences about the site,
visitors, pages, the list, sorting, showing or hiding. Compared with last round's
bundle, exactly five changed, the five above. The other 50 are unchanged and were
already checked true. **No sentence in the admin now says something about the public site
that isn't true.**

## Regression

The only differences in the admin bundle are those five literals. The public pages are
byte-identical to my build. Nothing I had passed before has changed.

## One observation outside my five

This merge also brought `/sketch/photos/` (from `ac3db3c`). It is live and reachable by
its address (200), but it has `noindex, nofollow`, it isn't in the sitemap (still only
`/`, `/imprint/`, `/privacy/`), and no public page links to it. That's fine for a sketch.
But it is a second public page on a site the client asked to be one page, so it should be
removed or kept behind its address on purpose before the hand-over.

## What I left behind

No leads. The admin session ended with "You are logged out." on screen, and the tab is
closed.

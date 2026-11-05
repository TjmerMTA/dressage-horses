# Request — 2026-11-04 — Dressage horse site

## The person's own words (verbatim, Russian/Ukrainian)

> Я зробив мок ап, вам мали його надсилати вот файл + фото нужно сделать полноценный с админкой быстрый по гугл пейдж спид и выложить его к нам на гит что бы показать людям в загрузках фото с лошадьми + файл /Users/nazar/Downloads/index.html

> выложить потом сюда https://dev.siteboosty.com

> старый сайт можно пока оставить на гите что там лежал

## English copy

> I made a mock-up, it should have been sent to you — here is the file + photos. Make a full-featured site with an admin panel, fast on Google PageSpeed, and publish it to our git so we can show it to people. The horse photos are in Downloads + the file /Users/nazar/Downloads/index.html

> Publish it afterwards here: https://dev.siteboosty.com

> The old site can stay on git for now, the one that was there.

## Rows

| Row | What | Quote |
|---|---|---|
| R01 | Build a real, full site out of the mock-up (not just the one landing page) | "нужно сделать полноценный" |
| R02 | It must have an admin panel | "с админкой" |
| R03 | It must be fast on Google PageSpeed | "быстрый по гугл пейдж спид" |
| R04 | Use the horse photos from ~/Downloads | "в загрузках фото с лошадьми" |
| R05 | Use the mock-up /Users/nazar/Downloads/index.html as the design source | "+ файл /Users/nazar/Downloads/index.html" |
| R06 | Publish to the person's GitHub | "выложить его к нам на гит" |
| R07 | It must be live at https://dev.siteboosty.com | "выложить потом сюда https://dev.siteboosty.com" |
| R08 | Do not delete the old site's repository | "старый сайт можно пока оставить на гите" |
| R09 | It is meant to be shown to people (a demo that must look finished) | "что бы показать людям" |

## Done scenarios (draft, to confirm)

1. I open https://dev.siteboosty.com on my phone — the horse landing opens in under 2 seconds, with real photos.
2. I run the page through Google PageSpeed Insights — mobile 90+, desktop 95+.
3. I open https://dev.siteboosty.com/horses/ — I see a catalogue of horses with photos, price, age, level; I can filter.
4. I open one horse — a full page with a photo gallery and an enquiry button.
5. I go through the 4-question quiz and send it — I get a thank-you, and the lead shows up in the admin panel.
6. I open the admin panel, log in with a password, add a horse with a photo, and in ~1 minute it is on the public site.
7. I open the admin panel and edit the headline text of the home page; it changes on the site.
8. The old pflegedienst-alno repository is still on GitHub, untouched.

## The client's later words (Telegram, 2026-11-05, translated from Ukrainian)

> Did you make several pages? We only need one, no navigation and no menu.
> The footer has no links to Instagram, TikTok and WhatsApp.
> The second block with our horses — it is not in the mock-up, we are removing it.
> Please add some emoji like ⬛ ⬜ ⚫ so the list doesn't look so dull.

And from the person relaying it: the privacy policy and such technical pages should
stay as separate pages.

| Row | What | Quote |
|---|---|---|
| R10 | One page only — no navigation, no menu | "Нам лише одну треба, ніяких переходів і меню не треба" |
| R11 | Remove the horses block; it is not in the mock-up | "2 блок з нашими конями - його нема на макеті, прибираємо" |
| R12 | Instagram, TikTok and WhatsApp belong in the footer | "В футері нема посилань на інст, тікток і вотс ап" |
| R13 | Emoji in the quiz's option lists | "Додайте, будь ласка, якісь емодзі… щоб трохи не так нудно виглядав список" |
| R14 | The privacy policy and other technical pages stay separate | "политика конфидациальности и такие технические страницы пусть будут отдельно" |

R01 is narrowed by R10 and R11: "full" no longer means more pages.

## Done scenarios (final, after the client's change of scope)

1. I open https://dev.siteboosty.com on my phone — one page opens in under 2 seconds,
   looking like my mock-up, with real horse photographs.
2. There is no menu and no navigation anywhere: the header is just the logo.
3. There is no block of horses on the page.
4. I run the page through Google PageSpeed Insights — mobile 90+, desktop 95+.
5. Each answer in the quiz has an emoji in front of it, and the list does not look dull.
6. I go through the 4-question quiz and send it — I get a thank-you, and the request
   shows up in the admin panel with every answer and the time.
7. The footer links to the privacy policy and the imprint, and those open as their own
   pages. They say honestly what is collected and what is not yet filled in.
8. The footer shows Instagram, TikTok and WhatsApp as soon as I put the addresses in
   the admin panel, and shows nothing dead while they are empty.
9. I open the admin panel, log in with a password, change a text on the page, and in
   about a minute it is live.
10. A mistyped address shows my own page, not GitHub's.
11. The old pflegedienst-alno repository is still on GitHub, untouched.

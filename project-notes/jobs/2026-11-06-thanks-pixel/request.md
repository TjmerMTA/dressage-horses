# Request — thank-you page + pixel settings

Notebook v1 — updated 2026-11-06

## The person's words (verbatim)

R01 «добавь пожалуйста еще страницу спасибо»
R02 «+ в админку настройки для пикселя»
R03 «Щоб була окрема сторінка, гарно писалось :
SUCCESS
Thank you for filling the form. Our manager will text you in WhatsApp soon
Follow is in Instagram:
(Посилання на інсту)»

## English copy
R01 Please also add a thank-you page.
R02 Plus settings for the pixel in the admin.
R03 A separate page, nicely written: SUCCESS / Thank you for filling the form. Our manager
will text you in WhatsApp soon / Follow us on Instagram: (link to Instagram).

## Decided for the person (say if not)
- "Pixel" = Meta (Facebook/Instagram) Pixel: the audience arrives from Instagram. Others later.
- "Follow is in Instagram" corrected to "Follow us on Instagram".
- The Instagram link is the one already in the admin; the line is hidden while it is empty.
- EU site: the pixel loads only after the visitor accepts in a cookie banner; the banner
  exists only while a pixel id is set. The privacy page gains a Meta Pixel paragraph then.

## Done scenarios (drafted, not yet confirmed)
1. I fill the quiz and send it → I land on a separate page: SUCCESS, the thank-you text, the
   Instagram link.
2. In the admin I open the pixel setting, paste the pixel id, save → after publishing, the
   site sends PageView on every page and Lead on the thank-you page (after consent).
3. A visitor who declines cookies is never tracked.
4. With no pixel id set, the site has no banner and loads nothing from Meta.

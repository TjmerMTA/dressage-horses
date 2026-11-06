// Content collections — Astro 7: this file lives at src/content.config.ts and every
// collection has a loader.
//
// Page texts live in src/content/texts/<name>.json. Each JSON file is one plain object
// (easy for the admin panel to read and write back through the GitHub API). The
// `file()` loader would turn every top-level key into its own entry, so a tiny parser
// wraps the whole object into a single entry whose id is the file name:
//   getEntry('home', 'home').data  ->  the contents of home.json
//
// Long legal texts (privacy, imprint) are Markdown in src/content/pages/*.md.
import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { THANKS_CODE_MAX, isOneEmojiOrNone, metaPixelId } from './scripts/site-values.js';

const textFile = (name: string) =>
  file(`src/content/texts/${name}.json`, {
    parser: (text) => ({ [name]: JSON.parse(text) }),
  });

const meta = z.object({
  title: z.string(),
  description: z.string(),
});

const titledText = z.object({ title: z.string(), text: z.string() });


const home = defineCollection({
  loader: textFile('home'),
  schema: ({ image }) =>
    z.object({
      meta,
      hero: z.object({
        eyebrow: z.string(),
        title: z.string(),
        lead: z.string(),
        ticks: z.array(z.string()).min(1),
        cta: z.string(),
        ctaNote: z.string(),
        photo: image(),
        photoAlt: z.string().min(1),
        // Wide-screen crop focus (CSS object-position). Optional: without it the
        // mock-up's own value is used. Phones always use the mock-up's value.
        photoPosition: z.string().optional(),
      }),
      quiz: z.object({
        title: z.string(),
        intro: z.string(),
        stepLabel: z.string(), // "{step}" and "{total}" are replaced
        back: z.string(),
        steps: z
          .array(
            z.object({
              key: z.enum(['region', 'budget', 'format']),
              title: z.string(),
              // Each answer: the words (what the lead stores and the thank-you screen
              // repeats) and an optional emoji shown before them, hidden from screen readers.
              options: z
                .array(
                  z.object({
                    icon: z.string().refine(isOneEmojiOrNone, 'one emoji, or leave it empty'),
                    answer: z.string().min(1),
                  }),
                )
                .min(2),
            }),
          )
          .length(3),
        contactTitle: z.string(),
        nameLabel: z.string(),
        whatsappLabel: z.string(),
        whatsappPlaceholder: z.string(),
        whatsappHint: z.string(),
        consent: z.string(),
        submit: z.string(),
        sending: z.string(),
        errors: z.object({
          name: z.string(),
          whatsapp: z.string(),
          consent: z.string(),
          send: z.string(),
          sendNoWhatsapp: z.string().optional(), // used while no WhatsApp number is set
        }),
        // Shown in the quiz box when JavaScript is off (the quiz is built by a script).
        noScript: z.string(),
        noScriptLink: z.string(),
        noScriptEmail: z.string(),
        noScriptNone: z.string(),
      }),
      how: z.object({
        eyebrow: z.string(),
        title: z.string(),
        steps: z.array(titledText).min(1),
      }),
      services: z.object({
        eyebrow: z.string(),
        title: z.string(),
        items: z.array(titledText).min(1),
      }),
    }),
});

const site = defineCollection({
  loader: textFile('site'),
  schema: ({ image }) =>
    z.object({
      brand: z.string(), // company name for the footer; may stay empty
      siteTitle: z.string().min(1).default('Dressage horses'), // shown where the company name is still empty
      logo: image(),
      logoAlt: z.string().min(1),
      skipLink: z.string(),
      endpoint: z.string(), // where quiz leads are POSTed; empty = not sent anywhere yet
      links: z.object({ // empty = not set: the icon / button is not rendered
        instagram: z.string(),
        tiktok: z.string(),
        whatsapp: z.string(),
      }),
      tracking: z.object({
        // Meta (Facebook) Pixel id, digits only; empty = no pixel, no cookie banner.
        metaPixelId: z.string().refine((v) => v.trim() === '' || metaPixelId(v) !== null, 'digits only (the Pixel ID from Meta Events Manager), or leave it empty'),
        // HTML from an ad service (Google Ads, TikTok, …) for a lead; runs only on /thanks/, after
        // a sent quiz and the visitor's Accept. Empty = none. Its own presence turns the banner on.
        thanksCode: z.string().max(THANKS_CODE_MAX),
      }),
      footer: z.object({
        title: z.string(),
        lead: z.string(),
        leadNoWhatsapp: z.string().optional(), // used while no WhatsApp number is set
        cta: z.string(),
        photo: image(),
        photoAlt: z.string().min(1),
        photoPosition: z.string().optional(),
        links: z.array(z.object({ label: z.string(), href: z.string() })),
      }),
      stickyCta: z.string(),
      notFound: z.object({ // the 404 page, shown for any address that does not exist
        metaTitle: z.string(),
        eyebrow: z.string(),
        title: z.string(),
        lead: z.string(),
        home: z.string(),
      }),
      thanks: z.object({ // /thanks/, where the quiz sends the visitor after a successful send
        metaTitle: z.string().min(1),
        title: z.string().min(1),
        text: z.string(),
        instagramLead: z.string(), // shown before the Instagram link; the line is hidden while no link is set
      }),
      cookies: z.object({ // the consent banner, shown only while a Meta Pixel id or a thank-you page code is set
        title: z.string().min(1),
        text: z.string().min(1),
        privacyLink: z.string().min(1),
        accept: z.string().min(1),
        decline: z.string().min(1),
        change: z.string().min(1), // the button on /privacy/ that asks again
      }),
    }),
});

const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    eyebrow: z.string(),
    updated: z.coerce.date(),
    // privacy.md: set to true by the admin once the company has read and approved the text
    reviewed: z.boolean().default(false),
    // imprint.md: the company's legal facts; empty = not provided yet (the page says so)
    companyName: z.string().default(''),
    legalForm: z.string().default(''),
    address: z.string().default(''),
    enterpriseNumber: z.string().default(''),
    vatNumber: z.string().default(''),
    email: z.string().default(''),
  }),
});

// The horse catalogue: one Markdown file per horse in src/content/horses/. Since the
// site went back to one page (2026-11-05) nothing renders it; the collection stays so
// the build still checks the files the admin's Horses screen writes, and the catalogue
// can come back from git history.
const horses = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/horses' }),
  schema: z
      .object({
        name: z.string().min(1),
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and single hyphens'),
        price: z.number().positive().optional(), // EUR
        priceOnRequest: z.boolean().default(false),
        currency: z.string().regex(/^[A-Z]{3}$/).default('EUR'),
        year: z.number().int().min(1990).max(2100), // year of birth; the age is computed
        height: z.number().int().min(120).max(200), // cm at the withers
        sex: z.enum(['mare', 'gelding', 'stallion']),
        colour: z.string().min(1),
        breed: z.string().min(1),
        country: z.enum(['BE', 'DE', 'NL']),
        level: z.enum(['young horse', 'L', 'M', 'S', 'Prix St-Georges', 'Grand Prix']),
        sire: z.string().min(1),
        dam: z.string().min(1),
        damsire: z.string().min(1),
        xrays: z.enum(['clean', 'minor findings', 'not done']),
        video: z.url({ protocol: /^https?$/ }).optional(),
        // The first one is the cover. Checked as a path, not imported with image(): an
        // import would copy every horse photo into the build although nothing shows them.
        photos: z.array(z.string().regex(/^\.\.\/\.\.\/assets\/horses\/[\w.-]+\.(?:jpe?g|png|webp)$/i, 'a photo in src/assets/horses/')).min(1),
        // Optional alt texts, same order as `photos`. Missing ones are generated from
        // the horse's name, age, colour and sex.
        photoAlt: z.array(z.string().min(1)).optional(),
        listed: z.coerce.date().optional(), // when the horse went on sale ("Newest" sort)
        sold: z.boolean().default(false),
        featured: z.boolean().default(false),
        published: z.boolean().default(true),
        sample: z.boolean().default(false), // demo horse shipped with the site; safe to delete
      })
      .refine((h) => h.priceOnRequest || h.price !== undefined, {
        message: 'give a `price` or set `priceOnRequest: true`',
        path: ['price'],
      }),
});

export const collections = { home, site, pages, horses };

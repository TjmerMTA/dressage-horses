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

const textFile = (name: string) =>
  file(`src/content/texts/${name}.json`, {
    parser: (text) => ({ [name]: JSON.parse(text) }),
  });

const meta = z.object({
  title: z.string(),
  description: z.string(),
});

const pageHeader = z.object({
  eyebrow: z.string(),
  title: z.string(),
  lead: z.string().optional(),
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
              options: z.array(z.string()).min(2),
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
        }),
        thanksTitle: z.string(),
        thanksNamed: z.string(), // "{name}" is replaced
        thanksText: z.string(),
        recap: z.object({ region: z.string(), budget: z.string(), format: z.string() }),
        whatsappNow: z.string(),
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
      nav: z.array(z.object({ label: z.string(), href: z.string() })).min(1),
      menuLabel: z.string(),
      footer: z.object({
        title: z.string(),
        lead: z.string(),
        cta: z.string(),
        photo: image(),
        photoAlt: z.string().min(1),
        photoPosition: z.string().optional(),
        links: z.array(z.object({ label: z.string(), href: z.string() })),
      }),
      stickyCta: z.string(),
    }),
});

const services = defineCollection({
  loader: textFile('services'),
  schema: z.object({
    meta,
    header: pageHeader,
    sectionTitle: z.string(),
    items: z
      .array(z.object({ title: z.string(), text: z.string(), includes: z.array(z.string()) }))
      .min(1),
    cta: z.object({ title: z.string(), text: z.string(), button: z.string() }),
  }),
});

const about = defineCollection({
  loader: textFile('about'),
  schema: z.object({
    meta,
    header: pageHeader,
    figures: z.array(z.object({ value: z.string(), label: z.string() })).min(1),
    story: z.object({ eyebrow: z.string(), title: z.string(), paragraphs: z.array(z.string()).min(1) }),
    why: z.object({ eyebrow: z.string(), title: z.string(), ticks: z.array(z.string()).min(1) }),
    cta: z.object({ title: z.string(), text: z.string(), button: z.string() }),
  }),
});

const contact = defineCollection({
  loader: textFile('contact'),
  schema: z.object({
    meta,
    header: pageHeader,
    channels: z
      .array(
        z.object({
          link: z.enum(['whatsapp', 'instagram', 'tiktok', 'quiz']),
          title: z.string(),
          text: z.string(),
          button: z.string(),
        }),
      )
      .min(1),
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

// The horse catalogue: one Markdown file per horse in src/content/horses/. The file's
// `slug` becomes the entry id (the glob loader uses a front-matter `slug` when present),
// so the page lives at /horses/<slug>/. The Markdown body is the description.
const horses = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/horses' }),
  schema: ({ image }) =>
    z
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
        photos: z.array(image()).min(1), // the first one is the cover
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

// Texts of the catalogue pages (/horses/, the horse pages, the home-page strip).
const catalogue = defineCollection({
  loader: textFile('catalogue'),
  schema: z.object({
    meta,
    header: pageHeader,
    filters: z.object({
      title: z.string(),
      sex: z.string(),
      country: z.string(),
      level: z.string(),
      priceMin: z.string(),
      priceMax: z.string(),
      sort: z.string(),
      any: z.string(),
      sortNewest: z.string(),
      sortPriceUp: z.string(),
      sortPriceDown: z.string(),
      reset: z.string(),
      count: z.string(), // "{count}" is replaced
      countOne: z.string(),
      empty: z.string(),
      emptyText: z.string(),
    }),
    priceSteps: z.array(z.number().positive()).min(2),
    labels: z.object({
      sold: z.string(),
      priceOnRequest: z.string(),
      age: z.string(), // "{age}" is replaced
      height: z.string(), // "{height}" is replaced
      level: z.string(), // "{level}" is replaced; used for L, M and S
      youngHorse: z.string(),
      mare: z.string(),
      gelding: z.string(),
      stallion: z.string(),
      BE: z.string(),
      DE: z.string(),
      NL: z.string(),
    }),
    detail: z.object({
      back: z.string(),
      eyebrow: z.string(), // "{country}" is replaced
      lead: z.string(), // "{age}", "{colour}", "{sex}", "{height}", "{level}" are replaced
      gallery: z.string(), // "{name}" is replaced
      photo: z.string(), // "{n}" and "{total}" are replaced
      prev: z.string(),
      next: z.string(),
      factsTitle: z.string(),
      pedigreeTitle: z.string(),
      descriptionTitle: z.string(),
      videoTitle: z.string(),
      videoLink: z.string(),
      enquire: z.string(), // "{name}" is replaced
      enquireNote: z.string(),
      soldNote: z.string(),
      facts: z.object({
        price: z.string(),
        age: z.string(),
        born: z.string(),
        height: z.string(),
        sex: z.string(),
        colour: z.string(),
        breed: z.string(),
        country: z.string(),
        level: z.string(),
        xrays: z.string(),
        sire: z.string(),
        dam: z.string(),
        damsire: z.string(),
      }),
      xrays: z.object({ clean: z.string(), 'minor findings': z.string(), 'not done': z.string() }),
      cta: z.object({ title: z.string(), text: z.string(), button: z.string() }),
      metaTitle: z.string(), // "{name}", "{age}", "{colour}", "{sex}", "{level}" are replaced
      metaDescription: z.string(),
    }),
    featured: z.object({ eyebrow: z.string(), title: z.string(), all: z.string() }),
    quiz: z.object({
      horseNote: z.string(), // "{name}" is replaced
      horseRecap: z.string(),
    }),
  }),
});

export const collections = { home, site, services, about, contact, pages, horses, catalogue };

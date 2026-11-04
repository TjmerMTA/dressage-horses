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
      logo: image(),
      logoAlt: z.string().min(1),
      skipLink: z.string(),
      endpoint: z.string(), // where quiz leads are POSTed; empty = not sent anywhere yet
      links: z.object({
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
  }),
});

export const collections = { home, site, services, about, contact, pages };

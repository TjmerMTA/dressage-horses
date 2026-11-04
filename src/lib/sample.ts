// Example listings: the horses shipped with the site to show how the catalogue works.
// A horse file with `sample: true` is one of them. Everything a visitor sees about that —
// the marker on its card and its page, the reworded catalogue lead — is driven by the
// flag alone, so it disappears by itself when the client replaces the samples with real
// horses (or drops the flag).
//
// The wording lives here, in one place. It is not yet editable in the admin: moving it
// into src/content/texts/catalogue.json needs a matching schema entry in
// src/content.config.ts.
import type { Horse } from './horses';

export const isSample = (horse: Horse): boolean => horse.data.sample === true;

export const SAMPLE = {
  /** The pill on the photo (card) and in the summary box (horse page). */
  badge: 'Example listing',
  /** Under the price on a card. */
  cardNote: 'Not for sale. A sample that shows how a listing looks.',
  /** Appended, visually hidden, to the card's link so it is announced with the name. */
  linkSuffix: ' (example listing, not for sale)',
  /** Replaces "Dressage horse · <country>" above the horse page's title. */
  eyebrow: 'Example listing · not for sale',
  /** In the horse page's summary box, in place of the enquiry note. */
  detailNote:
    'This horse is an example that shows how a listing looks on this site. It is not for sale. Tell us what you are looking for and we’ll search for horses that fit.',
  /** Page title and description of a sample horse page. */
  title: (name: string) => `${name}: example listing, not for sale`,
  description: (name: string) =>
    `${name} is an example listing that shows how a horse is presented on this site. It is not a horse for sale.`,
  /** The catalogue's lead while every listed horse is a sample. */
  catalogueLeadAll:
    'The horses below are example listings. They show how the catalogue works and are not for sale. Tell us what you are looking for and we’ll search our network in Belgium, Germany and the Netherlands for you.',
  /** The catalogue's lead while real horses and samples are listed side by side. */
  catalogueLeadSome:
    'A selection of horses from our network in Belgium, Germany and the Netherlands. Listings marked “Example listing” only show how the catalogue works and are not for sale. Not the right one yet? Take the quiz and we’ll look for you.',
} as const;

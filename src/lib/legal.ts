// The company's legal facts and the ways to reach it, read in one place for the imprint
// and the privacy policy, so the two pages can never disagree. The facts live in the
// front matter of src/content/pages/imprint.md, the WhatsApp link in
// src/content/texts/site.json — both editable in the admin. Nothing here is ever made up:
// a fact that is not set is reported as missing, and a channel that is not set is left
// out, so both pages update themselves when the client fills them in.
import { getEntry } from 'astro:content';
import { getSite } from './texts';
import { IMPRINT_FIELDS, isSet, whatsappHref } from '../scripts/site-values.js';

export interface LegalFacts {
  /** Company facts that are set, in the imprint's order (e-mail is a channel, not listed here). */
  known: { key: string; label: string; value: string }[];
  /** Labels of the company facts still missing, e.g. "Registered company name". */
  missing: string[];
  /** A fact's value, or '' when it is not set. */
  fact: (key: string) => string;
  /** The company's e-mail address, or '' when none is set. */
  email: string;
  /** https://wa.me/<number>, or null while no WhatsApp number is set. */
  whatsapp: string | null;
  /** The imprint's own "updated" date, as "5 November 2026". */
  asOf: string;
}

export const formatDay = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "Registered office" -> "registered office"; "VAT number" stays as it is. */
export const lowerFirst = (s: string) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** "a", "a and b", "a, b and c". */
export const listText = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

export async function getLegalFacts(): Promise<LegalFacts> {
  const entry = await getEntry('pages', 'imprint');
  if (!entry) throw new Error('src/content/pages/imprint.md is missing');
  const site = await getSite();
  const data = entry.data as unknown as Record<string, unknown>;
  const raw = (k: string) => (typeof data[k] === 'string' ? (data[k] as string).trim() : '');
  const fact = (k: string) => (isSet(raw(k)) ? raw(k) : '');
  const companyFacts = IMPRINT_FIELDS.filter(([k]) => k !== 'email');
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fact('email')) ? fact('email') : '';
  return {
    known: companyFacts.filter(([k]) => fact(k)).map(([key, label]) => ({ key, label, value: fact(key) })),
    missing: companyFacts.filter(([k]) => !fact(k)).map(([, label]) => label.replace(/ \(.*\)$/, '')),
    fact,
    email,
    whatsapp: whatsappHref(site.links.whatsapp),
    asOf: formatDay(entry.data.updated),
  };
}

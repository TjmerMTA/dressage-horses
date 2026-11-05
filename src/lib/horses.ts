import { getCollection, type CollectionEntry } from 'astro:content';
import { getCatalogue } from './texts';

export type Horse = CollectionEntry<'horses'>;
type Catalogue = Awaited<ReturnType<typeof getCatalogue>>;

/**
 * Every horse that may appear on the site. Unpublished horses are dropped here, and this
 * is the only way the pages read the collection — so the list, the home-page strip and
 * getStaticPaths all leave them out (a filter in one place only would leave the page
 * reachable by direct link).
 */
export async function getPublishedHorses(): Promise<Horse[]> {
  const all = await getCollection('horses', ({ data }) => data.published);
  return sortHorses(all);
}

/** "Newest" order: most recently listed first (then youngest, then name); sold horses last. */
export function sortHorses(horses: Horse[]): Horse[] {
  return [...horses].sort((a, b) => {
    if (a.data.sold !== b.data.sold) return a.data.sold ? 1 : -1;
    const la = a.data.listed?.getTime() ?? 0;
    const lb = b.data.listed?.getTime() ?? 0;
    if (la !== lb) return lb - la;
    if (a.data.year !== b.data.year) return b.data.year - a.data.year;
    return a.data.name.localeCompare(b.data.name, 'en');
  });
}

/** Age in years as horses count it: everyone gets a year older on 1 January. */
export function ageOf(horse: Horse, now = new Date()): number {
  return now.getUTCFullYear() - horse.data.year;
}

export function formatPrice(horse: Horse, t: Catalogue): string {
  const { price, priceOnRequest, currency } = horse.data;
  if (priceOnRequest || price === undefined) return t.labels.priceOnRequest;
  return formatAmount(price, currency);
}

export function formatAmount(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

/** Replaces {key} placeholders in a text from catalogue.json. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

export function sexLabel(horse: Horse, t: Catalogue): string {
  return t.labels[horse.data.sex];
}

export function countryLabel(horse: Horse, t: Catalogue): string {
  return t.labels[horse.data.country];
}

/** Alt text for photo `i`: the one written in the file, or one built from the facts. */
export function photoAlt(horse: Horse, i: number, t: Catalogue): string {
  const given = horse.data.photoAlt?.[i];
  if (given) return given;
  const { name, colour } = horse.data;
  const base = `${name}, ${ageOf(horse)}-year-old ${colour} ${sexLabel(horse, t).toLowerCase()}`;
  return horse.data.photos.length > 1
    ? `${base} — ${fill(t.detail.photo, { n: i + 1, total: horse.data.photos.length }).toLowerCase()}`
    : base;
}

export function horseHref(horse: Horse): string {
  return `/horses/${horse.id}/`;
}

export function enquiryHref(horse: Horse): string {
  return `/#quiz?horse=${encodeURIComponent(horse.id)}`;
}

/** Up to `count` horses for the home page: featured first, then the newest unsold ones. */
export function pickFeatured(horses: Horse[], count = 4): Horse[] {
  const unsold = horses.filter((h) => !h.data.sold);
  const featured = unsold.filter((h) => h.data.featured);
  const rest = unsold.filter((h) => !h.data.featured);
  return [...featured, ...rest].slice(0, count);
}

/**
 * The level as a value under a "Level" label (the Facts table): "S", not "Level S" —
 * levelLabel() there gave "Level Level S".
 */
export function levelValue(level: Horse['data']['level'], t: Catalogue): string {
  return level === 'young horse' ? t.labels.youngHorse : level;
}

/** "Level S", "Young horse", "Grand Prix": how the level reads on its own. */
export function levelLabel(level: Horse['data']['level'], t: Catalogue): string {
  if (level === 'young horse') return t.labels.youngHorse;
  if (level.length === 1) return fill(t.labels.level, { level });
  return level;
}

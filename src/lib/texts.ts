import { getEntry } from 'astro:content';

// Each texts collection holds exactly one entry whose id equals the collection name
// (see src/content.config.ts). These helpers fail the build loudly if a file is missing.

export async function getHome() {
  const entry = await getEntry('home', 'home');
  if (!entry) throw new Error('src/content/texts/home.json is missing');
  return entry.data;
}

export async function getSite() {
  const entry = await getEntry('site', 'site');
  if (!entry) throw new Error('src/content/texts/site.json is missing');
  return entry.data;
}

export async function getServices() {
  const entry = await getEntry('services', 'services');
  if (!entry) throw new Error('src/content/texts/services.json is missing');
  return entry.data;
}

export async function getAbout() {
  const entry = await getEntry('about', 'about');
  if (!entry) throw new Error('src/content/texts/about.json is missing');
  return entry.data;
}

export async function getContact() {
  const entry = await getEntry('contact', 'contact');
  if (!entry) throw new Error('src/content/texts/contact.json is missing');
  return entry.data;
}

/** "/#quiz" from inner pages, "#quiz" on the home page (as in the mock-up). */
export function quizHref(pathname: string) {
  return pathname === '/' ? '#quiz' : '/#quiz';
}

export async function getCatalogue() {
  const entry = await getEntry('catalogue', 'catalogue');
  if (!entry) throw new Error('src/content/texts/catalogue.json is missing');
  return entry.data;
}

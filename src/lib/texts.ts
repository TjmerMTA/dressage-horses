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

/** "#quiz" on the home page (as in the mock-up), "/#quiz" from the privacy policy, the imprint and the 404 page. */
export function quizHref(pathname: string) {
  return pathname === '/' ? '#quiz' : '/#quiz';
}


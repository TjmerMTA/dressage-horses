// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://koni.quest',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  // The admin panel is not for search engines (robots.txt disallows it as well), and
  // /sketch/ pages are decisions for the client, not part of the site (noindex as well);
  // /thanks/ is reached only by sending the quiz (noindex as well).
  integrations: [sitemap({ filter: (page) => !page.includes('/admin/') && !page.includes('/sketch/') && !page.includes('/thanks/') })],
});

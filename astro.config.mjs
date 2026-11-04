// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://dev.siteboosty.com',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  // The admin panel is not for search engines (robots.txt disallows it as well).
  integrations: [sitemap({ filter: (page) => !page.includes('/admin/') })],
});

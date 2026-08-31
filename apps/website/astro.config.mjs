import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

export default defineConfig({
  site: 'https://github.com/Incantly/canvas',
  integrations: [sitemap()],
  build: { inlineStylesheets: 'auto' },
})

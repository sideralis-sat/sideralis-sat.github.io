import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * robots.txt y sitemap.xml para los buscadores. Necesitan la dirección completa de la web,
 * que en GitHub Pages llega en VITE_SITE_URL al construir; en local no se generan.
 */
function seoFiles(): Plugin {
  return {
    name: 'seo-files',
    apply: 'build',
    generateBundle() {
      const site = (process.env.VITE_SITE_URL ?? '').trim()
      if (!/^https?:\/\//.test(site)) return
      const url = site.endsWith('/') ? site : `${site}/`
      const today = new Date().toISOString().slice(0, 10)
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${url}sitemap.xml\n` })
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>\n</urlset>\n`,
      })
    },
  }
}

// BASE_PATH permite publicar en un subdirectorio (p. ej. GitHub Pages: /orbita/)
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), seoFiles()],
  worker: { format: 'es' },
  // three.js + R3F ocupan ~1 MB (~320 kB comprimido); es lo esperable en una app 3D
  build: { chunkSizeWarningLimit: 1800 },
})

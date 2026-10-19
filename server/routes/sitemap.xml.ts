import { PUBLIC_PAGES } from '~~/shared/site'

export default defineEventHandler((event) => {
  const origin = siteUrl(event)
  const urls = PUBLIC_PAGES.map(page => `  <url><loc>${origin}${page.path}</loc></url>`).join('\n')
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
})

export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /album/',
    'Disallow: /guest/',
    'Disallow: /studio/albums/',
    'Disallow: /studio/members',
    'Disallow: /studio/invite',
    'Disallow: /studio/reset-password',
    '',
    `Sitemap: ${siteUrl(event)}/sitemap.xml`,
    '',
  ].join('\n')
})

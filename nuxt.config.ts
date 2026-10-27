import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-13',
  modules: ['@pinia/nuxt'],
  nitro: {
    vercel: {
      functions: { runtime: 'nodejs24.x' },
    },
  },
  routeRules: {
    // Customer links carry a capability token in the query string.
    '/album/**': { headers: { 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow' } },
    '/guest/**': { headers: { 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow' } },
    '/studio/invite': { headers: { 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow' } },
    '/studio/reset-password': { headers: { 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow' } },
    '/studio/albums/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/studio/members': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/studio/analytics': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/admin/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/api/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'vi' },
      meta: [{ name: 'theme-color', content: '#f8f7f3' }],
      link: [
        { rel: 'icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/favicon-32x32.png' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
      ],
    },
  },
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  runtimeConfig: {
    databaseUrl: '',
    databaseDirectUrl: '',
    betterAuthSecret: '',
    betterAuthUrl: '',
    googleApiKey: '',
    driveVerified: '',
    googleClientId: '',
    googleClientSecret: '',
    ga4PropertyId: '',
    ga4PropertyTimezone: '',
    ga4ServiceAccountJson: '',
    public: {
      // Absolute origin for canonical, sitemap and structured data; falls back to the request origin.
      siteUrl: '',
      ga4Enabled: '',
      ga4MeasurementId: '',
      studioGalleryAnalyticsEnabled: '',
    },
  },
})

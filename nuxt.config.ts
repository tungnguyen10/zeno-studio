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
  },
})

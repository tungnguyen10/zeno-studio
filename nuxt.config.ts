import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-13',
  modules: ['@pinia/nuxt'],
  nitro: {
    vercel: {
      functions: { runtime: 'nodejs24.x' },
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
  },
})

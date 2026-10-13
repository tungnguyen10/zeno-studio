import { createStudioAuth } from './server/utils/auth'

export const auth = createStudioAuth({
  databaseUrl: process.env.NUXT_DATABASE_DIRECT_URL ?? 'postgresql://auth:auth@localhost:5432/photo_workflow',
  baseURL: process.env.NUXT_BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.NUXT_BETTER_AUTH_SECRET ?? 'local-schema-generation-secret-at-least-32-chars',
})

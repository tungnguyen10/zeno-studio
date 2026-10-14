import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

it('uses the Vercel deployment URL for Better Auth when no explicit origin is configured', async () => {
  vi.stubEnv('NUXT_DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
  vi.stubEnv('NUXT_BETTER_AUTH_SECRET', 'preview-secret-at-least-thirty-two-characters')
  vi.stubEnv('NUXT_BETTER_AUTH_URL', '')
  vi.stubEnv('VERCEL_URL', 'zeno-studio-preview.vercel.app')

  const { getStudioAuth } = await import('../../server/utils/auth')
  expect(getStudioAuth().options.baseURL).toBe('https://zeno-studio-preview.vercel.app')
}, 20_000)

it('keeps an explicitly configured Better Auth origin', async () => {
  vi.stubEnv('NUXT_DATABASE_URL', 'postgresql://user:pass@localhost:5432/test')
  vi.stubEnv('NUXT_BETTER_AUTH_SECRET', 'preview-secret-at-least-thirty-two-characters')
  vi.stubEnv('NUXT_BETTER_AUTH_URL', 'https://studio.example.com')
  vi.stubEnv('VERCEL_URL', 'zeno-studio-preview.vercel.app')

  const { getStudioAuth } = await import('../../server/utils/auth')
  expect(getStudioAuth().options.baseURL).toBe('https://studio.example.com')
}, 20_000)

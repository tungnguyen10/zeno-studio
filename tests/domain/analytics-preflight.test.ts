import { describe, expect, it } from 'vitest'
import { checkAnalyticsConfig } from '../../scripts/check-analytics-config.mjs'

const valid = {
  NUXT_PUBLIC_GA4_ENABLED: 'true',
  NUXT_PUBLIC_GA4_MEASUREMENT_ID: 'G-TEST123',
  NUXT_ANALYTICS_ID_SECRET: 'test-only-secret-at-least-thirty-two-characters',
  VERCEL_ENV: 'production',
  VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
}

describe('analytics release preflight', () => {
  it('does not require analytics secrets when the gate is off', () => {
    expect(checkAnalyticsConfig({})).toEqual([])
    expect(checkAnalyticsConfig({ NUXT_PUBLIC_GA4_ENABLED: 'false' })).toEqual([])
  })
  it('accepts valid production config and derived version', () => {
    expect(checkAnalyticsConfig(valid)).toEqual([])
  })
  it('rejects invalid production config using names only', () => {
    const result = checkAnalyticsConfig({ ...valid, NUXT_ANALYTICS_ID_SECRET: 'secret-sentinel', NUXT_PUBLIC_GA4_MEASUREMENT_ID: 'bad-id-sentinel', NUXT_PUBLIC_ANALYTICS_APP_VERSION: 'local' })
    expect(result).toEqual(expect.arrayContaining(['NUXT_ANALYTICS_ID_SECRET', 'NUXT_PUBLIC_GA4_MEASUREMENT_ID', 'NUXT_PUBLIC_ANALYTICS_APP_VERSION']))
    expect(JSON.stringify(result)).not.toMatch(/sentinel/)
  })
  it('rejects Preview mislabeled as production and production mislabeled as development', () => {
    expect(checkAnalyticsConfig({ ...valid, VERCEL_ENV: 'preview', NUXT_PUBLIC_ANALYTICS_ENVIRONMENT: 'production' })).toContain('NUXT_PUBLIC_ANALYTICS_ENVIRONMENT')
    expect(checkAnalyticsConfig({ ...valid, NUXT_PUBLIC_ANALYTICS_ENVIRONMENT: 'development' })).toContain('NUXT_PUBLIC_ANALYTICS_ENVIRONMENT')
  })
  it('rejects versions the runtime would sanitize to local', () => {
    expect(checkAnalyticsConfig({ ...valid, NUXT_PUBLIC_ANALYTICS_APP_VERSION: 'release-2026' })).toContain('NUXT_PUBLIC_ANALYTICS_APP_VERSION')
  })
  it('rejects explicit empty public overrides instead of assuming build fallbacks', () => {
    expect(checkAnalyticsConfig({ ...valid, NUXT_PUBLIC_ANALYTICS_ENVIRONMENT: '' })).toContain('NUXT_PUBLIC_ANALYTICS_ENVIRONMENT')
    expect(checkAnalyticsConfig({ ...valid, NUXT_PUBLIC_ANALYTICS_APP_VERSION: '' })).toContain('NUXT_PUBLIC_ANALYTICS_APP_VERSION')
  })
  it('accepts a test property on Preview with the staging label', () => {
    expect(checkAnalyticsConfig({ ...valid, VERCEL_ENV: 'preview', NUXT_PUBLIC_ANALYTICS_ENVIRONMENT: 'staging' })).toEqual([])
  })
})

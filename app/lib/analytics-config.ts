// Nuxt runtime overrides may parse the environment string "true" as a boolean.
export function isAnalyticsEnabled(flag: unknown, measurementId: unknown): boolean {
  return (flag === true || flag === 'true')
    && typeof measurementId === 'string' && /^G-[A-Z0-9]+$/.test(measurementId)
}

import type { AnalyticsEnvironment } from '~~/shared/domain/analytics'

export function analyticsDeploymentEnvironment(override: unknown, deployment?: unknown): AnalyticsEnvironment {
  if (override === 'production' || override === 'staging' || override === 'development') return override
  if (deployment === 'production') return 'production'
  if (deployment === 'preview') return 'staging'
  return 'development'
}

export function analyticsAppVersion(override: unknown, commitSha?: unknown): string {
  if (override === 'local' || (typeof override === 'string' && /^[a-f0-9]{7,12}$/i.test(override))) return override
  if (typeof commitSha === 'string' && /^[a-f0-9]{7,64}$/i.test(commitSha)) return commitSha.slice(0, 7)
  return 'local'
}

export function analyticsCommonContext(environment: unknown, version: unknown) {
  return {
    environment: analyticsDeploymentEnvironment(environment),
    app_version: analyticsAppVersion(version),
    taxonomy_version: 'zeno_v2' as const,
  }
}

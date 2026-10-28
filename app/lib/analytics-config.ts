// Nuxt runtime overrides may parse the environment string "true" as a boolean.
export function isAnalyticsEnabled(flag: unknown, measurementId: unknown): boolean {
  return (flag === true || flag === 'true')
    && typeof measurementId === 'string' && /^G-[A-Z0-9]+$/.test(measurementId)
}

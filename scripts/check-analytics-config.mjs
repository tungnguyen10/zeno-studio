import { pathToFileURL } from 'node:url'

/** Validate deployment configuration without reading or writing user data.
 * @param {Record<string, string | undefined>} env
 * @returns {string[]} Invalid/missing configuration names only.
 */
export function checkAnalyticsConfig(env) {
  if (env.NUXT_PUBLIC_GA4_ENABLED !== 'true') return []
  const invalid = []
  const expected = env.VERCEL_ENV === 'production' ? 'production' : env.VERCEL_ENV === 'preview' ? 'staging' : 'development'
  const environment = env.NUXT_PUBLIC_ANALYTICS_ENVIRONMENT ?? expected
  const version = env.NUXT_PUBLIC_ANALYTICS_APP_VERSION ?? (env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || 'local')
  if (!/^G-[A-Z0-9]+$/.test(env.NUXT_PUBLIC_GA4_MEASUREMENT_ID || '')) invalid.push('NUXT_PUBLIC_GA4_MEASUREMENT_ID')
  if ((env.NUXT_ANALYTICS_ID_SECRET?.trim().length || 0) < 32) invalid.push('NUXT_ANALYTICS_ID_SECRET')
  if (!['production', 'staging', 'development'].includes(environment) || environment !== expected) invalid.push('NUXT_PUBLIC_ANALYTICS_ENVIRONMENT')
  if (!(version === 'local' || /^[a-f0-9]{7,12}$/i.test(version)) || (environment === 'production' && version === 'local')) invalid.push('NUXT_PUBLIC_ANALYTICS_APP_VERSION')
  return invalid
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const invalid = checkAnalyticsConfig(process.env)
  if (invalid.length) {
    process.stderr.write(`Analytics configuration missing or invalid: ${invalid.join(', ')}\n`)
    process.exitCode = 1
  } else process.stdout.write('Analytics configuration check passed.\n')
}

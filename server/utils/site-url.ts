import type { H3Event } from 'h3'
import { normalizeSiteUrl } from '~~/shared/site'

export function siteUrl(event: H3Event): string {
  return normalizeSiteUrl(useRuntimeConfig(event).public.siteUrl || getRequestURL(event).origin)
}

import { normalizeSiteUrl } from '~~/shared/site'

export function useSiteUrl(): string {
  return normalizeSiteUrl(useRuntimeConfig().public.siteUrl || useRequestURL().origin)
}

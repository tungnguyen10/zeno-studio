<script setup lang="ts">
import { SITE_NAME, SITE_OG_IMAGE } from '~~/shared/site'

const route = useRoute()
const siteUrl = useSiteUrl()
// Path only: query strings can carry capability tokens.
const pageUrl = computed(() => `${siteUrl}${route.path === '/' ? '/' : route.path.replace(/\/+$/, '')}`)
const socialImageUrl = `${siteUrl}${SITE_OG_IMAGE.path}`

useHead({ link: [{ rel: 'canonical', href: pageUrl }] })
useSeoMeta({
  ogSiteName: SITE_NAME,
  ogLocale: 'vi_VN',
  ogType: 'website',
  ogUrl: pageUrl,
  ogImage: socialImageUrl,
  ogImageType: SITE_OG_IMAGE.type,
  ogImageWidth: SITE_OG_IMAGE.width,
  ogImageHeight: SITE_OG_IMAGE.height,
  ogImageAlt: SITE_OG_IMAGE.alt,
  twitterCard: 'summary_large_image',
  twitterImage: socialImageUrl,
  twitterImageAlt: SITE_OG_IMAGE.alt,
})
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtPage />
  <AnalyticsConsent />
</template>

<script setup lang="ts">
import { SITE_NAME, SITE_OG_IMAGE } from '~~/shared/site'

const route = useRoute()
const siteUrl = useSiteUrl()
// Path only: query strings can carry capability tokens.
const pageUrl = computed(() => `${siteUrl}${route.path === '/' ? '/' : route.path.replace(/\/+$/, '')}`)

useHead({ link: [{ rel: 'canonical', href: pageUrl }] })
useSeoMeta({
  ogSiteName: SITE_NAME,
  ogLocale: 'vi_VN',
  ogType: 'website',
  ogUrl: pageUrl,
  ogImage: `${siteUrl}${SITE_OG_IMAGE.path}`,
  ogImageWidth: SITE_OG_IMAGE.width,
  ogImageHeight: SITE_OG_IMAGE.height,
  ogImageAlt: SITE_OG_IMAGE.alt,
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtPage />
</template>

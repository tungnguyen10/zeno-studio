<script setup lang="ts">
const route = useRoute()
const albumId = String(route.params.albumId)
const studioId = typeof route.query.studio === 'string' ? route.query.studio : ''
useSeoMeta({ title: 'Chi tiết album — Studio' })
</script>

<template>
  <AlbumWorkspace
    :api-root="`/api/studio/${studioId}/albums/${albumId}`"
    back-to="/studio"
    :results-to="`/studio/albums/${albumId}/results?studio=${studioId}`"
  />
</template>

<script setup lang="ts">
const route = useRoute()
const albumId = String(route.params.albumId)
const studioId = typeof route.query.studio === 'string' ? route.query.studio : ''
useSeoMeta({ title: 'Kết quả chọn ảnh — Zeno Studio' })
</script>

<template>
  <AlbumResults :api-root="`/api/studio/${studioId}/albums/${albumId}`" :back-to="`/studio/albums/${albumId}?studio=${studioId}`" />
</template>

<script setup lang="ts">
const route = useRoute()
const albumId = String(route.params.albumId)
useSeoMeta({ title: 'Kết quả chọn ảnh — Zeno Studio' })
</script>

<template>
  <AlbumResults :api-root="`/api/guest/albums/${albumId}`" :back-to="`/guest/albums/${albumId}`" :filter-base="`/guest/albums/${albumId}/filter`" />
</template>

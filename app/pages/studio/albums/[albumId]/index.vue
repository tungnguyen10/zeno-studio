<script setup lang="ts">
import { onMounted } from 'vue'
import { effectiveStatus, type AlbumStatus } from '~~/shared/domain/album-status'
import { useStudioStore } from '~/stores/studio'

const route = useRoute()
const store = useStudioStore()
const albumId = String(route.params.albumId)
const studioId = typeof route.query.studio === 'string' ? route.query.studio : ''
useSeoMeta({ title: 'Chi tiết album — Studio' })
// Only needed for the role-gated share actions; a failure leaves them hidden.
onMounted(() => { void store.ensureStudios(studioId) })
</script>

<template>
  <AlbumWorkspace
    :api-root="`/api/studio/${studioId}/albums/${albumId}`"
    :back-to="`/studio?studio=${studioId}`"
    back-label="Album"
    :results-to="`/studio/albums/${albumId}/results?studio=${studioId}`"
    :can-publish="store.canManage"
    :can-share="store.canShare"
  >
    <template #actions="{ workspace, reload }">
      <StudioAlbumShareActions
        compact
        :album-title="workspace.title"
        :studio-id="studioId"
        :album-id="albumId"
        :status="effectiveStatus({ status: workspace.status as AlbumStatus, expiresAt: workspace.expiresAt })"
        :can-publish="store.canManage"
        :can-share="store.canShare"
        :primary="workspace.status === 'DRAFT'"
        @published="reload"
      />
    </template>
  </AlbumWorkspace>
</template>

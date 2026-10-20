<script setup lang="ts">
import { ref, watch } from 'vue'
import type { StudioAlbum } from '~/lib/studio-album'

const props = defineProps<{ studioId: string; album: StudioAlbum | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ changed: [] }>()
const busy = ref(false)
const error = ref('')

watch(open, value => { if (value) error.value = '' })

async function remove() {
  if (!props.album) return
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/studio/${props.studioId}/albums/${props.album.id}`, { method: 'DELETE' })
    open.value = false
    emit('changed')
  } catch (cause) {
    const status = cause && typeof cause === 'object' ? (cause as { data?: { statusMessage?: unknown } }).data?.statusMessage : null
    error.value = typeof status === 'string' && status ? status : 'Không xóa được bản nháp. Vui lòng thử lại.'
  } finally { busy.value = false }
}
</script>

<template>
  <UiModal v-model:open="open" title="Xóa bản nháp?" description="Hành động này không thể hoàn tác.">
    <div v-if="album" class="space-y-4">
      <p class="text-sm leading-6">Album <strong class="break-words">{{ album.title }}</strong> và ảnh đã nhập trong bản nháp sẽ bị xóa khỏi Zeno Studio. Ảnh gốc trên Google Drive không bị xóa.</p>
      <UiNotice v-if="error" tone="error">{{ error }}</UiNotice>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <UiButton variant="ghost" @click="open = false">Giữ album</UiButton>
        <UiButton variant="danger" :loading="busy" @click="remove">Xóa bản nháp</UiButton>
      </div>
    </div>
  </UiModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { studioAlbumErrorMessage } from '~/lib/studio-album-error'

const props = defineProps<{ studioId: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ changed: [] }>()

const title = ref('')
const folderUrl = ref('')
const limit = ref(30)
const days = ref<15 | 30>(15)
const busy = ref(false)
const error = ref('')
const created = ref<{ id: string; title: string; photoCount: number } | null>(null)

watch(open, value => {
  if (!value) return
  title.value = ''
  folderUrl.value = ''
  error.value = ''
  created.value = null
})

async function submit() {
  busy.value = true
  error.value = ''
  try {
    const result = await $fetch<{ album: { id: string; title: string; photoCount: number } }>(`/api/studio/${props.studioId}/albums`, {
      method: 'POST',
      body: { title: title.value, folderUrl: folderUrl.value, expiresInDays: days.value, limit: { kind: 'maximum', count: limit.value } },
    })
    created.value = result.album
    emit('changed')
  } catch (cause) { error.value = studioAlbumErrorMessage(cause) }
  finally { busy.value = false }
}

const field = 'mt-1 min-h-11 w-full rounded-xl border border-[#d9ddd2] px-3 py-2 font-normal focus-visible:border-brand-soft focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-soft'
</script>

<template>
  <UiModal v-model:open="open" :title="created ? 'Album đã được tạo' : 'Tạo album từ Google Drive'" :description="created ? 'Xuất bản để lấy link gửi khách, hoặc để sau.' : 'Folder Drive cần chia sẻ công khai cho người có đường liên kết.'">
    <div v-if="created" class="space-y-5">
      <div class="rounded-xl bg-tint p-4 text-sm">
        <p class="break-words font-semibold">{{ created.title }}</p>
        <p class="mt-1 text-muted">{{ created.photoCount }} ảnh · Bản nháp</p>
      </div>
      <StudioAlbumShareActions :studio-id="studioId" :album-id="created.id" status="DRAFT" can-publish :can-share="false" primary @published="emit('changed')" />
      <div class="flex flex-wrap gap-2">
        <NuxtLink :to="`/studio/albums/${created.id}?studio=${studioId}`" class="inline-flex min-h-11 items-center rounded-full border border-[#b8c8b3] px-5 text-sm font-semibold text-brand hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Mở album</NuxtLink>
        <button type="button" class="min-h-11 rounded-full px-5 text-sm font-semibold text-muted hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" @click="open = false">Xong</button>
      </div>
    </div>

    <form v-else class="space-y-4" @submit.prevent="submit">
      <label class="block text-sm font-semibold">Tên album<input v-model="title" required maxlength="150" autofocus :class="field" placeholder="Mai & Quang"></label>
      <label class="block text-sm font-semibold">Link folder Drive<input v-model="folderUrl" required type="url" inputmode="url" :class="field" placeholder="https://drive.google.com/drive/folders/..."></label>
      <div class="grid grid-cols-2 gap-3">
        <label class="block text-sm font-semibold">Tối đa ảnh chọn<input v-model.number="limit" required type="number" min="0" inputmode="numeric" :class="field"></label>
        <label class="block text-sm font-semibold">Hạn album<select v-model.number="days" :class="field"><option :value="15">15 ngày</option><option :value="30">30 ngày</option></select></label>
      </div>
      <p v-if="error" role="alert" class="rounded-xl bg-[#fbeceb] p-3 text-sm text-red-700">{{ error }}</p>
      <div class="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" class="min-h-11 rounded-full px-5 text-sm font-semibold text-muted hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" @click="open = false">Hủy</button>
        <button type="submit" :disabled="busy" :aria-busy="busy" class="min-h-11 rounded-full bg-brand px-6 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50">{{ busy ? 'Đang tạo…' : 'Tạo album nháp' }}</button>
      </div>
    </form>
  </UiModal>
</template>

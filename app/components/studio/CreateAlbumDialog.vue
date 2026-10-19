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

const field = 'control mt-1.5'
</script>

<template>
  <UiModal v-model:open="open" :title="created ? 'Album đã được tạo' : 'Tạo album từ Google Drive'" :description="created ? 'Xuất bản để lấy link gửi khách, hoặc để sau.' : 'Folder Drive cần chia sẻ công khai cho người có đường liên kết.'">
    <div v-if="created" class="space-y-5">
      <div class="rounded-xl bg-tint p-4 text-sm">
        <p class="break-words font-semibold">{{ created.title }}</p>
        <p class="mt-1 text-muted tabular-nums">{{ created.photoCount }} ảnh · Bản nháp</p>
      </div>
      <StudioAlbumShareActions :studio-id="studioId" :album-id="created.id" status="DRAFT" can-publish :can-share="false" primary @published="emit('changed')" />
      <div class="flex flex-wrap gap-2">
        <UiButton :to="`/studio/albums/${created.id}?studio=${studioId}`" variant="secondary" size="sm">Mở album</UiButton>
        <UiButton variant="ghost" size="sm" @click="open = false">Xong</UiButton>
      </div>
    </div>

    <form v-else class="space-y-4" @submit.prevent="submit">
      <AlbumDriveShareGuide after-create="Album được tạo ở dạng nháp; xuất bản để lấy link gửi khách." />
      <label class="block text-sm font-semibold">Tên album<input v-model="title" required maxlength="150" autofocus name="album-title" autocomplete="off" :class="field" placeholder="Mai & Quang…"></label>
      <label class="block text-sm font-semibold">Link folder Drive<input v-model="folderUrl" required type="url" inputmode="url" name="folder-url" autocomplete="off" spellcheck="false" :class="field" placeholder="https://drive.google.com/drive/folders/…"></label>
      <div class="grid gap-3 min-[380px]:grid-cols-2">
        <label class="block text-sm font-semibold">Tối đa ảnh chọn<input v-model.number="limit" required type="number" min="0" inputmode="numeric" name="selection-limit" :class="field"></label>
        <label class="block text-sm font-semibold">Hạn album<select v-model.number="days" name="expires-in" :class="field"><option :value="15">15 ngày</option><option :value="30">30 ngày</option></select></label>
      </div>
      <UiNotice v-if="error" tone="error">{{ error }}</UiNotice>
      <div class="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <UiButton variant="ghost" @click="open = false">Hủy</UiButton>
        <UiButton type="submit" :loading="busy">{{ busy ? 'Đang tạo…' : 'Tạo album nháp' }}</UiButton>
      </div>
    </form>
  </UiModal>
</template>

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
const durationOptions = [{ value: 15, label: '15 ngày' }, { value: 30, label: '30 ngày' }] as const
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

</script>

<template>
  <UiModal v-model:open="open" :title="created ? 'Album đã được tạo' : 'Tạo album từ Google Drive'" :description="created ? 'Xuất bản để lấy link gửi khách, hoặc để sau.' : 'Folder Drive cần chia sẻ công khai cho người có đường liên kết.'">
    <div v-if="created" class="min-w-0 space-y-4">
      <div class="flex min-w-0 items-center gap-3 rounded-2xl bg-tint p-4 text-sm">
        <span aria-hidden="true" class="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-white">
          <svg viewBox="0 0 20 20" fill="currentColor" class="size-5"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.58l7.3-7.3a1 1 0 0 1 1.4 0Z" clip-rule="evenodd" /></svg>
        </span>
        <div class="min-w-0">
          <p class="break-words font-semibold">{{ created.title }}</p>
          <p class="mt-0.5 text-muted tabular-nums">{{ created.photoCount }} ảnh · Bản nháp</p>
        </div>
      </div>
      <div class="grid min-w-0 gap-2">
        <StudioAlbumShareActions :studio-id="studioId" :album-id="created.id" status="DRAFT" can-publish :can-share="false" primary @published="emit('changed')" />
      </div>
      <div class="grid grid-cols-2 gap-2 border-t border-line pt-4">
        <UiButton :to="`/studio/albums/${created.id}?studio=${studioId}`" variant="secondary" size="sm">Mở album</UiButton>
        <UiButton variant="ghost" size="sm" @click="open = false">Xong</UiButton>
      </div>
    </div>

    <form v-else class="space-y-4" @submit.prevent="submit">
      <AlbumDriveShareGuide after-create="Album được tạo ở dạng nháp; xuất bản để lấy link gửi khách." />
      <label class="block text-sm font-semibold">Tên album<UiInput v-model="title" required maxlength="150" autofocus name="album-title" autocomplete="off" class="mt-1.5" placeholder="Mai & Quang…" /></label>
      <label class="block text-sm font-semibold">Link folder Drive<UiInput v-model="folderUrl" required type="url" inputmode="url" name="folder-url" autocomplete="off" spellcheck="false" class="mt-1.5" placeholder="https://drive.google.com/drive/folders/…" /></label>
      <div class="grid gap-3 min-[380px]:grid-cols-2">
        <label class="block text-sm font-semibold">Tối đa ảnh chọn<UiInput v-model="limit" required type="number" min="0" inputmode="numeric" name="selection-limit" class="mt-1.5" /></label>
        <label class="block text-sm font-semibold">Hạn album<UiSelect v-model="days" label="Hạn album" name="expires-in" :options="durationOptions" class="mt-1.5" /></label>
      </div>
      <UiNotice v-if="error" tone="error">{{ error }}</UiNotice>
      <div class="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <UiButton variant="ghost" @click="open = false">Hủy</UiButton>
        <UiButton type="submit" :loading="busy">{{ busy ? 'Đang tạo…' : 'Tạo album nháp' }}</UiButton>
      </div>
    </form>
  </UiModal>
</template>

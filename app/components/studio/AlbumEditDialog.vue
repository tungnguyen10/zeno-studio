<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SelectionLimit } from '~~/shared/domain/selection'
import type { StudioAlbum } from '~/lib/studio-album'

const props = defineProps<{ studioId: string; album: StudioAlbum | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ changed: [] }>()

const title = ref('')
const days = ref<15 | 30>(15)
const kind = ref<SelectionLimit['kind']>('unlimited')
const durationOptions = [{ value: 15, label: '15 ngày' }, { value: 30, label: '30 ngày' }] as const
const limitOptions = [{ value: 'unlimited', label: 'Không giới hạn' }, { value: 'maximum', label: 'Tối đa' }, { value: 'exact', label: 'Chính xác' }, { value: 'minimum', label: 'Tối thiểu' }, { value: 'range', label: 'Trong khoảng' }] as const
const count = ref(0)
const minimum = ref(0)
const maximum = ref(0)
const loading = ref(false)
const settingsReady = ref(false)
const busy = ref(false)
const error = ref('')
const draft = computed(() => props.album?.status === 'DRAFT')
let loadSequence = 0

function message(cause: unknown): string {
  const value = cause && typeof cause === 'object' ? (cause as { data?: { statusMessage?: unknown } }).data?.statusMessage : null
  return typeof value === 'string' && value ? value : 'Không lưu được thay đổi. Vui lòng thử lại.'
}

async function loadSettings() {
  if (!props.album || !draft.value) return
  const albumId = props.album.id
  const sequence = ++loadSequence
  loading.value = true
  error.value = ''
  try {
    const workspace = await $fetch<{ settings: { limitKind: SelectionLimit['kind']; limitMin: number | null; limitMax: number | null; durationDays: 15 | 30 } }>(`/api/studio/${props.studioId}/albums/${albumId}`)
    if (!open.value || props.album?.id !== albumId || sequence !== loadSequence) return
    days.value = workspace.settings.durationDays
    kind.value = workspace.settings.limitKind
    minimum.value = workspace.settings.limitMin ?? 0
    maximum.value = workspace.settings.limitMax ?? 0
    count.value = workspace.settings.limitKind === 'minimum' ? minimum.value : maximum.value
    settingsReady.value = true
  } catch (cause) { if (open.value && props.album?.id === albumId && sequence === loadSequence) error.value = message(cause) }
  finally { if (sequence === loadSequence) loading.value = false }
}

watch(open, value => {
  if (!value || !props.album) { loadSequence++; return }
  title.value = props.album.title
  error.value = ''
  settingsReady.value = !draft.value
  if (draft.value) void loadSettings()
})

function selectionLimit(): SelectionLimit {
  if (kind.value === 'unlimited') return { kind: 'unlimited' }
  if (kind.value === 'range') return { kind: 'range', min: minimum.value, max: maximum.value }
  return { kind: kind.value, count: count.value }
}

async function submit() {
  if (!props.album) return
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/studio/${props.studioId}/albums/${props.album.id}`, {
      method: 'PATCH',
      body: draft.value ? { title: title.value, expiresInDays: days.value, limit: selectionLimit() } : { title: title.value },
    })
    open.value = false
    emit('changed')
  } catch (cause) { error.value = message(cause) }
  finally { busy.value = false }
}
</script>

<template>
  <UiModal v-model:open="open" title="Sửa album" :description="draft ? 'Các cài đặt này sẽ áp dụng khi xuất bản.' : 'Sau khi xuất bản, bạn chỉ có thể đổi tên album.'">
    <form v-if="album" class="space-y-4" @submit.prevent="submit">
      <label class="block text-sm font-semibold">Tên album<UiInput v-model="title" required maxlength="150" autofocus name="album-title" class="mt-1.5" /></label>
      <template v-if="draft && !loading">
        <label class="block text-sm font-semibold">Hạn album<UiSelect v-model="days" label="Hạn album" :options="durationOptions" class="mt-1.5" /></label>
        <label class="block text-sm font-semibold">Giới hạn chọn<UiSelect v-model="kind" label="Giới hạn chọn" :options="limitOptions" class="mt-1.5" /></label>
        <label v-if="kind !== 'unlimited' && kind !== 'range'" class="block text-sm font-semibold">Số ảnh<UiInput v-model="count" required type="number" min="0" inputmode="numeric" class="mt-1.5" /></label>
        <div v-if="kind === 'range'" class="grid grid-cols-2 gap-3">
          <label class="block text-sm font-semibold">Từ<UiInput v-model="minimum" required type="number" min="0" inputmode="numeric" class="mt-1.5" /></label>
          <label class="block text-sm font-semibold">Đến<UiInput v-model="maximum" required type="number" :min="minimum" inputmode="numeric" class="mt-1.5" /></label>
        </div>
      </template>
      <p v-if="loading" role="status" class="text-sm text-muted">Đang tải cài đặt…</p>
      <UiNotice v-if="error" tone="error">{{ error }}</UiNotice>
      <UiButton v-if="draft && !settingsReady && !loading" variant="secondary" size="sm" @click="loadSettings">Tải lại cài đặt</UiButton>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <UiButton variant="ghost" @click="open = false">Hủy</UiButton>
        <UiButton type="submit" :disabled="loading || !settingsReady" :loading="busy">Lưu thay đổi</UiButton>
      </div>
    </form>
  </UiModal>
</template>

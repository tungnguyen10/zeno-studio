<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ALBUM_STATUS_LABELS, effectiveStatus, type AlbumStatus } from '~~/shared/domain/album-status'
import { driveFitSrcset, driveGridSrc, driveGridSrcset, driveThumbnailUrl } from '~/lib/drive-image'
import type { GalleryLayout } from '~/lib/gallery-layout'
import { usePagedPhotos, type PhotoFilter, type PhotoPageResponse } from '~/composables/usePagedPhotos'
import { useGalleryLayout } from '~/composables/useGalleryLayout'
import GalleryLayoutSwitch from './GalleryLayoutSwitch.vue'
import AlbumActionBar from './AlbumActionBar.vue'
import PhotoGallery from './PhotoGallery.vue'
import PhotoTile from './PhotoTile.vue'

type Photo = { id: string; sourceFileId: string; filename: string; width: number | null; height: number | null; sortOrder: number; selected: boolean; previouslyFinalized: boolean }
type Workspace = { id: string; title: string; status: string; expiresAt: string; canFinalize: boolean; hasResults: boolean; previousCount: number; settings: { limitKind: string; limitMin: number | null; limitMax: number | null }; photoCount: number; selectedCount: number }
const props = withDefaults(defineProps<{ apiRoot: string; backTo: string; backLabel?: string; resultsTo: string; canPublish?: boolean; canShare?: boolean }>(), { backLabel: 'Quay lại', canPublish: false, canShare: false })
const workspace = ref<Workspace | null>(null)
// Studio edits are stored as differences from the customer's list so huge albums never ship full id arrays.
const included = ref(new Set<string>())
const excluded = ref(new Set<string>())
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const message = ref('')
const failedThumbnails = ref<Record<string, true>>({})
const layout = useGalleryLayout('zeno-studio-gallery-layout')
const paged = usePagedPhotos<Photo>(params => $fetch<PhotoPageResponse<Photo>>(`${props.apiRoot}/photos`, { query: { limit: params.limit, filter: params.filter, ...(params.cursor ? { cursor: params.cursor } : {}) } }))
const filter = computed<PhotoFilter>({ get: () => paged.filter.value, set: value => { if (value !== paged.filter.value) void paged.reset(value) } })

const currentStatus = computed<AlbumStatus | null>(() => workspace.value ? effectiveStatus({ status: workspace.value.status as AlbumStatus, expiresAt: workspace.value.expiresAt }) : null)
const canChoose = computed(() => currentStatus.value === 'PUBLISHED' && !!workspace.value?.canFinalize)
const actionAvailable = computed(() => currentStatus.value === 'DRAFT' ? props.canPublish : (currentStatus.value === 'PUBLISHED' || currentStatus.value === 'FINALIZED' || currentStatus.value === 'DELIVERED') && props.canShare)
const filterTabs = computed(() => {
  const w = workspace.value
  if (!w) return []
  const tabs: Array<{ id: PhotoFilter; label: string; count: number }> = [
    { id: 'all', label: 'Tất cả', count: w.photoCount },
    { id: 'selected', label: w.hasResults && w.status === 'PUBLISHED' ? 'Đang chọn' : 'Khách đã chọn', count: w.selectedCount },
  ]
  if (w.hasResults) tabs.push({ id: 'previous', label: currentStatus.value === 'PUBLISHED' ? 'Bộ chốt trước' : 'Bộ đã chốt', count: w.previousCount })
  return tabs
})
const expiresLabel = computed(() => workspace.value ? new Intl.DateTimeFormat('vi-VN').format(new Date(workspace.value.expiresAt)) : '')
const chosenCount = computed(() => (workspace.value?.selectedCount ?? 0) - excluded.value.size + included.value.size)
const statusLabel = computed(() => currentStatus.value ? ALBUM_STATUS_LABELS[currentStatus.value] : '')
const limitLabel = computed(() => {
  const s = workspace.value?.settings
  if (!s || s.limitKind === 'unlimited') return 'Không giới hạn'
  if (s.limitKind === 'range') return `${s.limitMin}–${s.limitMax} ảnh`
  if (s.limitKind === 'minimum') return `Tối thiểu ${s.limitMin} ảnh`
  if (s.limitKind === 'maximum') return `Tối đa ${s.limitMax} ảnh`
  return `${s.limitMax ?? s.limitMin} ảnh`
})

function isChosen(photo: Photo) {
  return photo.selected ? !excluded.value.has(photo.id) : included.value.has(photo.id)
}

function toggle(photo: Photo) {
  const target = photo.selected ? excluded : included
  const next = new Set(target.value)
  if (next.has(photo.id)) next.delete(photo.id)
  else next.add(photo.id)
  target.value = next
}

async function load() {
  error.value = ''
  try {
    workspace.value = await $fetch<Workspace>(props.apiRoot)
    included.value = new Set()
    excluded.value = new Set()
    await paged.reset(workspace.value.hasResults || filter.value !== 'previous' ? filter.value : 'all')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Không tải được album' }
  finally { loading.value = false }
}

function retry() {
  loading.value = true
  void load()
}

async function finalize() {
  if (!workspace.value || busy.value) return
  busy.value = true
  message.value = ''
  error.value = ''
  try {
    const result = await $fetch<{ versionNumber: number }>(`${props.apiRoot}/finalize`, { method: 'POST', body: { include: [...included.value], exclude: [...excluded.value] } })
    await load()
    message.value = `Đã chốt phiên bản ${result.versionNumber}.`
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Không thể chốt ảnh' }
  finally { busy.value = false }
}

async function reopen() {
  if (busy.value) return
  busy.value = true
  message.value = ''
  error.value = ''
  try { await $fetch(`${props.apiRoot}/reopen`, { method: 'POST' }); await load(); message.value = `Đã mở vòng chọn mới và giữ ${workspace.value?.previousCount ?? 0} ảnh từ bộ chốt trước.` }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Không thể mở lại album' }
  finally { busy.value = false }
}

function tileSrc(photo: Photo, mode: GalleryLayout) {
  return mode === 'grid' ? driveGridSrc(photo.sourceFileId, photo.width, photo.height) : driveThumbnailUrl(photo.sourceFileId, 'w', 480)
}

function tileSrcset(photo: Photo, mode: GalleryLayout) {
  return mode === 'grid' ? driveGridSrcset(photo.sourceFileId, photo.width, photo.height) : driveFitSrcset(photo.sourceFileId)
}

onMounted(() => { void load() })
</script>

<template>
  <div class="min-h-dvh bg-canvas text-ink">
    <header class="sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <NuxtLink :to="backTo" class="focus-ring -ml-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 font-semibold text-brand hover:bg-tint">← {{ backLabel }}</NuxtLink>
        <span v-if="workspace" class="min-w-0 truncate text-sm text-muted">{{ workspace.title }}</span>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6 sm:pt-10 lg:px-8">
      <div v-if="loading" role="status" aria-label="Đang tải album" aria-busy="true">
        <div class="space-y-3">
          <UiSkeleton class="h-3 w-24 rounded-full" />
          <UiSkeleton class="h-9 w-2/3 max-w-sm rounded-xl" />
          <div class="flex flex-wrap gap-2 pt-1">
            <UiSkeleton v-for="n in 3" :key="n" class="h-7 w-28 rounded-full" />
          </div>
        </div>
        <UiSkeleton class="mt-8 h-11 w-60 rounded-full" />
        <div class="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          <div v-for="n in 10" :key="n" class="overflow-hidden rounded-2xl border border-line bg-white">
            <UiPhotoSkeleton class="aspect-[.8] rounded-none" />
            <div class="space-y-2 p-3">
              <UiSkeleton class="h-3 w-4/5 rounded-full" />
              <UiSkeleton class="h-3 w-1/2 rounded-full" />
            </div>
          </div>
        </div>
        <span class="sr-only">Đang tải album…</span>
      </div>

      <div v-else-if="!workspace" role="alert" class="mx-auto max-w-md rounded-2xl border border-danger/20 bg-white p-6 text-center">
        <p class="font-semibold text-danger">{{ error || 'Không tải được album' }}</p>
        <UiButton variant="secondary" class="mt-4" @click="retry">Thử lại</UiButton>
      </div>

      <template v-else>
        <section aria-labelledby="album-title">
          <p class="text-xs font-bold uppercase tracking-[.18em] text-brand-soft">Chi tiết album</p>
          <h1 id="album-title" class="mt-2 break-words text-2xl font-semibold tracking-tight text-balance sm:text-4xl">{{ workspace.title }}</h1>
          <ul class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted sm:mt-4 sm:text-sm" aria-label="Thông tin album">
            <li class="rounded-full bg-brand px-3 py-1 font-semibold text-white">{{ statusLabel }}</li>
            <li class="tabular-nums">{{ workspace.photoCount }} ảnh</li>
            <li class="tabular-nums">{{ currentStatus === 'PUBLISHED' ? 'Đang chọn' : 'Khách đã chọn' }} {{ workspace.selectedCount }}</li>
            <li>Giới hạn: {{ limitLabel }}</li>
            <li>Hạn <time :datetime="workspace.expiresAt">{{ expiresLabel }}</time></li>
          </ul>
          <AlbumProgress :status="currentStatus ?? workspace.status" />
        </section>

        <UiNotice v-if="error" tone="error" class="mt-5">{{ error }}</UiNotice>
        <UiNotice v-if="message" tone="success" class="mt-5 font-medium">{{ message }}</UiNotice>

        <AlbumActionBar
          :status="currentStatus ?? workspace.status as AlbumStatus"
          :has-results="workspace.hasResults"
          :can-reopen="currentStatus === 'FINALIZED' && workspace.canFinalize"
          :action-available="actionAvailable"
          :results-to="resultsTo"
          :busy="busy"
          @reopen="reopen"
        >
          <template #actions><slot name="actions" :workspace="workspace" :reload="load" /></template>
        </AlbumActionBar>

        <div class="mt-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <UiTabs label="Lọc ảnh" :items="filterTabs" :current="filter" class="min-w-0 flex-1" @select="filter = $event" />
          <GalleryLayoutSwitch v-model="layout" class="self-start sm:self-auto" />
        </div>

        <p v-if="canChoose" class="mt-4 text-sm text-pretty text-muted">Bấm vào ảnh để thêm hoặc bỏ khỏi bộ chốt. Ảnh khách đã chọn được đánh dấu sẵn; ghi chú được đóng băng trong phiên bản kết quả.</p>

        <div class="mt-5">
          <div v-if="!paged.started.value" role="status" aria-label="Đang tải ảnh" class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            <UiPhotoSkeleton v-for="n in 10" :key="n" class="aspect-[.8]" />
          </div>
          <div v-else-if="!paged.items.value.length && !paged.loading.value" class="rounded-2xl border border-dashed border-line-strong bg-white p-8 text-center text-muted sm:p-10">
            {{ paged.error.value || (filter === 'previous' ? 'Bộ chốt trước không có ảnh.' : filter === 'selected' ? 'Chưa có ảnh được chọn.' : 'Album chưa có ảnh.') }}
          </div>
          <ClientOnly v-else>
            <PhotoGallery
              :items="paged.items.value"
              :layout="layout"
              :total="paged.total.value"
              :has-more="paged.hasMore.value"
              :loading="paged.loading.value"
              :caption-height="44"
              label="Ảnh trong album"
              @end="paged.loadMore"
            >
              <template #default="{ item: photo, box, layout: mode, eager }">
                <PhotoTile
                  :filename="photo.filename"
                  :layout="mode"
                  :box="box"
                  :src="tileSrc(photo, mode)"
                  :srcset="tileSrcset(photo, mode)"
                  :eager="eager"
                  :failed="!!failedThumbnails[photo.id]"
                  :action-label="canChoose ? `Chốt ${photo.filename}` : photo.filename"
                  :interactive="canChoose"
                  :pressed="canChoose ? isChosen(photo) : undefined"
                  :highlighted="canChoose && isChosen(photo)"
                  :caption-height="44"
                  @activate="canChoose && toggle(photo)"
                  @error="failedThumbnails[photo.id] = true"
                >
                  <template v-if="photo.selected || photo.previouslyFinalized" #badge>
                    <span v-if="photo.previouslyFinalized" class="inline-flex min-h-7 items-center rounded-full bg-tint/95 px-2 text-xs font-semibold text-brand shadow-sm">Đã chốt trước</span>
                    <span v-else class="grid size-7 place-items-center rounded-full bg-heart-soft/95 text-sm text-heart shadow-sm" :title="workspace.hasResults && workspace.status === 'PUBLISHED' ? 'Đang chọn' : 'Khách chọn'"><span aria-hidden="true">♥</span><span class="sr-only">{{ workspace.hasResults && workspace.status === 'PUBLISHED' ? 'Đang chọn' : 'Khách chọn' }}</span></span>
                  </template>
                  <template v-if="canChoose" #action>
                    <span aria-hidden="true" class="grid size-7 shrink-0 place-items-center rounded-full border-2 text-sm font-bold shadow-sm" :class="isChosen(photo) ? 'border-brand bg-brand text-white' : 'border-line-strong bg-white/80 text-transparent'">✓</span>
                  </template>
                </PhotoTile>
              </template>
            </PhotoGallery>
          </ClientOnly>
          <div v-if="paged.error.value && paged.items.value.length" role="alert" class="mt-6 flex flex-wrap items-center justify-center gap-2 text-center text-sm text-danger">
            {{ paged.error.value }}
            <UiButton variant="secondary" size="sm" @click="paged.loadMore">Thử lại</UiButton>
          </div>
        </div>

        <div v-if="canChoose" class="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-line bg-canvas/95 px-4 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div class="flex items-center justify-between gap-3">
            <p class="min-w-0 text-sm text-muted"><strong class="text-ink tabular-nums">{{ chosenCount }}</strong> ảnh sẽ chốt<span class="hidden min-[400px]:inline"> · {{ limitLabel }}</span></p>
            <UiButton class="shrink-0" :loading="busy" @click="finalize">{{ busy ? 'Đang chốt…' : `Chốt ${chosenCount} ảnh` }}</UiButton>
          </div>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ALBUM_FILTERS, countByFilter, filterAlbums, sortAlbums, type AlbumFilter, type AlbumSort } from '~~/shared/domain/album-status'
import type { AlbumManageAction, StudioAlbum } from '~/lib/studio-album'
import { useStudioStore } from '~/stores/studio'
import { publicPage } from '~~/shared/site'

const studioPage = publicPage('/studio')
useSeoMeta({ title: studioPage.title, description: studioPage.description, ogTitle: studioPage.title, ogDescription: studioPage.description })

const store = useStudioStore()
const route = useRoute()
const albums = ref<StudioAlbum[]>([])
const albumsLoading = ref(false)
const albumsLoaded = ref(false)
const albumsError = ref('')
const filter = ref<AlbumFilter>('all')
const query = ref('')
const createOpen = ref(false)
const group = ref<'active' | 'archived'>('active')
const sort = ref<AlbumSort>('newest')
const sortOptions = [{ value: 'newest', label: 'Mới nhất' }, { value: 'name', label: 'Tên A–Z' }, { value: 'expiry', label: 'Hạn gần nhất' }] as const
const view = ref<'table' | 'cards'>('table')
const target = ref<StudioAlbum | null>(null)
const editOpen = ref(false)
const deleteOpen = ref(false)
const actionBusy = ref<string | null>(null)
const actionError = ref('')
const actionSuccess = ref('')

const next = computed(() => {
  const candidate = route.query.next
  return typeof candidate === 'string' && (candidate.startsWith('/studio/') || candidate.startsWith('/guest/albums/')) && !candidate.startsWith('//') ? candidate : '/studio'
})
const preferredStudio = computed(() => typeof route.query.studio === 'string' ? route.query.studio : null)
const archivedCount = computed(() => albums.value.filter(album => !!album.archivedAt).length)
const scoped = computed(() => albums.value.filter(album => group.value === 'archived' ? !!album.archivedAt : !album.archivedAt))
const counts = computed(() => countByFilter(scoped.value))
const filters = computed(() => ALBUM_FILTERS.filter(item => item.value !== 'EXPIRED' || counts.value.EXPIRED > 0 || filter.value === 'EXPIRED'))
const visible = computed(() => sortAlbums(filterAlbums(scoped.value, filter.value, query.value), sort.value))

async function loadAlbums() {
  const id = store.studio?.id
  if (!id) return
  albumsLoading.value = true
  albumsError.value = ''
  try {
    const result = await $fetch<{ albums: StudioAlbum[] }>(`/api/studio/${id}/albums`)
    if (store.studio?.id !== id) return
    albums.value = result.albums
    albumsLoaded.value = true
  } catch (error) {
    if (store.studio?.id === id) albumsError.value = error instanceof Error ? error.message : 'Không tải được album'
  } finally { if (store.studio?.id === id) albumsLoading.value = false }
}

watch(() => store.studio?.id, () => {
  albums.value = []
  albumsLoaded.value = false
  filter.value = 'all'
  query.value = ''
  group.value = 'active'
  actionError.value = ''
  actionSuccess.value = ''
  void loadAlbums()
}, { immediate: true })

async function enter() {
  if (next.value !== '/studio') await navigateTo(next.value)
  else await store.ensureStudios(preferredStudio.value)
}

async function afterSignIn() {
  await store.checkSession()
  if (store.user) await enter()
}

onMounted(async () => {
  view.value = localStorage.getItem('zeno-studio:albums-view') === 'cards' ? 'cards' : 'table'
  if (!store.sessionChecked) await store.checkSession()
  if (store.user) await enter()
})

function resetFilters() {
  filter.value = 'all'
  query.value = ''
}

function setView(value: 'table' | 'cards') {
  view.value = value
  localStorage.setItem('zeno-studio:albums-view', value)
}

function setGroup(value: 'active' | 'archived') {
  group.value = value
  filter.value = 'all'
  query.value = ''
}

async function manage(action: AlbumManageAction, album: StudioAlbum) {
  if (actionBusy.value) return
  target.value = album
  actionError.value = ''
  actionSuccess.value = ''
  if (action === 'edit') { editOpen.value = true; return }
  if (action === 'delete') { deleteOpen.value = true; return }
  actionBusy.value = album.id
  try {
    await $fetch(`/api/studio/${store.studio?.id}/albums/${album.id}/${action}`, { method: 'POST' })
    await loadAlbums()
    actionSuccess.value = action === 'archive' ? `Đã lưu trữ ${album.title}.` : `Đã khôi phục ${album.title}.`
  } catch (cause) {
    const status = cause && typeof cause === 'object' ? (cause as { data?: { statusMessage?: unknown } }).data?.statusMessage : null
    actionError.value = typeof status === 'string' && status ? status : 'Không cập nhật được album. Vui lòng thử lại.'
  } finally { actionBusy.value = null }
}

function afterCreate() {
  setGroup('active')
  void loadAlbums()
}
</script>

<template>
  <div class="min-h-dvh bg-canvas text-ink">
    <template v-if="store.user">
      <StudioHeader />
      <main class="mx-auto max-w-6xl px-4 pb-[max(5rem,env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-8 lg:px-8">
        <template v-if="store.studio">
          <UiPageHeader title="Album" description="Theo dõi từng album từ lúc xuất bản đến khi chốt bộ ảnh.">
            <template v-if="store.canManage" #actions>
              <UiButton @click="createOpen = true"><span aria-hidden="true">+</span> Tạo album</UiButton>
            </template>
          </UiPageHeader>

          <div v-if="albums.length" class="mt-5 space-y-3 sm:mt-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div role="group" aria-label="Nhóm album" class="inline-flex gap-1 rounded-full border border-line bg-white p-1">
                <button type="button" :aria-pressed="group === 'active'" class="focus-ring min-h-10 rounded-full px-4 text-sm font-semibold transition-colors" :class="group === 'active' ? 'bg-brand text-white' : 'text-brand hover:bg-tint'" @click="setGroup('active')">Đang quản lý ({{ albums.length - archivedCount }})</button>
                <button type="button" :aria-pressed="group === 'archived'" class="focus-ring min-h-10 rounded-full px-4 text-sm font-semibold transition-colors" :class="group === 'archived' ? 'bg-brand text-white' : 'text-brand hover:bg-tint'" @click="setGroup('archived')">Đã lưu trữ ({{ archivedCount }})</button>
              </div>
              <div role="group" aria-label="Cách xem album" class="hidden gap-1 rounded-full border border-line bg-white p-1 lg:flex">
                <button type="button" :aria-pressed="view === 'table'" class="focus-ring min-h-10 rounded-full px-4 text-sm font-semibold transition-colors" :class="view === 'table' ? 'bg-brand text-white' : 'text-brand hover:bg-tint'" @click="setView('table')">Bảng</button>
                <button type="button" :aria-pressed="view === 'cards'" class="focus-ring min-h-10 rounded-full px-4 text-sm font-semibold transition-colors" :class="view === 'cards' ? 'bg-brand text-white' : 'text-brand hover:bg-tint'" @click="setView('cards')">Thẻ</button>
              </div>
            </div>
            <div role="group" aria-label="Lọc album theo trạng thái" class="flex flex-wrap gap-1.5">
              <button v-for="item in filters" :key="item.value" type="button" :aria-pressed="filter === item.value" class="focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-full border pl-3 pr-1.5 text-sm font-semibold transition-colors" :class="filter === item.value ? 'border-brand bg-brand text-white' : 'border-line bg-white hover:bg-tint'" @click="filter = item.value">
                {{ item.label }}
                <span class="grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs tabular-nums" :class="filter === item.value ? 'bg-white/20' : 'bg-tint text-muted'">{{ counts[item.value] }}</span>
              </button>
            </div>
            <div class="flex flex-col gap-2 sm:flex-row">
              <label class="block min-w-0 flex-1 sm:max-w-md">
                <span class="sr-only">Tìm album theo tên</span>
                <UiInput v-model="query" type="search" name="album-search" autocomplete="off" enterkeyhint="search" placeholder="Tìm album theo tên…" />
              </label>
              <UiSelect v-model="sort" label="Sắp xếp album" :options="sortOptions" class="sm:w-auto sm:min-w-44" />
            </div>
          </div>

          <UiNotice v-if="actionError" class="mt-4" tone="error">{{ actionError }}</UiNotice>
          <UiNotice v-if="actionSuccess" class="mt-4" tone="success">{{ actionSuccess }}</UiNotice>
          <p v-if="actionBusy" role="status" class="mt-2 text-sm text-muted">Đang cập nhật album…</p>

          <div v-if="albumsLoading && !albumsLoaded" role="status" aria-busy="true" aria-label="Đang tải album" class="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div v-for="n in 3" :key="n" class="rounded-2xl border border-line bg-white p-5">
              <UiSkeleton class="h-5 w-1/2" />
              <UiSkeleton class="mt-2 h-3 w-1/3" />
              <UiSkeleton class="mt-6 h-11 w-36 rounded-full" />
            </div>
            <span class="sr-only">Đang tải album…</span>
          </div>
          <div v-else-if="albumsError" role="alert" class="mt-6 rounded-2xl border border-danger/20 bg-white p-5 sm:p-6">
            <p class="font-semibold text-danger">{{ albumsError }}</p>
            <UiButton variant="secondary" class="mt-3" @click="loadAlbums">Thử lại</UiButton>
          </div>
          <div v-else-if="albumsLoaded && !albums.length" class="mt-6 rounded-3xl border border-dashed border-line-strong bg-white p-6 text-center sm:mt-8 sm:p-12">
            <h2 class="text-xl font-semibold">Chưa có album nào</h2>
            <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-pretty text-muted">{{ store.canManage ? 'Tạo album từ folder Google Drive, xuất bản rồi gửi link cho khách chọn ảnh.' : 'Quản lý studio sẽ tạo album và chia sẻ cho bạn.' }}</p>
            <UiButton v-if="store.canManage" class="mt-5" @click="createOpen = true">Tạo album đầu tiên</UiButton>
          </div>
          <template v-else-if="albums.length">
            <p role="status" class="mt-4 text-sm text-muted tabular-nums sm:mt-5">Hiển thị {{ visible.length }}/{{ scoped.length }} album</p>
            <template v-if="visible.length">
              <div :class="view === 'cards' ? 'mt-3 grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3' : 'mt-3 grid gap-3 sm:grid-cols-2 lg:hidden'">
                <StudioAlbumCard v-for="album in visible" :key="album.id" :album="album" :studio-id="store.studio.id" :can-publish="store.canManage" :can-share="store.canShare" :can-manage="store.canManage" @published="loadAlbums" @manage="manage($event, album)" />
              </div>
              <StudioAlbumTable v-if="view === 'table'" class="mt-3 hidden lg:block" :albums="visible" :studio-id="store.studio.id" :can-manage="store.canManage" :can-share="store.canShare" @published="loadAlbums" @manage="manage" />
            </template>
            <div v-else class="mt-3 rounded-2xl border border-dashed border-line-strong bg-white p-6 text-center sm:p-8">
              <p class="font-semibold">{{ scoped.length ? 'Không có album phù hợp' : group === 'archived' ? 'Chưa có album lưu trữ' : 'Chưa có album đang quản lý' }}</p>
              <UiButton variant="secondary" class="mt-3" @click="resetFilters">Xóa bộ lọc</UiButton>
            </div>
          </template>

          <StudioCreateAlbumDialog v-if="store.canManage" v-model:open="createOpen" :studio-id="store.studio.id" @changed="afterCreate" />
          <StudioAlbumEditDialog v-if="store.canManage" v-model:open="editOpen" :studio-id="store.studio.id" :album="target" @changed="loadAlbums" />
          <StudioAlbumDeleteDialog v-if="store.canManage" v-model:open="deleteOpen" :studio-id="store.studio.id" :album="target" @changed="loadAlbums" />
        </template>
        <div v-else-if="store.error" role="alert" class="mx-auto max-w-md rounded-2xl border border-danger/20 bg-white p-6 text-center">
          <p class="font-semibold text-danger">{{ store.error }}</p>
          <UiButton variant="secondary" class="mt-4" @click="store.loadStudios(preferredStudio)">Thử lại</UiButton>
        </div>
        <div v-else role="status" aria-busy="true" aria-label="Đang tải không gian studio">
          <UiSkeleton class="h-9 w-40" />
          <UiSkeleton class="mt-2 h-4 w-72 max-w-full" />
          <div class="mt-6 flex gap-2 overflow-hidden sm:grid sm:grid-cols-4">
            <UiSkeleton v-for="n in 4" :key="n" class="h-16 min-w-[7.5rem] rounded-2xl sm:h-[4.5rem]" />
          </div>
          <div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <UiSkeleton v-for="n in 3" :key="n" class="h-40 rounded-2xl" />
          </div>
          <span class="sr-only">Đang tải không gian studio…</span>
        </div>
      </main>
    </template>

    <template v-else>
      <SiteHeader>
        <NuxtLink to="/tools/file-filter" class="focus-ring inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 transition-colors hover:border-brand">Lọc file<span class="hidden sm:inline">&nbsp;trên máy</span></NuxtLink>
      </SiteHeader>

      <main class="mx-auto grid max-w-7xl items-start gap-8 px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-4 sm:px-8 sm:pt-10 lg:grid-cols-2 lg:gap-12 lg:pt-24">
        <div class="max-w-xl">
          <p class="text-xs font-bold uppercase tracking-[.2em] text-brand-soft">Không gian làm việc cho studio</p>
          <h1 class="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-[-.04em] text-balance sm:mt-4 sm:text-5xl">Mỗi bộ ảnh có một hành trình. <em class="font-serif font-normal text-brand-soft">Quản lý trọn vẹn.</em></h1>
          <p class="mt-4 text-base leading-7 text-pretty text-muted sm:mt-6 sm:text-lg sm:leading-8">Theo dõi album, lựa chọn chung và các phiên bản đã chốt ở cùng một nơi.</p>
          <ul class="mt-6 hidden space-y-3 text-sm text-muted sm:mt-10 sm:block"><li>✓ Link khách và link quản trị tách biệt</li><li>✓ Tên file và ghi chú luôn đi cùng ảnh</li><li>✓ Lịch sử chốt được lưu rõ ràng</li></ul>
        </div>

        <section class="w-full max-w-lg rounded-3xl border border-line bg-white p-5 shadow-[0_30px_80px_-35px_rgba(39,55,35,.25)] sm:rounded-[2rem] sm:p-10">
          <div v-if="!store.sessionChecked" role="status" aria-busy="true" aria-label="Đang kiểm tra đăng nhập">
            <UiSkeleton class="h-12 w-full rounded-full" />
            <UiSkeleton class="mt-8 h-9 w-3/4" />
            <UiSkeleton class="mt-3 h-4 w-full" />
            <div class="mt-7 space-y-4">
              <UiSkeleton v-for="n in 2" :key="n" class="h-[4.5rem] w-full rounded-xl" />
            </div>
            <UiSkeleton class="mt-4 h-[3.25rem] w-full rounded-full" />
            <span class="sr-only">Đang kiểm tra đăng nhập…</span>
          </div>
          <StudioAuthForm v-else :next="next" @signed-in="afterSignIn" />
        </section>
      </main>
      <SiteFooter />
    </template>
  </div>
</template>

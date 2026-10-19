<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ALBUM_FILTERS, countByFilter, filterAlbums, type AlbumFilter } from '~~/shared/domain/album-status'
import type { StudioAlbum } from '~/lib/studio-album'
import { useStudioStore } from '~/stores/studio'

useSeoMeta({ title: 'Studio — Zeno Studio' })

const store = useStudioStore()
const route = useRoute()
const albums = ref<StudioAlbum[]>([])
const albumsLoading = ref(false)
const albumsLoaded = ref(false)
const albumsError = ref('')
const filter = ref<AlbumFilter>('all')
const query = ref('')
const createOpen = ref(false)

const next = computed(() => {
  const candidate = route.query.next
  return typeof candidate === 'string' && (candidate.startsWith('/studio/') || candidate.startsWith('/guest/albums/')) && !candidate.startsWith('//') ? candidate : '/studio'
})
const preferredStudio = computed(() => typeof route.query.studio === 'string' ? route.query.studio : null)
const counts = computed(() => countByFilter(albums.value))
const filters = computed(() => ALBUM_FILTERS.filter(item => item.value !== 'EXPIRED' || counts.value.EXPIRED > 0 || filter.value === 'EXPIRED'))
const visible = computed(() => filterAlbums(albums.value, filter.value, query.value))

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
  if (!store.sessionChecked) await store.checkSession()
  if (store.user) await enter()
})

function resetFilters() {
  filter.value = 'all'
  query.value = ''
}
</script>

<template>
  <div class="min-h-dvh bg-canvas text-ink">
    <template v-if="store.user">
      <StudioHeader />
      <main class="mx-auto max-w-6xl px-4 pb-[max(5rem,env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-8 lg:px-8">
        <template v-if="store.studio">
          <div class="flex items-end justify-between gap-3">
            <div class="min-w-0">
              <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Album</h1>
              <p class="mt-1 text-sm text-pretty text-muted">Theo dõi từng album từ lúc xuất bản đến khi bàn giao.</p>
            </div>
            <UiButton v-if="store.canManage" class="shrink-0" @click="createOpen = true"><span aria-hidden="true">+</span> Tạo album</UiButton>
          </div>

          <div v-if="albums.length" class="mt-5 sm:mt-6">
            <div role="group" aria-label="Lọc album theo trạng thái" class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
              <button v-for="item in filters" :key="item.value" type="button" :aria-pressed="filter === item.value" class="focus-ring min-h-16 min-w-[7.5rem] shrink-0 rounded-2xl border p-3 text-left transition-colors sm:min-h-[4.5rem] sm:min-w-0" :class="filter === item.value ? 'border-brand bg-brand text-white' : 'border-line bg-white hover:bg-tint'" @click="filter = item.value">
                <span class="block text-xl font-semibold leading-none tabular-nums sm:text-2xl">{{ counts[item.value] }}</span>
                <span class="mt-1.5 block whitespace-nowrap text-xs font-semibold">{{ item.label }}</span>
              </button>
            </div>
            <label class="mt-4 block">
              <span class="sr-only">Tìm album theo tên</span>
              <input v-model="query" type="search" name="album-search" autocomplete="off" enterkeyhint="search" placeholder="Tìm album theo tên…" class="control sm:max-w-sm">
            </label>
          </div>

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
            <p role="status" class="mt-4 text-sm text-muted tabular-nums sm:mt-5">Hiển thị {{ visible.length }}/{{ albums.length }} album</p>
            <div v-if="visible.length" class="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
              <StudioAlbumCard v-for="album in visible" :key="album.id" :album="album" :studio-id="store.studio.id" :can-publish="store.canManage" :can-share="store.canShare" @published="loadAlbums" />
            </div>
            <div v-else class="mt-3 rounded-2xl border border-dashed border-line-strong bg-white p-6 text-center sm:p-8">
              <p class="font-semibold">Không có album phù hợp</p>
              <UiButton variant="secondary" class="mt-3" @click="resetFilters">Xóa bộ lọc</UiButton>
            </div>
          </template>

          <StudioCreateAlbumDialog v-if="store.canManage" v-model:open="createOpen" :studio-id="store.studio.id" @changed="loadAlbums" />
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
      <header class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-6">
        <NuxtLink to="/" class="focus-ring flex min-h-11 items-center gap-3 rounded-lg text-lg font-bold"><span aria-hidden="true" class="grid size-9 place-items-center rounded-xl bg-brand text-white">Z</span>Zeno Studio</NuxtLink>
        <NuxtLink to="/tools/file-filter" class="focus-ring inline-flex min-h-11 items-center rounded-full px-2 text-sm font-semibold text-brand hover:bg-tint">Lọc file<span class="hidden sm:inline">&nbsp;trên máy</span>&nbsp;<span aria-hidden="true">↗</span></NuxtLink>
      </header>

      <main class="mx-auto grid max-w-7xl items-start gap-8 px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-4 sm:px-8 sm:pt-10 lg:grid-cols-2 lg:gap-12 lg:pt-24">
        <div class="max-w-xl">
          <p class="text-xs font-bold uppercase tracking-[.2em] text-brand-soft">Không gian làm việc cho studio</p>
          <h1 class="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-[-.04em] text-balance sm:mt-4 sm:text-5xl">Mỗi bộ ảnh có một hành trình. <em class="font-serif font-normal text-brand-soft">Quản lý trọn vẹn.</em></h1>
          <p class="mt-4 text-base leading-7 text-pretty text-muted sm:mt-6 sm:text-lg sm:leading-8">Theo dõi album, lựa chọn của khách, ghi chú hậu kỳ và các vòng duyệt ở cùng một nơi.</p>
          <ul class="mt-6 hidden space-y-3 text-sm text-muted sm:mt-10 sm:block"><li>✓ Link khách và link quản trị tách biệt</li><li>✓ Tên file và yêu cầu chỉnh sửa luôn đi cùng ảnh</li><li>✓ Lịch sử chốt và duyệt được lưu rõ ràng</li></ul>
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
    </template>
  </div>
</template>

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
  <div class="min-h-screen bg-[#f8f7f3] text-[#24231f]">
    <template v-if="store.user">
      <StudioHeader />
      <main class="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <template v-if="store.studio">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 class="text-3xl font-semibold tracking-tight">Album</h1>
              <p class="mt-1 text-sm text-muted">Theo dõi từng album từ lúc xuất bản đến khi bàn giao.</p>
            </div>
            <button v-if="store.canManage" type="button" class="min-h-11 rounded-full bg-brand px-6 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" @click="createOpen = true">Tạo album</button>
          </div>

          <div v-if="albums.length" class="mt-6">
            <div role="group" aria-label="Lọc album theo trạng thái" class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
              <button v-for="item in filters" :key="item.value" type="button" :aria-pressed="filter === item.value" class="min-h-[4.5rem] rounded-2xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" :class="filter === item.value ? 'border-brand bg-brand text-white' : 'border-line bg-white hover:bg-tint'" @click="filter = item.value">
                <span class="block text-2xl font-semibold leading-none">{{ counts[item.value] }}</span>
                <span class="mt-1.5 block text-xs font-semibold">{{ item.label }}</span>
              </button>
            </div>
            <label class="mt-4 block">
              <span class="sr-only">Tìm album theo tên</span>
              <input v-model="query" type="search" placeholder="Tìm album theo tên" class="min-h-11 w-full rounded-xl border border-line bg-white px-4 focus-visible:border-brand-soft focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-soft sm:max-w-sm">
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
          <div v-else-if="albumsError" role="alert" class="mt-6 rounded-2xl border border-[#ead6d6] bg-white p-6">
            <p class="font-semibold text-red-700">{{ albumsError }}</p>
            <button type="button" class="mt-3 min-h-11 rounded-full border border-[#cbd4c6] px-5 font-semibold hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" @click="loadAlbums">Thử lại</button>
          </div>
          <div v-else-if="albumsLoaded && !albums.length" class="mt-8 rounded-3xl border border-dashed border-[#cdd6c7] bg-white p-8 text-center sm:p-12">
            <h2 class="text-xl font-semibold">Chưa có album nào</h2>
            <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{{ store.canManage ? 'Tạo album từ folder Google Drive, xuất bản rồi gửi link cho khách chọn ảnh.' : 'Quản lý studio sẽ tạo album và chia sẻ cho bạn.' }}</p>
            <button v-if="store.canManage" type="button" class="mt-5 min-h-11 rounded-full bg-brand px-6 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" @click="createOpen = true">Tạo album đầu tiên</button>
          </div>
          <template v-else-if="albums.length">
            <p role="status" class="mt-5 text-sm text-muted">Hiển thị {{ visible.length }}/{{ albums.length }} album</p>
            <div v-if="visible.length" class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <StudioAlbumCard v-for="album in visible" :key="album.id" :album="album" :studio-id="store.studio.id" :can-publish="store.canManage" :can-share="store.canShare" @published="loadAlbums" />
            </div>
            <div v-else class="rounded-2xl border border-dashed border-[#cdd6c7] bg-white p-8 text-center">
              <p class="font-semibold">Không có album phù hợp</p>
              <button type="button" class="mt-3 min-h-11 rounded-full border border-[#cbd4c6] px-5 font-semibold hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" @click="resetFilters">Xóa bộ lọc</button>
            </div>
          </template>

          <StudioCreateAlbumDialog v-if="store.canManage" v-model:open="createOpen" :studio-id="store.studio.id" @changed="loadAlbums" />
        </template>
        <div v-else-if="store.error" role="alert" class="mx-auto max-w-md rounded-2xl border border-[#ead6d6] bg-white p-6 text-center">
          <p class="font-semibold text-red-700">{{ store.error }}</p>
          <button type="button" class="mt-4 min-h-11 rounded-full border border-[#cbd4c6] px-5 font-semibold hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" @click="store.loadStudios(preferredStudio)">Thử lại</button>
        </div>
        <div v-else role="status" aria-busy="true" aria-label="Đang tải không gian studio">
          <UiSkeleton class="h-9 w-40" />
          <UiSkeleton class="mt-2 h-4 w-72 max-w-full" />
          <div class="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <UiSkeleton v-for="n in 4" :key="n" class="h-[4.5rem] rounded-2xl" />
          </div>
          <div class="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <UiSkeleton v-for="n in 3" :key="n" class="h-40 rounded-2xl" />
          </div>
          <span class="sr-only">Đang tải không gian studio…</span>
        </div>
      </main>
    </template>

    <template v-else>
      <header class="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
        <NuxtLink to="/" class="flex items-center gap-3 text-lg font-bold"><span class="grid size-9 place-items-center rounded-xl bg-brand text-white">Z</span>Zeno Studio</NuxtLink>
        <NuxtLink to="/tools/file-filter" class="inline-flex min-h-11 items-center text-sm font-semibold text-[#496446]">Lọc file trên máy ↗</NuxtLink>
      </header>

      <main class="mx-auto grid max-w-7xl items-start gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-2 lg:pt-28">
        <div class="max-w-xl">
          <p class="text-xs font-bold uppercase tracking-[.2em] text-[#718a66]">Không gian làm việc cho studio</p>
          <h1 class="mt-4 text-5xl font-semibold leading-[1.1] tracking-[-.045em]">Mỗi bộ ảnh có một hành trình. <em class="font-serif font-normal text-brand-soft">Quản lý trọn vẹn.</em></h1>
          <p class="mt-6 text-lg leading-8 text-[#74766e]">Theo dõi album, lựa chọn của khách, ghi chú hậu kỳ và các vòng duyệt ở cùng một nơi.</p>
          <div class="mt-10 space-y-3 text-sm text-[#5f695a]"><p>✓ Link khách và link quản trị tách biệt</p><p>✓ Tên file và yêu cầu chỉnh sửa luôn đi cùng ảnh</p><p>✓ Lịch sử chốt và duyệt được lưu rõ ràng</p></div>
        </div>

        <section class="w-full max-w-lg rounded-[2rem] border border-[#e0e3d8] bg-white p-7 shadow-[0_30px_80px_-35px_rgba(39,55,35,.25)] sm:p-10">
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

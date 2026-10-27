<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from 'vue'
import type { StudioAnalyticsReport } from '~~/server/analytics/studio-report'
import { useStudioStore } from '~/stores/studio'

useSeoMeta({ title: 'Thống kê studio — Zeno Studio', robots: 'noindex, nofollow' })
const store = useStudioStore()
const galleryTrackingEnabled = String(useRuntimeConfig().public.studioGalleryAnalyticsEnabled) === 'true'
const route = useRoute()
const days = shallowRef<7 | 30 | 90>(30)
const report = shallowRef<StudioAnalyticsReport | null>(null)
const loading = shallowRef(false)
const error = shallowRef('')
let requestNumber = 0
const preferredStudio = computed(() => typeof route.query.studio === 'string' ? route.query.studio : null)
const requestedStudioAvailable = computed(() => !preferredStudio.value || store.studio?.id === preferredStudio.value)
const format = new Intl.NumberFormat('vi-VN')
const statusLabels: Record<string, string> = { DRAFT: 'Bản nháp', PUBLISHED: 'Đang chọn ảnh', FINALIZED: 'Đã chốt', DELIVERED: 'Đã bàn giao', EXPIRED: 'Hết hạn' }
const metrics = computed(() => report.value ? [
  { label: 'Album đã tạo', value: report.value.albumsCreated, hint: 'Toàn bộ thao tác hợp lệ trong kỳ' },
  { label: 'Album xuất bản', value: report.value.albumsPublished },
  { label: 'Lần chốt lựa chọn', value: report.value.selectionFinalized, hint: `${format.format(report.value.albumsFinalized)} album còn lưu có lần chốt trong kỳ` },
  { label: 'Lượt mở gallery', value: report.value.galleryOpens, hint: galleryTrackingEnabled ? 'Chỉ tính lượt đã đồng ý phân tích; không phải số người' : 'Tạm tắt ghi nhận lượt mở; số cũ vẫn hiển thị' },
  { label: 'Lần đối chiếu file', value: report.value.fileMatchRuns, hint: 'Kết quả do công cụ trên máy báo cáo' },
  { label: 'File khớp / thiếu / mơ hồ', value: report.value.matchedCount, hint: `${format.format(report.value.missingCount)} thiếu · ${format.format(report.value.ambiguousCount)} mơ hồ` },
] : [])
const opensTrend = computed(() => report.value?.trend.map(item => ({ date: item.date, value: item.galleryOpens })) ?? [])
const workflowTrend = computed(() => report.value?.trend.map(item => ({ date: item.date, value: item.albumsCreated + item.albumsPublished + item.selectionFinalized })) ?? [])
const asOfLabel = computed(() => report.value ? new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short', timeZone: report.value.timezone,
}).format(new Date(report.value.asOf)) : '')

async function load() {
  const studioId = store.studio?.id
  if (!studioId) return
  const current = ++requestNumber
  loading.value = true
  error.value = ''
  report.value = null
  try {
    const result = await $fetch<{ report: StudioAnalyticsReport }>(`/api/studio/${studioId}/analytics`, { query: { days: days.value } })
    if (current === requestNumber) report.value = result.report
  } catch (cause) {
    if (current === requestNumber) {
      const message = (cause as { data?: { statusMessage?: unknown } } | null)?.data?.statusMessage
      error.value = typeof message === 'string' && message ? message : 'Không tải được thống kê studio'
    }
  } finally { if (current === requestNumber) loading.value = false }
}

onMounted(async () => {
  if (!store.sessionChecked) await store.checkSession()
  if (store.user) await store.ensureStudios(preferredStudio.value)
})
watch([days, () => store.studio?.id, preferredStudio], () => {
  report.value = null
  if (import.meta.client && requestedStudioAvailable.value && store.studio?.role === 'owner') void load()
}, { immediate: true })
</script>

<template>
  <div class="min-h-dvh bg-canvas text-ink">
    <StudioHeader />
    <main class="mx-auto max-w-6xl space-y-5 px-4 pb-20 pt-5 sm:px-6 sm:pt-8 lg:px-8">
      <UiPageHeader title="Thống kê studio" description="Tiến độ công việc đầy đủ và lượt mở gallery đã đồng ý phân tích." />
      <p v-if="!store.sessionChecked || store.studiosLoading" role="status" class="text-sm text-muted">Đang tải studio…</p>
      <div v-else-if="!store.user" class="rounded-2xl border border-line bg-white p-5 text-sm">
        <p>Đăng nhập để xem thống kê studio.</p>
        <NuxtLink to="/studio" class="focus-ring mt-3 inline-flex min-h-10 items-center rounded-full bg-brand px-4 font-semibold text-white">Đăng nhập</NuxtLink>
      </div>
      <p v-else-if="store.error" role="alert" class="rounded-2xl border border-danger bg-danger-soft p-5 text-sm text-danger">{{ store.error }}</p>
      <p v-else-if="!requestedStudioAvailable" role="alert" class="rounded-2xl border border-line bg-white p-5 text-sm">Studio này không có trong tài khoản của bạn.</p>
      <p v-else-if="store.studio?.role !== 'owner'" role="alert" class="rounded-2xl border border-line bg-white p-5 text-sm">Chỉ chủ studio được xem trang này.</p>
      <template v-else>
        <p class="text-sm font-semibold">{{ store.studio.name }}</p>
        <AnalyticsRangePicker v-model="days" />
        <p v-if="loading" role="status" class="rounded-2xl border border-line bg-white p-5 text-sm text-muted">Đang tải thống kê…</p>
        <div v-else-if="error" role="alert" class="rounded-2xl border border-danger bg-danger-soft p-5">
          <p class="text-sm font-medium text-danger">{{ error }}</p>
          <button type="button" class="focus-ring mt-3 min-h-10 rounded-full bg-brand px-4 text-sm font-semibold text-white" @click="load">Thử lại</button>
        </div>
        <template v-else-if="report">
          <p class="text-xs text-muted">Cập nhật {{ asOfLabel }} · Múi giờ {{ report.timezone }} · Các thao tác workflow không phụ thuộc đồng ý GA4.</p>
          <AnalyticsMetricCards :items="metrics" />
          <div class="grid gap-3 lg:grid-cols-2">
            <AnalyticsDailyBars title="Thao tác workflow theo ngày" :points="workflowTrend" unit="thao tác" />
            <AnalyticsDailyBars title="Lượt mở gallery theo ngày" :points="opensTrend" unit="lượt" />
          </div>
          <section class="min-w-0 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
            <h2 class="text-base font-semibold">Album hiện còn trong studio</h2>
            <p v-if="!report.albums.length" class="mt-4 text-sm text-muted">Chưa có album nào.</p>
            <div v-else class="mt-3 max-w-full overflow-x-auto">
              <table class="w-full min-w-[680px] text-left text-sm">
                <thead><tr class="border-b border-line text-muted">
                  <th scope="col" class="py-2 pr-3 font-medium">Album</th><th scope="col" class="py-2 pr-3 font-medium">Trạng thái</th>
                  <th scope="col" class="py-2 pr-3 text-right font-medium">Ảnh</th><th scope="col" class="py-2 pr-3 text-right font-medium">Ảnh chốt</th>
                  <th scope="col" class="py-2 pr-3 text-right font-medium">Ghi chú</th><th scope="col" class="py-2 text-right font-medium">Lượt mở</th>
                </tr></thead>
                <tbody><tr v-for="album in report.albums" :key="album.id" class="border-b border-line/60 last:border-0">
                  <th scope="row" class="max-w-52 truncate py-3 pr-3 font-medium" :title="album.title">{{ album.title }}</th>
                  <td class="py-3 pr-3">{{ statusLabels[album.status] ?? album.status }}</td>
                  <td class="py-3 pr-3 text-right tabular-nums">{{ format.format(album.photoCount) }}</td>
                  <td class="py-3 pr-3 text-right tabular-nums">{{ format.format(album.selectedCount) }}</td>
                  <td class="py-3 pr-3 text-right tabular-nums">{{ format.format(album.noteCount) }}</td>
                  <td class="py-3 text-right tabular-nums">{{ format.format(album.galleryOpens) }}</td>
                </tr></tbody>
              </table>
            </div>
            <p class="mt-3 text-xs text-muted">Tối đa 50 album còn lưu. Lượt mở chỉ tính người đã đồng ý và trong khoảng ngày đã chọn.</p>
          </section>
        </template>
      </template>
    </main>
  </div>
</template>

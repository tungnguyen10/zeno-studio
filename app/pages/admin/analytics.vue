<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from 'vue'
import type { SiteReport } from '~~/server/analytics/ga4-report'
import { useStudioStore } from '~/stores/studio'

useSeoMeta({ title: 'Thống kê nền tảng — Zeno Studio', robots: 'noindex, nofollow' })
const store = useStudioStore()
const days = shallowRef<7 | 30 | 90>(30)
const report = shallowRef<SiteReport | null>(null)
const loading = shallowRef(true)
const error = shallowRef('')
let requestNumber = 0

const metrics = computed(() => report.value ? [
  { label: 'Người dùng hoạt động', value: report.value.activeUsers, hint: 'Chỉ những phiên đã đồng ý phân tích' },
  { label: 'Lượt xem trang', value: report.value.pageViews, hint: 'Từ GA4, không gồm người từ chối' },
] : [])
const usersByDay = computed(() => report.value?.trend.map(item => ({ date: item.date, value: item.activeUsers })) ?? [])
const viewsByDay = computed(() => report.value?.trend.map(item => ({ date: item.date, value: item.pageViews })) ?? [])
const eventLabels: Record<string, string> = {
  album_created: 'Tạo album', album_published: 'Xuất bản album', album_opened: 'Mở album khách',
  gallery_view_changed: 'Đổi cách xem gallery', photo_selected: 'Chọn ảnh', photo_unselected: 'Bỏ chọn ảnh',
  photo_note_saved: 'Lưu ghi chú', selection_finalized: 'Chốt bộ ảnh', selection_reopened: 'Mở lại bộ ảnh',
  file_match_completed: 'Đối chiếu file',
}
const format = new Intl.NumberFormat('vi-VN')
const asOfLabel = computed(() => report.value
  ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: report.value.timezone }).format(new Date(report.value.asOf))
  : '')

async function load() {
  const current = ++requestNumber
  loading.value = true
  error.value = ''
  try {
    const result = await $fetch<{ report: SiteReport }>('/api/admin/analytics', { query: { days: days.value } })
    if (current === requestNumber) report.value = result.report
  } catch (cause) {
    if (current === requestNumber) {
      report.value = null
      const status = (cause as { data?: { statusMessage?: unknown } } | null)?.data?.statusMessage
      error.value = typeof status === 'string' && status ? status : 'Không tải được báo cáo GA4'
    }
  } finally {
    if (current === requestNumber) loading.value = false
  }
}

onMounted(() => {
  if (!store.sessionChecked) void store.checkSession()
  void load()
})
watch(days, () => { if (import.meta.client) void load() })
</script>

<template>
  <div class="min-h-dvh bg-canvas text-ink">
    <StudioHeader />
    <main class="mx-auto max-w-6xl space-y-5 px-4 pb-20 pt-5 sm:px-6 sm:pt-8 lg:px-8">
      <UiPageHeader title="Thống kê toàn Zeno Studio" description="Dữ liệu GA4 của các phiên đã đồng ý phân tích." />
      <AnalyticsRangePicker v-model="days" />

      <p v-if="loading" role="status" class="rounded-2xl border border-line bg-white p-5 text-sm text-muted">Đang tải báo cáo GA4…</p>
      <div v-else-if="error" role="alert" class="rounded-2xl border border-danger bg-danger-soft p-5">
        <p class="text-sm font-medium text-danger">{{ error }}</p>
        <button type="button" class="focus-ring mt-3 min-h-10 rounded-full bg-brand px-4 text-sm font-semibold text-white" @click="load">Thử lại</button>
      </div>
      <template v-else-if="report">
        <p class="text-xs text-muted">Lấy lúc {{ asOfLabel }} · Múi giờ {{ report.timezone }} · Hôm nay có thể chưa đủ dữ liệu.</p>
        <AnalyticsMetricCards :items="metrics" />
        <div class="grid gap-3 lg:grid-cols-2">
          <AnalyticsDailyBars title="Người dùng hoạt động theo ngày" :points="usersByDay" unit="người dùng" />
          <AnalyticsDailyBars title="Lượt xem trang theo ngày" :points="viewsByDay" unit="lượt xem" />
        </div>
        <div class="grid gap-3 lg:grid-cols-2">
          <section class="min-w-0 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
            <h2 class="text-base font-semibold">Trang được xem nhiều</h2>
            <p v-if="!report.pages.length" class="mt-4 text-sm text-muted">Chưa có lượt xem trong kỳ này.</p>
            <div v-else class="mt-3 max-w-full overflow-x-auto">
              <table class="w-full min-w-64 text-left text-sm">
                <thead><tr class="border-b border-line text-muted"><th scope="col" class="py-2 pr-3 font-medium">Đường dẫn</th><th scope="col" class="py-2 text-right font-medium">Lượt xem</th></tr></thead>
                <tbody><tr v-for="page in report.pages" :key="page.path" class="border-b border-line/60 last:border-0"><th scope="row" class="break-all py-2 pr-3 font-medium">{{ page.path }}</th><td class="py-2 text-right tabular-nums">{{ format.format(page.views) }}</td></tr></tbody>
              </table>
            </div>
          </section>
          <section class="min-w-0 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
            <h2 class="text-base font-semibold">Sự kiện workflow</h2>
            <p v-if="!report.events.length" class="mt-4 text-sm text-muted">Chưa có sự kiện trong kỳ này.</p>
            <div v-else class="mt-3 max-w-full overflow-x-auto">
              <table class="w-full min-w-64 text-left text-sm">
                <thead><tr class="border-b border-line text-muted"><th scope="col" class="py-2 pr-3 font-medium">Sự kiện</th><th scope="col" class="py-2 text-right font-medium">Lượt</th></tr></thead>
                <tbody><tr v-for="event in report.events" :key="event.name" class="border-b border-line/60 last:border-0"><th scope="row" class="py-2 pr-3 font-medium">{{ eventLabels[event.name] ?? event.name }}</th><td class="py-2 text-right tabular-nums">{{ format.format(event.count) }}</td></tr></tbody>
              </table>
            </div>
          </section>
        </div>
      </template>
    </main>
  </div>
</template>

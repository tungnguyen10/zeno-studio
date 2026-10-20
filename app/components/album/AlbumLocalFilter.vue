<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocalPhotoFilter, type FilterManifest } from '~~/app/composables/useLocalPhotoFilter'

const props = defineProps<{ manifest: FilterManifest }>()
const job = useLocalPhotoFilter(props.manifest)
const previewPage = ref(0)
const statusFilter = ref<'all' | 'matched' | 'missing' | 'ambiguous'>('all')
const entries = computed(() => [
  ...(job.preview.value?.matched ?? []).map(value => ({ kind: 'matched' as const, value })),
  ...(job.preview.value?.missing ?? []).map(value => ({ kind: 'missing' as const, value })),
  ...(job.preview.value?.ambiguous ?? []).map(value => ({ kind: 'ambiguous' as const, value })),
])
const filteredEntries = computed(() => entries.value.filter(item => statusFilter.value === 'all' || item.kind === statusFilter.value))
const pageEntries = computed(() => filteredEntries.value.slice(previewPage.value * 50, (previewPage.value + 1) * 50))
const shownMatches = computed(() => pageEntries.value.flatMap(item => item.kind === 'matched' ? [item.value] : []))
const shownMissing = computed(() => pageEntries.value.flatMap(item => item.kind === 'missing' ? [item.value] : []))
const shownAmbiguous = computed(() => pageEntries.value.flatMap(item => item.kind === 'ambiguous' ? [item.value] : []))
const listCount = computed(() => filteredEntries.value.length)
const canCopy = computed(() => job.phase.value === 'preview' && !job.pathError.value && job.unresolved.value === 0 && job.blockingConflicts.value.length === 0 && (!job.preview.value?.missing.length || job.missingConfirmed.value) && job.planned.value.length > 0 && (!job.sourceReadOnly.value || job.destinationMode.value === 'picker'))
const copyBlocker = computed(() => {
  if (!job.supported.value) return 'Trình duyệt chưa hỗ trợ copy thư mục.'
  if (job.pathError.value) return job.pathError.value
  if (job.unresolved.value > 0) return 'Chọn file hoặc bỏ qua các tên còn mơ hồ.'
  if (job.blockingConflicts.value.length > 0) return 'Sửa tên file đích đang bị xung đột.'
  if (job.preview.value?.missing.length && !job.missingConfirmed.value) return 'Xác nhận các ảnh thiếu trước khi copy.'
  if (!job.planned.value.length) return 'Chưa có file phù hợp để copy.'
  if (job.sourceReadOnly.value && job.destinationMode.value !== 'picker') return 'Chọn một thư mục đích khác cho nguồn chỉ đọc.'
  return ''
})
const retryable = computed(() => job.outcomes.value.some(item => item.status === 'failed' || item.status === 'cancelled'))
const showDestination = ref(false)
const destinationOpen = computed(() => showDestination.value || job.destinationMode.value !== 'auto')
const notesCount = computed(() => props.manifest.items.filter(item => item.notes.length > 0).length)

function downloadFilenames() {
  const content = props.manifest.items.map(item => item.originalFilename).join('\n') + '\n'
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'filenames.txt'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="mt-4">
    <p class="text-pretty text-muted">Phiên bản {{ manifest.versionNumber }} · {{ manifest.items.length }} ảnh · Chỉ copy, không sửa ảnh gốc</p>
    <p v-if="!job.supported.value" class="mt-6 rounded-xl border border-warn-line bg-warn-soft p-4 text-warn" role="status">Trình duyệt này không hỗ trợ chọn và copy thư mục. Dùng Chrome hoặc Edge trên macOS/Windows để lọc ảnh. Bạn vẫn có thể xuất danh sách và ghi chú.</p>
    <div v-if="!job.supported.value" class="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:gap-3"><UiButton variant="secondary" @click="downloadFilenames">Tải tên file TXT</UiButton><UiButton variant="secondary" @click="job.downloadReport('notes')">Tải ghi chú CSV</UiButton></div>

    <div class="mt-6 grid items-start gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div class="space-y-4 sm:space-y-6">
        <UiStepCard :step="1" title="Chọn thư mục RAW" description="Danh sách ảnh đã chốt được dùng sẵn. Chỉ cần chọn thư mục chứa ảnh gốc, hệ thống tự quét và so khớp.">
          <div class="flex flex-wrap items-center gap-2 sm:gap-3">
            <UiButton :disabled="!job.supported.value || job.phase.value === 'scanning' || job.phase.value === 'copying'" @click="job.chooseSource()">Chọn RAW</UiButton>
            <UiButton variant="ghost" size="sm" :disabled="!job.supported.value || job.phase.value === 'copying'" @click="job.chooseSource(true)">Nguồn chỉ đọc</UiButton>
          </div>
          <p v-if="job.source.value" class="mt-3 break-all text-sm font-medium text-brand" translate="no"><span aria-hidden="true">✓ </span>{{ job.source.value.name }}{{ job.sourceReadOnly.value ? ' · chỉ đọc' : '' }}</p>
          <p v-if="job.phase.value === 'scanning'" class="mt-3 text-sm tabular-nums" role="status">Đang quét {{ job.scanCount.value }} mục…</p>
          <UiButton v-if="job.phase.value === 'scanning'" variant="ghost" size="sm" class="mt-2" @click="job.stop">Dừng quét</UiButton>
          <details class="mt-5 rounded-xl border border-line px-4 py-1 open:pb-4"><summary class="focus-ring flex min-h-11 cursor-pointer items-center rounded text-sm font-semibold text-muted">Tùy chọn nâng cao</summary>
            <fieldset :disabled="job.phase.value === 'copying'" class="disabled:opacity-60">
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <label class="text-sm font-semibold">Loại file<UiSelect v-model="job.fileType.value" label="Loại file" name="file-type" :options="[{ value: 'raw', label: 'RAW' }, { value: 'jpeg', label: 'JPEG' }, { value: 'all', label: 'RAW + JPEG' }, { value: 'custom', label: 'Custom' }]" class="mt-1" /></label>
              <label class="text-sm font-semibold">So khớp<UiSelect v-model="job.matchBy.value" label="So khớp" name="match-by" :options="[{ value: 'stem', label: 'Tên gốc JPG → RAW' }, { value: 'full', label: 'Tên file đầy đủ' }]" class="mt-1" /></label>
            </div>
            <label v-if="job.fileType.value === 'custom'" class="mt-3 block text-sm font-semibold">Phần mở rộng ảnh<UiInput v-model="job.customExtensions.value" name="custom-extensions" autocomplete="off" spellcheck="false" class="mt-1" placeholder=".tif, .png…" /></label>
            <label class="mt-3 flex min-h-11 cursor-pointer items-center gap-2 text-sm"><UiCheckbox v-model="job.includeSidecar.value" /> Copy sidecar .xmp cùng ảnh đã khớp</label>
            <label class="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><UiCheckbox v-model="job.preserveFolders.value" /> Giữ cấu trúc thư mục nguồn khi copy</label>
            </fieldset>
          </details>
        </UiStepCard>

        <UiStepCard :step="2" title="Nơi lưu ảnh đã lọc" description="Mặc định tự tạo thư mục SELECTED trong RAW khi bạn xác nhận copy. Chỉ đổi khi cần path khác.">
          <div class="flex flex-wrap items-center gap-2 rounded-xl bg-tint py-1.5 pl-3 pr-1.5">
            <p class="min-w-0 flex-1 break-all text-sm font-medium" translate="no">Đích: {{ job.destinationLabel.value }}</p>
            <button type="button" class="focus-ring min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-brand hover:bg-white" :aria-expanded="destinationOpen" aria-controls="destination-options" @click="showDestination = !destinationOpen">{{ destinationOpen ? 'Thu gọn' : 'Đổi thư mục đích' }}</button>
          </div>
          <div v-show="destinationOpen" id="destination-options" class="mt-3">
            <fieldset :disabled="job.phase.value === 'copying'" class="text-sm disabled:opacity-60">
              <legend class="sr-only">Chọn cách lưu file</legend>
              <label class="flex min-h-11 cursor-pointer items-center gap-2"><UiRadio v-model="job.destinationMode.value" name="destination-mode" value="auto" /> Tự động: RAW/SELECTED</label>
              <label class="flex min-h-11 cursor-pointer items-center gap-2"><UiRadio v-model="job.destinationMode.value" name="destination-mode" value="relative" /> Path con trong RAW</label>
              <label class="flex min-h-11 cursor-pointer items-center gap-2"><UiRadio v-model="job.destinationMode.value" name="destination-mode" value="picker" /> Thư mục khác</label>
            </fieldset>
            <label v-if="job.destinationMode.value === 'relative'" class="mt-2 block text-sm font-semibold">Path tương đối<UiInput v-model="job.relativePath.value" :disabled="job.phase.value === 'copying'" type="text" name="relative-path" autocomplete="off" spellcheck="false" :invalid="!!job.pathError.value" class="mt-1.5" placeholder="KhachA/DaLoc…" /></label>
            <UiButton v-if="job.destinationMode.value === 'picker'" variant="secondary" class="mt-2" :disabled="job.phase.value === 'copying'" @click="job.chooseExternalDestination">Chọn thư mục đích khác</UiButton>
          </div>
          <p v-if="job.pathError.value" class="mt-2 text-sm text-danger" role="alert">{{ job.pathError.value }}</p>
          <p v-if="job.sourceReadOnly.value && job.destinationMode.value !== 'picker'" class="mt-2 text-sm text-warn">Nguồn chỉ đọc: hãy đổi sang “Thư mục khác” để copy.</p>
        </UiStepCard>
      </div>

      <aside class="space-y-4">
        <section aria-labelledby="filter-guide" class="rounded-3xl border border-line bg-white p-4 sm:p-5">
          <h2 id="filter-guide" class="text-xs font-bold uppercase tracking-[.16em] text-brand-soft">Cách dùng</h2>
          <ol class="mt-3 space-y-3 text-sm">
            <li class="flex gap-3"><span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">1</span><span>Bấm <strong>Chọn RAW</strong> và chọn thư mục ảnh gốc.</span></li>
            <li class="flex gap-3"><span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">2</span><span>Kiểm tra ảnh khớp, thiếu hoặc trùng tên.</span></li>
            <li class="flex gap-3"><span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">3</span><span>Bấm <strong>Xác nhận copy</strong>. Ảnh và ghi chú được copy vào <span translate="no">SELECTED</span>.</span></li>
          </ol>
        </section>
        <section aria-labelledby="filter-manifest" class="rounded-3xl border border-line bg-white p-4 sm:p-5">
          <h2 id="filter-manifest" class="text-xs font-bold uppercase tracking-[.16em] text-brand-soft">Danh sách đã chốt</h2>
          <p class="mt-2 text-2xl font-semibold tabular-nums">{{ manifest.items.length }} <span class="text-base font-medium text-muted">ảnh</span></p>
          <p class="mt-1 text-sm text-muted tabular-nums">Phiên bản {{ manifest.versionNumber }} · {{ notesCount }} ảnh có ghi chú</p>
          <details class="mt-3 rounded-xl border border-line px-3 py-1 open:pb-3"><summary class="focus-ring flex min-h-11 cursor-pointer items-center rounded text-sm font-semibold text-brand">Xem tên file</summary>
            <ul class="max-h-60 space-y-1 overflow-auto overscroll-contain text-xs" translate="no">
              <li v-for="item in manifest.items" :key="item.photoId" class="truncate" :title="item.originalFilename">{{ item.originalFilename }}</li>
            </ul>
          </details>
        </section>
      </aside>
    </div>

    <p v-if="job.message.value" class="mt-5 rounded-xl bg-tint p-4 text-sm" role="status">{{ job.message.value }}</p>
    <UiButton v-if="job.source.value && job.phase.value === 'setup' && !job.pathError.value" class="mt-5" @click="job.scan">Quét lại và xem preview</UiButton>

    <UiStepCard v-if="job.preview.value && (job.phase.value === 'preview' || job.phase.value === 'copying' || job.phase.value === 'result')" :step="3" title="Kiểm tra trước khi copy" class="mt-4 sm:mt-6">
      <p class="text-sm text-muted tabular-nums">{{ job.matchedPhotoCount.value }} ảnh khớp · {{ job.planned.value.length }} file dự kiến · {{ job.preview.value.missing.length }} thiếu · {{ job.preview.value.ambiguous.length }} mơ hồ · {{ job.existingConflicts.value.length }} file đích đã có · {{ job.blockingConflicts.value.length }} xung đột cần sửa</p>
      <p v-if="job.scanWarnings.value.length" class="mt-3 text-sm text-warn" role="alert">{{ job.scanWarnings.value.join(' ') }} Kết quả quét có thể chưa đầy đủ.</p>
      <div role="group" aria-label="Lọc kết quả so khớp" class="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"><UiChip v-for="filter in ['all', 'matched', 'missing', 'ambiguous'] as const" :key="filter" :pressed="statusFilter === filter" @click="statusFilter = filter; previewPage = 0">{{ { all: 'Tất cả', matched: 'Khớp', missing: 'Thiếu', ambiguous: 'Mơ hồ' }[filter] }}</UiChip></div>
      <div class="mt-4 max-h-96 space-y-2 overflow-auto overscroll-contain">
        <div v-for="item in shownMatches" :key="`${item.photoId}:${item.file.path}`" class="rounded-xl border border-line p-3 text-sm" translate="no"><strong class="break-all">{{ item.requested }}</strong> → <span class="break-all">{{ item.file.path }}</span></div>
        <div v-for="item in shownMissing" :key="item.photoId" class="rounded-xl border border-warn-line bg-warn-soft p-3 text-sm"><strong class="break-all" translate="no">{{ item.requested }}</strong> · Không tìm thấy</div>
        <label v-for="item in shownAmbiguous" :key="`${item.photoId}:${item.extension}`" class="block rounded-xl border border-warn-line p-3 text-sm"><strong class="break-all" translate="no">{{ item.requested }} · .{{ item.extension }}</strong><UiSelect v-model="job.resolutions.value[`${item.photoId}:${item.extension}`]" :label="item.requested" :options="[{ value: '', label: 'Chọn file hoặc bỏ qua' }, { value: '__skip__', label: 'Bỏ qua file này' }, ...item.files.map(file => ({ value: file.path, label: file.path }))]" class="mt-2" /></label>
      </div>
      <div v-if="listCount > 50" class="mt-4 flex items-center gap-3 text-sm"><UiButton variant="secondary" size="sm" :disabled="previewPage === 0" @click="previewPage--">Trước</UiButton><span class="tabular-nums">Trang {{ previewPage + 1 }} / {{ Math.ceil(listCount / 50) }}</span><UiButton variant="secondary" size="sm" :disabled="(previewPage + 1) * 50 >= listCount" @click="previewPage++">Sau</UiButton></div>
      <div v-if="job.conflicts.value.length" class="mt-5 rounded-xl border border-warn-line bg-warn-soft p-4"><h3 class="font-semibold">File đích đã có sẽ được bỏ qua; tên trùng khác cần đổi</h3><p v-for="text in job.conflicts.value.slice(0, 30)" :key="text" class="mt-1 break-all text-sm" translate="no">{{ text }}</p><label v-for="item in job.planned.value.filter(file => job.conflicts.value.some(text => text.startsWith(file.outputPath + ':'))).slice(0, 30)" :key="item.id" class="mt-3 block text-sm">{{ item.sourcePath }} · đổi tên đích nếu muốn<UiInput v-model="job.outputNames.value[item.sourcePath]" autocomplete="off" spellcheck="false" class="mt-1" :placeholder="item.outputPath" /></label></div>
      <label v-if="job.preview.value.missing.length" class="mt-5 flex min-h-11 cursor-pointer items-center gap-2 text-sm"><UiCheckbox v-model="job.missingConfirmed.value" /> Tiếp tục mà không copy {{ job.preview.value.missing.length }} ảnh thiếu</label>
      <p class="mt-4 break-all text-sm">Sẽ copy vào: <strong translate="no">{{ job.destinationLabel.value }}</strong></p>
      <UiButton v-if="job.phase.value === 'preview'" class="mt-4 w-full sm:w-auto" :disabled="!canCopy" :aria-describedby="!canCopy ? 'album-copy-blocker' : undefined" @click="job.runCopy()">Xác nhận copy {{ job.planned.value.length }} file</UiButton>
      <p v-if="job.phase.value === 'preview' && !canCopy" id="album-copy-blocker" class="mt-2 text-sm text-muted">{{ copyBlocker }}</p>
      <div v-if="job.phase.value === 'copying'" class="mt-5 text-sm" role="status"><p class="tabular-nums">{{ job.outcomes.value.length }}/{{ job.planned.value.length }} file · <span translate="no">{{ job.progressName.value }}</span></p><progress class="mt-2 w-full accent-brand" :value="job.outcomes.value.length" :max="job.planned.value.length" /><UiButton variant="secondary" size="sm" class="mt-2" @click="job.stop">Dừng sau file hiện tại</UiButton></div>
      <div v-if="job.phase.value === 'result'" class="mt-5 text-sm"><p class="tabular-nums">Hoàn tất {{ job.copyCounts.value.copied }} · Bỏ qua {{ job.copyCounts.value.skipped }} · Lỗi {{ job.copyCounts.value.failed }} · Chưa chạy {{ job.copyCounts.value.cancelled }}</p><p v-if="job.writtenReports.value.length" class="mt-2">Báo cáo trong đích: {{ job.writtenReports.value.join(', ') }}</p><UiButton v-if="retryable" variant="secondary" size="sm" class="mt-3" @click="job.runCopy(true)">Thử lại file lỗi/chưa chạy</UiButton><p v-if="job.outcomes.value.some(item => item.status === 'partial')" class="mt-2 text-warn">File dang dở được giữ nguyên. Chọn đích khác rồi quét lại để copy ảnh này.</p></div>
      <div class="mt-5 flex flex-wrap gap-2 sm:gap-3"><UiButton variant="secondary" size="sm" @click="job.downloadReport('notes')">Tải ghi chú CSV</UiButton><UiButton variant="secondary" size="sm" @click="job.downloadReport('report')">Tải báo cáo CSV</UiButton></div>
    </UiStepCard>
  </div>
</template>

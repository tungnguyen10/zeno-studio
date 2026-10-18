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
const retryable = computed(() => job.outcomes.value.some(item => item.status === 'failed' || item.status === 'cancelled'))

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
    <p class="text-[#667461]">Phiên bản {{ manifest.versionNumber }} · {{ manifest.items.length }} ảnh · Chỉ copy, không sửa ảnh gốc</p>
    <p v-if="!job.supported.value" class="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900" role="status">Trình duyệt này không hỗ trợ chọn và copy thư mục. Dùng Chrome hoặc Edge trên macOS/Windows để lọc ảnh. Bạn vẫn có thể xuất danh sách và ghi chú.</p>
    <div v-if="!job.supported.value" class="mt-4 flex flex-wrap gap-3"><button type="button" class="rounded-full border px-5 py-3" @click="downloadFilenames">Tải tên file TXT</button><button type="button" class="rounded-full border px-5 py-3" @click="job.downloadReport('notes')">Tải ghi chú CSV</button></div>

    <div class="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
      <section class="rounded-3xl border bg-white p-6">
        <h2 class="text-xl font-semibold">1. Chọn thư mục RAW</h2>
        <p class="mt-2 text-sm text-muted">Quét tên file trong RAW và thư mục con. Ảnh gốc được giữ nguyên.</p>
        <div class="mt-5 flex flex-wrap gap-3">
          <button type="button" :disabled="!job.supported.value || job.phase.value === 'scanning' || job.phase.value === 'copying'" class="min-h-11 rounded-full bg-[#344732] px-5 font-semibold text-white disabled:opacity-50" @click="job.chooseSource()">Chọn RAW</button>
          <button type="button" :disabled="!job.supported.value || job.phase.value === 'copying'" class="min-h-11 rounded-full border px-5 text-sm font-semibold disabled:opacity-50" @click="job.chooseSource(true)">Nguồn chỉ đọc</button>
        </div>
        <p v-if="job.source.value" class="mt-3 break-all text-sm text-[#496345]">{{ job.source.value.name }}{{ job.sourceReadOnly.value ? ' · chỉ đọc' : '' }}</p>
        <p v-if="job.phase.value === 'scanning'" class="mt-3 text-sm" role="status">Đang quét {{ job.scanCount.value }} mục…</p>
        <button v-if="job.phase.value === 'scanning'" type="button" class="mt-2 underline" @click="job.stop">Dừng quét</button>
        <details class="mt-6 rounded-xl border p-4"><summary class="cursor-pointer font-semibold">Tùy chọn so khớp</summary>
          <fieldset :disabled="job.phase.value === 'copying'" class="disabled:opacity-60">
          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <label class="text-sm">Loại file<select v-model="job.fileType.value" class="mt-1 min-h-11 w-full rounded-xl border bg-white px-3"><option value="raw">RAW</option><option value="jpeg">JPEG</option><option value="all">RAW + JPEG</option><option value="custom">Custom</option></select></label>
            <label class="text-sm">So khớp<select v-model="job.matchBy.value" class="mt-1 min-h-11 w-full rounded-xl border bg-white px-3"><option value="stem">Tên gốc JPG → RAW</option><option value="full">Tên file đầy đủ</option></select></label>
          </div>
          <label v-if="job.fileType.value === 'custom'" class="mt-3 block text-sm">Phần mở rộng ảnh<input v-model="job.customExtensions.value" class="mt-1 min-h-11 w-full rounded-xl border px-3" placeholder=".tif, .png…"></label>
          <label class="mt-3 flex min-h-11 items-center gap-2 text-sm"><input v-model="job.includeSidecar.value" type="checkbox"> Copy sidecar .xmp cùng ảnh đã khớp</label>
          <label class="mt-3 flex min-h-11 items-center gap-2 text-sm"><input v-model="job.preserveFolders.value" type="checkbox"> Giữ cấu trúc thư mục nguồn khi copy</label>
          </fieldset>
        </details>
      </section>

      <section class="rounded-3xl border bg-white p-6">
        <h2 class="text-xl font-semibold">2. Thư mục đích</h2>
        <p class="mt-2 text-sm text-muted">Mặc định tự tạo thư mục đã lọc xong khi bạn xác nhận copy.</p>
        <fieldset :disabled="job.phase.value === 'copying'" class="mt-5 space-y-2 text-sm disabled:opacity-60">
          <legend class="font-semibold">Chọn cách lưu file</legend>
          <label class="flex min-h-11 items-center gap-2"><input v-model="job.destinationMode.value" type="radio" value="auto"> Tự động: RAW/SELECTED</label>
          <label class="flex min-h-11 items-center gap-2"><input v-model="job.destinationMode.value" type="radio" value="relative"> Path con trong RAW</label>
          <label class="flex min-h-11 items-center gap-2"><input v-model="job.destinationMode.value" type="radio" value="picker"> Thư mục khác</label>
        </fieldset>
        <label v-if="job.destinationMode.value === 'relative'" class="mt-3 block text-sm font-semibold">Path tương đối<input v-model="job.relativePath.value" :disabled="job.phase.value === 'copying'" type="text" class="mt-2 min-h-11 w-full rounded-xl border px-3 font-normal" placeholder="KhachA/DaLoc…"></label>
        <p v-if="job.pathError.value" class="mt-2 text-sm text-red-700" role="alert">{{ job.pathError.value }}</p>
        <button v-if="job.destinationMode.value === 'picker'" type="button" :disabled="job.phase.value === 'copying'" class="mt-3 min-h-11 rounded-full border px-5 font-semibold disabled:opacity-50" @click="job.chooseExternalDestination">Chọn thư mục đích khác</button>
        <p class="mt-4 break-all rounded-xl bg-[#eaf1e5] p-3 text-sm">Đích: {{ job.destinationLabel.value }}</p>
        <p v-if="job.destinationMode.value === 'auto'" class="mt-2 text-sm text-muted">Thư mục đã lọc: SELECTED</p>
        <p v-if="job.sourceReadOnly.value && job.destinationMode.value !== 'picker'" class="mt-2 text-sm text-amber-800">Nguồn chỉ đọc: hãy chọn thư mục khác để copy.</p>
      </section>
    </div>

    <p v-if="job.message.value" class="mt-5 rounded-xl bg-[#eaf1e5] p-4 text-sm" role="status">{{ job.message.value }}</p>
    <button v-if="job.source.value && job.phase.value === 'setup' && !job.pathError.value" type="button" class="mt-5 min-h-11 rounded-full bg-[#344732] px-6 font-semibold text-white" @click="job.scan">Quét lại và xem preview</button>

    <section v-if="job.preview.value && (job.phase.value === 'preview' || job.phase.value === 'copying' || job.phase.value === 'result')" class="mt-8 rounded-3xl border bg-white p-6">
      <h2 class="text-xl font-semibold">3. Kiểm tra trước khi copy</h2>
      <p class="mt-2 text-sm text-muted">{{ job.matchedPhotoCount.value }} ảnh khớp · {{ job.planned.value.length }} file dự kiến · {{ job.preview.value.missing.length }} thiếu · {{ job.preview.value.ambiguous.length }} mơ hồ · {{ job.existingConflicts.value.length }} file đích đã có · {{ job.blockingConflicts.value.length }} xung đột cần sửa</p>
      <p v-if="job.scanWarnings.value.length" class="mt-3 text-sm text-amber-800" role="alert">{{ job.scanWarnings.value.join(' ') }} Kết quả quét có thể chưa đầy đủ.</p>
      <div class="mt-4 flex flex-wrap gap-2 text-sm"><button v-for="filter in ['all', 'matched', 'missing', 'ambiguous'] as const" :key="filter" type="button" class="min-h-11 rounded-full border px-4" :aria-pressed="statusFilter === filter" @click="statusFilter = filter; previewPage = 0">{{ { all: 'Tất cả', matched: 'Khớp', missing: 'Thiếu', ambiguous: 'Mơ hồ' }[filter] }}</button></div>
      <div class="mt-4 max-h-96 space-y-2 overflow-auto">
        <div v-for="item in shownMatches" :key="`${item.photoId}:${item.file.path}`" class="rounded-xl border p-3 text-sm"><strong class="break-all">{{ item.requested }}</strong> → <span class="break-all">{{ item.file.path }}</span></div>
        <div v-for="item in shownMissing" :key="item.photoId" class="rounded-xl border border-amber-200 p-3 text-sm"><strong class="break-all">{{ item.requested }}</strong> · Không tìm thấy</div>
        <label v-for="item in shownAmbiguous" :key="`${item.photoId}:${item.extension}`" class="block rounded-xl border border-amber-200 p-3 text-sm"><strong class="break-all">{{ item.requested }} · .{{ item.extension }}</strong><select v-model="job.resolutions.value[`${item.photoId}:${item.extension}`]" class="mt-2 min-h-11 w-full rounded-lg border bg-white px-2"><option value="">Chọn file hoặc bỏ qua</option><option value="__skip__">Bỏ qua file này</option><option v-for="file in item.files" :key="file.path" :value="file.path">{{ file.path }}</option></select></label>
      </div>
      <div v-if="listCount > 50" class="mt-4 flex items-center gap-3 text-sm"><button type="button" :disabled="previewPage === 0" class="min-h-11 rounded-full border px-4 disabled:opacity-50" @click="previewPage--">Trước</button><span>Trang {{ previewPage + 1 }} / {{ Math.ceil(listCount / 50) }}</span><button type="button" :disabled="(previewPage + 1) * 50 >= listCount" class="min-h-11 rounded-full border px-4 disabled:opacity-50" @click="previewPage++">Sau</button></div>
      <div v-if="job.conflicts.value.length" class="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 class="font-semibold">File đích đã có sẽ được bỏ qua; tên trùng khác cần đổi</h3><p v-for="text in job.conflicts.value.slice(0, 30)" :key="text" class="mt-1 break-all text-sm">{{ text }}</p><label v-for="item in job.planned.value.filter(file => job.conflicts.value.some(text => text.startsWith(file.outputPath + ':'))).slice(0, 30)" :key="item.id" class="mt-3 block text-sm">{{ item.sourcePath }} · đổi tên đích nếu muốn<input v-model="job.outputNames.value[item.sourcePath]" class="mt-1 min-h-11 w-full rounded-lg border px-3" :placeholder="item.outputPath"></label></div>
      <label v-if="job.preview.value.missing.length" class="mt-5 flex min-h-11 items-center gap-2 text-sm"><input v-model="job.missingConfirmed.value" type="checkbox"> Tiếp tục mà không copy {{ job.preview.value.missing.length }} ảnh thiếu</label>
      <p class="mt-4 break-all text-sm">Sẽ copy vào: <strong>{{ job.destinationLabel.value }}</strong></p>
      <button v-if="job.phase.value === 'preview'" type="button" :disabled="!canCopy" class="mt-4 min-h-11 rounded-full bg-[#344732] px-6 font-semibold text-white disabled:opacity-50" @click="job.runCopy()">Xác nhận copy {{ job.planned.value.length }} file</button>
      <div v-if="job.phase.value === 'copying'" class="mt-5 text-sm" role="status"><p>{{ job.outcomes.value.length }}/{{ job.planned.value.length }} file · {{ job.progressName.value }}</p><progress class="mt-2 w-full accent-[#344732]" :value="job.outcomes.value.length" :max="job.planned.value.length" /><button type="button" class="mt-2 min-h-11 rounded-full border px-4" @click="job.stop">Dừng sau file hiện tại</button></div>
      <div v-if="job.phase.value === 'result'" class="mt-5 text-sm"><p>Hoàn tất {{ job.copyCounts.value.copied }} · Bỏ qua {{ job.copyCounts.value.skipped }} · Lỗi {{ job.copyCounts.value.failed }} · Chưa chạy {{ job.copyCounts.value.cancelled }}</p><p v-if="job.writtenReports.value.length" class="mt-2">Báo cáo trong đích: {{ job.writtenReports.value.join(', ') }}</p><button v-if="retryable" type="button" class="mt-3 min-h-11 rounded-full border px-4" @click="job.runCopy(true)">Thử lại file lỗi/chưa chạy</button><p v-if="job.outcomes.value.some(item => item.status === 'partial')" class="mt-2 text-amber-800">File dang dở được giữ nguyên. Chọn đích khác rồi quét lại để copy ảnh này.</p></div>
      <div class="mt-5 flex flex-wrap gap-3"><button type="button" class="min-h-11 rounded-full border px-4" @click="job.downloadReport('notes')">Tải ghi chú CSV</button><button type="button" class="min-h-11 rounded-full border px-4" @click="job.downloadReport('report')">Tải báo cáo CSV</button></div>
    </section>
  </div>
</template>

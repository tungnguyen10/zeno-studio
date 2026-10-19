<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { matchLocalFiles, type MatchResult } from '~~/shared/domain/file-matching'
import type { CopyResult } from '~~/shared/domain/file-copy'
import { exportFileFilterReport } from '~~/shared/domain/file-report'
import { scanDirectory, type IndexedFile } from '~~/app/services/local-filter/directoryScanner'
import { copyLocalFiles } from '~~/app/services/local-filter/copyEngine'

useSeoMeta({ title: 'Lọc file trên máy — Zeno Studio' })

type BrowserWithDirectoryPicker = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
}

const supported = ref(false)
const requestedText = ref('')
const source = shallowRef<FileSystemDirectoryHandle | null>(null)
const destination = shallowRef<FileSystemDirectoryHandle | null>(null)
const indexedFiles = shallowRef<IndexedFile[]>([])
const matchBy = ref<'full' | 'stem'>('stem')
const fileType = ref<'jpeg' | 'raw' | 'all' | 'custom'>('raw')
const customExtensions = ref('')
const preview = ref<MatchResult | null>(null)
const resolvedPaths = ref<Record<string, string>>({})
const busy = ref(false)
const progress = ref({ done: 0, total: 0 })
const report = ref<CopyResult | null>(null)
const message = ref('')
const messageTone = ref<'info' | 'success' | 'warn' | 'error'>('info')
const guideOpen = ref(true)
const missingCopied = ref(false)
const GUIDE_KEY = 'zeno-file-filter-guide'
const GUIDE_STEPS = [
  'Dán danh sách tên ảnh khách chọn vào ô bên dưới (mỗi dòng một tên, hoặc cách nhau bằng dấu phẩy).',
  'Chọn thư mục chứa ảnh gốc. Công cụ quét cả thư mục con, không tải file lên mạng.',
  'Bấm “Xem kết quả so khớp”, kiểm tra tên không tìm thấy và chọn file đúng cho tên bị trùng.',
  'Bấm Copy. File được chép vào thư mục SELECTED (hoặc thư mục đích bạn chọn).',
]

function notify(text: string, tone: typeof messageTone.value = 'info') {
  message.value = text
  messageTone.value = tone
}

function onGuideToggle(event: Event) {
  guideOpen.value = (event.target as HTMLDetailsElement).open
  localStorage.setItem(GUIDE_KEY, guideOpen.value ? 'open' : 'closed')
}

onMounted(() => {
  supported.value = typeof (window as BrowserWithDirectoryPicker).showDirectoryPicker === 'function'
  if (localStorage.getItem(GUIDE_KEY) === 'closed') guideOpen.value = false
  if (useRoute().query.from === 'results') {
    requestedText.value = sessionStorage.getItem('zeno-filter-filenames') ?? ''
    sessionStorage.removeItem('zeno-filter-filenames')
  }
})

// Accept lists pasted from chat/spreadsheets: newline, tab, comma or semicolon separated.
const parsedNames = computed(() => requestedText.value.split(/[\r\n\t,;]+/).map(name => name.trim()).filter(Boolean))
const requestedNames = computed(() => {
  const seen = new Set<string>()
  return parsedNames.value.filter(name => {
    const key = name.normalize('NFC').toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})
const duplicateCount = computed(() => parsedNames.value.length - requestedNames.value.length)
const previewBlocker = computed(() => {
  if (!supported.value) return 'Cần Chrome hoặc Edge trên máy tính.'
  if (requestedNames.value.length === 0 && !source.value) return 'Còn thiếu: danh sách tên file và thư mục nguồn.'
  if (requestedNames.value.length === 0) return 'Còn thiếu: danh sách tên file (bước 1).'
  if (!source.value) return 'Còn thiếu: thư mục nguồn (bước 2).'
  return ''
})

// A preview computed from old inputs could copy the wrong files.
watch([requestedNames, matchBy, fileType, customExtensions], () => {
  if (!preview.value) return
  preview.value = null
  report.value = null
  notify('Dữ liệu đã thay đổi — hãy xem lại kết quả so khớp.', 'warn')
})
const AUTO_FOLDER = 'SELECTED'
const destinationLabel = computed(() => destination.value?.name ?? (source.value ? `${source.value.name}/${AUTO_FOLDER}` : `${AUTO_FOLDER} trong thư mục nguồn`))
const selectedMatches = computed(() => {
  if (!preview.value) return []
  const manual = preview.value.ambiguous.flatMap(item => {
    const path = resolvedPaths.value[item.requested]
    const file = item.files.find(candidate => candidate.path === path)
    return file ? [{ requested: item.requested, file }] : []
  })
  return [...preview.value.matched, ...manual]
})

async function chooseSource() {
  const picker = (window as BrowserWithDirectoryPicker).showDirectoryPicker
  if (!picker) return
  try {
    source.value = await picker({ mode: 'read' })
    progress.value = { done: 0, total: 0 }
    busy.value = true
    notify('Đang đọc danh sách file…')
    indexedFiles.value = (await scanDirectory(source.value)).files
    preview.value = null
    report.value = null
    notify(`Đã tìm thấy ${indexedFiles.value.length} file trong thư mục nguồn.`, indexedFiles.value.length ? 'success' : 'warn')
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) notify(error instanceof Error ? error.message : 'Không đọc được thư mục.', 'error')
  } finally { busy.value = false }
}

async function chooseDestination() {
  const picker = (window as BrowserWithDirectoryPicker).showDirectoryPicker
  if (!picker) return
  try {
    const chosen = await picker({ mode: 'readwrite' })
    if (source.value && await chosen.isSameEntry(source.value)) {
      notify('Hãy chọn thư mục đích khác thư mục nguồn.', 'warn')
      return
    }
    destination.value = chosen
    notify(`Thư mục đích: ${chosen.name}`)
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) notify(error instanceof Error ? error.message : 'Không mở được thư mục đích.', 'error')
  }
}

function useAutoDestination() {
  destination.value = null
  notify(`Thư mục đích: ${destinationLabel.value}`)
}

// Without an explicit destination, copies go to SELECTED inside the source (needs write permission).
async function resolveDestination(): Promise<FileSystemDirectoryHandle> {
  if (destination.value) return destination.value
  const root = source.value as FileSystemDirectoryHandle & { requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState> }
  if (root.requestPermission && await root.requestPermission({ mode: 'readwrite' }) !== 'granted') {
    throw new Error(`Cần quyền ghi vào “${root.name}” để tạo thư mục ${AUTO_FOLDER}. Hoặc chọn thư mục đích khác.`)
  }
  return root.getDirectoryHandle(AUTO_FOLDER, { create: true })
}

function runPreview() {
  if (!source.value || requestedNames.value.length === 0) {
    notify('Nhập tên file và chọn thư mục nguồn trước khi xem kết quả.', 'warn')
    return
  }
  preview.value = matchLocalFiles(requestedNames.value, indexedFiles.value, {
    matchBy: matchBy.value,
    fileType: fileType.value,
    customExtensions: customExtensions.value.split(',').map(value => value.trim()).filter(Boolean),
  })
  resolvedPaths.value = {}
  report.value = null
  missingCopied.value = false
  const { matched, missing, ambiguous } = preview.value
  if (ambiguous.length) notify(`Có ${ambiguous.length} tên trùng — chọn file đúng ở bước 3 trước khi copy.`, 'warn')
  else if (missing.length) notify(`Khớp ${matched.length} file, ${missing.length} tên không tìm thấy.`, 'warn')
  else notify(`Khớp đủ ${matched.length} file. Sẵn sàng copy.`, 'success')
}

async function copyMissing() {
  if (!preview.value) return
  try {
    await navigator.clipboard.writeText(preview.value.missing.join('\n'))
    missingCopied.value = true
  } catch {
    notify('Không copy được vào clipboard.', 'error')
  }
}

async function runCopy() {
  if (!source.value || selectedMatches.value.length === 0) return
  busy.value = true
  progress.value = { done: 0, total: selectedMatches.value.length }
  try {
    const target = await resolveDestination()
    const files = selectedMatches.value.map(item => {
      const indexed = indexedFiles.value.find(file => file.path === item.file.path)
      if (!indexed) throw new Error(`Không còn tìm thấy ${item.file.path}`)
      return { id: indexed.path, requested: item.requested, sourcePath: indexed.path, outputPath: indexed.name, handle: indexed.handle }
    })
    const outcomes = await copyLocalFiles(files, target, { onProgress: current => {
      progress.value = { done: current.length, total: files.length }
    } })
    report.value = {
      copied: outcomes.filter(item => item.status === 'copied').map(item => item.outputPath),
      skipped: outcomes.filter(item => item.status === 'skipped').map(item => item.outputPath),
      errors: outcomes.filter(item => item.status === 'failed' || item.status === 'partial').map(item => ({ filename: item.outputPath, message: item.reason })),
      outcomes: outcomes.map(item => ({ requested: item.requested, filename: item.outputPath, sourcePath: item.sourcePath, status: item.status === 'copied' ? 'copied' : item.status === 'skipped' ? 'skipped' : 'error', detail: item.reason })),
    }
    notify(`Đã copy ${report.value.copied.length} file; bỏ qua ${report.value.skipped.length}; lỗi ${report.value.errors.length}.`, report.value.errors.length ? 'error' : 'success')
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Không thể copy file.', 'error')
  } finally { busy.value = false }
}

function downloadReport() {
  if (!preview.value) return
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([exportFileFilterReport(preview.value, resolvedPaths.value, report.value)], { type: 'text/csv;charset=utf-8' }))
  link.download = 'file-filter-report.csv'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1_000)
}
</script>

<template>
  <div class="min-h-dvh bg-canvas text-ink">
    <header class="border-b border-line bg-white px-4 sm:px-5">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 py-1.5">
        <NuxtLink to="/" class="focus-ring -ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 font-semibold text-brand hover:bg-tint">← Zeno Studio</NuxtLink>
        <span class="text-sm text-muted">Công cụ studio</span>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 pt-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-10">
      <p class="text-xs font-bold uppercase tracking-[.18em] text-brand-soft">Local File Filter</p>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Lọc file theo danh sách ảnh</h1>
      <p class="mt-4 max-w-3xl text-pretty text-muted">Dán tên ảnh khách đã chọn, tìm RAW/JPEG trong thư mục trên máy và copy đúng file sang thư mục đích · <span class="font-medium text-brand">Chỉ copy, không xóa file nguồn</span></p>

      <UiNotice v-if="!supported" tone="warn" class="mt-6">
        Trình duyệt này không hỗ trợ chọn thư mục trực tiếp. Hãy mở công cụ trên Chrome hoặc Edge ở máy tính.
      </UiNotice>

      <details class="group mt-6 rounded-3xl border border-line bg-white px-4 sm:mt-8 sm:px-6" :open="guideOpen" @toggle="onGuideToggle">
        <summary class="focus-ring -mx-2 flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-2 font-semibold [&::-webkit-details-marker]:hidden">
          <span>Cách sử dụng</span>
          <span aria-hidden="true" class="text-muted transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div class="pb-5 sm:pb-6">
          <ol class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <li v-for="(text, index) in GUIDE_STEPS" :key="index" class="flex gap-3 rounded-2xl bg-canvas p-3 text-sm text-pretty">
              <span aria-hidden="true" class="grid size-6 shrink-0 place-items-center rounded-full bg-tint text-xs font-bold text-brand tabular-nums">{{ index + 1 }}</span>
              <span>{{ text }}</span>
            </li>
          </ol>
          <ul class="mt-4 grid gap-2 text-sm text-pretty text-muted lg:grid-cols-3">
            <li><strong class="text-ink">Tên gốc JPG → RAW:</strong> khách gửi <code translate="no" class="font-mono text-ink">DSC_0123.JPG</code> sẽ tìm ra <code translate="no" class="font-mono text-ink">DSC_0123.CR3/.NEF/.ARW…</code></li>
            <li><strong class="text-ink">Trùng tên:</strong> cùng một tên xuất hiện ở nhiều thư mục con — bạn chọn file cần copy.</li>
            <li><strong class="text-ink">An toàn:</strong> file gốc luôn giữ nguyên; file đã có ở thư mục đích sẽ được bỏ qua.</li>
          </ul>
        </div>
      </details>

      <div class="mt-4 grid items-start gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-2">
        <UiStepCard :step="1" title="Danh sách ảnh" description="Dán tên file khách đã chọn từ album, tin nhắn hoặc bảng tính.">
          <div class="flex items-end justify-between gap-3">
            <label for="requested" class="text-sm font-semibold">Tên file cần tìm</label>
            <UiButton v-if="requestedText" variant="ghost" size="sm" class="-mb-2 -mr-2" @click="requestedText = ''">Xóa</UiButton>
          </div>
          <textarea id="requested" v-model="requestedText" rows="8" name="requested" autocomplete="off" spellcheck="false" placeholder="DSC_0123.JPG&#10;DSC_0124.JPG" aria-describedby="requested-hint" class="control mt-1.5 resize-y bg-canvas px-4 py-3 font-mono text-sm leading-7" />
          <p id="requested-hint" class="mt-1.5 text-xs text-muted tabular-nums">
            {{ requestedNames.length }} tên<template v-if="duplicateCount"> · bỏ {{ duplicateCount }} tên lặp</template> · mỗi dòng, dấu phẩy hoặc chấm phẩy
          </p>
        </UiStepCard>

        <UiStepCard :step="2" title="Thư mục" description="Chọn nơi chứa ảnh gốc và nơi lưu ảnh đã lọc.">
          <div class="space-y-3">
            <div class="rounded-2xl border border-line p-3 sm:p-4">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">Nguồn</p>
              <p class="mt-1 break-all text-sm" :class="source ? 'font-medium text-brand' : 'text-muted'" translate="no">
                {{ source ? `${source.name} · ${indexedFiles.length} file` : 'Chưa chọn thư mục' }}
              </p>
              <UiButton class="mt-3" size="sm" :variant="source ? 'secondary' : 'primary'" :disabled="!supported || busy" :loading="busy && !progress.total" @click="chooseSource">Chọn thư mục nguồn</UiButton>
            </div>
            <div class="rounded-2xl border border-line p-3 sm:p-4">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">Đích</p>
              <p class="mt-1 break-all text-sm font-medium" translate="no">{{ destinationLabel }}</p>
              <p class="mt-0.5 text-xs text-muted">{{ destination ? 'Thư mục do bạn chọn.' : 'Tự tạo khi copy — trình duyệt sẽ hỏi quyền ghi.' }}</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <UiButton variant="secondary" size="sm" :disabled="!supported || busy" @click="chooseDestination">Chọn thư mục đích</UiButton>
                <UiButton v-if="destination" variant="ghost" size="sm" :disabled="busy" @click="useAutoDestination">Dùng mặc định</UiButton>
              </div>
            </div>
          </div>

          <details class="mt-3 rounded-2xl border border-line px-3 sm:px-4 open:pb-4">
            <summary class="focus-ring flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded text-sm font-semibold">
              Tùy chọn so khớp
              <span class="font-normal text-muted">{{ { raw: 'RAW', jpeg: 'JPEG', all: 'RAW + JPEG', custom: 'Tùy chỉnh' }[fileType] }} · {{ matchBy === 'stem' ? 'theo tên gốc' : 'tên đầy đủ' }}</span>
            </summary>
            <div class="mt-2 grid gap-3 sm:grid-cols-2">
              <label class="text-sm font-semibold">Loại file<select v-model="fileType" name="file-type" class="control mt-1"><option value="raw">RAW</option><option value="jpeg">JPEG</option><option value="all">RAW + JPEG</option><option value="custom">Tùy chỉnh</option></select></label>
              <label class="text-sm font-semibold">So khớp<select v-model="matchBy" name="match-by" class="control mt-1"><option value="stem">Tên gốc JPG → RAW</option><option value="full">Tên file đầy đủ</option></select></label>
            </div>
            <label v-if="fileType === 'custom'" class="mt-3 block text-sm font-semibold">Phần mở rộng (cách nhau bằng dấu phẩy)<input v-model="customExtensions" name="custom-extensions" autocomplete="off" spellcheck="false" placeholder=".tif, .png…" class="control mt-1"></label>
            <p class="mt-3 text-xs text-pretty text-muted">{{ matchBy === 'stem' ? 'Bỏ đuôi file khi so khớp: tên JPG khách chọn sẽ tìm đúng file RAW cùng tên.' : 'Tên file phải trùng hoàn toàn, kể cả phần đuôi.' }}</p>
          </details>

          <UiButton block class="mt-5" :disabled="busy || Boolean(previewBlocker)" @click="runPreview">Xem kết quả so khớp</UiButton>
          <p v-if="previewBlocker" class="mt-2 text-center text-xs text-muted">{{ previewBlocker }}</p>
        </UiStepCard>
      </div>

      <UiNotice v-if="message" :tone="messageTone" class="mt-4">{{ message }}</UiNotice>

      <UiStepCard v-if="preview" :step="3" title="Kết quả so khớp" description="Kiểm tra file thiếu và file trùng trước khi copy." class="mt-4 sm:mt-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <ul class="flex flex-wrap gap-2 text-sm font-medium tabular-nums">
            <li class="rounded-full bg-tint px-3 py-1.5 text-brand">{{ preview.matched.length }} khớp</li>
            <li class="rounded-full bg-warn-soft px-3 py-1.5 text-warn">{{ preview.missing.length }} không tìm thấy</li>
            <li class="rounded-full bg-danger-soft px-3 py-1.5 text-danger">{{ preview.ambiguous.length }} trùng tên</li>
          </ul>
          <UiButton variant="secondary" size="sm" @click="downloadReport">Tải báo cáo CSV</UiButton>
        </div>

        <div v-if="preview.ambiguous.length" class="mt-6">
          <h3 class="font-semibold">Chọn file cho tên trùng</h3>
          <div class="mt-3 grid gap-3 lg:grid-cols-2">
            <label v-for="item in preview.ambiguous" :key="item.requested" class="block rounded-xl border border-line p-3 text-sm sm:p-4"><span class="break-all font-medium" translate="no">{{ item.requested }}</span>
              <select v-model="resolvedPaths[item.requested]" class="control mt-2"><option value="">Không copy file này</option><option v-for="file in item.files" :key="file.path" :value="file.path">{{ file.path }}</option></select>
            </label>
          </div>
        </div>

        <div v-if="preview.missing.length" class="mt-6 rounded-2xl border border-warn-line bg-warn-soft p-3 sm:p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-warn">Không tìm thấy</h3>
            <UiButton variant="ghost" size="sm" @click="copyMissing">{{ missingCopied ? 'Đã copy danh sách' : 'Copy danh sách' }}</UiButton>
          </div>
          <ul class="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto" translate="no">
            <li v-for="name in preview.missing" :key="name" class="break-all rounded-full bg-white px-2.5 py-1 font-mono text-xs text-warn">{{ name }}</li>
          </ul>
        </div>

        <div class="mt-6 border-t border-line pt-5">
          <p class="break-all text-sm">Sẽ copy vào: <strong translate="no">{{ destinationLabel }}</strong></p>
          <div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <UiButton class="w-full sm:w-auto" :disabled="busy || selectedMatches.length === 0" :loading="busy && progress.total > 0" @click="runCopy">Copy {{ selectedMatches.length }} file</UiButton>
            <div v-if="busy && progress.total" class="flex flex-1 items-center gap-3">
              <div role="progressbar" aria-label="Tiến độ copy" :aria-valuenow="progress.done" aria-valuemin="0" :aria-valuemax="progress.total" class="h-2 flex-1 overflow-hidden rounded-full bg-tint">
                <div class="h-full rounded-full bg-brand transition-[width]" :style="{ width: `${(progress.done / progress.total) * 100}%` }" />
              </div>
              <span class="text-sm text-muted tabular-nums">{{ progress.done }}/{{ progress.total }}</span>
            </div>
          </div>
        </div>
      </UiStepCard>
    </main>
  </div>
</template>

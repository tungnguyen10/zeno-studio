<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { matchLocalFiles, type LocalFile, type MatchResult } from '~~/shared/domain/file-matching'
import { copyMatchedFiles, type CopyDestination, type CopyResult } from '~~/shared/domain/file-copy'
import { exportFileFilterReport } from '~~/shared/domain/file-report'

useSeoMeta({ title: 'Lọc file trên máy — Zeno Studio' })

type DirectoryWithEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}
type BrowserWithDirectoryPicker = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
}
interface IndexedFile extends LocalFile { handle: FileSystemFileHandle }

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

onMounted(() => { supported.value = typeof (window as BrowserWithDirectoryPicker).showDirectoryPicker === 'function' })

const requestedNames = computed(() => requestedText.value.split(/\r?\n/).map(name => name.trim()).filter(Boolean))
const selectedMatches = computed(() => {
  if (!preview.value) return []
  const manual = preview.value.ambiguous.flatMap(item => {
    const path = resolvedPaths.value[item.requested]
    const file = item.files.find(candidate => candidate.path === path)
    return file ? [{ requested: item.requested, file }] : []
  })
  return [...preview.value.matched, ...manual]
})

async function walk(directory: FileSystemDirectoryHandle, prefix = ''): Promise<IndexedFile[]> {
  const collected: IndexedFile[] = []
  for await (const [name, handle] of (directory as DirectoryWithEntries).entries()) {
    const path = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'directory') collected.push(...await walk(handle as FileSystemDirectoryHandle, path))
    else collected.push({ name, path, handle: handle as FileSystemFileHandle })
  }
  return collected
}

async function chooseSource() {
  const picker = (window as BrowserWithDirectoryPicker).showDirectoryPicker
  if (!picker) return
  try {
    source.value = await picker({ mode: 'read' })
    busy.value = true
    message.value = 'Đang đọc danh sách file…'
    indexedFiles.value = await walk(source.value)
    preview.value = null
    message.value = `Đã tìm thấy ${indexedFiles.value.length} file trong thư mục nguồn.`
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) message.value = error instanceof Error ? error.message : 'Không đọc được thư mục.'
  } finally { busy.value = false }
}

async function chooseDestination() {
  const picker = (window as BrowserWithDirectoryPicker).showDirectoryPicker
  if (!picker) return
  try {
    const chosen = await picker({ mode: 'readwrite' })
    if (source.value && await chosen.isSameEntry(source.value)) {
      message.value = 'Hãy chọn thư mục đích khác thư mục nguồn.'
      return
    }
    destination.value = chosen
    message.value = `Thư mục đích: ${chosen.name}`
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) message.value = error instanceof Error ? error.message : 'Không mở được thư mục đích.'
  }
}

function runPreview() {
  if (!source.value || requestedNames.value.length === 0) {
    message.value = 'Nhập tên file và chọn thư mục nguồn trước khi xem kết quả.'
    return
  }
  preview.value = matchLocalFiles(requestedNames.value, indexedFiles.value, {
    matchBy: matchBy.value,
    fileType: fileType.value,
    customExtensions: customExtensions.value.split(',').map(value => value.trim()).filter(Boolean),
  })
  resolvedPaths.value = {}
  report.value = null
  message.value = 'Đã so khớp. Kiểm tra các file trùng trước khi copy.'
}

async function runCopy() {
  if (!destination.value || selectedMatches.value.length === 0) return
  busy.value = true
  progress.value = { done: 0, total: selectedMatches.value.length }
  try {
    const files = await Promise.all(selectedMatches.value.map(async item => {
      const indexed = indexedFiles.value.find(file => file.path === item.file.path)
      if (!indexed) throw new Error(`Không còn tìm thấy ${item.file.path}`)
      return { requested: item.requested, sourcePath: indexed.path, file: await indexed.handle.getFile() }
    }))
    report.value = await copyMatchedFiles(files, destination.value as unknown as CopyDestination, (done, total) => {
      progress.value = { done, total }
    })
    message.value = `Đã copy ${report.value.copied.length} file; bỏ qua ${report.value.skipped.length}; lỗi ${report.value.errors.length}.`
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Không thể copy file.'
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
  <div class="min-h-screen bg-[#f8f7f3] text-[#24231f]">
    <header class="border-b border-[#e2e2d9] bg-white/85">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <NuxtLink to="/" class="flex items-center gap-3 font-bold"><span class="grid size-9 place-items-center rounded-xl bg-[#344732] text-white">Z</span>Zeno Studio</NuxtLink>
        <span class="text-sm text-[#7a7b72]">Công cụ studio</span>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-5 pb-20 pt-12 sm:px-8">
      <div class="max-w-3xl">
        <span class="text-xs font-bold uppercase tracking-[.2em] text-[#718a66]">Local File Filter</span>
        <h1 class="mt-3 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">Lọc file theo danh sách ảnh</h1>
        <p class="mt-4 text-lg leading-8 text-[#6e7068]">Dán tên ảnh khách đã chọn, tìm RAW/JPEG trong thư mục trên máy và copy đúng file sang thư mục đích.</p>
        <p class="mt-4 inline-flex rounded-full bg-[#eaf2e4] px-4 py-2 text-sm font-medium text-[#496345]">Chỉ copy, không xóa file nguồn</p>
      </div>

      <div v-if="!supported" class="mt-8 rounded-2xl border border-[#e9d6b3] bg-[#fff8e9] p-5 text-sm leading-6 text-[#775b2b]" role="status">
        Trình duyệt này không hỗ trợ chọn thư mục trực tiếp. Hãy mở công cụ trên Chrome hoặc Edge ở máy tính để dùng File System Access API.
      </div>

      <div class="mt-9 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <section class="rounded-[1.7rem] border border-[#e2e3d9] bg-white p-6 shadow-sm sm:p-8">
          <div class="flex items-center gap-3"><span class="grid size-8 place-items-center rounded-full bg-[#eaf1e5] text-sm font-bold text-[#54704d]">1</span><h2 class="text-xl font-semibold">Danh sách và cách so khớp</h2></div>
          <label for="requested" class="mt-6 block text-sm font-semibold">Tên file cần tìm</label>
          <p class="mt-1 text-sm text-[#8a8b83]">Mỗi dòng một tên file, ví dụ DSC_0123.JPG.</p>
          <textarea id="requested" v-model="requestedText" rows="9" placeholder="DSC_0123.JPG&#10;DSC_0124.JPG" class="mt-3 w-full resize-y rounded-2xl border border-[#d9ddd2] bg-[#fcfcfa] px-4 py-3 font-mono text-sm leading-7 outline-none focus:border-[#78916e] focus:ring-2 focus:ring-[#dce8d4]" />
          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <label class="block text-sm font-semibold">So khớp theo
              <select v-model="matchBy" class="mt-2 w-full rounded-xl border border-[#d9ddd2] bg-white px-4 py-3 font-normal"><option value="stem">Tên gốc (JPG → RAW)</option><option value="full">Tên file đầy đủ</option></select>
            </label>
            <label class="block text-sm font-semibold">Loại file
              <select v-model="fileType" class="mt-2 w-full rounded-xl border border-[#d9ddd2] bg-white px-4 py-3 font-normal"><option value="raw">RAW</option><option value="jpeg">JPEG</option><option value="all">RAW + JPEG</option><option value="custom">Tùy chỉnh</option></select>
            </label>
          </div>
          <label v-if="fileType === 'custom'" class="mt-4 block text-sm font-semibold">Phần mở rộng (cách nhau bằng dấu phẩy)
            <input v-model="customExtensions" placeholder=".tif, .png" class="mt-2 w-full rounded-xl border border-[#d9ddd2] px-4 py-3 font-normal">
          </label>
        </section>

        <section class="rounded-[1.7rem] border border-[#e2e3d9] bg-white p-6 shadow-sm sm:p-8">
          <div class="flex items-center gap-3"><span class="grid size-8 place-items-center rounded-full bg-[#eaf1e5] text-sm font-bold text-[#54704d]">2</span><h2 class="text-xl font-semibold">Thư mục trên máy</h2></div>
          <div class="mt-6 space-y-4">
            <div class="rounded-2xl border border-dashed border-[#ccd5c7] bg-[#fafbf8] p-5">
              <p class="font-semibold">Thư mục nguồn</p><p class="mt-1 text-sm text-[#777a71]">Tìm file trong thư mục này và các thư mục con.</p>
              <button type="button" :disabled="!supported || busy" class="mt-4 rounded-full border border-[#8ba082] px-5 py-2.5 text-sm font-semibold text-[#344732] disabled:opacity-50" @click="chooseSource">Chọn thư mục nguồn</button>
              <p v-if="source" class="mt-3 break-all text-sm text-[#597153]">{{ source.name }} · {{ indexedFiles.length }} file</p>
            </div>
            <div class="rounded-2xl border border-dashed border-[#ccd5c7] bg-[#fafbf8] p-5">
              <p class="font-semibold">Thư mục đích</p><p class="mt-1 text-sm text-[#777a71]">File được copy vào đây; file đã có sẽ được bỏ qua.</p>
              <button type="button" :disabled="!supported || busy" class="mt-4 rounded-full border border-[#8ba082] px-5 py-2.5 text-sm font-semibold text-[#344732] disabled:opacity-50" @click="chooseDestination">Chọn thư mục đích</button>
              <p v-if="destination" class="mt-3 break-all text-sm text-[#597153]">{{ destination.name }}</p>
            </div>
          </div>
          <button type="button" :disabled="busy || !source || requestedNames.length === 0" class="mt-6 w-full rounded-full bg-[#344732] px-6 py-3.5 font-semibold text-white disabled:bg-[#b9c2b4]" @click="runPreview">Xem kết quả so khớp</button>
        </section>
      </div>

      <p v-if="message" class="mt-6 rounded-xl bg-[#eaf1e5] px-5 py-3 text-sm text-[#3f6141]" role="status">{{ message }}</p>

      <section v-if="preview" class="mt-8 rounded-[1.7rem] border border-[#e2e3d9] bg-white p-6 shadow-sm sm:p-8">
        <div class="flex flex-wrap items-center justify-between gap-4"><div><h2 class="text-2xl font-semibold">Kết quả so khớp</h2><p class="mt-1 text-sm text-[#777a71]">Kiểm tra file thiếu và file trùng trước khi copy.</p></div><button type="button" class="rounded-full border border-[#cfd5c9] px-4 py-2 text-sm font-semibold" @click="downloadReport">Tải báo cáo</button></div>
        <div class="mt-6 grid gap-3 sm:grid-cols-3">
          <div class="rounded-2xl bg-[#eaf3e8] p-4"><strong class="text-3xl text-[#436540]">{{ preview.matched.length }}</strong><span class="ml-2 text-sm">Matched</span></div>
          <div class="rounded-2xl bg-[#faf0e4] p-4"><strong class="text-3xl text-[#976535]">{{ preview.missing.length }}</strong><span class="ml-2 text-sm">Missing</span></div>
          <div class="rounded-2xl bg-[#f6e9e8] p-4"><strong class="text-3xl text-[#9d5b58]">{{ preview.ambiguous.length }}</strong><span class="ml-2 text-sm">Ambiguous</span></div>
        </div>
        <div v-if="preview.ambiguous.length" class="mt-6 space-y-3"><h3 class="font-semibold">Chọn thủ công cho tên trùng</h3>
          <label v-for="item in preview.ambiguous" :key="item.requested" class="block rounded-xl border border-[#e3e3dc] p-4 text-sm"><span class="font-medium">{{ item.requested }}</span>
            <select v-model="resolvedPaths[item.requested]" class="mt-2 w-full rounded-lg border border-[#d9ddd2] bg-white px-3 py-2"><option value="">Không copy file này</option><option v-for="file in item.files" :key="file.path" :value="file.path">{{ file.path }}</option></select>
          </label>
        </div>
        <div v-if="preview.missing.length" class="mt-5 text-sm text-[#8a6450]"><strong>Không tìm thấy:</strong> {{ preview.missing.join(', ') }}</div>
        <div class="mt-7 flex flex-wrap items-center gap-4"><button type="button" :disabled="busy || !destination || selectedMatches.length === 0" class="rounded-full bg-[#344732] px-6 py-3 font-semibold text-white disabled:bg-[#b9c2b4]" @click="runCopy">Copy {{ selectedMatches.length }} file</button><span v-if="busy && progress.total" class="text-sm text-[#6d7169]">{{ progress.done }}/{{ progress.total }} file</span></div>
        <p v-if="report" class="mt-4 text-sm text-[#5f7160]">Đã copy {{ report.copied.length }}, bỏ qua {{ report.skipped.length }}, lỗi {{ report.errors.length }}.</p>
      </section>
    </main>
  </div>
</template>

import { trackAnalyticsEvent } from '~/lib/analytics-events'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { matchLocalPhotos, type MatchOptions, type PhotoMatchResult } from '~~/shared/domain/file-matching'
import { destinationCollisionKey, parseDestinationPath } from '~~/shared/domain/destination-path'
import { buildFilterReports, type FilterManifestItem, type FilterReportEntry } from '~~/shared/domain/local-filter-reports'
import { scanDirectory, type IndexedFile } from '~~/app/services/local-filter/directoryScanner'
import { destinationFiles, openRelativeDestination } from '~~/app/services/local-filter/destination'
import { copyLocalFiles, type CopyJobItem, type CopyOutcome } from '~~/app/services/local-filter/copyEngine'
import { writeFilterReports, writeOutputMarker } from '~~/app/services/local-filter/reportExporter'

export interface FilterManifest {
  albumId: string
  selectionVersionId: string
  versionNumber: number
  finalizedAt: string
  items: FilterManifestItem[]
}

type PickerWindow = Window & { showDirectoryPicker?: (options: { mode: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle> }
type DestinationMode = 'auto' | 'relative' | 'picker'
type Selected = { photoId: string; requested: string; file: IndexedFile }

export function useLocalPhotoFilter(manifest: FilterManifest) {
  const supported = ref(false)
  const source = shallowRef<FileSystemDirectoryHandle | null>(null)
  const externalDestination = shallowRef<FileSystemDirectoryHandle | null>(null)
  const sourceReadOnly = ref(false)
  const destinationMode = ref<DestinationMode>('auto')
  const relativePath = ref('KhachA/DaLoc')
  const fileType = ref<MatchOptions['fileType']>('raw')
  const matchBy = ref<MatchOptions['matchBy']>('stem')
  const customExtensions = ref('')
  const includeSidecar = ref(false)
  const preserveFolders = ref(false)
  const indexed = shallowRef<IndexedFile[]>([])
  const preview = shallowRef<PhotoMatchResult | null>(null)
  const resolutions = ref<Record<string, string>>({})
  const outputNames = ref<Record<string, string>>({})
  const existingPaths = shallowRef<Set<string>>(new Set())
  const scanWarnings = shallowRef<string[]>([])
  const scanCount = ref(0)
  const phase = ref<'setup' | 'scanning' | 'preview' | 'copying' | 'result'>('setup')
  const message = ref('')
  const missingConfirmed = ref(false)
  const outcomes = shallowRef<CopyOutcome[]>([])
  const progressName = ref('')
  const writtenReports = shallowRef<string[]>([])
  let scanController: AbortController | null = null
  let copyController: AbortController | null = null
  let lastPlan: CopyJobItem[] = []
  let lastDestination: FileSystemDirectoryHandle | null = null

  onMounted(() => { supported.value = window.isSecureContext && typeof (window as PickerWindow).showDirectoryPicker === 'function' })
  const destinationLabel = computed(() => destinationMode.value === 'picker' ? externalDestination.value?.name ?? 'Chưa chọn thư mục' : destinationMode.value === 'auto' ? 'RAW/SELECTED' : `RAW/${relativePath.value.replaceAll('\\', '/')}`)
  const pathError = computed(() => {
    if (destinationMode.value !== 'relative') return ''
    try { parseDestinationPath(relativePath.value); return '' }
    catch (error) { return error instanceof Error ? error.message : 'Đường dẫn không hợp lệ' }
  })

  const selected = computed<Selected[]>(() => {
    if (!preview.value) return []
    const byPath = new Map(indexed.value.map(file => [file.path, file]))
    const automatic = preview.value.matched.flatMap(item => {
      const file = byPath.get(item.file.path)
      return file ? [{ photoId: item.photoId, requested: item.requested, file }] : []
    })
    const manual = preview.value.ambiguous.flatMap(item => {
      const chosen = resolutions.value[`${item.photoId}:${item.extension}`]
      const file = chosen && item.files.some(candidate => candidate.path === chosen) ? byPath.get(chosen) : undefined
      return file ? [{ photoId: item.photoId, requested: item.requested, file }] : []
    })
    const photos = [...automatic, ...manual]
    if (!includeSidecar.value) return photos
    const sidecars = new Map<string, IndexedFile[]>()
    for (const file of indexed.value) {
      if (!/\.xmp$/i.test(file.name)) continue
      const key = file.path.slice(0, file.path.lastIndexOf('.')).normalize('NFC').toLowerCase()
      const group = sidecars.get(key) ?? []
      group.push(file)
      sidecars.set(key, group)
    }
    const extra = photos.flatMap(item => {
      const key = item.file.path.slice(0, item.file.path.lastIndexOf('.')).normalize('NFC').toLowerCase()
      const group = sidecars.get(key) ?? []
      return group.length === 1 ? [{ photoId: item.photoId, requested: item.requested, file: group[0]! }] : []
    })
    return [...photos, ...extra]
  })
  const unresolved = computed(() => preview.value?.ambiguous.filter(item => !resolutions.value[`${item.photoId}:${item.extension}`]).length ?? 0)
  const planned = computed<CopyJobItem[]>(() => {
    const byPath = new Map<string, CopyJobItem>()
    for (const item of selected.value) {
      const custom = outputNames.value[item.file.path]
      const outputPath = custom || (preserveFolders.value ? item.file.path : item.file.name)
      byPath.set(item.file.path, { id: item.file.path, requested: item.requested, sourcePath: item.file.path, outputPath, handle: item.file.handle })
    }
    return [...byPath.values()]
  })
  const conflicts = computed(() => {
    const names = new Map<string, string>()
    const found: string[] = []
    for (const item of planned.value) {
      try { parseDestinationPath(item.outputPath) }
      catch { found.push(`${item.outputPath}: tên đích không hợp lệ`); continue }
      const key = destinationCollisionKey(item.outputPath)
      if (names.has(key) && names.get(key) !== item.sourcePath) found.push(`${item.outputPath}: nhiều file cùng tên đích`)
      else if (existingPaths.value.has(key)) found.push(`${item.outputPath}: đã có ở đích`)
      names.set(key, item.sourcePath)
    }
    return found
  })
  const blockingConflicts = computed(() => conflicts.value.filter(item => !item.endsWith(': đã có ở đích')))
  const existingConflicts = computed(() => conflicts.value.filter(item => item.endsWith(': đã có ở đích')))
  const matchedPhotoCount = computed(() => new Set(selected.value.map(item => item.photoId)).size)
  const copyCounts = computed(() => ({
    copied: outcomes.value.filter(item => item.status === 'copied').length,
    skipped: outcomes.value.filter(item => item.status === 'skipped').length,
    failed: outcomes.value.filter(item => item.status === 'failed' || item.status === 'partial').length,
    cancelled: outcomes.value.filter(item => item.status === 'cancelled').length,
  }))

  function invalidate() {
    if (phase.value === 'copying') return
    scanController?.abort()
    preview.value = null
    resolutions.value = {}
    existingPaths.value = new Set()
    outcomes.value = []
    phase.value = 'setup'
  }
  watch([destinationMode, relativePath, fileType, matchBy, customExtensions, includeSidecar, preserveFolders], invalidate)

  async function chooseSource(readOnly = false) {
    const picker = (window as PickerWindow).showDirectoryPicker
    if (!picker) return
    try {
      const chosen = await picker({ mode: readOnly ? 'read' : 'readwrite' })
      source.value = chosen
      sourceReadOnly.value = readOnly
      invalidate()
      await scan()
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) message.value = error instanceof Error ? error.message : 'Không chọn được thư mục RAW' }
  }

  async function chooseExternalDestination() {
    const picker = (window as PickerWindow).showDirectoryPicker
    if (!picker) return
    try {
      const chosen = await picker({ mode: 'readwrite' })
      if (source.value && await chosen.isSameEntry(source.value)) throw new Error('Hãy chọn thư mục đích khác RAW hoặc dùng path con.')
      externalDestination.value = chosen
      destinationMode.value = 'picker'
      invalidate()
      if (source.value) await scan()
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) message.value = error instanceof Error ? error.message : 'Không chọn được thư mục đích' }
  }

  async function scan() {
    if (!source.value || pathError.value || (destinationMode.value === 'picker' && !externalDestination.value)) return
    scanController?.abort()
    scanController = new AbortController()
    const current = scanController
    phase.value = 'scanning'
    scanCount.value = 0
    message.value = 'Đang quét tên file…'
    try {
      const excluded = [destinationMode.value === 'auto' ? 'SELECTED' : relativePath.value.replaceAll('\\', '/')]
      if (externalDestination.value && destinationMode.value === 'picker') {
        const path = await source.value.resolve(externalDestination.value)
        if (path?.length) excluded.push(path.join('/'))
      }
      const result = await scanDirectory(source.value, { excludedPaths: excluded, signal: current.signal, onProgress: count => { scanCount.value = count } })
      if (current.signal.aborted) return
      indexed.value = result.files
      scanWarnings.value = result.warnings
      preview.value = matchLocalPhotos(manifest.items.map(item => ({ photoId: item.photoId, filename: item.originalFilename })), result.files, {
        matchBy: matchBy.value, fileType: fileType.value,
        customExtensions: customExtensions.value.split(',').map(value => value.trim()).filter(Boolean),
      })
      resolutions.value = {}
      outputNames.value = {}
      missingConfirmed.value = false
      existingPaths.value = await inspectExisting()
      if (current.signal.aborted) return
      phase.value = 'preview'
      trackAnalyticsEvent({
        name: 'file_match_completed',
        matched_count: preview.value.matched.length,
        missing_count: preview.value.missing.length,
        ambiguous_count: preview.value.ambiguous.length,
      })
      message.value = `Đã quét ${scanCount.value} mục.`
    } catch (error) {
      if (current.signal.aborted) return
      phase.value = 'setup'
      message.value = error instanceof DOMException && error.name === 'AbortError' ? 'Đã dừng quét.' : error instanceof Error ? error.message : 'Không quét được RAW.'
    }
  }

  async function destinationForPreview(): Promise<FileSystemDirectoryHandle | null> {
    if (destinationMode.value === 'picker') return externalDestination.value
    if (!source.value) return null
    return openRelativeDestination(source.value, destinationMode.value === 'auto' ? 'SELECTED' : relativePath.value, false)
  }

  async function inspectExisting(): Promise<Set<string>> {
    const result = new Set<string>()
    const root = await destinationForPreview()
    if (!root) return result
    const parents = new Set(planned.value.map(item => parseDestinationPath(item.outputPath).slice(0, -1).join('/')))
    parents.add('')
    for (const parent of parents) {
      const folder = parent ? await openRelativeDestination(root, parent, false) : root
      for (const name of await destinationFiles(folder)) result.add(destinationCollisionKey(parent ? `${parent}/${name}` : name))
    }
    return result
  }

  async function refreshConflicts() {
    existingPaths.value = await inspectExisting()
  }
  watch([resolutions, outputNames, preserveFolders], () => {
    if (phase.value === 'preview') void refreshConflicts().catch(error => { message.value = `Không kiểm tra được thư mục đích: ${error instanceof Error ? error.message : 'lỗi không xác định'}` })
  }, { deep: true })

  function reportEntries(): FilterReportEntry[] {
    const result: FilterReportEntry[] = []
    const outcomeByPath = new Map(outcomes.value.map(item => [item.sourcePath, item]))
    for (const item of selected.value) {
      const outcome = outcomeByPath.get(item.file.path)
      result.push({ photoId: item.photoId, sourcePath: item.file.path, outputPath: outcome?.outputPath ?? '', status: outcome?.status ?? 'cancelled', reason: outcome?.reason ?? '' })
    }
    for (const item of preview.value?.missing ?? []) result.push({ photoId: item.photoId, sourcePath: '', outputPath: '', status: 'missing', reason: '' })
    for (const item of preview.value?.ambiguous ?? []) {
      if (resolutions.value[`${item.photoId}:${item.extension}`] === '__skip__') result.push({ photoId: item.photoId, sourcePath: '', outputPath: '', status: 'ambiguous', reason: 'Đã bỏ qua file mơ hồ' })
    }
    return result
  }
  const reports = computed(() => buildFilterReports(String(manifest.versionNumber), manifest.items, reportEntries()))

  async function writeReports() {
    if (!lastDestination) return
    try { writtenReports.value = await writeFilterReports(lastDestination, manifest.versionNumber, reports.value) }
    catch (error) { message.value += ` Báo cáo chưa ghi được vào đích: ${error instanceof Error ? error.message : 'lỗi không xác định'}. Có thể tải báo cáo từ trang.` }
  }

  async function runCopy(retry = false) {
    if (!source.value || !preview.value || unresolved.value || blockingConflicts.value.length || (preview.value.missing.length && !missingConfirmed.value) || pathError.value) return
    if (!retry) {
      try { await refreshConflicts() }
      catch (error) { message.value = `Không kiểm tra được thư mục đích: ${error instanceof Error ? error.message : 'lỗi không xác định'}`; return }
    }
    if (sourceReadOnly.value && destinationMode.value !== 'picker') { message.value = 'Nguồn chỉ đọc: chọn thư mục đích khác.'; return }
    const candidates = retry ? lastPlan.filter(item => outcomes.value.some(outcome => outcome.id === item.id && ['failed', 'cancelled'].includes(outcome.status))) : planned.value
    if (!candidates.length) return
    phase.value = 'copying'
    copyController = new AbortController()
    try {
      const destination = retry ? lastDestination : destinationMode.value === 'picker' ? externalDestination.value : await openRelativeDestination(source.value, destinationMode.value === 'auto' ? 'SELECTED' : relativePath.value, true)
      if (!destination) throw new Error('Chưa chọn thư mục đích')
      lastDestination = destination
      if (!retry) lastPlan = [...candidates]
      if (!retry) await writeOutputMarker(destination)
      const newOutcomes = await copyLocalFiles(candidates, destination, { signal: copyController.signal, onCurrent: item => { progressName.value = item.outputPath }, onProgress: current => { outcomes.value = retry ? [...outcomes.value.filter(old => !current.some(next => next.id === old.id)), ...current] : current } })
      outcomes.value = retry ? [...outcomes.value.filter(old => !newOutcomes.some(next => next.id === old.id)), ...newOutcomes] : newOutcomes
      phase.value = 'result'
      message.value = `Đã copy ${copyCounts.value.copied} file; bỏ qua ${copyCounts.value.skipped}; lỗi ${copyCounts.value.failed}.`
      await writeReports()
    } catch (error) { phase.value = 'preview'; message.value = error instanceof Error ? error.message : 'Không thể copy' }
  }

  function stop() { if (phase.value === 'scanning') scanController?.abort(); if (phase.value === 'copying') copyController?.abort() }
  function downloadReport(kind: 'notes' | 'report') {
    const blob = new Blob([reports.value[kind]], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = kind === 'notes' ? 'RETOUCH_NOTES.csv' : 'SELECTION_REPORT.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const beforeUnload = (event: BeforeUnloadEvent) => { if (phase.value === 'copying') { event.preventDefault(); event.returnValue = '' } }
  if (import.meta.client) window.addEventListener('beforeunload', beforeUnload)
  onBeforeUnmount(() => { scanController?.abort(); copyController?.abort(); if (import.meta.client) window.removeEventListener('beforeunload', beforeUnload) })

  return { supported, source, sourceReadOnly, externalDestination, destinationMode, relativePath, destinationLabel, pathError,
    fileType, matchBy, customExtensions, includeSidecar, preserveFolders, preview, resolutions, outputNames, conflicts, blockingConflicts, existingConflicts, selected, planned, unresolved,
    matchedPhotoCount, scanWarnings, scanCount, phase, message, missingConfirmed, outcomes, copyCounts, progressName, writtenReports,
    chooseSource, chooseExternalDestination, scan, refreshConflicts, runCopy, stop, downloadReport }
}

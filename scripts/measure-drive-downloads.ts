import { performance } from 'node:perf_hooks'
import { partitionFiles } from '../server/downloads/plan'
import { DOWNLOAD_LIMITS } from '../server/downloads/limits'
import { DriveSourceError, GoogleDriveAdapter, parseGoogleDriveFolderLink } from '../server/photo-sources/google-drive'

const key = process.env.NUXT_GOOGLE_API_KEY
const folderUrl = process.env.NUXT_DRIVE_SAMPLE_FOLDER_URL
const budget = Number(process.env.ZENO_DOWNLOAD_MEASURE_MAX_BYTES ?? 96 * 1024 * 1024)
if (process.env.ZENO_DRIVE_DOWNLOAD_MEASURE !== '1' || !key || !folderUrl ||
  !Number.isSafeInteger(budget) || budget < 1) {
  throw new Error('Cần ZENO_DRIVE_DOWNLOAD_MEASURE=1, Drive test folder/API key và byte budget hợp lệ')
}

type SourceFile = { id: string; filename: string; mimeType: string; resourceKey?: string; sizeBytes?: number }

async function main() {
  const drive = new GoogleDriveAdapter(key!)
  const folder = parseGoogleDriveFolderLink(folderUrl!)
  const files: SourceFile[] = []
  let cursor: string | undefined
  do {
    const page = await drive.listPhotos(folder, cursor)
    files.push(...page.items)
    cursor = page.nextPageToken
  } while (cursor)
  const reports: unknown[] = []
  let remainingBudget = budget
  for (const target of [1, 10, 100, 1000, 3000]) {
    if (files.length < target) { reports.push({ target, skipped: 'folder smaller than target' }); continue }
    const sample = files.slice(0, target)
    const unknownSizes = sample.filter(file => file.sizeBytes === undefined).length
    if (unknownSizes) { reports.push({ target, skipped: 'Drive did not list all file sizes', unknownSizes }); continue }
    const planned = sample.map((file, index) => ({ photoId: String(index), filename: file.filename,
      mimeType: file.mimeType, sizeBytes: file.sizeBytes! }))
    const parts = partitionFiles(planned, DOWNLOAD_LIMITS)
    const estimatedBytes = planned.reduce((sum, file) => sum + file.sizeBytes, 0)
    const partSizes = parts.map(part => part.reduce((sum, file) => sum + file.sizeBytes, 0))
    if (estimatedBytes > remainingBudget) {
      reports.push({ target, estimatedBytes, partCount: parts.length, largestPartBytes: Math.max(...partSizes),
        skipped: 'exceeds remaining source-read budget' })
      continue
    }
    const started = performance.now()
    let peakRss = process.memoryUsage().rss
    let bytes = 0
    const errors: Record<string, number> = {}
    const timer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss) }, 50)
    try {
      for (const file of sample) {
        try {
          const response = await drive.readPhoto(file.id, file.resourceKey)
          if (!response.body) throw new Error('Drive did not return a stream')
          for await (const chunk of response.body) bytes += chunk.byteLength
        } catch (error) {
          const code = error instanceof DriveSourceError ? String(error.status) : 'network_or_stream'
          errors[code] = (errors[code] ?? 0) + 1
        }
      }
    } finally { clearInterval(timer) }
    remainingBudget -= bytes
    reports.push({ target, sourceBytes: bytes, estimatedBytes, partCount: parts.length,
      largestPartBytes: Math.max(...partSizes), durationMs: Math.round(performance.now() - started),
      peakRssBytes: peakRss, errors })
  }
  const largest = files.reduce<SourceFile | null>((best, file) =>
    (file.sizeBytes ?? 0) > (best?.sizeBytes ?? 0) ? file : best, null)
  process.stdout.write(`${JSON.stringify({ scope: 'direct Drive source baseline; excludes ZENO/Preview, 4G and browser LCP',
    folderImages: files.length, budgetBytes: budget, remainingBudgetBytes: remainingBudget,
    oversizedSinglePresent: (largest?.sizeBytes ?? 0) > DOWNLOAD_LIMITS.maxBytes,
    reports }, null, 2)}\n`)
}

main().catch(error => {
  process.stderr.write(`Không đo được Drive download (${error instanceof DriveSourceError ? `HTTP ${error.status}` : 'configuration or network'}); không in URL, ID hoặc key.\n`)
  process.exitCode = 1
})

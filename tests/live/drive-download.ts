import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { Pool } from 'pg'
import { GoogleDriveAdapter, parseGoogleDriveFolderLink } from '../../server/photo-sources/google-drive'

const pooledUrl = process.env.NUXT_DATABASE_TEST_URL
const directUrl = process.env.NUXT_DATABASE_TEST_DIRECT_URL
const apiKey = process.env.NUXT_GOOGLE_API_KEY
const folderUrl = process.env.NUXT_DRIVE_SAMPLE_FOLDER_URL
const authSecret = process.env.NUXT_BETTER_AUTH_SECRET
const ticketSecret = process.env.NUXT_DOWNLOAD_TICKET_SECRET
if (!pooledUrl || !directUrl || !apiKey || !folderUrl || !authSecret || !ticketSecret) {
  throw new Error('Thiếu cấu hình Neon test branch, Drive hoặc download secret; chưa chạy live gate')
}
if (ticketSecret.length < 32 || !new URL(pooledUrl).hostname.includes('-pooler') ||
  new URL(pooledUrl).hostname.replace('-pooler', '') !== new URL(directUrl).hostname ||
  pooledUrl === process.env.NUXT_DATABASE_URL || directUrl === process.env.NUXT_DATABASE_DIRECT_URL) {
  throw new Error('Neon test branch hoặc download secret không hợp lệ')
}

const origin = 'http://127.0.0.1:43630'
const drive = new GoogleDriveAdapter(apiKey)
const owner = new Pool({ connectionString: directUrl, max: 1 })
const server = spawn('node', ['.output/server/index.mjs'], {
  env: { ...process.env, NUXT_DATABASE_URL: pooledUrl, NUXT_DRIVE_VERIFIED: 'true',
    NUXT_GOOGLE_API_KEY: apiKey, NUXT_DOWNLOAD_TICKET_SECRET: ticketSecret,
    NUXT_BETTER_AUTH_SECRET: authSecret, HOST: '127.0.0.1', PORT: '43630' },
  stdio: 'ignore',
})
let createdAlbumId: string | null = null
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

async function request(path: string, method = 'GET', body?: unknown, token?: string, cookie?: string): Promise<Response> {
  return fetch(`${origin}${path}`, { method, headers: {
    ...(body ? { 'content-type': 'application/json' } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}),
  }, body: body ? JSON.stringify(body) : undefined })
}
async function expected(response: Response, status: number, step: string): Promise<Response> {
  if (response.status !== status) throw new Error(`${step}: HTTP ${response.status}, cần ${status}`)
  return response
}

function unzipStore(bytes: Uint8Array): Array<{ name: string; bytes: Uint8Array }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let position = bytes.length - 22; position >= Math.max(0, bytes.length - 65557); position--) {
    if (view.getUint32(position, true) === 0x06054b50) { eocd = position; break }
  }
  if (eocd < 0) throw new Error('ZIP không có central directory')
  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const entries: Array<{ name: string; bytes: Uint8Array }> = []
  for (let index = 0; index < count; index++) {
    if (view.getUint32(offset, true) !== 0x02014b50 || view.getUint16(offset + 10, true) !== 0) throw new Error('ZIP không dùng STORE')
    const size = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const local = view.getUint32(offset + 42, true)
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength))
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error('ZIP thiếu local header')
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const content = bytes.slice(dataStart, dataStart + size)
    if (content.length !== size) throw new Error('ZIP entry bị thiếu bytes')
    entries.push({ name, bytes: content })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function main() {
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error('Nitro test server đã thoát')
      try { if ((await fetch(origin)).ok) break } catch { /* starting */ }
      if (attempt === 99) throw new Error('Nitro test server không khởi động')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    const folder = parseGoogleDriveFolderLink(folderUrl!)
    const sourceFiles = new Map<string, { resourceKey?: string; mimeType: string; filename: string }>()
    let cursor: string | undefined
    do {
      const page = await drive.listPhotos(folder, cursor)
      for (const file of page.items) sourceFiles.set(file.id, file)
      cursor = page.nextPageToken
    } while (cursor)
    const created = await (await expected(await request('/api/guest/albums', 'POST', {
      title: `Download gate ${randomUUID().slice(0, 8)}`, folderUrl, expiresInDays: 15,
      limit: { kind: 'unlimited' },
    }), 200, 'create guest album')).json() as { id: string; adminToken: string; customerToken: string }
    createdAlbumId = created.id
    const base = `/api/album/${created.id}`
    const photos = await (await expected(await request(`${base}/photos?limit=60`, 'GET', undefined, created.customerToken), 200, 'list photos')).json() as { items: Array<{ id: string; sourceFileId: string; filename: string }> }
    const candidates = photos.items.filter(item => sourceFiles.has(item.sourceFileId))
    const used = new Set<string>()
    const samples: typeof candidates = []
    const add = (item?: typeof candidates[number]) => {
      if (item && !used.has(item.id) && samples.length < 6) { samples.push(item); used.add(item.id) }
    }
    for (const mime of ['image/jpeg', 'image/png', 'image/heic']) add(candidates.find(item => sourceFiles.get(item.sourceFileId)?.mimeType === mime))
    add(candidates.find(item => /[^\x00-\x7f]/.test(item.filename)))
    const nameCounts = new Map<string, number>()
    for (const item of candidates) nameCounts.set(item.filename, (nameCounts.get(item.filename) ?? 0) + 1)
    add(candidates.find(item => (nameCounts.get(item.filename) ?? 0) > 1))
    add(candidates.find(item => !!sourceFiles.get(item.sourceFileId)?.resourceKey))
    for (const item of candidates) add(item)
    if (!samples.length) throw new Error('Folder thử nghiệm không có ảnh phù hợp')
    await expected(await request(`${base}/photos/${samples[0]!.id}/download`, 'GET', undefined, created.customerToken), 403, 'default deny')
    const admin = await expected(await request(`/api/guest/albums/${created.id}/access`, 'POST', { token: created.adminToken }), 200, 'guest admin access')
    const cookie = admin.headers.get('set-cookie')?.split(';')[0]
    if (!cookie) throw new Error('Không nhận được guest admin cookie')
    const settings = { enabled: true, allowSingle: true, allowSelected: true, allowAll: true, availableWhen: 'anytime' }
    await expected(await request(`/api/guest/albums/${created.id}/download`, 'PATCH', settings, undefined, cookie), 200, 'enable downloads')

    const originalByPhoto = new Map<string, Uint8Array>()
    let resourceKeySampled = false
    for (const sample of samples) {
      const source = sourceFiles.get(sample.sourceFileId)!
      const metadata = await drive.getOriginalMetadata(sample.sourceFileId, source.resourceKey)
      const bytes = new Uint8Array(await (await drive.readPhoto(sample.sourceFileId, source.resourceKey)).arrayBuffer())
      assert.equal(bytes.length, metadata.sizeBytes)
      if (metadata.md5Checksum) assert.equal(createHash('md5').update(bytes).digest('hex'), metadata.md5Checksum)
      originalByPhoto.set(sample.id, bytes)
      resourceKeySampled ||= !!source.resourceKey
    }
    const single = await expected(await request(`${base}/photos/${samples[0]!.id}/download`, 'GET', undefined, created.customerToken), 200, 'single original')
    assert.equal(single.headers.get('cache-control'), 'private, no-store')
    assert.equal(single.headers.get('content-type'), sourceFiles.get(samples[0]!.sourceFileId)!.mimeType)
    assert.match(single.headers.get('content-disposition') ?? '', /attachment/i)
    assert.equal(sha(new Uint8Array(await single.arrayBuffer())), sha(originalByPhoto.get(samples[0]!.id)!))
    const plan = await (await expected(await request(`${base}/download/plan`, 'POST', {
      kind: 'basket', photoIds: samples.map(item => item.id),
    }, created.customerToken), 200, 'plan basket')).json() as {
      parts: Array<{ format: 'zip' | 'file'; ticket: string; photoIds: string[] }>;
    }
    const allPlan = await (await expected(await request(`${base}/download/plan`, 'POST', { kind: 'all' }, created.customerToken), 200, 'plan all')).json() as {
      totalFiles: number; parts: Array<{ format: 'zip' | 'file'; count: number; byteLength: number }>;
    }
    assert.equal(allPlan.totalFiles, created.photoCount)
    assert.equal(allPlan.parts.reduce((sum, part) => sum + part.count, 0), created.photoCount)
    assert.ok(allPlan.parts.every(part => part.format === 'file' || (part.count <= 50 && part.byteLength <= 96 * 1024 * 1024)))
    let checked = 0
    let zipParts = 0
    for (const part of plan.parts) {
      if (part.format === 'file') {
        const file = await expected(await request(`${base}/download/file`, 'POST', { ticket: part.ticket }, created.customerToken), 200, 'oversized file')
        assert.equal(sha(new Uint8Array(await file.arrayBuffer())), sha(originalByPhoto.get(part.photoIds[0]!)!))
        checked++
      } else {
        const response = await expected(await request(`${base}/download/zip`, 'POST', { ticket: part.ticket }, created.customerToken), 200, 'ZIP part')
        const entries = unzipStore(new Uint8Array(await response.arrayBuffer()))
        assert.equal(entries.length, part.photoIds.length)
        for (const [index, entry] of entries.entries()) {
          assert.equal(sha(entry.bytes), sha(originalByPhoto.get(part.photoIds[index]!)!))
          checked++
        }
        zipParts++
      }
    }
    assert.equal(checked, samples.length)
    await expected(await request(`/api/guest/albums/${created.id}/download`, 'PATCH', { ...settings, enabled: false }, undefined, cookie), 200, 'revoke downloads')
    const revokedPart = plan.parts[0]!
    await expected(await request(`${base}/download/${revokedPart.format}`, 'POST', { ticket: revokedPart.ticket }, created.customerToken), 403, 'revoked ticket')
    process.stdout.write(`${JSON.stringify({ ok: true, sampled: samples.length, zipParts,
      fullPlanFiles: allPlan.totalFiles, fullPlanParts: allPlan.parts.length, resourceKeySampled,
      mimeTypes: [...new Set(samples.map(item => sourceFiles.get(item.sourceFileId)!.mimeType))],
      unicodeNameSampled: samples.some(item => /[^\x00-\x7f]/.test(item.filename)),
      duplicateNameSampled: samples.some(item => (nameCounts.get(item.filename) ?? 0) > 1),
      skipped: ['device QA', '4G/Preview measurement', 'forced Drive 429',
        ...(!zipParts ? ['ZIP fixture'] : []), ...(!resourceKeySampled ? ['resource-key fixture'] : [])] })}\n`)
  } finally {
    server.kill('SIGTERM')
    try {
      if (createdAlbumId) await owner.query('DELETE FROM studios WHERE id = (SELECT studio_id FROM albums WHERE id = $1) AND guest_only = true', [createdAlbumId])
    } finally { await owner.end() }
  }
}

main().catch(() => { process.stderr.write('Drive download live gate failed; kiểm tra test branch và fixture trong môi trường riêng\n'); process.exitCode = 1 })

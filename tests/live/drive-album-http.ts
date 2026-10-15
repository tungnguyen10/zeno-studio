import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { Pool } from 'pg'
import { createStudioAuth } from '../../server/utils/auth'
import type { TransactionalMail } from '../../server/utils/mail'

const pooledUrl = process.env.NUXT_DATABASE_TEST_URL
const directUrl = process.env.NUXT_DATABASE_TEST_DIRECT_URL
const secret = process.env.NUXT_BETTER_AUTH_SECRET
const folderUrl = process.env.NUXT_DRIVE_SAMPLE_FOLDER_URL
const expectedPhotoCount = Number(process.env.NUXT_DRIVE_EXPECTED_PHOTO_COUNT ?? '307')
if (!pooledUrl || !directUrl || !secret || !folderUrl) throw new Error('Thiếu cấu hình Neon test, Better Auth hoặc folder mẫu')
if (!Number.isInteger(expectedPhotoCount) || expectedPhotoCount < 1) throw new Error('NUXT_DRIVE_EXPECTED_PHOTO_COUNT không hợp lệ')
if (!new URL(pooledUrl).hostname.includes('-pooler')) throw new Error('Neon test URL phải dùng pooler')
if (new URL(pooledUrl).hostname.replace('-pooler', '') !== new URL(directUrl).hostname) throw new Error('Neon test URLs phải cùng branch')

const origin = 'http://127.0.0.1:43629'
const mails: TransactionalMail[] = []
const auth = createStudioAuth({ databaseUrl: pooledUrl, baseURL: origin, secret, sendMail: async mail => { mails.push(mail) } })
const owner = new Pool({ connectionString: directUrl, max: 1 })
const users: string[] = []
const server = spawn('node', ['.output/server/index.mjs'], {
  env: {
    ...process.env,
    NUXT_DATABASE_URL: pooledUrl,
    NUXT_BETTER_AUTH_SECRET: secret,
    NUXT_BETTER_AUTH_URL: origin,
    NUXT_DRIVE_VERIFIED: 'true',
    HOST: '127.0.0.1',
    PORT: '43629',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

async function expectStatus(response: Response, status: number, step: string): Promise<Response> {
  if (response.status !== status) throw new Error(`${step}: HTTP ${response.status}, cần ${status}`)
  return response
}

async function authRequest(path: string, method: 'GET' | 'POST', body?: object): Promise<Response> {
  return auth.handler(new Request(`${origin}/api/auth${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }))
}

async function appRequest(path: string, method: 'GET' | 'POST' = 'GET', body?: object, token?: string): Promise<Response> {
  return fetch(`${origin}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
}

let cookie = ''

async function main(): Promise<void> {
  try {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (server.exitCode !== null) throw new Error('Nitro server đã thoát')
      try { if ((await fetch(origin)).ok) break } catch { /* starting */ }
      if (attempt === 79) throw new Error('Nitro server không khởi động')
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const email = `drive-smoke-${randomUUID()}@example.invalid`
    const password = `Test-${randomUUID()}`
    await expectStatus(await authRequest('/sign-up/email', 'POST', { name: 'Drive smoke', email, password }), 200, 'signup')
    const user = await owner.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email])
    if (!user.rows[0]) throw new Error('Không tạo được user kiểm thử')
    users.push(user.rows[0].id)
    let verification: TransactionalMail | undefined
    for (let attempt = 0; attempt < 40; attempt++) {
      verification = mails.find(mail => mail.to === email && mail.subject === 'Xác minh email')
      if (verification) break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const link = verification?.text.match(/https?:\/\/\S+/)?.[0]
    if (!link) throw new Error('Không nhận được email xác minh trong bộ nhớ')
    const verificationUrl = new URL(link)
    await expectStatus(await authRequest(`${verificationUrl.pathname.replace('/api/auth', '')}${verificationUrl.search}`, 'GET'), 302, 'verify email')
    const signedIn = await expectStatus(await authRequest('/sign-in/email', 'POST', { email, password }), 200, 'sign in')
    cookie = signedIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    if (!cookie) throw new Error('Không có session cookie')

    const bootstrapped = await (await expectStatus(await appRequest('/api/studio/bootstrap', 'POST'), 200, 'bootstrap')).json() as { studio: { id: string } }
    const studioId = bootstrapped.studio.id
    const created = await (await expectStatus(await appRequest(`/api/studio/${studioId}/albums`, 'POST', {
      title: 'Drive HTTP smoke', folderUrl, expiresInDays: 15, limit: { kind: 'unlimited' },
    }), 200, 'create album')).json() as { album: { id: string; photoCount: number } }
    if (created.album.photoCount !== expectedPhotoCount) throw new Error(`Album có ${created.album.photoCount} ảnh, cần ${expectedPhotoCount}`)

    const list = await (await expectStatus(await appRequest(`/api/studio/${studioId}/albums`), 200, 'studio album list')).json() as { albums: Array<{ id: string; photoCount: number }> }
    if (!list.albums.some(album => album.id === created.album.id && album.photoCount === expectedPhotoCount)) throw new Error('Danh sách studio thiếu ảnh')

    const published = await (await expectStatus(await appRequest(`/api/studio/${studioId}/albums/${created.album.id}/publish`, 'POST'), 200, 'publish')).json() as { customerToken: string }
    const albumId = created.album.id
    let cursor: string | undefined
    let count = 0
    let firstPhotoId: string | undefined
    do {
      const path = `/api/album/${albumId}/photos${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`
      const page = await (await expectStatus(await appRequest(path, 'GET', undefined, published.customerToken), 200, 'customer photos')).json() as { items: Array<{ id: string }>; nextCursor?: string }
      count += page.items.length
      firstPhotoId ??= page.items[0]?.id
      cursor = page.nextCursor
    } while (cursor)
    if (count !== expectedPhotoCount || !firstPhotoId) throw new Error(`Gallery có ${count} ảnh, cần ${expectedPhotoCount}`)
    const image = await expectStatus(await appRequest(`/api/album/${albumId}/photos/${firstPhotoId}/image`, 'GET', undefined, published.customerToken), 200, 'customer image')
    if (!image.headers.get('content-type')?.startsWith('image/')) throw new Error('Endpoint ảnh không trả image content-type')
    const bytes = new Uint8Array(await image.arrayBuffer())
    if (bytes.length < 100 || new TextDecoder().decode(bytes.slice(0, 15)).toLowerCase().includes('<html')) throw new Error('Endpoint ảnh trả rỗng hoặc HTML')
    process.stdout.write(JSON.stringify({ ok: true, photoCount: count, imageBytes: bytes.length }) + '\n')
  } finally {
    server.kill('SIGTERM')
    try {
      if (users.length) {
        await owner.query('DELETE FROM studios WHERE owner_user_id = ANY($1)', [users])
        await owner.query('DELETE FROM "user" WHERE id = ANY($1)', [users])
      }
    } finally { await owner.end() }
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Lỗi không xác định'}\n`)
  process.exitCode = 1
})

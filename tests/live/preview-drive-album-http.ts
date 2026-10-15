import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { Pool } from 'pg'
import { createStudioAuth } from '../../server/utils/auth'
import type { TransactionalMail } from '../../server/utils/mail'

const pooledUrl = process.env.NUXT_DATABASE_TEST_URL
const directUrl = process.env.NUXT_DATABASE_TEST_DIRECT_URL
const folderUrl = process.env.NUXT_DRIVE_SAMPLE_FOLDER_URL
const deployment = process.env.NUXT_DRIVE_PREVIEW_DEPLOYMENT
const secret = process.env.NUXT_BETTER_AUTH_SECRET
const expectedPhotoCount = Number(process.env.NUXT_DRIVE_EXPECTED_PHOTO_COUNT ?? '307')
if (!pooledUrl || !directUrl || !folderUrl || !deployment || !secret) throw new Error('Thiếu cấu hình Preview smoke')
if (!Number.isInteger(expectedPhotoCount) || expectedPhotoCount < 1) throw new Error('NUXT_DRIVE_EXPECTED_PHOTO_COUNT không hợp lệ')
if (!new URL(pooledUrl).hostname.includes('-pooler')) throw new Error('Test DB phải dùng Neon pooler')
if (new URL(pooledUrl).hostname.replace('-pooler', '') !== new URL(directUrl).hostname) throw new Error('Test URLs phải cùng branch')
if (!/^dpl_[A-Za-z0-9]+$/.test(deployment)) throw new Error('Deployment ID không hợp lệ')

const origin = 'https://zeno-studio-preview-smoke.invalid'
const mails: TransactionalMail[] = []
const auth = createStudioAuth({ databaseUrl: pooledUrl, baseURL: origin, secret, sendMail: async mail => { mails.push(mail) } })
const owner = new Pool({ connectionString: directUrl, max: 1 })
const users: string[] = []
let cookie = ''

async function authRequest(path: string, method: 'GET' | 'POST', body?: object): Promise<Response> {
  return auth.handler(new Request(`${origin}/api/auth${path}`, {
    method, headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }))
}

async function previewRequest(path: string, method: 'GET' | 'POST' = 'GET', body?: object, token?: string): Promise<{ status: number; headers: Headers; body: Buffer }> {
  const args = ['curl', path, '--deployment', deployment!, '--', '--include', '--silent', '--request', method]
  if (cookie) args.push('--header', `cookie: ${cookie}`)
  if (token) args.push('--header', `authorization: Bearer ${token}`)
  if (body) args.push('--header', 'content-type: application/json', '--data-binary', '@-')
  const child = spawn('vercel', args, { stdio: ['pipe', 'pipe', 'pipe'] })
  const closed = new Promise<number | null>(resolve => child.on('close', resolve))
  child.stderr.resume()
  child.stdin.end(body ? JSON.stringify(body) : undefined)
  const chunks: Buffer[] = []
  for await (const chunk of child.stdout) chunks.push(Buffer.from(chunk))
  const exitCode = await closed
  if (exitCode !== 0) throw new Error(`vercel curl thất bại (exit ${exitCode})`)
  const output = Buffer.concat(chunks)
  const separator = output.indexOf('\r\n\r\n')
  if (separator < 0) throw new Error('Preview trả response không có HTTP header')
  const headerText = output.subarray(0, separator).toString('utf8')
  const status = Number(headerText.match(/^HTTP\/\d(?:\.\d)?\s+(\d+)/)?.[1])
  if (!Number.isInteger(status)) throw new Error('Preview trả HTTP status không hợp lệ')
  const headers = new Headers()
  for (const line of headerText.split('\r\n').slice(1)) {
    const index = line.indexOf(':')
    if (index > 0) headers.append(line.slice(0, index), line.slice(index + 1).trim())
  }
  return { status, headers, body: output.subarray(separator + 4) }
}

function expectStatus(response: { status: number }, status: number, step: string): void {
  if (response.status !== status) throw new Error(`${step}: HTTP ${response.status}, cần ${status}`)
}

async function main(): Promise<void> {
  try {
    process.stderr.write('Preview smoke: tạo tài khoản thử\n')
    const email = `preview-drive-${randomUUID()}@example.invalid`
    const password = `Test-${randomUUID()}`
    const signUp = await authRequest('/sign-up/email', 'POST', { name: 'Preview drive smoke', email, password })
    expectStatus(signUp, 200, 'signup fixture')
    const user = await owner.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email])
    if (!user.rows[0]) throw new Error('Không tạo được user fixture')
    users.push(user.rows[0].id)
    let verification: TransactionalMail | undefined
    for (let attempt = 0; attempt < 40; attempt++) {
      verification = mails.find(mail => mail.to === email && mail.subject === 'Xác minh email')
      if (verification) break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const link = verification?.text.match(/https?:\/\/\S+/)?.[0]
    if (!link) throw new Error('Không có email fixture')
    const url = new URL(link)
    expectStatus(await authRequest(`${url.pathname.replace('/api/auth', '')}${url.search}`, 'GET'), 302, 'verify fixture')

    process.stderr.write('Preview smoke: đăng nhập\n')
    const signIn = await previewRequest('/api/auth/sign-in/email', 'POST', { email, password })
    expectStatus(signIn, 200, 'Preview sign in')
    cookie = signIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    if (!cookie) throw new Error('Preview không trả session cookie')

    process.stderr.write('Preview smoke: tạo studio và album\n')
    const bootstrap = await previewRequest('/api/studio/bootstrap', 'POST')
    expectStatus(bootstrap, 200, 'Preview bootstrap')
    const studioId = (JSON.parse(bootstrap.body.toString()) as { studio: { id: string } }).studio.id
    const created = await previewRequest(`/api/studio/${studioId}/albums`, 'POST', {
      title: 'Preview Drive smoke', folderUrl, expiresInDays: 15, limit: { kind: 'unlimited' },
    })
    expectStatus(created, 200, 'Preview create album')
    const album = (JSON.parse(created.body.toString()) as { album: { id: string; photoCount: number } }).album
    if (album.photoCount !== expectedPhotoCount) throw new Error(`Preview album có ${album.photoCount} ảnh, cần ${expectedPhotoCount}`)

    process.stderr.write('Preview smoke: kiểm danh sách và xuất bản\n')
    const studioList = await previewRequest(`/api/studio/${studioId}/albums`)
    expectStatus(studioList, 200, 'Preview studio album list')
    const albums = (JSON.parse(studioList.body.toString()) as { albums: Array<{ id: string; photoCount: number }> }).albums
    if (!albums.some(item => item.id === album.id && item.photoCount === expectedPhotoCount)) throw new Error('Preview thiếu ảnh trong studio list')

    const publish = await previewRequest(`/api/studio/${studioId}/albums/${album.id}/publish`, 'POST')
    expectStatus(publish, 200, 'Preview publish')
    const publishedToken = (JSON.parse(publish.body.toString()) as { customerToken: string }).customerToken
    const share = await previewRequest(`/api/studio/${studioId}/albums/${album.id}/share`, 'POST')
    expectStatus(share, 200, 'Preview share link')
    const token = (JSON.parse(share.body.toString()) as { customerToken: string }).customerToken
    if (token === publishedToken) throw new Error('Preview share không cấp link mới')
    process.stderr.write('Preview smoke: kiểm gallery và ảnh khách\n')
    let cursor: string | undefined
    let count = 0
    let firstPhotoId: string | undefined
    do {
      const page = await previewRequest(`/api/album/${album.id}/photos${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, 'GET', undefined, token)
      expectStatus(page, 200, 'Preview customer photos')
      const content = JSON.parse(page.body.toString()) as { items: Array<{ id: string }>; nextCursor?: string }
      count += content.items.length
      firstPhotoId ??= content.items[0]?.id
      cursor = content.nextCursor
    } while (cursor)
    if (count !== expectedPhotoCount || !firstPhotoId) throw new Error(`Preview gallery có ${count} ảnh, cần ${expectedPhotoCount}`)
    const image = await previewRequest(`/api/album/${album.id}/photos/${firstPhotoId}/image`, 'GET', undefined, token)
    expectStatus(image, 200, 'Preview customer image')
    if (!image.headers.get('content-type')?.startsWith('image/') || image.body.length < 100) throw new Error('Preview không trả nội dung ảnh')
    process.stdout.write(JSON.stringify({ ok: true, photoCount: count, imageBytes: image.body.length }) + '\n')
  } finally {
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

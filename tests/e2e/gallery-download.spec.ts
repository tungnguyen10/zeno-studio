import { expect, test, type Page } from '@playwright/test'

const albumId = '11111111-1111-4111-8111-111111111111'
const photoId = '22222222-2222-4222-8222-222222222222'
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" />'

for (const status of ['PUBLISHED', 'FINALIZED'] as const) {
  test(`Focus offers original download in ${status}`, async ({ page }) => {
    await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }))
    await page.route(`**/api/album/${albumId}/**`, route => {
      const path = new URL(route.request().url()).pathname
      const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      if (path.endsWith('/access')) return json({ album: {
        id: albumId, title: 'Album tải', status, currentCycle: 1, expiresAt: '2030-01-01T00:00:00Z',
        joined: true, canJoin: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
        download: { canSingle: true, canSelected: false, canAll: false, reason: null, selectedSource: status === 'PUBLISHED' ? 'live' : 'snapshot', selectedCount: 0 },
      } })
      if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-download', filename: 'A.jpg', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: false }], nextCursor: null, total: 1, selectedCount: 0 })
      if (path.endsWith('/selection')) return json({ version: 0, selectedPhotoIds: [] })
      if (path.endsWith(`/photos/${photoId}/download`)) return route.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'content-disposition': 'attachment; filename="A.jpg"' }, body: Buffer.from([1, 2, 3]) })
      return route.continue()
    })
    await page.goto(`/album/${albumId}`)
    await page.getByRole('button', { name: 'Mở ảnh A.jpg' }).click()
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Tải ảnh gốc A.jpg' }).click()
    expect((await downloadEvent).suggestedFilename()).toBe('A.jpg')
  })
}

const iosUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const androidUserAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'

async function stubDevice(page: Page, userAgent: string, shareError?: string, withShare = true) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(([agent, error, share]) => {
    const state = window as unknown as { __shared: File[][] }
    state.__shared = []
    let failNext = !!error
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => agent })
    if (!share) {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined })
      return
    }
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: ({ files }: { files?: File[] }) => !!files?.length })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }: { files: File[] }) => {
      if (failNext) { failNext = false; throw new DOMException('activation expired', error) }
      state.__shared.push(files)
    } })
  }, [userAgent, shareError, withShare] as const)
}

async function setupFocusAlbum(page: Page, onOriginal: () => void, originalStatus = 200, originalDelayMs = 0) {
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }))
  await page.route(`**/api/album/${albumId}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Album Focus', status: 'FINALIZED', currentCycle: 1, expiresAt: '2030-01-01T00:00:00Z', joined: true, canJoin: false,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
      download: { canSingle: true, canSelected: false, canAll: false, reason: null, selectedSource: 'snapshot', selectedCount: 0 },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-download', filename: 'Ảnh A.jpg', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: false }], nextCursor: null, total: 1, selectedCount: 0 })
    if (path.endsWith(`/photos/${photoId}/download`)) {
      onOriginal()
      if (originalDelayMs) await new Promise(resolve => setTimeout(resolve, originalDelayMs))
      if (originalStatus !== 200) return route.fulfill({ status: originalStatus, body: 'Denied' })
      return route.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'content-disposition': "attachment; filename=\"Anh A.jpg\"; filename*=UTF-8''%E1%BA%A2nh%20A.jpg" }, body: Buffer.from([1, 2, 3]) })
    }
    return route.continue()
  })
  await page.goto(`/album/${albumId}`)
  await page.getByRole('button', { name: 'Mở ảnh Ảnh A.jpg' }).click()
}

const sharedFiles = (page: Page) => page.evaluate(async () => Promise.all((window as unknown as { __shared: File[][] }).__shared
  .map(async files => ({ name: files[0]!.name, bytes: [...new Uint8Array(await files[0]!.arrayBuffer())] }))))

test('iOS Focus prefetches the original so one tap opens the share sheet', async ({ page }) => {
  let requests = 0
  await stubDevice(page, iosUserAgent)
  await setupFocusAlbum(page, () => { requests++ })
  await expect.poll(() => requests).toBe(1)
  await page.getByRole('button', { name: 'Tải ảnh gốc Ảnh A.jpg' }).click()
  await expect.poll(() => sharedFiles(page)).toEqual([{ name: 'Ảnh A.jpg', bytes: [1, 2, 3] }])
  expect(requests).toBe(1)
})

test('iOS never shares after waiting and offers an explicit save button instead', async ({ page }) => {
  let requests = 0
  await stubDevice(page, iosUserAgent)
  await setupFocusAlbum(page, () => { requests++ }, 200, 1500)
  await page.getByRole('button', { name: 'Tải ảnh gốc Ảnh A.jpg' }).click()
  const save = page.getByRole('button', { name: /Lưu vào Ảnh/ })
  await expect(save).toBeVisible()
  expect(await sharedFiles(page)).toEqual([])
  await save.click()
  await expect.poll(() => sharedFiles(page)).toEqual([{ name: 'Ảnh A.jpg', bytes: [1, 2, 3] }])
  await expect(save).toHaveCount(0)
  expect(requests).toBe(1)
})

test('iOS shows the save button again when the share sheet is refused', async ({ page }) => {
  await stubDevice(page, iosUserAgent, 'NotAllowedError')
  let requests = 0
  await setupFocusAlbum(page, () => { requests++ })
  await expect.poll(() => requests).toBe(1)
  await page.getByRole('button', { name: 'Tải ảnh gốc Ảnh A.jpg' }).click()
  await page.getByRole('button', { name: /Lưu vào Ảnh/ }).click()
  await expect.poll(() => sharedFiles(page)).toEqual([{ name: 'Ảnh A.jpg', bytes: [1, 2, 3] }])
})

test('iOS in-app browser without file sharing shows the original for long-press save', async ({ page }) => {
  await stubDevice(page, iosUserAgent, undefined, false)
  let requests = 0
  await setupFocusAlbum(page, () => { requests++ })
  await expect.poll(() => requests).toBe(1)
  await page.getByRole('button', { name: 'Tải ảnh gốc Ảnh A.jpg' }).click()
  const preview = page.getByRole('dialog', { name: 'Lưu ảnh gốc' })
  await expect(preview.getByText('Nhấn giữ ảnh')).toBeVisible()
  await expect(preview.getByRole('img')).toHaveAttribute('src', /^blob:/)
  await preview.getByRole('button', { name: 'Đóng ảnh gốc' }).click()
  await expect(preview).toHaveCount(0)
})

test('Android Focus saves the original as a file in one tap without prefetch', async ({ page }) => {
  let requests = 0
  await stubDevice(page, androidUserAgent)
  await setupFocusAlbum(page, () => { requests++ })
  await page.waitForTimeout(1200)
  expect(requests).toBe(0)
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Tải ảnh gốc Ảnh A.jpg' }).click()
  expect((await downloadEvent).suggestedFilename()).toBe('Ảnh A.jpg')
  expect(await sharedFiles(page)).toEqual([])
})

test('Focus shows a denied single download inline', async ({ page }) => {
  await setupFocusAlbum(page, () => {}, 403)
  await page.getByRole('button', { name: 'Tải ảnh gốc Ảnh A.jpg' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Quyền tải đã thay đổi' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/album/${albumId}$`))
})

test('iOS saves many selected photos to Photos in batches of 12 and keeps ZIP as a Files fallback', async ({ page }) => {
  await stubDevice(page, iosUserAgent)
  const ids = Array.from({ length: 13 }, (_, index) => `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`)
  const zipForms: string[] = []
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }))
  await page.route(`**/api/album/${albumId}/**`, route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Album nhiều ảnh', status: 'FINALIZED', currentCycle: 1, expiresAt: '2030-01-01T00:00:00Z', joined: true, canJoin: false,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
      download: { canSingle: true, canSelected: true, canAll: false, reason: null, selectedSource: 'snapshot', selectedCount: 13 },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-download', filename: 'A.jpg', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: true }], nextCursor: null, total: 1, selectedCount: 1 })
    if (path.endsWith('/download/plan')) return json({ kind: 'selected', cycle: 1, totalFiles: 13, totalBytes: 39, unavailable: [], parts: [{
      index: 0, format: 'zip', filename: 'album-001.zip', count: 13, byteLength: 39, photoIds: ids, ticket: 'zip-signed',
      fileTickets: ids.map((id, index) => ({ photoId: id, ticket: `file-${index + 1}`, sizeBytes: 3 })),
    }] })
    if (path.endsWith('/download/file')) {
      const ticket = (request.postDataJSON() as { ticket: string }).ticket
      return route.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'content-disposition': `attachment; filename="${ticket}.jpg"` }, body: Buffer.from([1, 2, 3]) })
    }
    if (path.endsWith('/download/zip')) {
      zipForms.push(request.postData() ?? '')
      return route.fulfill({ status: 200, contentType: 'application/zip', headers: { 'content-disposition': 'attachment; filename="album-001.zip"' }, body: Buffer.from([4, 5, 6]) })
    }
    return route.continue()
  })
  await page.goto(`/album/${albumId}`)
  await page.getByRole('button', { name: 'Tải xuống' }).click()
  await page.getByRole('button', { name: 'Chuẩn bị tải 13 ảnh' }).click()
  await page.getByRole('button', { name: 'Lưu ảnh 1–12 vào Ảnh' }).click()
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __shared: File[][] }).__shared.map(files => files.length)))).toEqual([12])
  await page.getByRole('button', { name: 'Lưu ảnh 13–13 vào Ảnh' }).click()
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __shared: File[][] }).__shared.map(files => files.length)))).toEqual([12, 1])
  expect(await page.evaluate(() => (window as unknown as { __shared: File[][] }).__shared[0]!.map(file => file.name).slice(0, 2))).toEqual(['file-1.jpg', 'file-2.jpg'])
  await expect(page.getByText('Đã chuyển 13/13 ảnh')).toBeVisible()

  await page.getByText('Tải file ZIP (lưu vào app Tệp)').click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Tải phần 1' }).click()
  await downloadEvent
  expect(zipForms).toEqual(['ticket=zip-signed'])
})

test('selected originals are prefetched to disk cache so saving needs no new download', async ({ page }) => {
  await stubDevice(page, iosUserAgent)
  const ids = ['44444444-4444-4444-8444-000000000001', '44444444-4444-4444-8444-000000000002']
  const fileRequests: string[] = []
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }))
  await page.route(`**/api/album/${albumId}/**`, route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Album tải sẵn', status: 'FINALIZED', currentCycle: 1, expiresAt: '2030-01-01T00:00:00Z', joined: true, canJoin: false,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
      download: { canSingle: true, canSelected: true, canAll: false, reason: null, selectedSource: 'snapshot', selectedCount: 2 },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-download', filename: 'A.jpg', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: true }], nextCursor: null, total: 1, selectedCount: 1 })
    if (path.endsWith('/download/plan')) return json({ kind: 'selected', cycle: 1, totalFiles: 2, totalBytes: 6, unavailable: [], parts: [{
      index: 0, format: 'zip', filename: 'album-001.zip', count: 2, byteLength: 6, photoIds: ids, ticket: 'zip-signed',
      fileTickets: ids.map((id, index) => ({ photoId: id, ticket: `cached-${index + 1}`, sizeBytes: 3 })),
    }] })
    if (path.endsWith('/download/file')) {
      const ticket = (request.postDataJSON() as { ticket: string }).ticket
      fileRequests.push(ticket)
      return route.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'content-disposition': `attachment; filename="${ticket}.jpg"` }, body: Buffer.from([7, 8, 9]) })
    }
    return route.continue()
  })
  await page.goto(`/album/${albumId}`)
  await expect.poll(() => fileRequests, { timeout: 15_000 }).toEqual(['cached-1', 'cached-2'])
  await expect.poll(() => page.evaluate(async () => {
    const names = await caches.keys()
    const cache = await caches.open(names.find(name => name.startsWith('zeno-originals-v1:'))!)
    return (await cache.keys()).length
  })).toBe(2)

  await page.getByRole('button', { name: 'Tải xuống' }).click()
  await page.getByRole('button', { name: 'Lưu 2 ảnh vào Ảnh' }).click()
  await expect.poll(() => sharedFiles(page)).toEqual([{ name: 'cached-1.jpg', bytes: [7, 8, 9] }])
  expect(await page.evaluate(() => (window as unknown as { __shared: File[][] }).__shared[0]!.map(file => file.name))).toEqual(['cached-1.jpg', 'cached-2.jpg'])
  expect(fileRequests).toEqual(['cached-1', 'cached-2'])
})

test('download basket stays independent of saved hearts and shows a bounded plan', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const requests: unknown[] = []
  const selectionWrites: unknown[] = []
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }))
  await page.route(`**/api/album/${albumId}/**`, route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Album tải', status: 'PUBLISHED', currentCycle: 1, expiresAt: '2030-01-01T00:00:00Z', joined: true, canJoin: false,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
      download: { canSingle: false, canSelected: true, canAll: true, reason: null, selectedSource: 'live', selectedCount: 0 },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-download', filename: 'A.jpg', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: false }], nextCursor: null, total: 1, selectedCount: 0 })
    if (path.endsWith('/selection')) return json({ version: 0, selectedPhotoIds: [] })
    if (path.includes('/selection/')) { selectionWrites.push(route.request().postDataJSON()); return json({ status: 'saved', version: 1, selected: true, count: 1 }) }
    if (path.endsWith('/download/plan')) {
      requests.push(route.request().postDataJSON())
      return json({ kind: 'basket', cycle: 1, totalFiles: 1, totalBytes: 5, unavailable: [], parts: [{ index: 0, format: 'zip', filename: 'album-001.zip', count: 1, byteLength: 5, photoIds: [photoId], ticket: 'signed', fileTickets: [] }] })
    }
    return route.continue()
  })
  await page.goto(`/album/${albumId}`)
  await page.getByRole('button', { name: 'Tải xuống' }).click()
  await page.getByRole('button', { name: 'Chọn ảnh khác để tải' }).click()
  await page.getByRole('checkbox', { name: 'Tải A.jpg' }).check()
  expect(selectionWrites).toHaveLength(0)
  await page.getByRole('button', { name: 'Tải xuống' }).click()
  await page.getByRole('button', { name: 'Chuẩn bị tải 1 ảnh' }).click()
  await expect(page.getByText('album-001.zip')).toBeVisible()
  expect(requests).toEqual([{ kind: 'basket', photoIds: [photoId] }])
  await page.getByRole('button', { name: 'Hủy chọn ảnh tải' }).click()
  await expect(page.getByRole('button', { name: 'Chuẩn bị tải 0 ảnh' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Tải ảnh gốc' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Tải xuống' })).toBeFocused()
})

test('finalized Island uses the Studio snapshot count and selected label', async ({ page }) => {
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }))
  await page.route(`**/api/album/${albumId}/**`, route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Album chốt', status: 'FINALIZED', currentCycle: 1, expiresAt: '2030-01-01T00:00:00Z', joined: true, canJoin: false,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
      download: { canSingle: false, canSelected: true, canAll: false, reason: null, selectedSource: 'snapshot', selectedCount: 3 },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-download', filename: 'A.jpg', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: true }], nextCursor: null, total: 1, selectedCount: 1 })
    return route.continue()
  })
  await page.goto(`/album/${albumId}`)
  await expect(page.getByText('3 ảnh đã chốt')).toBeVisible()
  await page.getByRole('button', { name: 'Tải xuống' }).click()
  await expect(page.getByRole('button', { name: 'Tải bộ ảnh đã chốt' })).toBeVisible()
})

test('selected plan waits until a pending heart save finishes', async ({ page }) => {
  let releaseSave: () => void = () => {}
  const saveGate = new Promise<void>(resolve => { releaseSave = resolve })
  let planCount = 0
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }))
  await page.route(`**/api/album/${albumId}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Đang lưu', status: 'PUBLISHED', currentCycle: 1, expiresAt: '2030-01-01T00:00:00Z', joined: true, canJoin: false,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
      download: { canSingle: false, canSelected: true, canAll: false, reason: null, selectedSource: 'live', selectedCount: 1 },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-download', filename: 'A.jpg', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: true }], nextCursor: null, total: 1, selectedCount: 1 })
    if (path.endsWith('/selection')) return json({ version: 0, selectedPhotoIds: [photoId] })
    if (path.includes('/selection/')) { await saveGate; return json({ status: 'saved', version: 1, selected: false, count: 0 }) }
    if (path.endsWith('/download/plan')) { planCount++; return json({ kind: 'selected', cycle: 1, totalFiles: 0, totalBytes: 0, parts: [], unavailable: [] }) }
    return route.continue()
  })
  await page.goto(`/album/${albumId}`)
  await page.getByRole('button', { name: 'Bỏ chọn A.jpg' }).click()
  await page.getByRole('button', { name: 'Tải xuống' }).click()
  await expect(page.getByRole('button', { name: 'Đang lập kế hoạch…' })).toBeDisabled()
  expect(planCount).toBe(0)
  releaseSave()
  await expect.poll(() => planCount).toBe(1)
})

async function setupTransferAlbum(page: Page, fileTickets: Array<{ photoId: string; ticket: string }>) {
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }))
  await page.route(`**/api/album/${albumId}/**`, route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Album chuyển file', status: 'PUBLISHED', currentCycle: 1, expiresAt: '2030-01-01T00:00:00Z', joined: true, canJoin: false,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
      download: { canSingle: true, canSelected: true, canAll: false, reason: null, selectedSource: 'live', selectedCount: 1 },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-download', filename: 'Ảnh A.jpg', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: true }], nextCursor: null, total: 1, selectedCount: 1 })
    if (path.endsWith('/selection')) return json({ version: 0, selectedPhotoIds: [photoId] })
    if (path.endsWith('/download/plan')) return json({ kind: 'selected', cycle: 1, totalFiles: 1, totalBytes: 3, unavailable: [], parts: [{ index: 0, format: 'zip', filename: 'album-001.zip', count: 1, byteLength: 3, photoIds: [photoId], ticket: 'zip-signed', fileTickets }] })
    if (path.endsWith('/download/file')) return route.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'content-disposition': "attachment; filename=\"Anh A.jpg\"; filename*=UTF-8''%E1%BA%A2nh%20A.jpg" }, body: Buffer.from([1, 2, 3]) })
    if (path.endsWith(`/photos/${photoId}/download`)) return route.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'content-disposition': "attachment; filename=\"Anh A.jpg\"; filename*=UTF-8''%E1%BA%A2nh%20A.jpg" }, body: Buffer.from([1, 2, 3]) })
    if (path.endsWith('/download/zip')) return route.fulfill({ status: 200, contentType: 'application/zip', body: Buffer.from([4, 5, 6]) })
    return route.continue()
  })
  await page.goto(`/album/${albumId}`)
  await page.getByRole('button', { name: 'Tải xuống' }).click()
  await page.getByRole('button', { name: 'Chuẩn bị tải 1 ảnh' }).click()
  await expect(page.getByText('album-001.zip')).toBeVisible()
}

test('mobile share waits for a second click and uses original file bytes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: ({ files }: { files?: File[] }) => !!files?.length })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }: { files: File[] }) => {
      (window as unknown as { __sharedFiles: File[]; __shareCount: number }).__sharedFiles = files
      ;(window as unknown as { __shareCount: number }).__shareCount++
    } })
    ;(window as unknown as { __shareCount: number }).__shareCount = 0
  })
  await setupTransferAlbum(page, [{ photoId, ticket: 'file-signed' }])
  await page.getByRole('button', { name: 'Chuẩn bị ảnh gốc' }).click()
  await expect(page.getByRole('button', { name: 'Mở bảng lưu/chia sẻ' })).toBeEnabled()
  expect(await page.evaluate(() => (window as unknown as { __shareCount: number }).__shareCount)).toBe(0)
  await page.getByRole('button', { name: 'Mở bảng lưu/chia sẻ' }).click()
  expect(await page.evaluate(async () => {
    const file = (window as unknown as { __sharedFiles: File[] }).__sharedFiles[0]!
    return { name: file.name, bytes: [...new Uint8Array(await file.arrayBuffer())] }
  })).toEqual({ name: 'Ảnh A.jpg', bytes: [1, 2, 3] })
  await expect(page.getByText('Đã mở bảng lưu/chia sẻ')).toBeVisible()
})

test('desktop transfers one ZIP part on click and reports completion', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }) })
  await setupTransferAlbum(page, [])
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Tải phần 1' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('album-001.zip')
  await expect(page.getByText('Đã chuyển 1/1 phần')).toBeVisible()
})

test('unsupported mobile share falls back to the manual ZIP action', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false })
  })
  await setupTransferAlbum(page, [{ photoId, ticket: 'file-signed' }])
  await page.getByRole('button', { name: 'Chuẩn bị ảnh gốc' }).click()
  await expect(page.getByText(/không hỗ trợ chia sẻ file/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tải phần 1' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Mở bảng lưu/chia sẻ' })).toHaveCount(0)
})

test('failed ZIP part can be retried manually', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }) })
  await setupTransferAlbum(page, [])
  let attempts = 0
  await page.route(`**/api/album/${albumId}/download/zip`, route => {
    attempts++
    return route.fulfill(attempts === 1 ? { status: 502, body: 'Drive unavailable' } : { status: 200, contentType: 'application/zip', body: Buffer.from([4, 5, 6]) })
  })
  await page.getByRole('button', { name: 'Tải phần 1' }).click()
  await expect(page.getByRole('button', { name: 'Thử lại phần 1' })).toBeEnabled()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Thử lại phần 1' }).click()
  await downloadEvent
  await expect(page.getByText('Đã chuyển 1/1 phần')).toBeVisible()
  expect(attempts).toBe(2)
})

test('a revoked download right clears the temporary basket', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }) })
  await setupTransferAlbum(page, [])
  await page.getByRole('button', { name: 'Chọn ảnh khác để tải' }).click()
  await page.getByRole('checkbox', { name: 'Tải Ảnh A.jpg' }).check()
  await page.getByRole('button', { name: 'Tải xuống' }).click()
  await page.getByRole('button', { name: 'Chuẩn bị tải 1 ảnh' }).click()
  await page.route(`**/api/album/${albumId}/download/zip`, route => route.fulfill({ status: 403, body: 'Denied' }))
  await page.getByRole('button', { name: 'Tải phần 1' }).click()
  await expect(page.getByText('0 ảnh trong giỏ tải')).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Quyền tải đã thay đổi' })).toBeVisible()
})

test('stopping a ZIP request keeps the temporary basket', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }) })
  await setupTransferAlbum(page, [])
  await page.getByRole('button', { name: 'Chọn ảnh khác để tải' }).click()
  await page.getByRole('checkbox', { name: 'Tải Ảnh A.jpg' }).check()
  await page.getByRole('button', { name: 'Tải xuống' }).click()
  await page.getByRole('button', { name: 'Chuẩn bị tải 1 ảnh' }).click()
  let started: () => void = () => {}
  let release: () => void = () => {}
  const requested = new Promise<void>(resolve => { started = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route(`**/api/album/${albumId}/download/zip`, async route => {
    started()
    await gate
    try { await route.fulfill({ status: 200, contentType: 'application/zip', body: Buffer.from([4, 5, 6]) }) } catch { /* request was aborted */ }
  })
  await page.getByRole('button', { name: 'Tải phần 1' }).click()
  await requested
  await page.getByRole('button', { name: 'Dừng tải' }).click()
  release()
  await expect(page.getByRole('dialog', { name: 'Tải ảnh gốc' }).getByText('1 ảnh trong giỏ tải')).toBeVisible()
  await expect(page.getByText(/Đã dừng tải/)).toBeVisible()
})

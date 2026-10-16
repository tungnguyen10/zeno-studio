import { expect, test } from '@playwright/test'

const albumId = '11111111-1111-4111-8111-111111111111'
const photoId = '22222222-2222-4222-8222-222222222222'

test('customer opens album, saves a selection and an independent note', async ({ page }) => {
  let selected = false
  let version = 0
  let note = ''
  let noteVersion = 0
  const imageVariants: string[] = []
  const driveSizes: string[] = []
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#ddd"/></svg>'
  await page.route('https://drive.google.com/thumbnail**', route => {
    driveSizes.push(new URL(route.request().url()).searchParams.get('sz') ?? '')
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg })
  })
  let releaseNoteRead: () => void = () => {}
  const noteRead = new Promise<void>(resolve => { releaseNoteRead = resolve })
  await page.route(`**/api/album/${albumId}/**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access') && request.method() === 'POST') return json({ scope: 'customer', participantId: photoId })
    if (path.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Album mẫu', status: 'PUBLISHED', expiresAt: '2030-01-01T00:00:00Z',
      participant: { id: photoId, displayName: 'Lan' },
      settings: { limitKind: 'maximum', limitMin: null, limitMax: 5, collaborationMode: 'shared', shortlistRounds: 1 },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-file-a', filename: 'Ảnh A.JPG', width: 800, height: 1000, status: 'READY', sortOrder: 0 }], nextCursor: null })
    if (path.endsWith('/selection') && request.method() === 'GET') return json({ version, selectedPhotoIds: selected ? [photoId] : [] })
    if (path.endsWith(`/selection/${photoId}`)) {
      selected = (request.postDataJSON() as { selected: boolean }).selected
      version++
      return json({ status: 'saved', version, selected, count: selected ? 1 : 0 })
    }
    if (path.endsWith(`/notes/${photoId}`) && request.method() === 'GET') {
      await noteRead
      return json({ body: note, version: noteVersion })
    }
    if (path.endsWith(`/notes/${photoId}`)) {
      note = (request.postDataJSON() as { text: string }).text
      noteVersion++
      return json({ status: 'saved', version: noteVersion, body: note })
    }
    if (path.endsWith('/image')) {
      imageVariants.push(url.searchParams.get('variant') ?? 'original')
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#ddd"/></svg>' })
    }
    return route.continue()
  })

  await page.goto(`/album/${albumId}?token=${'a'.repeat(43)}`)
  await expect(page.getByRole('heading', { name: 'Album mẫu' })).toBeVisible()
  await expect(page).toHaveURL(`/album/${albumId}`)
  await expect.poll(() => driveSizes).toContain('w320')
  await page.getByRole('button', { name: 'Chọn Ảnh A.JPG' }).click()
  await expect(page.getByText('1 ảnh đã chọn')).toBeVisible()
  await page.getByRole('button', { name: 'Mở ảnh Ảnh A.JPG' }).click()
  await expect.poll(() => driveSizes).toContain('w960')
  await expect(page.getByLabel('Ghi chú chỉnh sửa')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Lưu ghi chú' })).toBeDisabled()
  releaseNoteRead()
  await expect(page.getByLabel('Ghi chú chỉnh sửa')).toBeEnabled()
  await page.getByLabel('Ghi chú chỉnh sửa').fill('Chỉnh sáng')
  await page.getByRole('button', { name: 'Lưu ghi chú' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu ghi chú' })).toBeVisible()
  expect(note).toBe('Chỉnh sáng')
})

test('shows an explicit failure in the gallery and Focus when Drive images fail', async ({ page }) => {
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 429, body: 'Rate limited' }))
  await page.route(`**/api/album/${albumId}/**`, route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Album lỗi ảnh', status: 'PUBLISHED', expiresAt: '2030-01-01T00:00:00Z',
      participant: { id: photoId, displayName: 'Lan' },
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null, collaborationMode: 'shared', shortlistRounds: 1 },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-file-b', filename: 'Lỗi.JPG', width: 800, height: 1000, status: 'READY', sortOrder: 0 }], nextCursor: null })
    if (path.endsWith('/selection')) return json({ version: 0, selectedPhotoIds: [] })
    if (path.endsWith(`/notes/${photoId}`)) return json({ body: '', version: 0 })
    if (path.endsWith('/image')) return route.fulfill({ status: 502, body: 'Drive unavailable' })
    return route.continue()
  })
  await page.goto(`/album/${albumId}`)
  await expect(page.getByText('Không tải được ảnh', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Mở ảnh Lỗi.JPG' }).click()
  await expect(page.getByText('Không tải được ảnh gốc từ Google Drive.')).toBeVisible()
})

const responsiveCases = [
  { name: 'mobile', viewport: { width: 390, height: 800 }, deviceScaleFactor: 3, expected: 'w640' },
  { name: 'tablet', viewport: { width: 820, height: 1100 }, deviceScaleFactor: 2, expected: 'w640' },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, expected: 'w320' },
]

for (const { name, viewport, deviceScaleFactor, expected } of responsiveCases) {
  test.describe(`grid thumbnails on ${name}`, () => {
    test.use({ viewport, deviceScaleFactor })

    test(`request ${expected}`, async ({ page }) => {
      const requested: string[] = []
      await page.route('https://drive.google.com/thumbnail**', route => {
        requested.push(new URL(route.request().url()).searchParams.get('sz') ?? '')
        return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#ddd"/></svg>' })
      })
      await page.route(`**/api/album/${albumId}/**`, route => {
        const path = new URL(route.request().url()).pathname
        const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
        if (path.endsWith('/access')) return json({ album: {
          id: albumId, title: 'Album responsive', status: 'PUBLISHED', expiresAt: '2030-01-01T00:00:00Z',
          participant: { id: photoId, displayName: 'Lan' },
          settings: { limitKind: 'unlimited', limitMin: null, limitMax: null, collaborationMode: 'shared', shortlistRounds: 1 },
        } })
        if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-file-c', filename: 'Ảnh C.JPG', width: 800, height: 1000, status: 'READY', sortOrder: 0 }], nextCursor: null })
        if (path.endsWith('/selection')) return json({ version: 0, selectedPhotoIds: [] })
        return route.continue()
      })
      await page.goto(`/album/${albumId}`)
      await expect.poll(() => requested).toEqual([expected])
    })
  })
}

async function mockSinglePhotoAlbum(page: import('@playwright/test').Page, proxied: string[]) {
  await page.route(`**/api/album/${albumId}/**`, route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Album retry', status: 'PUBLISHED', expiresAt: '2030-01-01T00:00:00Z',
      participant: { id: photoId, displayName: 'Lan' },
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null, collaborationMode: 'shared', shortlistRounds: 1 },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-file-d', filename: 'Ảnh D.JPG', width: 800, height: 1000, status: 'READY', sortOrder: 0 }], nextCursor: null })
    if (path.endsWith('/selection')) return json({ version: 0, selectedPhotoIds: [] })
    if (path.endsWith(`/notes/${photoId}`)) return json({ body: '', version: 0 })
    if (path.endsWith('/image')) {
      proxied.push(new URL(route.request().url()).search || 'original')
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#ddd"/></svg>' })
    }
    return route.continue()
  })
}

test('retries a transient Drive failure once before using the proxy', async ({ page }) => {
  const driveRequests: string[] = []
  const proxied: string[] = []
  await page.route('https://drive.google.com/thumbnail**', route => {
    driveRequests.push(route.request().url())
    if (driveRequests.length === 1) return route.fulfill({ status: 429, body: 'Rate limited' })
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#ddd"/></svg>' })
  })
  await mockSinglePhotoAlbum(page, proxied)
  await page.goto(`/album/${albumId}`)
  await expect.poll(() => driveRequests.length).toBe(2)
  expect(driveRequests[1]).toContain('retry=1')
  expect(proxied).toEqual([])
})

test('loads the original through the proxy only when requested', async ({ page }) => {
  const proxied: string[] = []
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#ddd"/></svg>' }))
  await mockSinglePhotoAlbum(page, proxied)
  await page.goto(`/album/${albumId}`)
  await page.getByRole('button', { name: 'Mở ảnh Ảnh D.JPG' }).click()
  await page.waitForTimeout(500)
  expect(proxied).toEqual([])
  await page.getByRole('button', { name: 'Xem ảnh gốc (nặng hơn)' }).click()
  await expect.poll(() => proxied).toEqual(['original'])
  await expect(page.getByRole('button', { name: 'Xem ảnh gốc (nặng hơn)' })).toHaveCount(0)
})

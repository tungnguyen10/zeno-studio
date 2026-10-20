import { expect, test } from '@playwright/test'

const albumId = '11111111-1111-4111-8111-111111111111'
const photoId = '22222222-2222-4222-8222-222222222222'

// Pre-existing assertions were written against the uniform grid; layout-specific behaviour has its own tests.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('zeno-gallery-layout')) localStorage.setItem('zeno-gallery-layout', 'grid') })
})

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
      joined: true, canJoin: false,
      settings: { limitKind: 'maximum', limitMin: null, limitMax: 5 },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-file-a', filename: 'Ảnh A.JPG', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: false }], nextCursor: null, total: 1, selectedCount: 0 })
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
  await expect(page).toHaveURL(`/album/${albumId}?token=${'a'.repeat(43)}`)
  await expect.poll(() => driveSizes).toContain('w320')
  await page.getByRole('button', { name: 'Chọn Ảnh A.JPG' }).click()
  await expect(page.getByText('1 ảnh đã chọn')).toBeVisible()
  await page.getByRole('button', { name: 'Mở ảnh Ảnh A.JPG' }).click()
  await expect.poll(() => driveSizes).toContain('w640')
  expect(driveSizes).not.toContain('w1280')
  await expect(page.getByRole('status', { name: 'Đang tải ghi chú' })).toBeVisible()
  await expect(page.getByLabel('Ghi chú chỉnh sửa')).toHaveCount(0)
  releaseNoteRead()
  await expect(page.getByLabel('Ghi chú chỉnh sửa')).toBeEnabled()
  await page.getByLabel('Ghi chú chỉnh sửa').fill('Chỉnh sáng')
  await expect(page.getByRole('button', { name: 'Lưu ghi chú' })).toHaveCount(0)
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
      joined: true, canJoin: false,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-file-b', filename: 'Lỗi.JPG', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: false }], nextCursor: null, total: 1, selectedCount: 0 })
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
          joined: true, canJoin: false,
          settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
        } })
        if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-file-c', filename: 'Ảnh C.JPG', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: false }], nextCursor: null, total: 1, selectedCount: 0 })
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
      joined: true, canJoin: false,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-file-d', filename: 'Ảnh D.JPG', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: false }], nextCursor: null, total: 1, selectedCount: 0 })
    if (path.endsWith('/selection')) return json({ version: 0, selectedPhotoIds: [] })
    if (path.endsWith(`/notes/${photoId}`)) return json({ body: '', version: 0 })
    if (path.endsWith('/image')) {
      proxied.push(new URL(route.request().url()).search || 'original')
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#ddd"/></svg>' })
    }
    return route.continue()
  })
}

test('uses the authenticated thumbnail proxy after one Drive failure', async ({ page }) => {
  const driveRequests: string[] = []
  const proxied: string[] = []
  await page.route('https://drive.google.com/thumbnail**', route => {
    driveRequests.push(route.request().url())
    return route.fulfill({ status: 429, body: 'Rate limited' })
  })
  await mockSinglePhotoAlbum(page, proxied)
  await page.goto(`/album/${albumId}`)
  await expect.poll(() => proxied).toContain('?variant=thumbnail')
  expect(driveRequests).toHaveLength(1)
})

test('opens the focus view from Drive without hitting the proxy', async ({ page }) => {
  const proxied: string[] = []
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#ddd"/></svg>' }))
  await mockSinglePhotoAlbum(page, proxied)
  await page.goto(`/album/${albumId}`)
  await page.getByRole('button', { name: 'Mở ảnh Ảnh D.JPG' }).click()
  await expect(page.getByRole('dialog', { name: 'Ảnh D.JPG' })).toBeVisible()
  await page.waitForTimeout(500)
  expect(proxied).toEqual([])
  await expect(page.getByRole('button', { name: /Xem ảnh gốc/ })).toHaveCount(0)
})

test('joins the album automatically without asking for a name', async ({ page }) => {
  let joinRequests = 0
  let joined = false
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#ddd"/></svg>' }))
  await page.route(`**/api/album/${albumId}/**`, route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/join') && request.method() === 'POST') { joinRequests++; joined = true; return json({ joined: true }) }
    if (path.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Album tự vào', status: 'PUBLISHED', expiresAt: '2030-01-01T00:00:00Z',
      joined, canJoin: !joined,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-file-e', filename: 'Ảnh E.JPG', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: false }], nextCursor: null, total: 1, selectedCount: 0 })
    if (path.endsWith('/selection')) return json({ version: 0, selectedPhotoIds: [] })
    return route.continue()
  })
  await page.goto(`/album/${albumId}`)
  await expect(page.getByRole('heading', { name: 'Album tự vào' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chọn Ảnh E.JPG' })).toBeVisible()
  await expect(page.getByLabel('Tên của bạn')).toHaveCount(0)
  expect(joinRequests).toBe(1)
})

test('shows the note field only while the photo is selected', async ({ page }) => {
  let version = 0
  let selected = false
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#ddd"/></svg>' }))
  await page.route(`**/api/album/${albumId}/**`, route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Album ghi chú', status: 'PUBLISHED', expiresAt: '2030-01-01T00:00:00Z',
      joined: true, canJoin: false,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-file-f', filename: 'Ảnh F.JPG', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: false }], nextCursor: null, total: 1, selectedCount: 0 })
    if (path.endsWith('/selection') && request.method() === 'GET') return json({ version, selectedPhotoIds: selected ? [photoId] : [] })
    if (path.endsWith(`/selection/${photoId}`)) {
      selected = (request.postDataJSON() as { selected: boolean }).selected
      version++
      return json({ status: 'saved', version, selected, count: selected ? 1 : 0 })
    }
    if (path.endsWith(`/notes/${photoId}`)) return json({ body: 'Chỉnh sáng', version: 1 })
    return route.continue()
  })
  await page.goto(`/album/${albumId}`)
  await page.getByRole('button', { name: 'Mở ảnh Ảnh F.JPG' }).click()
  await expect(page.getByText('Chọn ảnh này để ghi chú cần chỉnh sửa.')).toBeVisible()
  await expect(page.getByLabel('Ghi chú chỉnh sửa')).toHaveCount(0)
  await page.getByRole('button', { name: '♡ Chọn ảnh' }).click()
  await expect(page.getByLabel('Ghi chú chỉnh sửa')).toHaveValue('Chỉnh sáng')
  await page.getByRole('button', { name: '♥ Đã chọn' }).click()
  await expect(page.getByLabel('Ghi chú chỉnh sửa')).toHaveCount(0)
  await page.getByRole('button', { name: '♡ Chọn ảnh' }).click()
  await expect(page.getByLabel('Ghi chú chỉnh sửa')).toHaveValue('Chỉnh sáng')
})

function navAlbumPhoto(index: number) {
  return { id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`, sourceFileId: `drive-nav-${index}`, filename: `Nav ${index}.JPG`, width: index % 2 ? 1500 : 800, height: 1000, status: 'READY', sortOrder: index, selected: false }
}

async function mockNavigationAlbum(page: import('@playwright/test').Page, savedNotes: string[], selectionPuts: number[] = []) {
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#ddd"/></svg>' }))
  await page.route(`**/api/album/${albumId}/**`, route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Album lướt ảnh', status: 'PUBLISHED', expiresAt: '2030-01-01T00:00:00Z',
      joined: true, canJoin: false,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
    } })
    if (path.endsWith('/photos')) {
      const second = url.searchParams.get('cursor') === 'page-2'
      const items = second ? [navAlbumPhoto(2)] : [navAlbumPhoto(0), navAlbumPhoto(1)]
      return json({ items, nextCursor: second ? null : 'page-2', total: 3, selectedCount: 1 })
    }
    if (path.endsWith('/selection')) return json({ version: 1, selectedPhotoIds: [navAlbumPhoto(0).id] })
    if (path.includes('/selection/')) {
      const body = request.postDataJSON() as { selected: boolean; expectedVersion: number }
      selectionPuts.push(body.expectedVersion)
      return json({ status: 'saved', version: body.expectedVersion + 1, selected: body.selected, count: 1 })
    }
    if (path.includes('/notes/') && request.method() === 'GET') return json({ body: '', version: 0 })
    if (path.includes('/notes/')) {
      const body = (request.postDataJSON() as { text: string }).text
      savedNotes.push(body)
      return json({ status: 'saved', version: 1, body })
    }
    return route.continue()
  })
}

test('steps through photos with buttons and keys, loading the next page and keeping typed notes', async ({ page }) => {
  const savedNotes: string[] = []
  await mockNavigationAlbum(page, savedNotes)
  await page.goto(`/album/${albumId}`)
  await page.getByRole('button', { name: 'Mở ảnh Nav 0.JPG' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nav 0.JPG' })
  await expect(dialog.getByText('1 / 3')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ảnh trước' })).toHaveCount(0)
  await page.getByLabel('Ghi chú chỉnh sửa').fill('Làm mịn da')
  await page.getByRole('button', { name: 'Ảnh tiếp theo' }).click()
  await expect(page.getByRole('dialog', { name: 'Nav 1.JPG' })).toBeVisible()
  expect(savedNotes).toEqual(['Làm mịn da'])
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('dialog', { name: 'Nav 2.JPG' })).toBeVisible()
  await expect(page.getByText('3 / 3')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ảnh tiếp theo' })).toHaveCount(0)
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('dialog', { name: 'Nav 1.JPG' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('hearts respond instantly and saves are sent in order; double-click selects in the focus view', async ({ page }) => {
  const selectionPuts: number[] = []
  await mockNavigationAlbum(page, [], selectionPuts)
  await page.goto(`/album/${albumId}`)
  await expect(page.getByText('1 ảnh đã chọn')).toBeVisible()
  await page.getByRole('button', { name: 'Chọn Nav 1.JPG' }).click()
  await page.getByRole('button', { name: 'Bỏ chọn Nav 0.JPG' }).click()
  await expect(page.getByRole('button', { name: 'Bỏ chọn Nav 1.JPG' })).toBeVisible()
  await expect.poll(() => selectionPuts).toEqual([1, 2])
  await page.getByRole('button', { name: 'Mở ảnh Nav 0.JPG' }).click()
  await page.getByRole('dialog').getByRole('img', { name: 'Nav 0.JPG' }).dblclick()
  await expect(page.getByRole('button', { name: '♥ Đã chọn' })).toBeVisible()
  await expect.poll(() => selectionPuts).toEqual([1, 2, 3])
})

test.describe('focus view on mobile', () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true })

  test('fits the photo to the screen and swipes to the next photo', async ({ page }) => {
    await mockNavigationAlbum(page, [])
    await page.goto(`/album/${albumId}`)
    await page.getByRole('button', { name: 'Mở ảnh Nav 1.JPG' }).click()
    const image = page.getByRole('dialog').getByRole('img', { name: 'Nav 1.JPG' })
    await expect(image).toBeVisible()
    const box = (await image.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(390)
    expect(Math.abs(box.width / box.height - 1.5)).toBeLessThan(0.02)
    const stage = { x: 195, y: box.y + box.height / 2 }
    await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y)!
      const touch = (clientX: number) => new Touch({ identifier: 1, target, clientX, clientY: y })
      target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(x + 120)], changedTouches: [touch(x + 120)] }))
      target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [touch(x - 120)] }))
    }, stage)
    await expect(page.getByRole('dialog', { name: 'Nav 2.JPG' })).toBeVisible()
  })
})

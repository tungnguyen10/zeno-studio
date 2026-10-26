import { expect, test } from '@playwright/test'

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
      return route.continue()
    })
    await page.goto(`/album/${albumId}`)
    await page.getByRole('button', { name: 'Mở ảnh A.jpg' }).click()
    await expect(page.getByRole('link', { name: 'Tải ảnh gốc A.jpg' })).toHaveAttribute('href', `/api/album/${albumId}/photos/${photoId}/download`)
  })
}

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
  await page.getByRole('button', { name: 'Chuẩn bị tải 1 ảnh' }).click()
  expect(planCount).toBe(0)
  releaseSave()
  await expect.poll(() => planCount).toBe(1)
})

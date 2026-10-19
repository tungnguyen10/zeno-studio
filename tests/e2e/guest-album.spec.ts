import { expect, test } from '@playwright/test'

const albumId = '22222222-2222-4222-8222-222222222222'
const studioId = '11111111-1111-4111-8111-111111111111'
const adminToken = 'a'.repeat(43)
const customerToken = 'b'.repeat(43)

test('creates a published guest album and shows separate customer and admin links', async ({ page }) => {
  await page.route('**/api/guest/albums', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: albumId, status: 'PUBLISHED', photoCount: 1, adminToken, customerToken }),
  }))
  await page.goto('/')
  await page.getByRole('link', { name: /Tạo album nhanh/ }).click()
  await expect(page.getByRole('button', { name: 'Tạo và xuất bản album' })).toBeEnabled()
  await page.getByLabel('Tên album').fill('Album khách')
  await page.getByLabel('Link folder Drive').fill('https://drive.google.com/drive/folders/folder123')
  await page.getByRole('button', { name: 'Tạo và xuất bản album' }).click()
  await expect(page.getByRole('link', { name: /album\/.*token=/ })).toHaveAttribute('href', `http://127.0.0.1:43627/album/${albumId}?token=${customerToken}`)
  await expect(page.getByRole('link', { name: /guest\/albums\/.*admin-/ })).toHaveAttribute('href', `http://127.0.0.1:43627/guest/albums/${albumId}#admin-${adminToken}`)
  await expect(page.getByText('Hãy lưu lại; hiện chưa thể lấy lại nếu mất.')).toBeVisible()
})

test('exchanges a guest admin link, shares a new customer link, and claims into an owned studio', async ({ page }) => {
  let exchanged = 0
  await page.route(`**/api/guest/albums/${albumId}/access`, route => {
    exchanged++
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ albumId }) })
  })
  await page.route(`**/api/guest/albums/${albumId}`, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: albumId, title: 'Guest album', status: 'PUBLISHED', expiresAt: '2026-10-30T00:00:00.000Z', canFinalize: true, hasResults: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null }, photoCount: 0, selectedCount: 0 }),
  }))
  await page.route(/\/api\/(guest|studio\/[^/]+)\/albums\/[^/]+\/photos/, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null, total: 0, selectedCount: 0 }),
  }))
  await page.route(`**/api/guest/albums/${albumId}/share`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ customerToken }),
  }))
  await page.route('**/api/auth/get-session', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'owner', name: 'Owner', email: 'owner@example.com', emailVerified: true }, session: { id: 'session', userId: 'owner' } }),
  }))
  await page.route('**/api/studio', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ studios: [{ id: studioId, role: 'owner' }] }),
  }))
  await page.route(`**/api/guest/albums/${albumId}/claim`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ albumId, studioId }),
  }))
  await page.route(`**/api/studio/${studioId}/albums/${albumId}`, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: albumId, title: 'Guest album', status: 'PUBLISHED', expiresAt: '2026-10-30T00:00:00.000Z', canFinalize: true, hasResults: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null }, photoCount: 0, selectedCount: 0 }),
  }))
  await page.goto(`/guest/albums/${albumId}#admin-${adminToken}`)
  await expect(page.getByRole('button', { name: 'Cấp link khách mới' })).toBeVisible()
  await expect(page).toHaveURL(`http://127.0.0.1:43627/guest/albums/${albumId}`)
  expect(exchanged).toBe(1)
  await page.getByRole('button', { name: 'Cấp link khách mới' }).click()
  await expect(page.getByRole('link', { name: /album\/.*token=/ })).toHaveAttribute('href', `http://127.0.0.1:43627/album/${albumId}?token=${customerToken}`)
  await page.getByRole('button', { name: 'Nhận album vào tài khoản' }).click()
  await expect(page).toHaveURL(`http://127.0.0.1:43627/studio/albums/${albumId}?studio=${studioId}`)
})

test('exports guest results and sends review and delivery from the management page', async ({ page }) => {
  let reviewRequests = 0
  let deliveryRequests = 0
  let workflowStatus: 'ready' | 'approved' | 'delivered' = 'ready'
  await page.route(`**/api/guest/albums/${albumId}/results?*`, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ selectionVersionId: '33333333-3333-4333-8333-333333333333', finalizedAt: '2026-10-17T00:00:00Z', versionNumber: 1, total: 1, notesCount: 0, nextCursor: null, items: [{ photoId: 'photo-1', filename: '01.jpg', notes: [] }] }),
  }))
  await page.route(url => url.pathname === `/api/guest/albums/${albumId}/results/export` && url.searchParams.get('format') === 'selection-csv', route => route.fulfill({
    status: 200, headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="selection.csv"' }, body: 'photo_id,filename\r\nphoto-1,01.jpg\r\n',
  }))
  await page.route(`**/api/guest/albums/${albumId}/production`, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ canDeliver: true, review: workflowStatus === 'ready' ? null : { roundNumber: 1, status: 'APPROVED' }, items: [{ id: 'task-1', filename: '01.jpg', status: workflowStatus === 'ready' ? 'WAITING_REVIEW' : workflowStatus === 'approved' ? 'APPROVED' : 'DELIVERED' }] }),
  }))
  await page.route(`**/api/guest/albums/${albumId}/review`, route => {
    reviewRequests++
    workflowStatus = 'approved'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ roundNumber: 1 }) })
  })
  await page.route(`**/api/guest/albums/${albumId}/delivery`, route => {
    deliveryRequests++
    workflowStatus = 'delivered'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ versionNumber: 1 }) })
  })
  await page.goto(`/guest/albums/${albumId}/results`)
  await expect(page.getByRole('heading', { name: '01.jpg' })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByText('Xuất danh sách / ghi chú').click()
  await page.getByRole('button', { name: 'Selection CSV' }).click()
  expect((await download).suggestedFilename()).toBe('selection.csv')
  await page.getByRole('navigation', { name: 'Các bước xử lý' }).getByRole('link', { name: 'Duyệt & bàn giao' }).click()
  await expect(page.getByRole('button', { name: 'Đánh dấu hoàn tất' })).toBeHidden()
  await page.getByLabel('Link folder Google Drive').fill('https://drive.google.com/drive/folders/edited')
  await page.getByRole('button', { name: 'Mở vòng duyệt' }).click()
  await expect(page.getByText('Đã mở vòng duyệt 1.')).toBeVisible()
  expect(reviewRequests).toBe(1)
  await page.getByLabel('Link Drive thành phẩm').fill('https://drive.google.com/drive/folders/final')
  await page.getByRole('button', { name: 'Đánh dấu hoàn tất' }).click()
  await expect(page.getByText('Đã bàn giao album.')).toBeVisible()
  expect(deliveryRequests).toBe(1)
})

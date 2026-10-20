import { expect, test } from '@playwright/test'

const studioId = '11111111-1111-4111-8111-111111111111'
const draftId = '33333333-3333-4333-8333-333333333333'
const publishedId = '22222222-2222-4222-8222-222222222222'
const expiresAt = '2099-01-01T00:00:00.000Z'

test('studio owner sorts, edits, archives, restores, and deletes drafts from the list', async ({ page }) => {
  let albums = [
    { id: publishedId, title: 'Zebra', status: 'PUBLISHED', photoCount: 2, selectedCount: 0, selectionLimit: 3, latestVersionNumber: null, expiresAt, archivedAt: null },
    { id: draftId, title: 'An', status: 'DRAFT', photoCount: 2, selectedCount: 0, selectionLimit: 3, latestVersionNumber: null, expiresAt, archivedAt: null },
  ]
  await page.route('**/api/auth/get-session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'studio-user', name: 'Studio Mẫu', email: 'studio@example.com', emailVerified: true }, session: { id: 'session', userId: 'studio-user' } }) }))
  await page.route('**/api/studio', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ studios: [{ id: studioId, name: 'Studio Mẫu', role: 'owner' }] }) }))
  await page.route(`**/api/studio/${studioId}/albums`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ albums }) }))
  await page.route(`**/api/studio/${studioId}/albums/${draftId}`, route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: { limitKind: 'maximum', limitMin: null, limitMax: 3, durationDays: 15 } }) })
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as { title: string }
      albums = albums.map(item => item.id === draftId ? { ...item, title: body.title } : item)
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    }
    albums = albums.filter(item => item.id !== draftId)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.route(`**/api/studio/${studioId}/albums/${publishedId}/archive`, route => {
    albums = albums.map(item => item.id === publishedId ? { ...item, archivedAt: new Date().toISOString() } : item)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.route(`**/api/studio/${studioId}/albums/${publishedId}/restore`, route => {
    albums = albums.map(item => item.id === publishedId ? { ...item, archivedAt: null } : item)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })

  await page.goto('/studio')
  await expect(page.getByRole('table')).toBeVisible()
  const sort = page.getByRole('combobox', { name: 'Sắp xếp album' })
  await sort.focus()
  await sort.press('ArrowDown')
  await expect(sort).toHaveAttribute('aria-expanded', 'true')
  await sort.press('Enter')
  await expect(sort).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('tbody tr th').first()).toContainText('An')
  await page.getByRole('button', { name: 'Tùy chọn An' }).click()
  await page.getByRole('button', { name: 'Sửa album' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByLabel('Tên album').fill('Album mới')
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Album mới' })).toBeVisible()

  await page.getByRole('button', { name: 'Tùy chọn Zebra' }).click()
  await page.getByRole('button', { name: 'Lưu trữ', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Zebra' })).toHaveCount(0)
  await page.getByRole('button', { name: /Đã lưu trữ/ }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Zebra' })).toBeVisible()
  await page.getByRole('button', { name: 'Tùy chọn Zebra' }).click()
  await page.getByRole('button', { name: 'Khôi phục' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Zebra' })).toHaveCount(0)
  await page.getByRole('button', { name: /Đang quản lý/ }).click()
  await page.getByRole('button', { name: 'Tùy chọn Album mới' }).click()
  await page.getByRole('button', { name: 'Xóa bản nháp' }).click()
  await expect(page.getByRole('dialog')).toContainText('không thể hoàn tác')
  await page.getByRole('dialog').getByRole('button', { name: 'Xóa bản nháp' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Album mới' })).toHaveCount(0)
})

test('studio album list uses cards on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/auth/get-session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'studio-user', name: 'Studio Mẫu', email: 'studio@example.com', emailVerified: true }, session: { id: 'session', userId: 'studio-user' } }) }))
  await page.route('**/api/studio', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ studios: [{ id: studioId, name: 'Studio Mẫu', role: 'owner' }] }) }))
  await page.route(`**/api/studio/${studioId}/albums`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ albums: [{ id: draftId, title: 'Album mobile', status: 'DRAFT', photoCount: 2, selectedCount: 0, selectionLimit: 3, latestVersionNumber: null, expiresAt, archivedAt: null }] }) }))
  await page.goto('/studio')
  await expect(page.getByRole('article').filter({ hasText: 'Album mobile' })).toBeVisible()
  await expect(page.getByRole('table', { includeHidden: true })).toBeHidden()
})

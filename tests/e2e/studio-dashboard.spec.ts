import { expect, test, type Page, type Route } from '@playwright/test'

const studioId = '11111111-1111-4111-8111-111111111111'
const otherStudioId = '44444444-4444-4444-8444-444444444444'
const customerToken = 'c'.repeat(43)
const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

const base = { selectedCount: 0, selectionLimit: null, latestVersionNumber: null, photoCount: 20 }
const albums = [
  { ...base, id: 'a0000000-0000-4000-8000-000000000001', title: 'Đám cưới Lan', status: 'DRAFT', expiresAt: inDays(10) },
  { ...base, id: 'a0000000-0000-4000-8000-000000000002', title: 'Mai & Quang', status: 'PUBLISHED', expiresAt: inDays(2), selectedCount: 12, selectionLimit: 30 },
  { ...base, id: 'a0000000-0000-4000-8000-000000000003', title: 'Sinh nhật Bin', status: 'FINALIZED', expiresAt: inDays(20), latestVersionNumber: 2 },
  { ...base, id: 'a0000000-0000-4000-8000-000000000004', title: 'Gia đình Hoa', status: 'DELIVERED', expiresAt: inDays(20) },
  { ...base, id: 'a0000000-0000-4000-8000-000000000005', title: 'Album cũ', status: 'PUBLISHED', expiresAt: inDays(-1) },
]

async function signIn(page: Page, studios = [{ id: studioId, name: 'Studio Mẫu', role: 'owner' }]) {
  await page.route('**/api/auth/get-session', route => json(route, { user: { id: 'owner', name: 'Chủ studio', email: 'owner@example.com', emailVerified: true }, session: { id: 's', userId: 'owner' } }))
  await page.route('**/api/studio', route => json(route, { studios }))
}

test.describe('studio dashboard', () => {
  test('shows next steps, filters by status and searches without accents', async ({ page }) => {
    await signIn(page)
    await page.route(`**/api/studio/${studioId}/albums`, route => json(route, { albums }))
    await page.goto('/studio')

    await expect(page.getByRole('heading', { name: 'Album', level: 1 })).toBeVisible()
    await expect(page.locator('tbody tr')).toHaveCount(5)
    const filters = page.getByRole('group', { name: 'Lọc album theo trạng thái' })
    await expect(filters.getByRole('button', { name: /Tất cả/ })).toContainText('5')
    await expect(filters.getByRole('button', { name: /Hết hạn/ })).toContainText('1')

    const picking = page.getByRole('row').filter({ hasText: 'Mai & Quang' })
    await expect(picking).toContainText('Khách đã chọn 12/30 ảnh')
    await expect(picking).toContainText('Còn 2 ngày')
    await expect(picking.getByRole('link', { name: 'Xem & chốt ảnh' })).toHaveAttribute('href', `/studio/albums/${albums[1]!.id}?studio=${studioId}`)

    const finalized = page.getByRole('row').filter({ hasText: 'Sinh nhật Bin' })
    await expect(finalized).toContainText('phiên bản 2')
    await expect(finalized.getByRole('link', { name: 'Xem kết quả' })).toHaveAttribute('href', `/studio/albums/${albums[2]!.id}/results?studio=${studioId}`)

    const expired = page.getByRole('row').filter({ hasText: 'Album cũ' })
    await expect(expired).toContainText('Đã hết hạn')
    await expect(expired.getByRole('button', { name: 'Sao chép link khách' })).toHaveCount(0)

    await filters.getByRole('button', { name: /Đã chốt/ }).click()
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.getByText('Hiển thị 1/5 album')).toBeVisible()

    await filters.getByRole('button', { name: /Tất cả/ }).click()
    await page.getByRole('searchbox', { name: 'Tìm album theo tên' }).fill('dam cuoi')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody tr')).toContainText('Đám cưới Lan')

    await page.getByRole('searchbox', { name: 'Tìm album theo tên' }).fill('không có')
    await expect(page.getByText('Không có album phù hợp')).toBeVisible()
    await page.getByRole('button', { name: 'Xóa bộ lọc' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(5)
  })

  test('shows an empty state with a create action', async ({ page }) => {
    await signIn(page)
    await page.route(`**/api/studio/${studioId}/albums`, route => json(route, { albums: [] }))
    await page.goto('/studio')
    await expect(page.getByRole('heading', { name: 'Chưa có album nào' })).toBeVisible()
    await page.getByRole('button', { name: 'Tạo album đầu tiên' }).click()
    await expect(page.getByRole('dialog', { name: 'Tạo album từ Google Drive' })).toBeVisible()
  })

  test('switches between studios and keeps the selection in the URL', async ({ page }) => {
    await signIn(page, [{ id: studioId, name: 'Studio Một', role: 'owner' }, { id: otherStudioId, name: 'Studio Hai', role: 'manager' }])
    await page.route(`**/api/studio/${studioId}/albums`, route => json(route, { albums: [albums[0]] }))
    await page.route(`**/api/studio/${otherStudioId}/albums`, route => json(route, { albums: [albums[2]] }))
    await page.goto('/studio')
    await expect(page.locator('tbody tr')).toContainText('Đám cưới Lan')

    await page.getByRole('combobox', { name: 'Chọn studio' }).click()
    await page.getByRole('option', { name: 'Studio Hai' }).click()
    await expect(page.locator('tbody tr')).toContainText('Sinh nhật Bin')
    await expect(page).toHaveURL(new RegExp(`studio=${otherStudioId}`))
    await expect(page.getByRole('link', { name: 'Thành viên' })).toHaveAttribute('href', `/studio/members?studio=${otherStudioId}`)
  })

  test('does not overflow horizontally on a narrow phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 780 })
    await signIn(page, [{ id: studioId, name: 'Studio có một cái tên rất rất dài để kiểm tra', role: 'owner' }])
    await page.route(`**/api/studio/${studioId}/albums`, route => json(route, { albums: [{ ...albums[1], title: 'Tên album rất dài '.repeat(8) }, albums[2]!] }))
    await page.goto('/studio')
    await expect(page.getByRole('article')).toHaveCount(2)
    const statusFilters = page.getByRole('group', { name: 'Lọc album theo trạng thái' })
    for (const width of [320, 360, 384]) {
      await page.setViewportSize({ width, height: 780 })
      const filterOverflow = await statusFilters.evaluate(element => element.scrollWidth - element.clientWidth)
      expect(filterOverflow).toBeLessThanOrEqual(0)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(0)
    }
  })
})

test.describe('create album dialog', () => {
  test('creates a draft, publishes it from the dialog and returns focus on Escape', async ({ page }) => {
    await signIn(page)
    let created: unknown
    let listed = [] as typeof albums
    let published = 0
    const newAlbum = { ...base, id: 'b0000000-0000-4000-8000-000000000001', title: 'Album mới', status: 'DRAFT', expiresAt: inDays(15), photoCount: 3, selectionLimit: 40 }
    await page.route(`**/api/studio/${studioId}/albums`, route => {
      if (route.request().method() === 'POST') {
        created = route.request().postDataJSON()
        listed = [newAlbum] as typeof albums
        return json(route, { album: newAlbum })
      }
      return json(route, { albums: listed })
    })
    await page.route(`**/api/studio/${studioId}/albums/${newAlbum.id}/publish`, route => {
      published++
      listed = [{ ...newAlbum, status: 'PUBLISHED' }] as typeof albums
      return json(route, { customerToken })
    })
    await page.goto('/studio')

    const open = page.getByRole('button', { name: 'Tạo album', exact: true })
    await open.click()
    const dialog = page.getByRole('dialog', { name: 'Tạo album từ Google Drive' })
    await expect(dialog.getByLabel('Tên album')).toBeFocused()
    await dialog.getByLabel('Tên album').fill('Album mới')
    await dialog.getByLabel('Link folder Drive').fill('https://drive.google.com/drive/folders/abc')
    await dialog.getByLabel('Tối đa ảnh chọn').fill('40')
    await dialog.getByRole('combobox', { name: 'Hạn album' }).click()
    await dialog.getByRole('option', { name: '15 ngày' }).click()
    await dialog.getByRole('button', { name: 'Tạo album nháp' }).click()

    const done = page.getByRole('dialog', { name: 'Album đã được tạo' })
    await expect(done).toBeVisible()
    expect(created).toEqual({ title: 'Album mới', folderUrl: 'https://drive.google.com/drive/folders/abc', expiresInDays: 15, limit: { kind: 'maximum', count: 40 } })
    await expect(page.getByRole('row').filter({ hasText: 'Album mới' })).toContainText('Nháp')

    await done.getByRole('button', { name: 'Xuất bản' }).click()
    await expect(done.getByRole('link', { name: /album\/.*token=/ })).toHaveAttribute('href', `http://127.0.0.1:43627/album/${newAlbum.id}?token=${customerToken}`)
    expect(published).toBe(1)
    await expect(page.getByRole('row').filter({ hasText: 'Album mới' })).toContainText('Khách đang chọn')

    await page.keyboard.press('Escape')
    await expect(done).toBeHidden()
    await expect(open).toBeFocused()
  })

  test('shows the server error and keeps the form', async ({ page }) => {
    await signIn(page)
    await page.route(`**/api/studio/${studioId}/albums`, route => route.request().method() === 'POST'
      ? json(route, { statusMessage: 'Thư mục Drive không có ảnh có thể sử dụng' }, 400)
      : json(route, { albums: [] }))
    await page.goto('/studio')
    await page.getByRole('button', { name: 'Tạo album đầu tiên' }).click()
    const dialog = page.getByRole('dialog', { name: 'Tạo album từ Google Drive' })
    await dialog.getByLabel('Tên album').fill('Lỗi')
    await dialog.getByLabel('Link folder Drive').fill('https://drive.google.com/drive/folders/abc')
    await dialog.getByRole('button', { name: 'Tạo album nháp' }).click()
    await expect(dialog.getByRole('alert')).toContainText('Thư mục Drive không có ảnh có thể sử dụng')
    await expect(dialog.getByLabel('Tên album')).toHaveValue('Lỗi')
  })
})

test.describe('studio members', () => {
  const members = [{ userId: 'owner', email: 'owner@example.com', role: 'owner' }, { userId: 'u2', email: 'retoucher@example.com', role: 'retoucher' }]
  const invitations = [{ id: 'i1', email: 'new@example.com', role: 'member', expiresAt: inDays(5), acceptedAt: null, revokedAt: null }]

  test('asks for confirmation before removing a member or revoking an invitation', async ({ page }) => {
    await signIn(page)
    let removed = 0
    let revoked = 0
    await page.route(`**/api/studio/${studioId}/members`, route => json(route, { members }))
    await page.route(`**/api/studio/${studioId}/invitations`, route => json(route, { invitations }))
    await page.route(`**/api/studio/${studioId}/members/u2`, route => { removed++; return json(route, { ok: true }) })
    await page.route(`**/api/studio/${studioId}/invitations/i1`, route => { revoked++; return json(route, { ok: true }) })
    await page.goto(`/studio/members?studio=${studioId}`)

    await expect(page.getByRole('heading', { name: 'Mời người mới' })).toBeVisible()
    await expect(page.getByText('Thành viên · Hết hạn')).toBeVisible()

    await page.getByRole('button', { name: 'Thu hồi', exact: true }).click()
    const confirm = page.getByRole('dialog', { name: 'Thu hồi quyền thành viên?' })
    await expect(confirm).toContainText('retoucher@example.com')
    await confirm.getByRole('button', { name: 'Hủy' }).click()
    await expect(confirm).toBeHidden()
    expect(removed).toBe(0)

    await page.getByRole('button', { name: 'Thu hồi', exact: true }).click()
    await confirm.getByRole('button', { name: 'Thu hồi', exact: true }).click()
    await expect.poll(() => removed).toBe(1)

    await page.getByRole('button', { name: 'Thu hồi lời mời' }).click()
    await page.getByRole('dialog', { name: 'Thu hồi lời mời?' }).getByRole('button', { name: 'Thu hồi lời mời' }).click()
    await expect.poll(() => revoked).toBe(1)
  })

  test('hides member management from roles that cannot manage', async ({ page }) => {
    await signIn(page, [{ id: studioId, name: 'Studio Mẫu', role: 'member' }])
    await page.goto(`/studio/members?studio=${studioId}`)
    await expect(page.getByText('Bạn không có quyền quản lý thành viên của studio này.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mời người mới' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Thành viên' })).toHaveCount(0)
  })
})

test.describe('studio album detail', () => {
  test('offers publish and share from the detail page and keeps the studio on the way back', async ({ page }) => {
    await signIn(page)
    const albumId = albums[1]!.id
    await page.route(`**/api/studio/${studioId}/albums/${albumId}`, route => json(route, {
      id: albumId, title: 'Mai & Quang', status: 'PUBLISHED', expiresAt: inDays(5), canFinalize: true, hasResults: false, previousCount: 0,
      settings: { limitKind: 'maximum', limitMin: null, limitMax: 30 }, photoCount: 0, selectedCount: 0,
    }))
    await page.route(`**/api/studio/${studioId}/albums/${albumId}/photos?*`, route => json(route, { items: [], nextCursor: null, total: 0, selectedCount: 0 }))
    await page.route(`**/api/studio/${studioId}/albums/${albumId}/share`, route => json(route, { customerToken }))
    await page.goto(`/studio/albums/${albumId}?studio=${studioId}`)

    await expect(page.getByRole('heading', { name: 'Mai & Quang' })).toBeVisible()
    const steps = page.getByRole('list', { name: 'Tiến trình album' })
    await expect(steps.getByRole('listitem').filter({ hasText: 'Khách chọn ảnh' })).toHaveAttribute('aria-current', 'step')
    await page.getByRole('button', { name: 'Sao chép link khách' }).click()
    await expect(page.getByRole('link', { name: /album\/.*token=/ })).toHaveAttribute('href', `http://127.0.0.1:43627/album/${albumId}?token=${customerToken}`)
    await expect(page.getByRole('link', { name: '← Album' })).toHaveAttribute('href', `/studio?studio=${studioId}`)
  })
})

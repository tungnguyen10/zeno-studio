import { expect, test, type Page, type Route } from '@playwright/test'

const albumId = '88888888-8888-4888-8888-888888888888'
const studioId = '99999999-9999-4999-8999-999999999999'
const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

function gate() {
  let release: () => void = () => {}
  const opened = new Promise<void>(resolve => { release = resolve })
  return { opened, release }
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `test-results/skeleton-${name}.png` })
}

const viewports = [
  { name: 'mobile', viewport: { width: 390, height: 844 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
]

for (const { name, viewport } of viewports) {
  test.describe(`page skeletons on ${name}`, () => {
    test.use({ viewport })

    test('customer album shows a skeleton until the album opens', async ({ page }) => {
      const wait = gate()
      await page.route(`**/api/album/${albumId}/**`, async route => {
        const path = new URL(route.request().url()).pathname
        if (path.endsWith('/access')) {
          await wait.opened
          return json(route, { album: { id: albumId, title: 'Album skeleton', status: 'PUBLISHED', expiresAt: '2030-01-01T00:00:00Z', joined: true, canJoin: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null } } })
        }
        if (path.endsWith('/photos')) return json(route, { items: [], nextCursor: null, total: 0, selectedCount: 0 })
        if (path.endsWith('/selection')) return json(route, { version: 0, selectedPhotoIds: [] })
        return route.continue()
      })
      await page.goto(`/album/${albumId}`)
      await expect(page.getByRole('status', { name: 'Đang mở album' })).toBeVisible()
      await capture(page, `${name}-album`)
      wait.release()
      await expect(page.getByRole('heading', { name: 'Album skeleton' })).toBeVisible()
      await expect(page.getByRole('status', { name: 'Đang mở album' })).toHaveCount(0)
    })

    test('studio home shows a skeleton while checking the session and loading the studio', async ({ page }) => {
      const session = gate()
      const studio = gate()
      await page.route('**/api/auth/get-session', async route => {
        await session.opened
        return json(route, { user: { id: 'owner', name: 'Owner', email: 'owner@example.com', emailVerified: true }, session: { id: 's', userId: 'owner' } })
      })
      await page.route('**/api/studio', async route => {
        await studio.opened
        return json(route, { studios: [{ id: studioId, name: 'Studio Mẫu', role: 'owner' }] })
      })
      await page.route(`**/api/studio/${studioId}/albums`, route => json(route, { albums: [] }))
      await page.goto('/studio')
      await expect(page.getByRole('status', { name: 'Đang kiểm tra đăng nhập' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toHaveCount(0)
      await capture(page, `${name}-studio-session`)
      session.release()
      await expect(page.getByRole('status', { name: 'Đang tải không gian studio' })).toBeVisible()
      await capture(page, `${name}-studio-workspace`)
      studio.release()
      await expect(page.getByText('Studio Mẫu', { exact: true })).toBeVisible()
    })

    test('members page shows a skeleton until members load', async ({ page }) => {
      const wait = gate()
      await page.route('**/api/studio', async route => {
        await wait.opened
        return json(route, { studios: [{ id: studioId, name: 'Studio Mẫu', role: 'owner' }] })
      })
      await page.route(`**/api/studio/${studioId}/members`, route => json(route, { members: [{ userId: 'owner', email: 'owner@example.com', role: 'owner' }] }))
      await page.route(`**/api/studio/${studioId}/invitations`, route => json(route, { invitations: [] }))
      await page.goto(`/studio/members?studio=${studioId}`)
      await expect(page.getByRole('status', { name: 'Đang tải thành viên' })).toBeVisible()
      await capture(page, `${name}-members`)
      wait.release()
      await expect(page.getByRole('heading', { name: 'Mời người mới' })).toBeVisible()
      await expect(page.getByRole('status', { name: 'Đang tải thành viên' })).toHaveCount(0)
    })

    test('invite page shows a skeleton while checking the invitation', async ({ page }) => {
      const wait = gate()
      await page.route('**/api/auth/get-session', async route => {
        await wait.opened
        return json(route, null)
      })
      await page.goto(`/studio/invite?token=${'a'.repeat(43)}`)
      await expect(page.getByRole('status', { name: 'Đang kiểm tra lời mời' })).toBeVisible()
      await capture(page, `${name}-invite`)
      wait.release()
      await expect(page.getByRole('link', { name: 'Đăng nhập / tạo tài khoản' })).toBeVisible()
    })

    test('results page shows a skeleton until results load', async ({ page }) => {
      const wait = gate()
      await page.route(`**/api/guest/albums/${albumId}/results?*`, async route => {
        await wait.opened
        return json(route, { selectionVersionId: '11111111-1111-4111-8111-111111111111', finalizedAt: '2026-10-17T00:00:00.000Z', versionNumber: 1, total: 1, notesCount: 0, nextCursor: null, items: [{ photoId: 'photo-1', filename: '01.jpg', notes: [] }] })
      })
      await page.goto(`/guest/albums/${albumId}/results`)
      await expect(page.getByRole('status', { name: 'Đang tải kết quả' })).toBeVisible()
      await capture(page, `${name}-results`)
      wait.release()
      await expect(page.getByRole('heading', { name: '01.jpg' })).toBeVisible()
    })
  })
}

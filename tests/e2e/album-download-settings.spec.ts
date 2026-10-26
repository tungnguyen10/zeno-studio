import { expect, test } from '@playwright/test'

const studioId = '33333333-3333-4333-8333-333333333333'
const albumId = '44444444-4444-4444-8444-444444444444'
const initial = { enabled: false, allowSingle: true, allowSelected: true, allowAll: false, availableWhen: 'anytime' }

for (const context of ['studio', 'guest'] as const) {
  test(`${context} can save album download rights`, async ({ page }) => {
    const apiRoot = context === 'studio' ? `/api/studio/${studioId}/albums/${albumId}` : `/api/guest/albums/${albumId}`
    const pageUrl = context === 'studio' ? `/studio/albums/${albumId}?studio=${studioId}` : `/guest/albums/${albumId}`
    let settings = { ...initial }
    await page.route(`**${apiRoot}`, route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        id: albumId, title: 'Download settings', status: 'PUBLISHED', expiresAt: '2030-01-01T00:00:00Z',
        canFinalize: true, canEditDownloadSettings: true, hasResults: false, previousCount: 0,
        settings: { limitKind: 'unlimited', limitMin: null, limitMax: null }, downloadSettings: settings,
        photoCount: 0, selectedCount: 0,
      }),
    }))
    await page.route(`**${apiRoot}/photos?*`, route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null, total: 0, selectedCount: 0 }),
    }))
    await page.route(`**${apiRoot}/download`, route => {
      settings = route.request().postDataJSON() as typeof settings
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })
    await page.goto(pageUrl)
    await page.getByRole('checkbox', { name: 'Cho khách tải ảnh gốc' }).check()
    await page.getByRole('checkbox', { name: 'Toàn album' }).check()
    await page.getByLabel('Thời điểm cho tải').selectOption('after_finalize')
    await page.getByRole('button', { name: 'Lưu quyền tải' }).click()
    await expect(page.getByText('Đã lưu quyền tải ảnh.')).toBeVisible()
    expect(settings).toEqual({ ...initial, enabled: true, allowAll: true, availableWhen: 'after_finalize' })
    await page.reload()
    await expect(page.getByRole('checkbox', { name: 'Cho khách tải ảnh gốc' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Toàn album' })).toBeChecked()
  })
}

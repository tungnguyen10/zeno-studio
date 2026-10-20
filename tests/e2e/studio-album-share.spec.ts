import { expect, test } from '@playwright/test'

const studioId = '11111111-1111-4111-8111-111111111111'
const publishedId = '22222222-2222-4222-8222-222222222222'
const draftId = '33333333-3333-4333-8333-333333333333'
const customerToken = 'a'.repeat(43)
const expiresAt = '2099-01-01T00:00:00.000Z'
const progress = { expiresAt, selectedCount: 0, selectionLimit: null, latestVersionNumber: null }

test('studio album list can reveal a fresh customer share link on the published row', async ({ page }) => {
  let shareRequests = 0
  await page.route('**/api/auth/get-session', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'studio-user', name: 'Studio Mẫu', email: 'studio@example.com', emailVerified: true }, session: { id: 'session', userId: 'studio-user' } }),
  }))
  await page.route('**/api/studio', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ studios: [{ id: studioId, name: 'Studio Mẫu', role: 'owner' }] }),
  }))
  await page.route(`**/api/studio/${studioId}/albums`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ albums: [
      { id: publishedId, title: 'Album đã xuất bản', status: 'PUBLISHED', photoCount: 2, ...progress },
      { id: draftId, title: 'Album nháp', status: 'DRAFT', photoCount: 2, ...progress },
    ] }),
  }))
  await page.route(`**/api/studio/${studioId}/albums/${publishedId}/share`, route => {
    shareRequests++
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ customerToken }) })
  })

  await page.goto('/studio')
  const published = page.getByRole('article').filter({ hasText: 'Album đã xuất bản' })
  await expect(published.getByRole('button', { name: 'Sao chép link khách' })).toBeVisible()
  const draft = page.getByRole('article').filter({ hasText: 'Album nháp' })
  await expect(draft.getByRole('button', { name: 'Sao chép link khách' })).toHaveCount(0)
  await published.getByRole('button', { name: 'Sao chép link khách' }).click()
  await expect(published.getByRole('link', { name: /album\/.*token=/ })).toHaveAttribute('href', `http://127.0.0.1:43627/album/${publishedId}?token=${customerToken}`)
  await expect(published.getByRole('button', { name: 'Sao chép lại link' })).toBeVisible()
  expect(shareRequests).toBe(1)

  // Reopening the page should reuse the cached link instead of minting another customer token.
  await page.reload()
  const publishedAfterReload = page.getByRole('article').filter({ hasText: 'Album đã xuất bản' })
  await expect(publishedAfterReload.getByRole('link', { name: /album\/.*token=/ })).toHaveAttribute('href', `http://127.0.0.1:43627/album/${publishedId}?token=${customerToken}`)
  expect(shareRequests).toBe(1)
})

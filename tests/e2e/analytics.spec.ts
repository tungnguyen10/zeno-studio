import { expect, test, type Page } from '@playwright/test'
import { CONSENT_KEY } from '../../app/lib/analytics-consent'

async function commands(page: Page): Promise<unknown[][]> {
  return page.evaluate(() => ((window as Window & { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [])
    .map(command => Array.from(command)))
}

async function views(page: Page): Promise<unknown[][]> {
  return (await commands(page)).filter(call => call[0] === 'event' && call[1] === 'page_view')
}

async function interceptGoogle(page: Page, blocked = false) {
  const requests: string[] = []
  await page.route(/https:\/\/(?:[^/]+\.)?(?:googletagmanager\.com|google-analytics\.com|analytics\.google\.com)\//, route => {
    requests.push(route.request().url())
    return blocked ? route.abort() : route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
  })
  return requests
}

async function persistConsent(page: Page, choice: 'accepted' | 'rejected') {
  await page.addInitScript(({ key, choice }) => localStorage.setItem(key, choice), { key: CONSENT_KEY, choice })
}

test('loads only after consent and reports safe manual views', async ({ page, baseURL }) => {
  const requests = await interceptGoogle(page)
  await page.goto('/?token=secret#private-fragment')
  await expect(page.getByRole('button', { name: 'Đồng ý', exact: true })).toBeVisible()
  expect(requests).toEqual([])
  expect(await commands(page)).toEqual([])
  await page.getByRole('button', { name: 'Đồng ý', exact: true }).click()
  await expect.poll(() => requests.length).toBe(1)
  await expect.poll(async () => (await views(page)).length).toBe(1)
  const commandTypes = await page.evaluate(() =>
    ((window as Window & { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [])
      .map(command => Object.prototype.toString.call(command)))
  expect(commandTypes).toEqual(Array(commandTypes.length).fill('[object Arguments]'))
  const queued = await commands(page)
  expect(queued.slice(0, 2)).toEqual([
    ['consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied' }],
    ['consent', 'update', { analytics_storage: 'granted' }],
  ])
  expect(queued.find(call => call[0] === 'config')?.[2]).toEqual(expect.objectContaining({ send_page_view: false, page_location: `${baseURL}/`, page_title: 'Trang chủ' }))
  await page.getByRole('link', { name: /Tạo album nhanh/ }).first().click()
  await expect(page).toHaveURL(/\/create$/)
  await expect.poll(async () => (await views(page)).length).toBe(2)
  expect((await views(page))[1]?.[2]).toEqual({ page_location: `${baseURL}/create`, page_title: 'Tạo album', page_referrer: `${baseURL}/` })
  await page.evaluate(() => history.replaceState(history.state, '', '?token=query-secret#fragment-secret'))
  // Flush browser tasks so a history listener has an opportunity to run.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await views(page)).toHaveLength(2)
  expect(requests).toHaveLength(1)
  expect(JSON.stringify(await commands(page))).not.toMatch(/secret|private-fragment/)
})

test('persisted acceptance reports exactly one safe view in a new document', async ({ page, baseURL }) => {
  const requests = await interceptGoogle(page)
  await persistConsent(page, 'accepted')
  await page.goto('/create?token=secret')
  await expect.poll(async () => (await views(page)).length).toBe(1)
  expect(requests).toHaveLength(1)
  expect((await views(page))[0]?.[2]).toEqual({ page_location: `${baseURL}/create`, page_title: 'Tạo album' })
  expect(JSON.stringify(await commands(page))).not.toContain('secret')
})

test('rejection persists and sends no Google requests across reload', async ({ page }) => {
  const requests = await interceptGoogle(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Từ chối', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Cài đặt phân tích', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Đồng ý', exact: true })).toHaveCount(0)
  expect(await page.evaluate(key => localStorage.getItem(key), CONSENT_KEY)).toBe('rejected')
  expect(requests).toEqual([])
  expect(await commands(page)).toEqual([])
})

test('revoking active consent reloads and prevents further collection', async ({ page }) => {
  const requests = await interceptGoogle(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Đồng ý', exact: true }).click()
  await expect.poll(async () => (await views(page)).length).toBe(1)
  await page.getByRole('button', { name: 'Cài đặt phân tích', exact: true }).click()
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Từ chối', exact: true }).click(),
  ])
  await expect(page.getByRole('button', { name: 'Cài đặt phân tích', exact: true })).toBeVisible()
  expect(await commands(page)).toEqual([])
  expect(await page.evaluate(key => localStorage.getItem(key), CONSENT_KEY)).toBe('rejected')
  await page.getByRole('link', { name: /Tạo album nhanh/ }).first().click()
  await expect(page).toHaveURL(/\/create$/)
  expect(await commands(page)).toEqual([])
  expect(requests).toHaveLength(1)
})

test('blocked tag does not prevent application navigation', async ({ page }) => {
  const requests = await interceptGoogle(page, true)
  await persistConsent(page, 'accepted')
  await page.goto('/')
  await expect.poll(() => requests.length).toBe(1)
  await page.getByRole('link', { name: /Tạo album nhanh/ }).first().click()
  await expect(page).toHaveURL(/\/create$/)
  await expect.poll(async () => (await views(page)).length).toBe(2)
  expect(JSON.stringify(await commands(page))).not.toContain('secret')
})

const workflowAlbumId = '22222222-2222-4222-8222-222222222222'
const workflowPhotoId = '33333333-3333-4333-8333-333333333333'
const workflowToken = 'private-token-value'.repeat(3)
async function events(page: Page, name: string) {
  return (await commands(page)).filter(call => call[0] === 'event' && call[1] === name)
}

for (const succeeds of [true, false]) {
  test(`guest creation reports confirmed events only: success=${succeeds}`, async ({ page }) => {
    await interceptGoogle(page)
    await persistConsent(page, 'accepted')
    let requests = 0
    await page.route('**/api/guest/albums', route => {
      requests++
      return route.fulfill({ status: succeeds ? 200 : 500, contentType: 'application/json', body: JSON.stringify(succeeds
        ? { id: workflowAlbumId, adminToken: workflowToken, customerToken: workflowToken }
        : { statusMessage: 'Creation failed' }) })
    })
    await page.goto('/create')
    await expect(page.getByRole('button', { name: 'Tạo và xuất bản album' })).toBeEnabled()
    await page.getByLabel('Tên album').fill('Private album title')
    await page.getByLabel('Link folder Drive').fill('https://drive.google.com/drive/folders/private-folder')
    await page.getByRole('button', { name: 'Tạo và xuất bản album' }).click()
    if (succeeds) await expect(page.getByRole('region', { name: 'Link album vừa tạo' })).toBeVisible()
    else await expect(page.getByRole('alert')).toBeVisible()
    expect(requests).toBe(1)
    expect(await events(page, 'album_created')).toEqual(succeeds ? [['event', 'album_created', expect.objectContaining({ creation_flow: 'guest' })]] : [])
    expect(await events(page, 'album_published')).toEqual(succeeds ? [['event', 'album_published', expect.objectContaining({ creation_flow: 'guest' })]] : [])
    expect(JSON.stringify(await commands(page))).not.toMatch(/private-|token=|22222222/)
  })
}

async function mockCustomerGallery(page: Page, options: { failPhotos?: boolean; failAccess?: boolean; failSelection?: boolean } = {}) {
  let selected = false
  let version = 0
  await page.addInitScript(() => localStorage.setItem('zeno-gallery-layout', 'grid'))
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"/>' }))
  await page.route(`**/api/album/${workflowAlbumId}/**`, route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return options.failAccess ? json({ statusMessage: 'Access failed' }, 403) : json({ album: {
      id: workflowAlbumId, title: 'Private gallery title', status: 'PUBLISHED', expiresAt: '2099-01-01T00:00:00Z', joined: true, canJoin: false,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
    } })
    if (path.endsWith('/photos')) return options.failPhotos ? json({ statusMessage: 'Photos failed' }, 500) : json({ items: [{ id: workflowPhotoId, sourceFileId: 'private-drive-id', filename: 'Private filename.jpg', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: false }], nextCursor: null, total: 1, selectedCount: 0 })
    if (path.endsWith('/selection')) return json({ version, selectedPhotoIds: selected ? [workflowPhotoId] : [] })
    if (path.endsWith(`/selection/${workflowPhotoId}`)) {
      if (options.failSelection) return json({ statusMessage: 'Selection failed' }, 500)
      selected = (route.request().postDataJSON() as { selected: boolean }).selected
      return json({ status: 'saved', version: ++version, selected, count: selected ? 1 : 0 })
    }
    if (path.endsWith(`/notes/${workflowPhotoId}`)) return route.request().method() === 'PUT'
      ? json({ status: 'saved', version: 1, body: 'Private note' }) : json({ body: '', version: 0 })
    return json({})
  })
}

for (const failure of ['access', 'photos'] as const) {
  test(`does not report an album opened when ${failure} fails`, async ({ page }) => {
    await interceptGoogle(page)
    await persistConsent(page, 'accepted')
    await mockCustomerGallery(page, { failAccess: failure === 'access', failPhotos: failure === 'photos' })
    await page.goto(`/album/${workflowAlbumId}?token=${workflowToken}`)
    await expect(page.getByRole('status', { name: 'Đang mở album' })).toHaveCount(0)
    await expect.poll(async () => (await views(page)).length).toBe(1)
    expect(await events(page, 'album_opened')).toEqual([])
  })
}

test('reports opened gallery, deliberate layout choices and saved selection and note only', async ({ page }) => {
  await interceptGoogle(page)
  await persistConsent(page, 'accepted')
  await mockCustomerGallery(page)
  await page.goto(`/album/${workflowAlbumId}?token=${workflowToken}`)
  await expect(page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true })).toBeEnabled()
  expect(await events(page, 'album_opened')).toHaveLength(1)
  expect(await events(page, 'gallery_view_changed')).toEqual([])
  await page.getByRole('button', { name: 'Lưới', exact: true }).click()
  expect(await events(page, 'gallery_view_changed')).toEqual([])
  await page.getByRole('button', { name: 'Danh sách', exact: true }).click()
  expect(await events(page, 'gallery_view_changed')).toEqual([['event', 'gallery_view_changed', expect.objectContaining({ layout: 'list', surface: 'customer' })]])
  await page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true }).click()
  await expect.poll(async () => await events(page, 'photo_selected')).toEqual([['event', 'photo_selected', expect.objectContaining({ selected_count: 1 })]])
  await page.getByRole('button', { name: 'Mở ảnh Private filename.jpg' }).click()
  await page.getByLabel('Ghi chú chỉnh sửa').fill('Private note')
  await expect.poll(async () => (await events(page, 'photo_note_saved')).length).toBe(1)
  await page.getByRole('button', { name: 'Đóng ảnh' }).click()
  await page.getByRole('button', { name: 'Bỏ chọn Private filename.jpg', exact: true }).click()
  await expect.poll(async () => await events(page, 'photo_unselected')).toEqual([['event', 'photo_unselected', expect.objectContaining({ selected_count: 0 })]])
  await page.waitForTimeout(4200) // One polling cycle must not report another open.
  expect(await events(page, 'album_opened')).toHaveLength(1)
  expect(JSON.stringify(await commands(page))).not.toMatch(/private-|Private|token=|22222222|33333333/)
})

test('failed selection writes report no selection events', async ({ page }) => {
  await interceptGoogle(page)
  await persistConsent(page, 'accepted')
  await mockCustomerGallery(page, { failSelection: true })
  await page.goto(`/album/${workflowAlbumId}?token=${workflowToken}`)
  await page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true })).toBeVisible()
  expect(await events(page, 'photo_selected')).toEqual([])
  expect(await events(page, 'photo_unselected')).toEqual([])
})

test('studio creation and publication report successful writes, without counting link copies or failures', async ({ page }) => {
  await interceptGoogle(page)
  await persistConsent(page, 'accepted')
  const studioId = '11111111-1111-4111-8111-111111111111'
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: { user: { id: 'owner', name: 'Private owner', email: 'owner@example.com', emailVerified: true }, session: { id: 'session', userId: 'owner' } } }))
  await page.route('**/api/studio', route => route.fulfill({ json: { studios: [{ id: studioId, name: 'Studio', role: 'owner' }] } }))
  let failCreate = true
  let failPublish = true
  await page.route(`**/api/studio/${studioId}/albums`, route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { albums: [] } })
    return failCreate ? route.fulfill({ status: 500, json: { statusMessage: 'Create failed' } })
      : route.fulfill({ json: { album: { id: workflowAlbumId, title: 'Private album title', photoCount: 1 } } })
  })
  await page.route(`**/api/studio/${studioId}/albums/${workflowAlbumId}/publish`, route => failPublish
    ? route.fulfill({ status: 500, json: { statusMessage: 'Publish failed' } })
    : route.fulfill({ json: { customerToken: workflowToken } }))
  await page.goto('/studio')
  await page.getByRole('button', { name: 'Tạo album đầu tiên' }).click()
  await page.getByLabel('Tên album').fill('Private album title')
  await page.getByLabel('Link folder Drive').fill('https://drive.google.com/drive/folders/private-folder')
  await page.getByRole('button', { name: 'Tạo album nháp' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await events(page, 'album_created')).toEqual([])
  failCreate = false
  await page.getByRole('button', { name: 'Tạo album nháp' }).click()
  await expect(page.getByRole('button', { name: 'Xuất bản', exact: true })).toBeVisible()
  expect(await events(page, 'album_created')).toEqual([['event', 'album_created', expect.objectContaining({ creation_flow: 'studio' })]])
  await page.getByRole('button', { name: 'Xuất bản', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await events(page, 'album_published')).toEqual([])
  failPublish = false
  await page.getByRole('button', { name: 'Xuất bản', exact: true }).click()
  await expect.poll(async () => await events(page, 'album_published')).toEqual([['event', 'album_published', expect.objectContaining({ creation_flow: 'studio' })]])
  await expect(page.getByRole('button', { name: /Đã sao chép|Sao chép lại link/ })).toBeVisible()
  await page.getByRole('button', { name: /Đã sao chép|Sao chép lại link/ }).click()
  expect(await events(page, 'album_published')).toHaveLength(1)
  expect(JSON.stringify(await commands(page))).not.toMatch(/private-|Private|token=|22222222|11111111|owner@example/)
})

test('management layout choices report the studio surface including guest admin', async ({ page }) => {
  await interceptGoogle(page)
  await persistConsent(page, 'accepted')
  await page.addInitScript(() => localStorage.setItem('zeno-gallery-layout', 'grid'))
  await page.route(`**/api/guest/albums/${workflowAlbumId}`, route => route.fulfill({ json: { id: workflowAlbumId, title: 'Private title', status: 'PUBLISHED', expiresAt: '2099-01-01T00:00:00Z', canFinalize: true, hasResults: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null }, photoCount: 0, selectedCount: 0 } }))
  await page.route(`**/api/guest/albums/${workflowAlbumId}/photos?*`, route => route.fulfill({ json: { items: [], nextCursor: null, total: 0, selectedCount: 0 } }))
  await page.goto(`/guest/albums/${workflowAlbumId}`)
  await page.getByRole('button', { name: 'Danh sách', exact: true }).click()
  expect(await events(page, 'gallery_view_changed')).toEqual([['event', 'gallery_view_changed', expect.objectContaining({ layout: 'list', surface: 'studio' })]])
  await page.getByRole('button', { name: 'Danh sách', exact: true }).click()
  expect(await events(page, 'gallery_view_changed')).toHaveLength(1)
})

import { expect, test, type Page } from '@playwright/test'

const LEGACY_CONSENT_KEY = 'zeno-analytics-consent-v1'

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

async function persistLegacyChoice(page: Page, choice: 'accepted' | 'rejected') {
  await page.addInitScript(({ key, choice }) => localStorage.setItem(key, choice), { key: LEGACY_CONSENT_KEY, choice })
}

test('default server emits no Google tag in HTML or browser requests', async ({ page }, testInfo) => {
  test.skip(testInfo.config.configFile.endsWith('playwright.analytics.config.ts'), 'Default-disabled server only')
  const requests = await interceptGoogle(page)
  await persistLegacyChoice(page, 'accepted') // A previous choice cannot bypass the environment gate.
  const response = await page.goto('/')
  expect(await response!.text()).not.toMatch(/<script[^>]+src=["'][^"']*(?:googletagmanager|google-analytics)/i)
  await expect(page.getByRole('link', { name: /Tạo album nhanh/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cài đặt phân tích', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: /Tạo album nhanh/ }).first().click()
  await expect(page).toHaveURL(/\/create$/)
  expect(requests).toEqual([])
  expect(await commands(page)).toEqual([])
})

test.describe('enabled analytics with intercepted Google requests', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!testInfo.config.configFile.endsWith('playwright.analytics.config.ts'), 'Enabled isolated server only')
  })

  test.afterEach(async ({ page }, testInfo) => {
    await testInfo.attach('sanitized-data-layer', { body: JSON.stringify(await commands(page)), contentType: 'application/json' })
  })

  test('starts automatically without consent UI even after a legacy rejection', async ({ page }) => {
    const requests = await interceptGoogle(page)
    await persistLegacyChoice(page, 'rejected')
    await page.goto('/')
    await expect.poll(() => requests.length).toBe(1)
    await expect.poll(async () => (await views(page)).length).toBe(1)
    await expect(page.locator('#analytics-consent-title')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cài đặt phân tích', exact: true })).toHaveCount(0)
  })

  test('loads automatically and reports safe manual views', async ({ page, baseURL }) => {
    const requests = await interceptGoogle(page)
    await page.goto('/?token=secret#private-fragment')
    await expect.poll(() => requests.length).toBe(1)
    await expect.poll(async () => (await views(page)).length).toBe(1)
    const commandTypes = await page.evaluate(() =>
      ((window as Window & { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [])
        .map(command => Object.prototype.toString.call(command)))
    expect(commandTypes).toEqual(Array(commandTypes.length).fill('[object Arguments]'))
    const queued = await commands(page)
    expect(queued[0]).toEqual(['consent', 'default', {
      analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    }])
    expect(queued.some(call => call[0] === 'consent' && call[1] === 'update')).toBe(false)
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

test('new document reports exactly one safe view', async ({ page, baseURL }) => {
  const requests = await interceptGoogle(page)
  await page.goto('/create?token=secret')
  await expect.poll(async () => (await views(page)).length).toBe(1)
  expect(requests).toHaveLength(1)
  expect((await views(page))[0]?.[2]).toEqual({ page_location: `${baseURL}/create`, page_title: 'Tạo album' })
  expect(JSON.stringify(await commands(page))).not.toContain('secret')
})

test('blocked tag does not prevent application navigation', async ({ page }) => {
  const requests = await interceptGoogle(page, true)
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

test('records one studio gallery open after successful load despite legacy rejection', async ({ page }) => {
  await interceptGoogle(page)
  await persistLegacyChoice(page, 'rejected')
  await mockCustomerGallery(page)
  const requests: unknown[] = []
  await page.route(`**/api/album/${workflowAlbumId}/analytics/open`, route => {
    requests.push({ body: route.request().postData(), cookie: route.request().headers().cookie ?? '' })
    return route.fulfill({ status: 204, body: '' })
  })
  await page.goto(`/album/${workflowAlbumId}?token=${workflowToken}`)
  await expect(page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true })).toBeEnabled()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests).toEqual([{ body: null, cookie: expect.not.stringContaining('zeno_analytics_consent=accepted') }])
  await page.evaluate(() => history.replaceState(history.state, '', '?token=another-secret#fragment'))
  await page.waitForTimeout(4200)
  expect(requests).toHaveLength(1)
})

test('does not record studio gallery open after failed photos', async ({ page }) => {
  await interceptGoogle(page)
  await mockCustomerGallery(page, { failPhotos: true })
  let requests = 0
  await page.route(`**/api/album/${workflowAlbumId}/analytics/open`, route => { requests++; return route.fulfill({ status: 204, body: '' }) })
  await page.goto(`/album/${workflowAlbumId}?token=${workflowToken}`)
  await expect(page.getByRole('status', { name: 'Đang mở album' })).toHaveCount(0)
  expect(requests).toBe(0)
})

for (const failure of ['access', 'photos'] as const) {
  test(`does not report an album opened when ${failure} fails`, async ({ page }) => {
    await interceptGoogle(page)
    await mockCustomerGallery(page, { failAccess: failure === 'access', failPhotos: failure === 'photos' })
    await page.goto(`/album/${workflowAlbumId}?token=${workflowToken}`)
    await expect(page.getByRole('status', { name: 'Đang mở album' })).toHaveCount(0)
    await expect.poll(async () => (await views(page)).length).toBe(1)
    expect(await events(page, 'album_opened')).toEqual([])
  })
}

test('reports opened gallery, deliberate layout choices and saved selection and note only', async ({ page }) => {
  await interceptGoogle(page)
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
  await mockCustomerGallery(page, { failSelection: true })
  await page.goto(`/album/${workflowAlbumId}?token=${workflowToken}`)
  await page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true })).toBeVisible()
  expect(await events(page, 'photo_selected')).toEqual([])
  expect(await events(page, 'photo_unselected')).toEqual([])
})

test('studio creation and publication report successful writes, without counting link copies or failures', async ({ page }) => {
  await interceptGoogle(page)
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
  await page.addInitScript(() => localStorage.setItem('zeno-gallery-layout', 'grid'))
  await page.route(`**/api/guest/albums/${workflowAlbumId}`, route => route.fulfill({ json: { id: workflowAlbumId, title: 'Private title', status: 'PUBLISHED', expiresAt: '2099-01-01T00:00:00Z', canFinalize: true, hasResults: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null }, photoCount: 0, selectedCount: 0 } }))
  await page.route(`**/api/guest/albums/${workflowAlbumId}/photos?*`, route => route.fulfill({ json: { items: [], nextCursor: null, total: 0, selectedCount: 0 } }))
  await page.goto(`/guest/albums/${workflowAlbumId}`)
  await page.getByRole('button', { name: 'Danh sách', exact: true }).click()
  expect(await events(page, 'gallery_view_changed')).toEqual([['event', 'gallery_view_changed', expect.objectContaining({ layout: 'list', surface: 'studio' })]])
  await page.getByRole('button', { name: 'Danh sách', exact: true }).click()
  expect(await events(page, 'gallery_view_changed')).toHaveLength(1)
})

for (const surface of ['studio', 'guest_admin'] as const) {
  for (const action of ['finalize', 'reopen'] as const) {
    for (const outcome of ['success', 'write_failure', 'reload_failure'] as const) {
      test(`management completion event: ${surface} ${action} ${outcome}`, async ({ page, baseURL }) => {
        await interceptGoogle(page)
        await page.setViewportSize({ width: 1440, height: 900 })
        const studioId = '11111111-1111-4111-8111-111111111111'
        const root = surface === 'studio' ? `/api/studio/${studioId}/albums/${workflowAlbumId}` : `/api/guest/albums/${workflowAlbumId}`
        let status = action === 'finalize' ? 'PUBLISHED' : 'FINALIZED'
        let failReload = false
        let writes = 0
        await page.route(`**${root}`, route => failReload
          ? route.fulfill({ status: 500, json: { statusMessage: 'Reload failed' } })
          : route.fulfill({ json: { id: workflowAlbumId, title: 'Private title', status, expiresAt: '2099-01-01T00:00:00Z', canFinalize: true, hasResults: status === 'FINALIZED', previousCount: 1, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null }, photoCount: 1, selectedCount: 1 } }))
        await page.route(`**${root}/photos?*`, route => route.fulfill({ json: { items: [], nextCursor: null, total: 1, selectedCount: 1 } }))
        await page.route(`**${root}/${action}`, route => {
          writes++
          if (outcome === 'write_failure') return route.fulfill({ status: 500, json: { statusMessage: 'Write failed' } })
          status = action === 'finalize' ? 'FINALIZED' : 'PUBLISHED'
          failReload = outcome === 'reload_failure'
          return route.fulfill({ json: { versionNumber: 1, cycle: 2 } })
        })
        const prefix = surface === 'studio' ? 'studio' : 'guest'
        await page.goto(`/${prefix}/albums/${workflowAlbumId}?studio=${studioId}&token=${workflowToken}`)
        await expect.poll(async () => (await views(page)).length).toBe(1)
        await page.getByRole('button', { name: action === 'finalize' ? 'Chốt 1 ảnh' : 'Mở vòng chọn mới', exact: true }).click()
        const eventName = action === 'finalize' ? 'selection_finalized' : 'selection_reopened'
        if (outcome === 'success') await expect(page.getByText(action === 'finalize' ? 'Đã chốt phiên bản 1.' : 'Đã mở vòng chọn mới và giữ 1 ảnh từ bộ chốt trước.', { exact: true })).toBeVisible()
        else await expect(page.getByRole('alert')).toBeVisible()
        expect(writes).toBe(1)
        expect(await events(page, eventName)).toEqual(outcome === 'write_failure' ? [] : [['event', eventName, {
          surface, page_location: `${baseURL}/${prefix}/albums/:albumId`, page_title: surface === 'studio' ? 'Album studio' : 'Quản trị album',
        }]])
        expect(await events(page, action === 'finalize' ? 'selection_reopened' : 'selection_finalized')).toEqual([])
        expect(JSON.stringify(await commands(page))).not.toMatch(/Private|private-|token=|22222222|11111111/)
      })
    }
  }
}

async function mockMatchDirectory(page: Page, mode: 'success' | 'aborted' | 'failed') {
  await page.addInitScript(mode => {
    const file = (name: string) => ({ kind: 'file', name, getFile: async () => new File(['raw bytes'], name) })
    const folder = (name: string) => ({ kind: 'directory', name, async *entries() { yield ['Private-B.CR3', file('Private-B.CR3')] } })
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    Object.assign(window, { __releaseScan: release })
    const source = {
      kind: 'directory', name: 'Private source',
      async *entries() {
        if (mode === 'aborted') { await gate; throw new DOMException('Stopped', 'AbortError') }
        yield ['Private-A.CR3', file('Private-A.CR3')]
        yield ['set-1', folder('set-1')]
        yield ['set-2', folder('set-2')]
      },
      async getDirectoryHandle() {
        if (mode === 'failed') throw new DOMException('Destination denied', 'NotAllowedError')
        throw new DOMException('Missing', 'NotFoundError')
      },
    }
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async () => source })
  }, mode)
}

for (const entry of ['standalone', 'album'] as const) {
  test(`file-match completion counts exclude filenames: ${entry}`, async ({ page }) => {
    await interceptGoogle(page)
    await mockMatchDirectory(page, 'success')
    if (entry === 'album') await mockFilterManifest(page)
    await page.goto(entry === 'standalone' ? '/tools/file-filter' : `/guest/albums/${workflowAlbumId}/filter?version=${workflowPhotoId}`)
    await expect.poll(async () => (await views(page)).length).toBe(1)
    if (entry === 'standalone') {
      await page.getByLabel('Tên file cần tìm').fill('Private-A.JPG\nPrivate-B.JPG\nPrivate-C.JPG')
      await page.getByRole('button', { name: 'Chọn thư mục nguồn' }).click()
      await expect(page.getByText('Đã tìm thấy 3 file')).toBeVisible()
      expect(await events(page, 'file_match_completed')).toEqual([])
      await page.getByRole('button', { name: 'Xem kết quả so khớp' }).click()
    } else await page.getByRole('button', { name: 'Chọn RAW', exact: true }).click()
    await expect.poll(async () => await events(page, 'file_match_completed')).toEqual([['event', 'file_match_completed', expect.objectContaining({ matched_count: 1, missing_count: 1, ambiguous_count: 1, page_location: expect.any(String) })]])
    if (entry === 'standalone') {
      await page.getByRole('button', { name: 'Xem kết quả so khớp' }).click()
      expect(await events(page, 'file_match_completed')).toHaveLength(2)
    }
    expect(JSON.stringify(await commands(page))).not.toMatch(/Private|private-|22222222|33333333|\.JPG|\.CR3|set-1/)
  })
}

async function mockFilterManifest(page: Page) {
  await page.route(`**/api/guest/albums/${workflowAlbumId}/selections/${workflowPhotoId}/filter-manifest`, route => route.fulfill({ json: {
    albumId: workflowAlbumId, selectionVersionId: workflowPhotoId, versionNumber: 2, finalizedAt: '2026-10-17T00:00:00Z',
    items: ['A', 'B', 'C'].map(name => ({ photoId: name, originalFilename: `Private-${name}.JPG`, notes: [] })),
  } }))
}

for (const mode of ['aborted', 'failed'] as const) {
  test(`album scan ${mode} reports no match completion`, async ({ page }) => {
    await interceptGoogle(page)
    await mockMatchDirectory(page, mode)
    await mockFilterManifest(page)
    await page.goto(`/guest/albums/${workflowAlbumId}/filter?version=${workflowPhotoId}`)
    await page.getByRole('button', { name: 'Chọn RAW', exact: true }).click()
    if (mode === 'aborted') {
      await page.getByRole('button', { name: 'Dừng quét', exact: true }).click()
      await page.evaluate(() => (window as unknown as { __releaseScan(): void }).__releaseScan())
    } else await expect(page.getByText('Destination denied')).toBeVisible()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    expect(await events(page, 'file_match_completed')).toEqual([])
    expect(JSON.stringify(await commands(page))).not.toMatch(/Private|private-|\.CR3|\.JPG/)
  })
}

})

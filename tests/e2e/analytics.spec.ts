import { expect, test, type Page } from '@playwright/test'

const analytics = { albumId: `alb_${'a'.repeat(64)}` }

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
    expect((await views(page))[1]?.[2]).toEqual(expect.objectContaining({ page_location: `${baseURL}/create`, page_title: 'Tạo album', page_referrer: `${baseURL}/`, taxonomy_version: 'zeno_v2', environment: 'development' }))
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
  expect((await views(page))[0]?.[2]).toEqual(expect.objectContaining({ page_location: `${baseURL}/create`, page_title: 'Tạo album', taxonomy_version: 'zeno_v2', environment: 'development' }))
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
        ? { id: workflowAlbumId, status: 'PUBLISHED', photoCount: 1, analytics, adminToken: workflowToken, customerToken: workflowToken }
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
    expect(await events(page, 'album_creation_submitted')).toHaveLength(1)
    expect(await events(page, succeeds ? 'album_creation_failed' : 'album_created')).toHaveLength(0)
    expect(await events(page, 'album_created')).toEqual(succeeds ? [['event', 'album_created', expect.objectContaining({ creation_flow: 'guest' })]] : [])
    expect(await events(page, 'album_published')).toEqual(succeeds ? [['event', 'album_published', expect.objectContaining({ creation_flow: 'guest' })]] : [])
    expect(JSON.stringify(await commands(page))).not.toMatch(/private-|token=|22222222/)
  })
}

for (const clipboardOk of [true, false]) {
  test(`quick create shares customer clipboard only: ${clipboardOk}`, async ({ page }) => {
    await interceptGoogle(page)
    await page.addInitScript(ok => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { if (!ok) throw new Error('Denied') } } }), clipboardOk)
    await page.route('**/api/guest/albums', route => route.fulfill({ json: { id: workflowAlbumId, status: 'PUBLISHED', photoCount: 1, analytics, adminToken: workflowToken, customerToken: workflowToken } }))
    await page.goto('/create')
    await expect(page.getByRole('button', { name: 'Tạo và xuất bản album' })).toBeEnabled()
    expect(await events(page, 'album_creation_started')).toHaveLength(1)
    await page.getByRole('button', { name: 'Tạo và xuất bản album' }).click()
    expect(await events(page, 'album_creation_submitted')).toHaveLength(0)
    await page.getByLabel('Tên album').fill('Private title')
    await page.getByLabel('Link folder Drive').fill('https://drive.google.com/drive/folders/private-folder')
    await page.getByRole('button', { name: 'Tạo và xuất bản album' }).click()
    await expect(page.getByRole('region', { name: 'Link album vừa tạo' })).toBeVisible()
    await page.getByRole('button', { name: 'Sao chép link quản trị', exact: true }).click()
    expect(await events(page, 'album_shared')).toHaveLength(0)
    await page.getByRole('button', { name: 'Sao chép link khách', exact: true }).click()
    expect(await events(page, 'album_shared')).toEqual(clipboardOk ? [['event', 'album_shared', expect.objectContaining({ album_id: analytics.albumId, share_content: 'link' })]] : [])
    const names = (await commands(page)).filter(call => call[0] === 'event').map(call => call[1])
    expect(names.indexOf('album_created')).toBeLessThan(names.indexOf('album_published'))
  })
}

for (const boundary of ['missing_identity', 'throwing_transport'] as const) {
  test(`creation stays successful with ${boundary}`, async ({ page }) => {
    await interceptGoogle(page)
    await page.route('**/api/guest/albums', route => route.fulfill({ json: { ...(boundary === 'missing_identity' ? {} : { analytics }), photoCount: 1, status: 'PUBLISHED', id: workflowAlbumId, adminToken: workflowToken, customerToken: workflowToken } }))
    await page.goto('/create')
    await expect(page.getByRole('button', { name: 'Tạo và xuất bản album' })).toBeEnabled()
    if (boundary === 'throwing_transport') await page.evaluate(() => {
      const target = window as Window & { gtag?: (...args: unknown[]) => void }
      const original = target.gtag
      target.gtag = (...args) => { if (args[0] === 'event' && args[1] === 'album_created') throw new Error('Transport failed'); original?.(...args) }
    })
    await page.getByLabel('Tên album').fill('Private title')
    await page.getByLabel('Link folder Drive').fill('https://drive.google.com/drive/folders/private-folder')
    await page.getByRole('button', { name: 'Tạo và xuất bản album' }).click()
    await expect(page.getByRole('region', { name: 'Link album vừa tạo' })).toBeVisible()
    expect(await events(page, 'album_creation_failed')).toHaveLength(0)
    expect(await events(page, 'album_created')).toHaveLength(0)
    expect(await events(page, 'album_published')).toHaveLength(boundary === 'missing_identity' ? 0 : 1)
    expect(JSON.stringify(await commands(page))).not.toContain(workflowAlbumId)
  })
}

test('held quick create ignores a second submit and has one attempt', async ({ page }) => {
  await interceptGoogle(page)
  let release: (() => void) | undefined
  const pending = new Promise<void>(resolve => { release = resolve })
  let requests = 0
  await page.route('**/api/guest/albums', async route => {
    requests++
    await pending
    return route.fulfill({ json: { analytics, photoCount: 1, status: 'PUBLISHED', id: workflowAlbumId, adminToken: workflowToken, customerToken: workflowToken } })
  })
  await page.goto('/create')
  await expect(page.getByRole('button', { name: 'Tạo và xuất bản album' })).toBeEnabled()
  await page.getByLabel('Tên album').fill('Private title')
  await page.getByLabel('Link folder Drive').fill('https://drive.google.com/drive/folders/private-folder')
  await page.getByRole('button', { name: 'Tạo và xuất bản album' }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click() })
  await expect.poll(() => requests).toBe(1)
  expect(await events(page, 'album_creation_submitted')).toHaveLength(1)
  release!()
  await expect(page.getByRole('region', { name: 'Link album vừa tạo' })).toBeVisible()
  expect(await events(page, 'album_created')).toHaveLength(1)
})

for (const surface of ['card', 'table', 'detail'] as const) {
  test(`share tracking on ${surface} keeps QR separate and tracks cached link/message`, async ({ page }) => {
    await interceptGoogle(page)
    await page.setViewportSize({ width: surface === 'card' ? 390 : 1440, height: 900 })
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {}, write: async (items: ClipboardItem[]) => { for (const item of items) await item.getType('text/plain') } } }))
    const studioId = '11111111-1111-4111-8111-111111111111'
    const album = { analytics, currentCycle: 1, id: workflowAlbumId, title: 'Private title', status: 'PUBLISHED', expiresAt: '2099-01-01T00:00:00Z', photoCount: 1, selectedCount: 0, archivedAt: null, selectionLimit: null, latestVersionNumber: null, hasResults: false, canFinalize: true, settings: { limitKind: 'unlimited' } }
    await page.route('**/api/auth/get-session', route => route.fulfill({ json: { user: { id: 'owner', name: 'Owner', email: 'owner@example.com' }, session: { id: 's', userId: 'owner' } } }))
    await page.route('**/api/studio', route => route.fulfill({ json: { studios: [{ id: studioId, name: 'Studio', role: 'owner' }] } }))
    await page.route(`**/api/studio/${studioId}/albums`, route => route.fulfill({ json: { albums: [album] } }))
    await page.route(`**/api/studio/${studioId}/albums/${workflowAlbumId}`, route => route.fulfill({ json: album }))
    await page.route(`**/api/studio/${studioId}/albums/${workflowAlbumId}/photos?*`, route => route.fulfill({ json: { items: [], nextCursor: null, total: 1, selectedCount: 0 } }))
    let minted = 0
    await page.route(`**/api/studio/${studioId}/albums/${workflowAlbumId}/share`, route => { minted++; return route.fulfill({ json: { customerToken: workflowToken } }) })
    const path = surface === 'detail' ? `/studio/albums/${workflowAlbumId}?studio=${studioId}` : '/studio'
    await page.goto(path)
    await page.getByRole('button', { name: 'Link và mã QR', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Chia sẻ Private title' })
    await expect(dialog.getByRole('img', { name: /Mã QR/ })).toBeVisible()
    expect(await events(page, 'album_shared')).toHaveLength(0)
    await dialog.getByRole('button', { name: 'Sao chép lại link', exact: true }).click()
    await dialog.getByRole('button', { name: 'Sao chép link kèm lời nhắn', exact: true }).click()
    expect(await events(page, 'album_shared')).toEqual([
      ['event', 'album_shared', expect.objectContaining({ album_id: analytics.albumId, share_content: 'link' })],
      ['event', 'album_shared', expect.objectContaining({ album_id: analytics.albumId, share_content: 'message' })],
    ])
    expect(minted).toBe(1)
    await page.reload()
    await page.getByRole('button', { name: 'Sao chép link khách', exact: true }).click()
    expect(await events(page, 'album_shared')).toHaveLength(1)
    expect(minted).toBe(1)
  })
}

test('guest admin token issuance and admin copy do not count as customer shares', async ({ page }) => {
  await interceptGoogle(page)
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} } }))
  await page.route(`**/api/guest/albums/${workflowAlbumId}/access`, route => route.fulfill({ json: {} }))
  await page.route(`**/api/guest/albums/${workflowAlbumId}`, route => route.fulfill({ json: { analytics, currentCycle: 1, id: workflowAlbumId, title: 'Private title', status: 'PUBLISHED', expiresAt: '2099-01-01T00:00:00Z', photoCount: 0, selectedCount: 0, hasResults: false, settings: { limitKind: 'unlimited' } } }))
  await page.route(`**/api/guest/albums/${workflowAlbumId}/photos?*`, route => route.fulfill({ json: { items: [], nextCursor: null, total: 0, selectedCount: 0 } }))
  await page.route(`**/api/guest/albums/${workflowAlbumId}/share`, route => route.fulfill({ json: { customerToken: workflowToken } }))
  await page.goto(`/guest/albums/${workflowAlbumId}#admin-${'a'.repeat(43)}`)
  await page.getByRole('button', { name: 'Sao chép link quản trị', exact: true }).click()
  await page.getByRole('button', { name: 'Cấp link khách mới', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sao chép link khách', exact: true })).toBeVisible()
  expect(await events(page, 'album_shared')).toHaveLength(0)
  await page.getByRole('button', { name: 'Sao chép link khách', exact: true }).click()
  expect(await events(page, 'album_shared')).toEqual([['event', 'album_shared', expect.objectContaining({ actor_type: 'guest_admin', album_id: analytics.albumId })]])
})

async function mockCustomerGallery(page: Page, options: { failPhotos?: boolean; failAccess?: boolean; failSelection?: boolean; selectionOutcome?: 'noop' | 'conflict' | 'limit_reached'; noteOutcome?: 'noop' | 'conflict'; cycle?: number } = {}) {
  let selected = false
  let version = 0
  await page.addInitScript(() => localStorage.setItem('zeno-gallery-layout', 'grid'))
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"/>' }))
  await page.route(`**/api/album/${workflowAlbumId}/**`, route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return options.failAccess ? json({ statusMessage: 'Access failed' }, 403) : json({ album: {
      analytics, currentCycle: options.cycle ?? 1, id: workflowAlbumId, title: 'Private gallery title', status: 'PUBLISHED', expiresAt: '2099-01-01T00:00:00Z', joined: true, canJoin: false,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
    } })
    if (path.endsWith('/photos')) return options.failPhotos ? json({ statusMessage: 'Photos failed' }, 500) : json({ items: [{ id: workflowPhotoId, sourceFileId: 'private-drive-id', filename: 'Private filename.jpg', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: false }], nextCursor: null, total: 1, selectedCount: 0 })
    if (path.endsWith('/selection')) return json({ version, selectedPhotoIds: selected ? [workflowPhotoId] : [] })
    if (path.endsWith(`/selection/${workflowPhotoId}`)) {
      if (options.failSelection) return json({ statusMessage: 'Selection failed' }, 500)
      if (options.selectionOutcome) return json({ status: options.selectionOutcome === 'noop' ? 'saved' : options.selectionOutcome, cycle: options.cycle ?? 1, changed: false, version, selected, count: 0 })
      selected = (route.request().postDataJSON() as { selected: boolean }).selected
      return json({ status: 'saved', cycle: options.cycle ?? 1, changed: true, version: ++version, selected, count: selected ? 1 : 0 })
    }
    if (path.endsWith(`/notes/${workflowPhotoId}`)) return route.request().method() === 'PUT'
      ? json({ status: options.noteOutcome === 'conflict' ? 'conflict' : 'saved', cycle: 1, changed: !options.noteOutcome, version: 1, body: 'Private note' }) : json({ body: '', version: 0 })
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

test('iOS in-app gate defers GA4 and backend opens until continue', async ({ page }) => {
  await interceptGoogle(page)
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Zalo iOS/500' }))
  await mockCustomerGallery(page)
  let opens = 0
  await page.route(`**/api/album/${workflowAlbumId}/analytics/open`, route => { opens++; return route.fulfill({ status: 204 }) })
  await page.goto(`/album/${workflowAlbumId}?token=${workflowToken}`)
  await expect(page.getByRole('button', { name: 'Tiếp tục ở đây' })).toBeVisible()
  expect(await events(page, 'album_opened')).toHaveLength(0)
  expect(await events(page, 'guest_selection_started')).toHaveLength(0)
  expect(opens).toBe(0)
  await page.getByRole('button', { name: 'Tiếp tục ở đây' }).click()
  await expect.poll(async () => (await events(page, 'album_opened')).length).toBe(1)
  await expect.poll(() => opens).toBe(1)
})

test('GA4 remains enabled when backend gallery counter is disabled', async ({ page }) => {
  await interceptGoogle(page)
  await mockCustomerGallery(page)
  await page.route(`**/album/${workflowAlbumId}?*`, async route => {
    if (!route.request().isNavigationRequest()) return route.fallback()
    const response = await route.fetch()
    const original = await response.text()
    const body = original.replace(/(studioGalleryAnalyticsEnabled["']?\s*:\s*)(?:true|["']true["'])/g, '$1false')
    expect(body).not.toBe(original)
    return route.fulfill({ response, body })
  })
  let opens = 0
  await page.route(`**/api/album/${workflowAlbumId}/analytics/open`, route => { opens++; return route.fulfill({ status: 204 }) })
  await page.goto(`/album/${workflowAlbumId}?token=${workflowToken}`)
  await expect.poll(async () => (await events(page, 'album_opened')).length).toBe(1)
  expect(opens).toBe(0)
})

test('leaving during album load does not emit an opened event', async ({ page }) => {
  await interceptGoogle(page)
  await mockCustomerGallery(page)
  let release: (() => void) | undefined
  const pending = new Promise<void>(resolve => { release = resolve })
  let requested = false
  await page.route(`**/api/album/${workflowAlbumId}/photos?*`, async route => {
    requested = true
    await pending
    return route.fulfill({ json: { items: [], total: 0, selectedCount: 0, nextCursor: null } })
  })
  let opens = 0
  await page.route(`**/api/album/${workflowAlbumId}/analytics/open`, route => { opens++; return route.fulfill({ status: 204 }) })
  await page.goto(`/album/${workflowAlbumId}?token=${workflowToken}`)
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('link', { name: 'Zeno Studio – Trang chủ', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  release!()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await events(page, 'album_opened')).toHaveLength(0)
  expect(opens).toBe(0)
})

test('late selection result retains original cycle and cannot overwrite the new cycle', async ({ page }) => {
  await interceptGoogle(page)
  await mockCustomerGallery(page)
  let cycle = 1
  const download = { canSingle: false, canSelected: false, canAll: true, reason: null, selectedSource: 'live', selectedCount: 0 }
  await page.route(`**/api/album/${workflowAlbumId}/access`, route => route.fulfill({ json: { album: { analytics, currentCycle: cycle, id: workflowAlbumId, title: 'Private gallery title', status: 'PUBLISHED', expiresAt: '2099-01-01T00:00:00Z', joined: true, canJoin: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null }, download } } }))
  let release: (() => void) | undefined
  const pending = new Promise<void>(resolve => { release = resolve })
  let saves = 0
  await page.route(`**/api/album/${workflowAlbumId}/selection/${workflowPhotoId}`, async route => {
    saves++
    await pending
    return route.fulfill({ json: { status: 'saved', cycle: 1, changed: true, version: 99, selected: true, count: 1 } })
  })
  await page.route(`**/api/album/${workflowAlbumId}/download/plan`, route => { cycle = 2; return route.fulfill({ status: 403, json: { statusMessage: 'Rights changed' } }) })
  await page.goto(`/album/${workflowAlbumId}?token=${workflowToken}`)
  await page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true }).click()
  await expect.poll(() => saves).toBe(1)
  await page.getByRole('button', { name: 'Tải xuống', exact: true }).click()
  await page.getByRole('button', { name: 'Tải toàn album', exact: true }).click()
  await page.getByRole('button', { name: 'Chuẩn bị tải toàn album' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Đóng tải ảnh' }).click()
  await expect(page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true })).toBeEnabled()
  release!()
  await expect.poll(async () => (await events(page, 'photo_selected')).length).toBe(1)
  expect(await events(page, 'photo_selected')).toEqual([['event', 'photo_selected', expect.objectContaining({ album_id: analytics.albumId, cycle: 1, selected_count: 1 })]])
  await expect(page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true })).toBeEnabled()
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

for (const noteOutcome of ['noop', 'conflict'] as const) {
  test(`note ${noteOutcome} does not report a changed save`, async ({ page }) => {
    await interceptGoogle(page)
    await mockCustomerGallery(page, { noteOutcome })
    await page.goto(`/album/${workflowAlbumId}?token=${workflowToken}`)
    await page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true }).click()
    await expect.poll(async () => (await events(page, 'photo_selected')).length).toBe(1)
    await page.getByRole('button', { name: 'Mở ảnh Private filename.jpg' }).click()
    await page.getByLabel('Ghi chú chỉnh sửa').fill('Private note')
    await expect(page.getByText(noteOutcome === 'conflict' ? 'Ghi chú đã đổi ở thiết bị khác. Đã tải bản mới.' : 'Đã lưu ghi chú', { exact: true })).toBeVisible()
    expect(await events(page, 'photo_note_saved')).toHaveLength(0)
  })
}

for (const outcome of ['noop', 'conflict', 'limit_reached'] as const) {
  test(`selection ${outcome} emits no changed success`, async ({ page }) => {
    await interceptGoogle(page)
    await mockCustomerGallery(page, { selectionOutcome: outcome })
    await page.goto(`/album/${workflowAlbumId}?token=${workflowToken}`)
    await page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true })).toBeEnabled()
    expect(await events(page, 'photo_selected')).toHaveLength(0)
    expect(await events(page, 'guest_selection_started')).toHaveLength(0)
    expect(await events(page, 'guest_selection_save_failed')).toHaveLength(0)
    expect(await events(page, 'guest_selection_save_rejected')).toEqual(outcome === 'noop' ? [] : [['event', 'guest_selection_save_rejected', expect.objectContaining({ outcome, cycle: 1, album_id: analytics.albumId })]])
  })
}

test('selection started deduplicates refresh and allows a later cycle', async ({ page }) => {
  await interceptGoogle(page)
  await mockCustomerGallery(page)
  await page.goto(`/album/${workflowAlbumId}?token=${workflowToken}`)
  await page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true }).click()
  await expect.poll(async () => (await events(page, 'guest_selection_started')).length).toBe(1)
  await page.reload()
  await page.getByRole('button', { name: 'Bỏ chọn Private filename.jpg', exact: true }).click()
  await expect.poll(async () => (await events(page, 'photo_unselected')).length).toBe(1)
  expect(await events(page, 'guest_selection_started')).toHaveLength(0)
  await mockCustomerGallery(page, { cycle: 2 })
  await page.reload()
  await page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true }).click()
  await expect.poll(async () => (await events(page, 'guest_selection_started')).length).toBe(1)
  expect(await events(page, 'guest_selection_started')).toEqual([['event', 'guest_selection_started', expect.objectContaining({ cycle: 2 })]])
})

test('failed selection writes report no selection events', async ({ page }) => {
  await interceptGoogle(page)
  await mockCustomerGallery(page, { failSelection: true })
  await page.goto(`/album/${workflowAlbumId}?token=${workflowToken}`)
  await page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Chọn Private filename.jpg', exact: true })).toBeVisible()
  expect(await events(page, 'photo_selected')).toEqual([])
  expect(await events(page, 'photo_unselected')).toEqual([])
  expect(await events(page, 'guest_selection_started')).toEqual([])
  expect(await events(page, 'guest_selection_save_failed')).toEqual([['event', 'guest_selection_save_failed', expect.objectContaining({ error_code: 'unknown', cycle: 1 })]])
})

for (const { clipboardOk, storageThrows } of [{ clipboardOk: true, storageThrows: false }, { clipboardOk: false, storageThrows: false }, { clipboardOk: true, storageThrows: true }]) {
test(`studio creation and publication track clipboard result: ${clipboardOk}, storage blocked: ${storageThrows}`, async ({ page }) => {
  await interceptGoogle(page)
  await page.addInitScript(ok => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { if (!ok) throw new Error('Denied') }, write: async (items: ClipboardItem[]) => { for (const item of items) await item.getType('text/plain'); if (!ok) throw new Error('Denied') } } }), clipboardOk)
  if (storageThrows) await page.addInitScript(() => {
    const get = Storage.prototype.getItem
    const set = Storage.prototype.setItem
    Storage.prototype.getItem = function (key) { if (key.startsWith('zeno-studio:album-link:')) throw new DOMException('Blocked', 'SecurityError'); return get.call(this, key) }
    Storage.prototype.setItem = function (key, value) { if (key.startsWith('zeno-studio:album-link:')) throw new DOMException('Blocked', 'SecurityError'); return set.call(this, key, value) }
  })
  const studioId = '11111111-1111-4111-8111-111111111111'
  await page.route('**/api/auth/get-session', route => route.fulfill({ json: { user: { id: 'owner', name: 'Private owner', email: 'owner@example.com', emailVerified: true }, session: { id: 'session', userId: 'owner' } } }))
  await page.route('**/api/studio', route => route.fulfill({ json: { studios: [{ id: studioId, name: 'Studio', role: 'owner' }] } }))
  let failCreate = true
  let failPublish = true
  await page.route(`**/api/studio/${studioId}/albums`, route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { albums: [] } })
    return failCreate ? route.fulfill({ status: 500, json: { statusMessage: 'Create failed' } })
      : route.fulfill({ json: { album: { analytics, currentCycle: 1, id: workflowAlbumId, title: 'Private album title', photoCount: 1 } } })
  })
  await page.route(`**/api/studio/${studioId}/albums/${workflowAlbumId}/publish`, route => failPublish
    ? route.fulfill({ status: 500, json: { statusMessage: 'Publish failed' } })
    : route.fulfill({ json: { customerToken: workflowToken, analytics, photoCount: 1 } }))
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
  expect(await events(page, 'album_shared')).toHaveLength(clipboardOk ? 2 : 0)
  const publishNames = (await commands(page)).filter(call => call[0] === 'event').map(call => call[1])
  if (clipboardOk) expect(publishNames.indexOf('album_published')).toBeLessThan(publishNames.indexOf('album_shared'))
  expect(await events(page, 'studio_home_viewed')).toHaveLength(1)
  expect(await events(page, 'album_creation_started')).toHaveLength(1)
  expect(JSON.stringify(await commands(page))).not.toMatch(/private-|Private|token=|22222222|11111111|owner@example/)
})
}

test('management layout choices report the studio surface including guest admin', async ({ page }) => {
  await interceptGoogle(page)
  await page.addInitScript(() => localStorage.setItem('zeno-gallery-layout', 'grid'))
  await page.route(`**/api/guest/albums/${workflowAlbumId}`, route => route.fulfill({ json: { analytics, currentCycle: 1, id: workflowAlbumId, title: 'Private title', status: 'PUBLISHED', expiresAt: '2099-01-01T00:00:00Z', canFinalize: true, hasResults: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null }, photoCount: 0, selectedCount: 0 } }))
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
        let releaseWrite: (() => void) | undefined
        const writeGate = new Promise<void>(resolve => { releaseWrite = resolve })
        await page.route(`**${root}`, route => failReload
          ? route.fulfill({ status: 500, json: { statusMessage: 'Reload failed' } })
          : route.fulfill({ json: { analytics, currentCycle: 1, id: workflowAlbumId, title: 'Private title', status, expiresAt: '2099-01-01T00:00:00Z', canFinalize: true, hasResults: status === 'FINALIZED', previousCount: 1, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null }, photoCount: 1, selectedCount: 1 } }))
        await page.route(`**${root}/photos?*`, route => route.fulfill({ json: { items: [], nextCursor: null, total: 1, selectedCount: 1 } }))
        await page.route(`**${root}/${action}`, async route => {
          writes++
          await writeGate
          if (outcome === 'write_failure') return route.fulfill({ status: 500, json: { statusMessage: 'Write failed' } })
          status = action === 'finalize' ? 'FINALIZED' : 'PUBLISHED'
          failReload = outcome === 'reload_failure'
          return route.fulfill({ json: { versionNumber: 1, cycle: 2, count: 1, analytics } })
        })
        const prefix = surface === 'studio' ? 'studio' : 'guest'
        await page.goto(`/${prefix}/albums/${workflowAlbumId}?studio=${studioId}&token=${workflowToken}`)
        await expect.poll(async () => (await views(page)).length).toBe(1)
        await page.getByRole('button', { name: action === 'finalize' ? 'Chốt 1 ảnh' : 'Mở vòng chọn mới', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click() })
        await expect.poll(() => writes).toBe(1)
        releaseWrite!()
        const eventName = action === 'finalize' ? 'selection_finalized' : 'selection_reopened'
        if (outcome === 'success') await expect(page.getByText(action === 'finalize' ? 'Đã chốt phiên bản 1.' : 'Đã mở vòng chọn mới và giữ 1 ảnh từ bộ chốt trước.', { exact: true })).toBeVisible()
        else await expect(page.getByRole('alert')).toBeVisible()
        expect(writes).toBe(1)
        expect(await events(page, eventName)).toEqual(outcome === 'write_failure' ? [] : [['event', eventName, expect.objectContaining({
          surface, page_location: `${baseURL}/${prefix}/albums/:albumId`, page_title: surface === 'studio' ? 'Album studio' : 'Quản trị album',
        })]])
        if (action === 'finalize') {
          const submitted = await events(page, 'selection_finalize_submitted')
          expect(submitted).toHaveLength(1)
          const resultEvents = await events(page, outcome === 'write_failure' ? 'selection_finalize_failed' : 'selection_finalized')
          expect(resultEvents).toEqual([['event', expect.any(String), expect.objectContaining({ attempt_id: (submitted[0]![2] as { attempt_id: string }).attempt_id, ...(outcome === 'write_failure' ? { error_code: 'unknown' } : { selection_count: 1, version_number: 1, cycle: 2 }) })]])
        }
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
    expect(await events(page, 'file_match_completed')).toEqual([['event', 'file_match_completed', expect.objectContaining(entry === 'album' ? { context: 'album', album_id: analytics.albumId, cycle: 1, version_number: 2 } : { context: 'standalone' })]])
    if (entry === 'standalone') {
      await page.getByRole('button', { name: 'Xem kết quả so khớp' }).click()
      expect(await events(page, 'file_match_completed')).toHaveLength(2)
    }
    expect(JSON.stringify(await commands(page))).not.toMatch(/Private|private-|22222222|33333333|\.JPG|\.CR3|set-1/)
  })
}

async function mockFilterManifest(page: Page) {
  await page.route(`**/api/guest/albums/${workflowAlbumId}/selections/${workflowPhotoId}/filter-manifest`, route => route.fulfill({ json: {
    analytics, cycle: 1, albumId: workflowAlbumId, selectionVersionId: workflowPhotoId, versionNumber: 2, finalizedAt: '2026-10-17T00:00:00Z',
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

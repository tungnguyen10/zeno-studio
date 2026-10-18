import { expect, test } from '@playwright/test'

const albumId = '11111111-1111-4111-8111-111111111111'
const studioId = '22222222-2222-4222-8222-222222222222'
const versionId = '33333333-3333-4333-8333-333333333333'

test.beforeEach(async ({ page }) => {
  await page.route(`**/api/studio/${studioId}/albums/${albumId}/selections/${versionId}/filter-manifest`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ albumId, selectionVersionId: versionId, versionNumber: 2, finalizedAt: '2026-10-17T00:00:00Z', items: [{ photoId: 'a', originalFilename: 'A.JPG', notes: [{ text: 'Chỉnh sáng' }] }] }),
  }))
  await page.addInitScript(() => {
    const created: string[] = []
    const fileData = new Map<string, Uint8Array[]>()
    const folder = (name: string, prefix = '') => ({
      kind: 'directory', name,
      async *entries() { for (const key of fileData.keys()) if (!key.includes('/') && prefix === 'SELECTED') yield [key, { kind: 'file', name: key }] },
      async getDirectoryHandle(child: string, options?: { create?: boolean }) {
        if (child !== 'SELECTED' && child !== 'KhachA' && child !== 'DaLoc') throw new DOMException('missing', 'NotFoundError')
        if (options?.create) created.push(`${prefix}/${child}`)
        else throw new DOMException('missing', 'NotFoundError')
        return folder(child, child)
      },
      async getFileHandle(filename: string, options?: { create?: boolean }) {
        if (!options?.create && !fileData.has(filename)) throw new DOMException('missing', 'NotFoundError')
        if (options?.create) fileData.set(filename, [])
        return {
          async isSameEntry() { return false },
          async createWritable() { return new WritableStream<Uint8Array | string>({ write(chunk) { fileData.get(filename)!.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk) } }) },
          async getFile() { return new File(fileData.get(filename) ?? [], filename) },
        }
      },
      async isSameEntry() { return false },
      async resolve() { return null },
    })
    const raw = {
      ...folder('RAW'),
      async *entries() { yield ['A.CR3', { kind: 'file', name: 'A.CR3', async getFile() { return new File(['raw bytes'], 'A.CR3') }, async isSameEntry() { return false } }] },
    }
    const external = folder('OTHER')
    let pickerCount = 0
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async () => ++pickerCount === 1 ? raw : external })
    Object.assign(window, { __created: created, __fileData: fileData })
  })
})

test('creates SELECTED only after confirmation and writes copy plus reports', async ({ page }) => {
  await page.goto(`/studio/albums/${albumId}/filter?studio=${studioId}&version=${versionId}`)
  await page.getByRole('button', { name: 'Chọn RAW', exact: true }).click()
  await expect(page.getByText('1 ảnh khớp')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __created: string[] }).__created)).toEqual([])
  await page.getByRole('button', { name: 'Xác nhận copy 1 file' }).click()
  await expect(page.getByText('Hoàn tất 1')).toBeVisible()
  await expect(page.getByText('Báo cáo trong đích:')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __created: string[] }).__created)).toContain('/SELECTED')
  expect(await page.evaluate(() => [...(window as unknown as { __fileData: Map<string, Uint8Array[]> }).__fileData.keys()])).toEqual(expect.arrayContaining(['A.CR3', 'RETOUCH_NOTES.csv', 'SELECTION_REPORT.csv']))
})

test('normalizes a relative folder and keeps preview read only', async ({ page }) => {
  await page.goto(`/studio/albums/${albumId}/filter?studio=${studioId}&version=${versionId}`)
  await page.getByLabel('Path con trong RAW').check()
  await page.getByLabel('Path tương đối').fill('KhachA\\DaLoc')
  await page.getByRole('button', { name: 'Chọn RAW', exact: true }).click()
  await expect(page.getByText('RAW/KhachA/DaLoc', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __created: string[] }).__created)).toEqual([])
  await page.getByRole('button', { name: 'Xác nhận copy 1 file' }).click()
  await expect(page.getByText('Hoàn tất 1')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __created: string[] }).__created)).toEqual(['/KhachA', 'KhachA/DaLoc'])
})

test('invalidates preview when the destination changes, then copies into a picked folder', async ({ page }) => {
  await page.goto(`/studio/albums/${albumId}/filter?studio=${studioId}&version=${versionId}`)
  await page.getByRole('button', { name: 'Chọn RAW', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Xác nhận copy 1 file' })).toBeVisible()
  await page.getByLabel('Path con trong RAW').check()
  await expect(page.getByRole('button', { name: 'Xác nhận copy 1 file' })).toHaveCount(0)
  await page.getByLabel('Thư mục khác').check()
  await page.getByRole('button', { name: 'Chọn thư mục đích khác' }).click()
  await expect(page.getByText('Đích: OTHER')).toBeVisible()
  await page.getByRole('button', { name: 'Xác nhận copy 1 file' }).click()
  await expect(page.getByText('Hoàn tất 1')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __created: string[] }).__created)).toEqual([])
})

test('requires another destination when RAW is read only', async ({ page }) => {
  await page.goto(`/studio/albums/${albumId}/filter?studio=${studioId}&version=${versionId}`)
  await page.getByRole('button', { name: 'Nguồn chỉ đọc' }).click()
  await expect(page.getByRole('button', { name: 'Xác nhận copy 1 file' })).toBeDisabled()
  await page.getByLabel('Thư mục khác').check()
  await page.getByRole('button', { name: 'Chọn thư mục đích khác' }).click()
  await expect(page.getByRole('button', { name: 'Xác nhận copy 1 file' })).toBeEnabled()
})

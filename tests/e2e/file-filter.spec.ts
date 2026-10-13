import { expect, test } from '@playwright/test'

test('standalone file filter explains the copy workflow', async ({ page }) => {
  await page.goto('/tools/file-filter')
  await expect(page.getByRole('heading', { name: 'Lọc file theo danh sách ảnh' })).toBeVisible()
  await expect(page.getByLabel('Tên file cần tìm')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chọn thư mục nguồn' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chọn thư mục đích' })).toBeVisible()
  await expect(page.getByText('Chỉ copy, không xóa file nguồn')).toBeVisible()
})

test('previews matches and copies only resolved files', async ({ page }) => {
  await page.addInitScript(() => {
    const makeFile = (name: string) => ({ kind: 'file', name, getFile: async () => new File(['raw bytes'], name) })
    const folder = (name: string, files: string[]) => ({
      kind: 'directory', name,
      async *entries() { for (const filename of files) yield [filename, makeFile(filename)] },
    })
    const source = {
      kind: 'directory', name: 'Source',
      async *entries() {
        yield ['A.CR3', makeFile('A.CR3')]
        yield ['set-1', folder('set-1', ['B.CR3'])]
        yield ['set-2', folder('set-2', ['B.CR3'])]
      },
    }
    const stored = new Set<string>()
    const destination = {
      kind: 'directory', name: 'Output',
      async isSameEntry() { return false },
      async getFileHandle(name: string, options?: { create?: boolean }) {
        if (!options?.create) {
          if (stored.has(name)) return {}
          throw new DOMException('not found', 'NotFoundError')
        }
        stored.add(name)
        return { createWritable: async () => new WritableStream() }
      },
    }
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async (options?: { mode?: string }) => options?.mode === 'readwrite' ? destination : source,
    })
  })

  await page.goto('/tools/file-filter')
  await page.getByLabel('Tên file cần tìm').fill('A.JPG\nB.JPG\nC.JPG')
  await page.getByRole('button', { name: 'Chọn thư mục nguồn' }).click()
  await expect(page.getByText('Đã tìm thấy 3 file')).toBeVisible()
  await page.getByRole('button', { name: 'Chọn thư mục đích' }).click()
  await page.getByRole('button', { name: 'Xem kết quả so khớp' }).click()
  await expect(page.getByText('A.JPG')).toHaveCount(0)
  await expect(page.getByText('C.JPG')).toBeVisible()
  await page.getByLabel('B.JPG').selectOption('set-1/B.CR3')
  await page.getByRole('button', { name: 'Copy 2 file' }).click()
  await expect(page.getByText('Đã copy 2 file; bỏ qua 0; lỗi 0.')).toBeVisible()
})

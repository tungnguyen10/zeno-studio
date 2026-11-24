import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const SELECTION = ['0001', '0004', '0009', '0015', '0020']

const demo = (page: Page) => page.locator('#zeno-demo')
const screen = (page: Page) => page.locator('#zeno-demo-screen')
const shownIds = (page: Page) => screen(page).locator('li[data-photo-id]').evaluateAll(items => items.map(item => item.getAttribute('data-photo-id')))

async function gotoHydrated(page: Page) {
  await page.goto('/')
  await expect(demo(page)).toHaveAttribute('data-hydrated', 'true')
}

async function openManual(page: Page) {
  await gotoHydrated(page)
  await page.getByRole('button', { name: 'Tự chọn ảnh', exact: true }).click()
  await expect(demo(page)).toHaveAttribute('data-demo-mode', 'manual')
}

function zipEntryNames(bytes: Buffer): string[] {
  const names: string[] = []
  let offset = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  while (offset >= 0 && bytes.readUInt32LE(offset) === 0x02014b50) {
    const length = bytes.readUInt16LE(offset + 28)
    names.push(bytes.subarray(offset + 46, offset + 46 + length).toString('utf8'))
    offset += 46 + length + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32)
  }
  return names
}

test.describe('homepage V4 hero', () => {
  test('renders the exact V4 copy, a single primary CTA and the four workflow steps', async ({ page }) => {
    await page.goto('/')
    const hero = page.locator('section[aria-labelledby="hero-title"]')
    await expect(hero.getByText('Dành cho photographers')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Khách chọn nhanh\.\s*Bạn nhẹ việc\./)
    await expect(hero.getByText('Gửi album từ Google Drive.')).toBeVisible()
    await expect(hero.getByText('Nhận rõ ảnh khách chọn.')).toBeVisible()
    await expect(hero.getByRole('link', { name: 'Tạo album miễn phí' })).toHaveAttribute('href', '/create')
    await expect(hero.getByRole('link')).toHaveCount(1)
    await expect(hero.getByText('Khách không cần tài khoản.')).toBeVisible()
    await expect(hero.getByRole('group', { name: 'Chế độ trải nghiệm' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/studio')
    await expect(page.getByRole('heading', { level: 2, name: 'Từ album đến bộ ảnh cần làm.' })).toBeVisible()
    await expect(page.locator('#quy-trinh li')).toHaveText([/Bắt đầu từ Google Drive/, /Chọn ngay trên điện thoại/, /Rõ bộ ảnh cần xử lý/, /Lọc RAW\/JPEG trên máy/])
  })

  test('keeps copy, CTA and the album poster in the server HTML', async ({ request }) => {
    const html = await (await request.get('/')).text()
    for (const text of ['Khách chọn nhanh.', 'Bạn nhẹ việc.', 'Tạo album miễn phí', 'Bộ ảnh mẫu', '24 ảnh · Hạn 30/11/2026', '/images/demo/zeno-0001.webp']) {
      expect(html).toContain(text)
    }
  })

  for (const width of [320, 390, 768, 1440]) {
    test(`has no horizontal overflow and keeps controls reachable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
      for (const name of ['Tạo album miễn phí']) await expect(page.getByRole('link', { name })).toBeInViewport()
      const headline = await page.getByRole('heading', { level: 1 }).locator('span').evaluateAll(lines => lines.map(line => line.scrollWidth <= (line.parentElement?.clientWidth ?? 0) + 1))
      expect(headline).toEqual([true, true])
      await demo(page).scrollIntoViewIfNeeded()
      for (const name of ['Xem demo', 'Tự chọn ảnh', 'Tạm dừng', 'Phát lại']) {
        const box = await page.getByRole('button', { name, exact: true }).boundingBox()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width)
        expect(box!.height).toBeGreaterThanOrEqual(44)
      }
    })
  }
})

test.describe('homepage V4 autoplay', () => {
  test('selects the five scripted photos, filters to exactly them, and pauses/replays', async ({ page }) => {
    // Tall enough that the whole figure stays visible: playback pauses below 65% visibility.
    await page.setViewportSize({ width: 1280, height: 1200 })
    await page.clock.install()
    await gotoHydrated(page)
    await demo(page).scrollIntoViewIfNeeded()
    await expect(demo(page)).toHaveAttribute('data-demo-count', '0')
    await page.clock.runFor(3_500) // image preload gate + the first two taps
    await expect(demo(page)).toHaveAttribute('data-demo-running', 'true')
    await page.clock.runFor(11_000)
    await expect(demo(page)).toHaveAttribute('data-demo-count', '5')
    await expect(page.locator('[data-demo-caption]')).toHaveText('Lọc lại đúng 5 ảnh vừa chọn.')
    expect(await shownIds(page)).toEqual(SELECTION)
    for (const id of SELECTION) await expect(screen(page).locator(`[data-heart="${id}"]`)).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'Tạm dừng' }).click()
    await expect(page.getByRole('button', { name: 'Phát demo' })).toBeVisible()
    await expect(demo(page)).toHaveAttribute('data-demo-running', 'false')
    await expect(demo(page).getByRole('status')).toHaveText('Đã tạm dừng demo.')
    await page.getByRole('button', { name: 'Phát lại' }).click()
    await expect(demo(page).getByRole('status')).toHaveText('Phát lại kịch bản mẫu từ đầu.')
    await expect(demo(page)).toHaveAttribute('data-demo-count', '0')
    await expect(demo(page)).toHaveAttribute('data-demo-running', 'true')
  })

  test('shows the static 15.9s result under reduced motion until the viewer presses play', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await gotoHydrated(page)
    await expect(page.getByRole('button', { name: 'Phát demo' })).toBeVisible()
    await expect(demo(page)).toHaveAttribute('data-demo-running', 'false')
    await expect(demo(page)).toHaveAttribute('data-demo-count', '5')
    expect(await shownIds(page)).toEqual(SELECTION)
    await expect(screen(page)).toHaveAttribute('role', 'img')
    await expect(screen(page)).toHaveAttribute('aria-label', /chọn 5 ảnh/)
  })

  test('pauses while the phone is mostly off-screen and resumes when it comes back', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1200 })
    await gotoHydrated(page)
    await expect(demo(page)).toHaveAttribute('data-demo-running', 'true')
    await page.locator('#quy-trinh').evaluate(element => element.scrollIntoView({ block: 'start' }))
    await page.evaluate(() => window.scrollBy(0, 400))
    await expect(demo(page)).toHaveAttribute('data-demo-running', 'false')
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(demo(page)).toHaveAttribute('data-demo-running', 'true')
  })

  test('falls back to a placeholder when a sample image fails to load', async ({ page }) => {
    await page.route('**/images/demo/zeno-0003.webp', route => route.abort())
    await page.goto('/')
    await expect(screen(page).locator('[data-photo-id="0003"]').getByText('Không tải được ảnh')).toBeVisible()
    await expect(screen(page).locator('[data-photo-id="0001"] img')).toBeVisible()
  })
})

test.describe('homepage V4 hands-on mode', () => {
  test('selects with real heart buttons, filters, previews and keeps one shared state', async ({ page }) => {
    const writes: string[] = []
    page.on('request', request => { if (request.url().includes('/api/')) writes.push(`${request.method()} ${request.url()}`) })
    await openManual(page)
    const phone = screen(page)
    await expect(demo(page)).toHaveAttribute('data-demo-count', '0')
    for (const id of ['0001', '0004', '0010']) await phone.getByRole('button', { name: `Chọn ZENO_${id}.jpg` }).click()
    await expect(phone.getByRole('button', { name: 'Bỏ chọn ZENO_0004.jpg' })).toHaveAttribute('aria-pressed', 'true')
    await expect(phone.getByText('3 ảnh đã chọn')).toBeVisible()

    await phone.getByRole('button', { name: 'Xem ảnh đã chọn' }).click()
    await expect(phone.getByText('Ảnh đã chọn', { exact: true })).toBeVisible()
    expect(await shownIds(page)).toEqual(['0001', '0004', '0010'])

    await phone.getByRole('button', { name: 'Xem ảnh ZENO_0004.jpg' }).click()
    const dialog = phone.getByRole('dialog', { name: 'ZENO_0004.jpg' })
    await expect(dialog.getByRole('button', { name: 'Đóng ảnh' })).toBeFocused()
    await dialog.getByRole('button', { name: '♥ Đã chọn' }).click()
    await expect(dialog.getByRole('button', { name: '♡ Chọn ảnh' })).toHaveAttribute('aria-pressed', 'false')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(phone.getByText('2 ảnh đã chọn')).toBeVisible()
    expect(await shownIds(page)).toEqual(['0001', '0010'])

    // Opening a photo that stays in the list returns focus to its tile.
    await phone.getByRole('button', { name: 'Xem ảnh ZENO_0010.jpg' }).click()
    await page.keyboard.press('Escape')
    await expect(phone.getByRole('button', { name: 'Xem ảnh ZENO_0010.jpg' })).toBeFocused()

    for (const layout of ['Lưới', 'Hàng đều', 'Danh sách', 'So le']) {
      await phone.getByRole('button', { name: layout, exact: true }).click()
      await expect(phone.getByRole('button', { name: layout, exact: true })).toHaveAttribute('aria-pressed', 'true')
      expect(await shownIds(page)).toEqual(['0001', '0010'])
    }
    expect(writes).toEqual([])
  })

  test('shows an empty filter state with a way back, and resets to 0/masonry', async ({ page }) => {
    await openManual(page)
    const phone = screen(page)
    await expect(phone.getByRole('button', { name: 'Tải xuống' })).toBeDisabled()
    await phone.getByRole('button', { name: 'Xem ảnh đã chọn' }).click()
    await expect(phone.getByText('Chưa có ảnh được chọn.')).toBeVisible()
    await phone.getByRole('button', { name: 'Xem tất cả ảnh' }).click()
    expect(await shownIds(page)).toHaveLength(24)

    await phone.getByRole('button', { name: 'Chọn ZENO_0002.jpg' }).click()
    await phone.getByRole('button', { name: 'Danh sách', exact: true }).click()
    await phone.getByRole('button', { name: 'Xem ảnh đã chọn' }).click()
    await page.getByRole('button', { name: 'Làm lại' }).click()
    await expect(demo(page).getByRole('status')).toHaveText('Đã làm lại. Album có 24 ảnh mẫu, chưa chọn ảnh nào.')
    await expect(phone.getByText('0 ảnh đã chọn')).toBeVisible()
    await expect(phone.getByRole('button', { name: 'So le', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await shownIds(page)).toHaveLength(24)
    expect(await phone.locator('[data-demo-scroller]').evaluate(element => element.scrollTop)).toBe(0)
  })

  test('downloads a ZIP of exactly the selected sample WebP files', async ({ page }) => {
    await openManual(page)
    const phone = screen(page)
    await phone.getByRole('button', { name: 'Chọn ZENO_0001.jpg' }).click()
    await phone.getByRole('button', { name: 'Chọn ZENO_0004.jpg' }).click()
    const pending = page.waitForEvent('download')
    await phone.getByRole('button', { name: 'Tải xuống' }).click()
    const download = await pending
    expect(download.suggestedFilename()).toBe('zeno-anh-mau.zip')
    const bytes = await readFile((await download.path())!)
    expect(zipEntryNames(bytes)).toEqual(['ZENO_0001.webp', 'ZENO_0004.webp'])
    await expect(demo(page).getByRole('status')).toHaveText('Đã tạo ZIP 2 ảnh mẫu (.webp).')
  })

  test('autoplay never overwrites the manual selection and resumes where it left off', async ({ page }) => {
    await openManual(page)
    await screen(page).getByRole('button', { name: 'Chọn ZENO_0007.jpg' }).click()
    await page.getByRole('button', { name: 'Xem demo' }).click()
    await expect(demo(page)).toHaveAttribute('data-demo-mode', 'demo')
    await expect(screen(page)).toHaveAttribute('role', 'img')
    await page.getByRole('button', { name: 'Tự chọn ảnh', exact: true }).click()
    await expect(demo(page)).toHaveAttribute('data-demo-count', '1')
    await expect(screen(page).getByRole('button', { name: 'Bỏ chọn ZENO_0007.jpg' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('works from the keyboard: mode switch, hearts, filter and preview', async ({ page }) => {
    await gotoHydrated(page)
    const manual = page.getByRole('button', { name: 'Tự chọn ảnh', exact: true })
    await manual.focus()
    await page.keyboard.press('Enter')
    await expect(manual).toHaveAttribute('aria-pressed', 'true')
    const heart = screen(page).getByRole('button', { name: 'Chọn ZENO_0002.jpg' })
    await heart.focus()
    await page.keyboard.press('Space')
    await expect(screen(page).getByRole('button', { name: 'Bỏ chọn ZENO_0002.jpg' })).toBeFocused()
    await expect(screen(page).getByText('1 ảnh đã chọn')).toBeVisible()
    await screen(page).getByRole('button', { name: 'Xem ảnh ZENO_0002.jpg' }).focus()
    await page.keyboard.press('Enter')
    const dialog = screen(page).getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Đóng ảnh' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: '♥ Đã chọn' })).toBeFocused()
    await page.keyboard.press('Tab') // focus stays inside the preview
    await expect(dialog.getByRole('button', { name: 'Đóng ảnh' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(screen(page).getByRole('button', { name: 'Xem ảnh ZENO_0002.jpg' })).toBeFocused()
  })

  test('does not touch the album page layout preference', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('zeno-gallery-layout', 'list'))
    await openManual(page)
    await screen(page).getByRole('button', { name: 'Lưới', exact: true }).click()
    expect(await page.evaluate(() => localStorage.getItem('zeno-gallery-layout'))).toBe('list')
  })
})

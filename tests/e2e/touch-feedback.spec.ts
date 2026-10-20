import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test('touch CTA gives brief press feedback and respects reduced motion', async ({ page }) => {
  await page.goto('/create')
  const cta = page.getByRole('button', { name: 'Tạo và xuất bản album' })
  await expect(cta).toBeVisible()
  await expect(cta).toBeEnabled()
  expect(await page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches)).toBe(true)

  await cta.scrollIntoViewIfNeeded()
  const box = await cta.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await expect.poll(() => cta.evaluate(element => getComputedStyle(element).transform)).toContain('0.98')
  await page.mouse.up()
  await expect.poll(() => cta.evaluate(element => getComputedStyle(element).transform)).toBe('none')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.mouse.down()
  await expect.poll(() => cta.evaluate(element => getComputedStyle(element).transform)).toBe('none')
  await page.mouse.up()
})

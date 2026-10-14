import { expect, test } from '@playwright/test'

test('invitation page asks an anonymous recipient to sign in', async ({ page }) => {
  await page.route('**/api/auth/get-session', route => route.fulfill({
    status: 200, contentType: 'application/json', body: 'null',
  }))
  await page.goto(`/studio/invite?token=${'a'.repeat(43)}`)
  await expect(page.getByRole('heading', { name: 'Lời mời vào studio' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Đăng nhập / tạo tài khoản' })).toBeVisible()
})

test('invitation page rejects a malformed link', async ({ page }) => {
  await page.goto('/studio/invite?token=invalid')
  await expect(page.getByRole('alert')).toContainText('không hợp lệ')
})

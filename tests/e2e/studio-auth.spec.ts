import { expect, test } from '@playwright/test'

test('studio login offers sign in, registration and recovery', async ({ page }) => {
  await page.goto('/studio')
  await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Mật khẩu')).toBeVisible()
  await expect(page.locator('form').getByRole('button', { name: 'Đăng nhập' })).toBeVisible()
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click()
  await expect(page.getByLabel('Tên studio hoặc tên của bạn')).toBeVisible()
  await page.getByRole('button', { name: 'Quên mật khẩu?' }).click()
  await expect(page.getByRole('heading', { name: 'Lấy lại mật khẩu' })).toBeVisible()
})

test('password reset link requires a token and allows a new password', async ({ page }) => {
  await page.goto('/studio/reset-password')
  await expect(page.getByRole('heading', { name: 'Liên kết không hợp lệ' })).toBeVisible()
  await page.goto('/studio/reset-password?token=sample-token')
  await expect(page.getByRole('heading', { name: 'Đặt lại mật khẩu' })).toBeVisible()
  await expect(page.getByLabel('Mật khẩu mới')).toBeVisible()
  await expect(page.getByLabel('Xác nhận mật khẩu')).toBeVisible()
})

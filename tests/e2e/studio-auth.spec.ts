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

test('an unverified account can request a new verification email after signup', async ({ page }) => {
  let resendCount = 0
  await page.route('**/api/auth/get-session', route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }))
  await page.route('**/api/auth/sign-up/email', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ token: null, user: { id: 'test-user', email: 'studio@example.com', emailVerified: false } }),
  }))
  await page.route('**/api/auth/send-verification-email', route => {
    resendCount++
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":true}' })
  })

  await page.goto('/studio')
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click()
  await page.getByLabel('Tên studio hoặc tên của bạn').fill('Studio Mẫu')
  await page.getByLabel('Email').fill('studio@example.com')
  await page.getByLabel('Mật khẩu').fill('test-password-123')
  await page.locator('form').getByRole('button', { name: 'Tạo tài khoản' }).click()
  await expect(page.getByText('Kiểm tra email để xác minh tài khoản trước khi đăng nhập.')).toBeVisible()
  await page.getByRole('button', { name: 'Gửi lại email xác minh' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Kiểm tra hộp thư' })).toBeVisible()
  expect(resendCount).toBe(1)
})

test('an existing unverified account can resend from sign in without registering again', async ({ page }) => {
  let resendCount = 0
  await page.route('**/api/auth/get-session', route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }))
  await page.route('**/api/auth/send-verification-email', route => {
    resendCount++
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":true}' })
  })

  await page.goto('/studio')
  await expect(page.getByRole('button', { name: 'Tạo tài khoản' })).toBeEnabled()
  await page.getByLabel('Email').fill('studio@example.com')
  await page.getByRole('button', { name: 'Gửi lại email xác minh' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Kiểm tra hộp thư' })).toBeVisible()
  expect(resendCount).toBe(1)
})

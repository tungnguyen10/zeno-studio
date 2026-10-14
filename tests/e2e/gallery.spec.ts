import { expect, test } from '@playwright/test'

const albumId = '11111111-1111-4111-8111-111111111111'
const photoId = '22222222-2222-4222-8222-222222222222'

test('customer opens album, saves a selection and an independent note', async ({ page }) => {
  let selected = false
  let version = 0
  let note = ''
  let noteVersion = 0
  let releaseNoteRead: () => void = () => {}
  const noteRead = new Promise<void>(resolve => { releaseNoteRead = resolve })
  await page.route(`**/api/album/${albumId}/**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access') && request.method() === 'POST') return json({ scope: 'customer', participantId: photoId })
    if (path.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Album mẫu', status: 'PUBLISHED', expiresAt: '2030-01-01T00:00:00Z',
      participant: { id: photoId, displayName: 'Lan' },
      settings: { limitKind: 'maximum', limitMin: null, limitMax: 5, collaborationMode: 'shared', shortlistRounds: 1 },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, filename: 'Ảnh A.JPG', width: 800, height: 1000, status: 'READY', sortOrder: 0 }], nextCursor: null })
    if (path.endsWith('/selection') && request.method() === 'GET') return json({ version, selectedPhotoIds: selected ? [photoId] : [] })
    if (path.endsWith(`/selection/${photoId}`)) {
      selected = (request.postDataJSON() as { selected: boolean }).selected
      version++
      return json({ status: 'saved', version, selected, count: selected ? 1 : 0 })
    }
    if (path.endsWith(`/notes/${photoId}`) && request.method() === 'GET') {
      await noteRead
      return json({ body: note, version: noteVersion })
    }
    if (path.endsWith(`/notes/${photoId}`)) {
      note = (request.postDataJSON() as { text: string }).text
      noteVersion++
      return json({ status: 'saved', version: noteVersion, body: note })
    }
    if (path.endsWith('/image')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#ddd"/></svg>' })
    return route.continue()
  })

  await page.goto(`/album/${albumId}?token=${'a'.repeat(43)}`)
  await expect(page.getByRole('heading', { name: 'Album mẫu' })).toBeVisible()
  await expect(page).toHaveURL(`/album/${albumId}`)
  await page.getByRole('button', { name: 'Chọn Ảnh A.JPG' }).click()
  await expect(page.getByText('1 ảnh đã chọn')).toBeVisible()
  await page.getByRole('button', { name: 'Mở ảnh Ảnh A.JPG' }).click()
  await expect(page.getByLabel('Ghi chú chỉnh sửa')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Lưu ghi chú' })).toBeDisabled()
  releaseNoteRead()
  await expect(page.getByLabel('Ghi chú chỉnh sửa')).toBeEnabled()
  await page.getByLabel('Ghi chú chỉnh sửa').fill('Chỉnh sáng')
  await page.getByRole('button', { name: 'Lưu ghi chú' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu ghi chú' })).toBeVisible()
  expect(note).toBe('Chỉnh sáng')
})

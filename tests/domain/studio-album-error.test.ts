import { describe, expect, it } from 'vitest'
import { studioAlbumErrorMessage } from '../../app/lib/studio-album-error'

describe('studio album error feedback', () => {
  it('explains the Drive verification gate without showing the raw request URL', () => {
    expect(studioAlbumErrorMessage({
      status: 503,
      message: '[POST] /api/studio/example/albums: 503',
      data: { statusMessage: 'Nguồn Google Drive đang chờ kiểm chứng API chính thức' },
    })).toBe('Nguồn Google Drive chưa sẵn sàng. Vui lòng thử lại sau hoặc liên hệ người quản trị.')
  })

  it('shows an actionable server message for folder permission errors', () => {
    expect(studioAlbumErrorMessage({
      status: 422,
      data: { statusMessage: 'Không đọc được thư mục Drive. Hãy kiểm tra quyền chia sẻ.' },
    })).toBe('Không đọc được thư mục Drive. Hãy kiểm tra quyền chia sẻ.')
  })

  it('uses a safe fallback when no server message exists', () => {
    expect(studioAlbumErrorMessage(new Error('internal fetch details'))).toBe('Không thể tạo album. Vui lòng thử lại.')
  })
})

export function studioAlbumErrorMessage(error: unknown): string {
  const response = error && typeof error === 'object' ? error as { data?: { statusMessage?: unknown } } : null
  const statusMessage = response?.data?.statusMessage
  if (statusMessage === 'Nguồn Google Drive đang chờ kiểm chứng API chính thức') {
    return 'Nguồn Google Drive chưa sẵn sàng. Vui lòng thử lại sau hoặc liên hệ người quản trị.'
  }
  if (typeof statusMessage === 'string' && statusMessage.trim()) return statusMessage
  return 'Không thể tạo album. Vui lòng thử lại.'
}

export async function reportGalleryOpen(albumId: string, studioFlag: unknown): Promise<boolean> {
  if (String(studioFlag) !== 'true') return false
  await $fetch(`/api/album/${albumId}/analytics/open`, { method: 'POST' })
  return true
}

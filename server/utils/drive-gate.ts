import { GoogleDriveAdapter } from '../photo-sources/google-drive'

export function requireVerifiedDriveSource(): GoogleDriveAdapter {
  const apiKey = process.env.NUXT_GOOGLE_API_KEY
  if (process.env.NUXT_DRIVE_VERIFIED !== 'true' || !apiKey) {
    throw createError({ statusCode: 503, statusMessage: 'Nguồn Google Drive đang chờ kiểm chứng API chính thức' })
  }
  return new GoogleDriveAdapter(apiKey)
}

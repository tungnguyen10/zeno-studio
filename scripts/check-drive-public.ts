import { pathToFileURL } from 'node:url'
import { DriveSourceError, GoogleDriveAdapter, InvalidDriveFolderLinkError } from '../server/photo-sources/google-drive'
import { DriveVerificationError, verifyPublicDrive } from '../server/photo-sources/verify-public-drive'

async function main() {
  const apiKey = process.env.NUXT_GOOGLE_API_KEY
  const folderUrl = process.env.NUXT_DRIVE_SAMPLE_FOLDER_URL
  if (!apiKey || !folderUrl) throw new DriveVerificationError('Thiếu NUXT_GOOGLE_API_KEY hoặc NUXT_DRIVE_SAMPLE_FOLDER_URL')
  if (apiKey.endsWith('.apps.googleusercontent.com')) {
    throw new DriveVerificationError('NUXT_GOOGLE_API_KEY đang là OAuth Client ID; cần Google Cloud API key cho Drive API')
  }
  const result = await verifyPublicDrive(new GoogleDriveAdapter(apiKey), folderUrl)
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const result = error instanceof DriveSourceError
      ? { ok: false, kind: 'drive_api', status: error.status, reason: error.reason ?? null }
      : error instanceof DriveVerificationError || error instanceof InvalidDriveFolderLinkError
        ? { ok: false, kind: 'verification', message: error.message, ...(error instanceof DriveVerificationError ? error.stats : {}) }
        : { ok: false, kind: 'unexpected' }
    process.stderr.write(`${JSON.stringify(result)}\n`)
    process.exitCode = 1
  })
}

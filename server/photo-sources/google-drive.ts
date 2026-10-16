import type { FolderReference, PhotoPage, PhotoSourceAdapter, SourcePhoto } from './photo-source'

const driveId = /^[A-Za-z0-9_-]{3,}$/

function isTrustedThumbnailLink(input: string): boolean {
  try {
    const url = new URL(input)
    return url.protocol === 'https:' && (url.hostname === 'drive.google.com' || url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))
  } catch { return false }
}

export class DriveSourceError extends Error {
  constructor(public status: number, message: string, public reason?: string) { super(message) }
}

export class InvalidDriveFolderLinkError extends Error {}

async function errorReason(response: Response): Promise<string | undefined> {
  if (!response.headers.get('content-type')?.includes('application/json')) return undefined
  try {
    const body = await response.json() as { error?: { details?: Array<{ reason?: string }>; errors?: Array<{ reason?: string }>; status?: string } }
    return body.error?.details?.find(detail => detail.reason)?.reason ?? body.error?.errors?.[0]?.reason ?? body.error?.status
  } catch {
    return undefined
  }
}

export function parseGoogleDriveFolderLink(input: string): FolderReference {
  let url: URL
  try { url = new URL(input) } catch { throw new InvalidDriveFolderLinkError('Google Drive folder link không hợp lệ') }
  if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') throw new InvalidDriveFolderLinkError('Google Drive folder link không hợp lệ')
  const folderId = url.pathname.match(/^\/drive\/folders\/([A-Za-z0-9_-]+)/)?.[1]
    ?? (url.pathname === '/drive/u/0/folders' ? url.searchParams.get('id') : null)
  if (!folderId || !driveId.test(folderId)) throw new InvalidDriveFolderLinkError('Google Drive folder link không hợp lệ')
  const resourceKey = url.searchParams.get('resourcekey') ?? undefined
  return { folderId, ...(resourceKey ? { resourceKey } : {}) }
}

interface DriveFile {
  id?: string
  name?: string
  mimeType?: string
  resourceKey?: string
  thumbnailLink?: string
  imageMediaMetadata?: { width?: number; height?: number }
}

export class GoogleDriveAdapter implements PhotoSourceAdapter {
  constructor(private apiKey: string, private fetcher: typeof fetch = fetch) {}

  private async request(url: string, headers: Record<string, string>, redirect?: RequestRedirect): Promise<Response> {
    try { return await this.fetcher(url, { headers, ...(redirect ? { redirect } : {}) }) }
    catch (error) {
      if (error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new DriveSourceError(502, 'Google Drive request failed', 'NETWORK_ERROR')
      }
      throw error
    }
  }

  async listPhotos(folder: FolderReference, pageToken?: string): Promise<PhotoPage> {
    if (!driveId.test(folder.folderId)) throw new Error('Invalid Google Drive folder ID')
    const url = new URL('https://www.googleapis.com/drive/v3/files')
    url.searchParams.set('q', `'${folder.folderId}' in parents and trashed = false`)
    url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,resourceKey,thumbnailLink,imageMediaMetadata(width,height))')
    url.searchParams.set('pageSize', '1000')
    url.searchParams.set('supportsAllDrives', 'true')
    url.searchParams.set('includeItemsFromAllDrives', 'true')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const headers: Record<string, string> = { Accept: 'application/json', 'x-goog-api-key': this.apiKey }
    if (folder.resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${folder.folderId}/${folder.resourceKey}`
    const response = await this.request(url.toString(), headers)
    if (!response.ok) throw new DriveSourceError(response.status, `Google Drive folder request failed (${response.status})`, await errorReason(response))
    const body = await response.json() as { nextPageToken?: string; files?: DriveFile[] }
    const items: SourcePhoto[] = (body.files ?? [])
      .filter(file => file.id && file.name && file.mimeType?.startsWith('image/'))
      .map(file => ({
        id: file.id!, filename: file.name!, mimeType: file.mimeType!,
        ...(file.resourceKey ? { resourceKey: file.resourceKey } : {}),
        ...(file.thumbnailLink ? { thumbnailLink: file.thumbnailLink } : {}),
        ...(file.imageMediaMetadata?.width ? { width: file.imageMediaMetadata.width } : {}),
        ...(file.imageMediaMetadata?.height ? { height: file.imageMediaMetadata.height } : {}),
      }))
    return { items, ...(body.nextPageToken ? { nextPageToken: body.nextPageToken } : {}) }
  }

  async readPhoto(fileId: string, resourceKey?: string): Promise<Response> {
    if (!driveId.test(fileId)) throw new Error('Invalid Google Drive file ID')
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`)
    url.searchParams.set('alt', 'media')
    const headers: Record<string, string> = { 'x-goog-api-key': this.apiKey }
    if (resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${fileId}/${resourceKey}`
    const response = await this.request(url.toString(), headers)
    if (!response.ok) throw new DriveSourceError(response.status, `Google Drive photo request failed (${response.status})`, await errorReason(response))
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('image/')) {
      throw new DriveSourceError(502, 'Google Drive did not return image content')
    }
    return response
  }

  async readThumbnail(fileId: string, resourceKey?: string, cachedThumbnailLink?: string): Promise<{ response: Response; thumbnailLink: string; refreshed: boolean }> {
    if (!driveId.test(fileId)) throw new Error('Invalid Google Drive file ID')

    const fetchImage = async (link: string): Promise<Response> => {
      if (!isTrustedThumbnailLink(link)) throw new DriveSourceError(502, 'Google Drive returned an invalid thumbnail link')
      let url = link
      for (let redirects = 0; redirects < 4; redirects++) {
        const response = await this.request(url, {}, 'manual')
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location')
          if (!location) throw new DriveSourceError(502, 'Google Drive thumbnail redirect missing')
          url = new URL(location, url).toString()
          if (!isTrustedThumbnailLink(url)) throw new DriveSourceError(502, 'Google Drive thumbnail redirect invalid')
          continue
        }
        if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('image/')) {
          throw new DriveSourceError(502, 'Google Drive thumbnail request failed')
        }
        return response
      }
      throw new DriveSourceError(502, 'Google Drive thumbnail redirected too many times')
    }

    if (cachedThumbnailLink && isTrustedThumbnailLink(cachedThumbnailLink)) {
      try {
        return { response: await fetchImage(cachedThumbnailLink), thumbnailLink: cachedThumbnailLink, refreshed: false }
      } catch (error) {
        if (!(error instanceof DriveSourceError)) throw error
      }
    }

    const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`)
    url.searchParams.set('fields', 'thumbnailLink')
    const headers: Record<string, string> = { Accept: 'application/json', 'x-goog-api-key': this.apiKey }
    if (resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${fileId}/${resourceKey}`
    const metadata = await this.request(url.toString(), headers)
    if (!metadata.ok) throw new DriveSourceError(metadata.status, `Google Drive thumbnail metadata request failed (${metadata.status})`, await errorReason(metadata))
    const body = await metadata.json() as { thumbnailLink?: string }
    if (!body.thumbnailLink || !isTrustedThumbnailLink(body.thumbnailLink)) throw new DriveSourceError(502, 'Google Drive thumbnail unavailable')
    return { response: await fetchImage(body.thumbnailLink), thumbnailLink: body.thumbnailLink, refreshed: true }
  }
}

import { randomUUID } from 'node:crypto'
import type { ConnectionPool } from '../db/context'
import { withDatabaseContext } from '../db/context'
import type { PhotoSourceAdapter } from '../photo-sources/photo-source'
import { InvalidDriveFolderLinkError, parseGoogleDriveFolderLink } from '../photo-sources/google-drive'
import { hashAccessToken, issueAccessToken } from '../security/access-token'
import { StudioOperationError } from '../studios/error'
import type { SelectionLimit } from '../../shared/domain/selection'
import { collectPhotos, insertAlbumRecords, validateAlbumInput } from './album'
import { withManagedAlbum } from './manager'

type GuestCreateInput = { title: string; folderUrl: string; expiresInDays: 15 | 30; limit: SelectionLimit }

export async function createGuestAlbum(_pool: ConnectionPool, _source: PhotoSourceAdapter, _input: GuestCreateInput): Promise<{ id: string; status: 'PUBLISHED'; photoCount: number; adminToken: string; customerToken: string }> {
  validateAlbumInput(_input)
  let folder: ReturnType<typeof parseGoogleDriveFolderLink>
  try { folder = parseGoogleDriveFolderLink(_input.folderUrl) }
  catch (error) {
    if (error instanceof InvalidDriveFolderLinkError) throw new StudioOperationError(error.message, 400)
    throw error
  }
  const photos = await collectPhotos(_source, folder)
  const studioId = randomUUID()
  const albumId = randomUUID()
  const admin = issueAccessToken()
  const customer = issueAccessToken()
  await withDatabaseContext(_pool, { studioId, albumId, scope: 'guest_admin' }, async client => {
    await client.query('INSERT INTO studios (id, name, guest_only) VALUES ($1, $2, true)', [studioId, _input.title.trim()])
    await insertAlbumRecords(client, studioId, albumId, folder, photos, _input, true)
    await client.query('INSERT INTO album_tokens (id, album_id, scope, token_hash) VALUES ($1, $2, $3, $4), ($5, $2, $6, $7)',
      [randomUUID(), albumId, 'guest_admin', admin.tokenHash, randomUUID(), 'customer', customer.tokenHash])
  })
  return { id: albumId, status: 'PUBLISHED', photoCount: photos.length, adminToken: admin.token, customerToken: customer.token }
}

export async function createGuestShareLink(_pool: ConnectionPool, _albumId: string, _adminToken: string): Promise<{ customerToken: string }> {
  return withManagedAlbum(_pool, { kind: 'guest', albumId: _albumId, token: _adminToken }, _albumId, 'album.view', async client => {
    const album = await client.query<{ status: string; active: boolean }>(
      'SELECT status, expires_at > now() AS active FROM albums WHERE id = $1 FOR UPDATE', [_albumId])
    if (!album.rows[0]?.active || !['PUBLISHED', 'FINALIZED', 'DELIVERED'].includes(album.rows[0].status)) {
      throw new StudioOperationError('Album chưa xuất bản hoặc đã hết hạn', 409)
    }
    const token = issueAccessToken()
    await client.query('INSERT INTO album_tokens (id, album_id, scope, token_hash) VALUES ($1, $2, $3, $4)',
      [randomUUID(), _albumId, 'customer', token.tokenHash])
    return { customerToken: token.token }
  })
}

export async function claimGuestAlbum(_pool: ConnectionPool, _albumId: string, _adminToken: string, _studioId: string, _userId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(_adminToken)) throw new StudioOperationError('Link quản trị không hợp lệ', 403)
  const result = await withDatabaseContext(_pool, { studioId: _studioId, userId: _userId, scope: 'member' },
    client => client.query<{ claimed: boolean }>('SELECT app_private.claim_guest_album($1, $2, $3) AS claimed',
      [_albumId, hashAccessToken(_adminToken), _studioId]))
  if (!result.rows[0]?.claimed) throw new StudioOperationError('Không thể nhận album bằng link hoặc studio này', 403)
}

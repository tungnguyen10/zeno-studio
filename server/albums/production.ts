import { randomUUID } from 'node:crypto'
import { withDatabaseContext, type ConnectionPool, type QueryClient } from '../db/context'
import { StudioOperationError } from '../studios/error'
import { canTransitionProduction, type ProductionStatus } from '../../shared/domain/workflow'
import type { AlbumAccess } from './access'
import { withManagedAlbum, type AlbumManager } from './manager'

async function latestVersion(client: QueryClient, albumId: string): Promise<{ id: string; version_number: number }> {
  const result = await client.query<{ id: string; version_number: number }>(
    'SELECT id, version_number FROM selection_versions WHERE album_id = $1 ORDER BY version_number DESC LIMIT 1', [albumId])
  if (!result.rows[0]) throw new StudioOperationError('Album chưa có bộ ảnh đã chốt', 409)
  return result.rows[0]
}

export async function listProductionTasks(pool: ConnectionPool, studioId: string, userId: string, albumId: string) {
  return listManagedProductionTasks(pool, { kind: 'member', studioId, userId }, albumId)
}

export async function listManagedProductionTasks(pool: ConnectionPool, manager: AlbumManager, albumId: string) {
  return withManagedAlbum(pool, manager, albumId, 'production.update', async (client, session) => {
    const version = await latestVersion(client, albumId)
    const tasks = await client.query<{ id: string; photo_id: string; filename: string; status: ProductionStatus; assigned_user_id: string | null }>(
      `SELECT t.id, i.photo_id, i.filename, t.status, t.assigned_user_id FROM production_tasks t
       JOIN selection_version_items i ON i.id = t.selection_version_item_id
       WHERE i.selection_version_id = $1 ORDER BY i.filename, i.photo_id`, [version.id])
    const review = await client.query<{ round_number: number; status: string }>(
      'SELECT round_number, status FROM review_rounds WHERE selection_version_id = $1 ORDER BY round_number DESC LIMIT 1', [version.id])
    return {
      versionNumber: version.version_number,
      canDeliver: session.canDeliver,
      review: review.rows[0] ? { roundNumber: review.rows[0].round_number, status: review.rows[0].status } : null,
      items: tasks.rows.map(row => ({ id: row.id, photoId: row.photo_id, filename: row.filename, status: row.status, assignedUserId: row.assigned_user_id })),
    }
  })
}

export async function updateProductionTask(pool: ConnectionPool, studioId: string, userId: string, albumId: string, taskId: string, status: ProductionStatus, assignedUserId?: string | null) {
  return updateManagedProductionTask(pool, { kind: 'member', studioId, userId }, albumId, taskId, status, assignedUserId)
}

export async function updateManagedProductionTask(pool: ConnectionPool, manager: AlbumManager, albumId: string, taskId: string, status: ProductionStatus, assignedUserId?: string | null) {
  if (status !== 'RETOUCHING' && status !== 'WAITING_REVIEW') throw new StudioOperationError('Trạng thái này chỉ đổi qua duyệt hoặc bàn giao', 400)
  if (manager.kind === 'guest' && assignedUserId !== undefined) throw new StudioOperationError('Guest không thể phân công thành viên', 400)
  return withManagedAlbum(pool, manager, albumId, 'production.update', async (client, session) => {
    const task = await client.query<{ id: string; status: ProductionStatus; assigned_user_id: string | null }>(
      'SELECT id, status, assigned_user_id FROM production_tasks WHERE id = $1 AND album_id = $2 FOR UPDATE', [taskId, albumId])
    if (!task.rows[0]) throw new StudioOperationError('Công việc hậu kỳ không tồn tại', 404)
    if (status !== task.rows[0].status && !canTransitionProduction(task.rows[0].status, status)) throw new StudioOperationError('Chuyển trạng thái hậu kỳ không hợp lệ', 409)
    if (assignedUserId) {
      const assignee = await client.query<{ user_id: string }>('SELECT user_id FROM studio_members WHERE studio_id = $1 AND user_id = $2', [session.studioId, assignedUserId])
      if (!assignee.rows[0]) throw new StudioOperationError('Người xử lý không thuộc studio', 400)
    }
    const result = await client.query<{ status: ProductionStatus; assigned_user_id: string | null }>(
      'UPDATE production_tasks SET status = $1, assigned_user_id = $2, updated_at = now() WHERE id = $3 RETURNING status, assigned_user_id',
      [status, assignedUserId === undefined ? task.rows[0].assigned_user_id : assignedUserId, taskId])
    await client.query('INSERT INTO audit_logs (studio_id, album_id, actor_kind, actor_id, action, details) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
      [session.studioId, albumId, session.actorKind, session.actorId, 'production.updated', JSON.stringify({ taskId, from: task.rows[0].status, to: status })])
    return { id: taskId, status: result.rows[0]!.status, assignedUserId: result.rows[0]!.assigned_user_id }
  })
}

function driveUrl(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new StudioOperationError('Link Google Drive không hợp lệ', 400) }
  if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') throw new StudioOperationError('Cần link Google Drive HTTPS', 400)
  return url.toString()
}

export async function startReviewRound(pool: ConnectionPool, studioId: string, userId: string, albumId: string, editedDriveUrl: string) {
  return startManagedReviewRound(pool, { kind: 'member', studioId, userId }, albumId, editedDriveUrl)
}

export async function startManagedReviewRound(pool: ConnectionPool, manager: AlbumManager, albumId: string, editedDriveUrl: string) {
  const url = driveUrl(editedDriveUrl)
  return withManagedAlbum(pool, manager, albumId, 'production.update', async client => {
    const album = await client.query<{ id: string; status: string }>('SELECT id, status FROM albums WHERE id = $1 FOR UPDATE', [albumId])
    if (album.rows[0]?.status !== 'FINALIZED') throw new StudioOperationError('Album chưa ở giai đoạn duyệt', 409)
    const version = await latestVersion(client, albumId)
    const count = await client.query<{ total: number; ready: number }>(
      `SELECT count(*)::integer AS total, count(*) FILTER (WHERE t.status = 'WAITING_REVIEW')::integer AS ready
       FROM production_tasks t JOIN selection_version_items i ON i.id = t.selection_version_item_id
       WHERE i.selection_version_id = $1`, [version.id])
    if (!count.rows[0]?.total || count.rows[0].ready !== count.rows[0].total) throw new StudioOperationError('Cần hoàn tất hậu kỳ cho mọi ảnh trước khi gửi duyệt', 409)
    const last = await client.query<{ round_number: number; status: string; selection_version_id: string }>(
      'SELECT round_number, status, selection_version_id FROM review_rounds WHERE album_id = $1 ORDER BY round_number DESC LIMIT 1', [albumId])
    if (last.rows[0]?.selection_version_id === version.id && last.rows[0].status !== 'REVISION_REQUESTED') throw new StudioOperationError('Vòng duyệt hiện tại chưa thể tạo mới', 409)
    const roundNumber = (last.rows[0]?.round_number ?? 0) + 1
    const id = randomUUID()
    await client.query('INSERT INTO review_rounds (id, album_id, round_number, drive_url, selection_version_id, status) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, albumId, roundNumber, url, version.id, 'WAITING_REVIEW'])
    return { id, roundNumber, driveUrl: url, status: 'WAITING_REVIEW' }
  })
}

export async function getCustomerReview(pool: ConnectionPool, access: AlbumAccess) {
  return withDatabaseContext(pool, { albumId: access.albumId, participantId: access.participantId ?? undefined, scope: access.scope }, async client => {
    const result = await client.query<{ id: string; round_number: number; drive_url: string | null; status: string }>(
      'SELECT id, round_number, drive_url, status FROM review_rounds WHERE album_id = $1 ORDER BY round_number DESC LIMIT 1', [access.albumId])
    const delivery = await client.query<{ drive_url: string }>('SELECT drive_url FROM deliveries WHERE album_id = $1 ORDER BY delivered_at DESC LIMIT 1', [access.albumId])
    return result.rows[0] ? { id: result.rows[0].id, roundNumber: result.rows[0].round_number, driveUrl: result.rows[0].drive_url, status: result.rows[0].status, deliveryUrl: delivery.rows[0]?.drive_url ?? null } : null
  })
}

export async function submitCustomerReview(pool: ConnectionPool, access: AlbumAccess, decision: 'approve' | 'request_revision', note: string) {
  if (!access.participantId || !['customer', 'participant', 'finalizer'].includes(access.scope)) throw new StudioOperationError('Cần tham gia album để duyệt', 403)
  if (decision !== 'approve' && decision !== 'request_revision') throw new StudioOperationError('Quyết định duyệt không hợp lệ', 400)
  if (decision === 'request_revision' && (!note.trim() || note.length > 5000)) throw new StudioOperationError('Cần ghi yêu cầu sửa (tối đa 5.000 ký tự)', 400)
  try {
    return await withDatabaseContext(pool, { albumId: access.albumId, participantId: access.participantId, scope: access.scope }, async client => {
      const result = await client.query<{ status: string }>('SELECT app_private.submit_review($1, $2, $3, $4) AS status', [access.albumId, access.participantId, decision, note])
      return { status: result.rows[0]!.status }
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('review round is closed')) throw new StudioOperationError('Vòng duyệt đã đóng', 409)
    if (error instanceof Error && error.message.includes('review access denied')) throw new StudioOperationError('Không có quyền duyệt album', 403)
    throw error
  }
}

export async function completeDelivery(pool: ConnectionPool, studioId: string, userId: string, albumId: string, deliveryUrl: string) {
  return completeManagedDelivery(pool, { kind: 'member', studioId, userId }, albumId, deliveryUrl)
}

export async function completeManagedDelivery(pool: ConnectionPool, manager: AlbumManager, albumId: string, deliveryUrl: string) {
  const url = driveUrl(deliveryUrl)
  return withManagedAlbum(pool, manager, albumId, 'delivery.manage', async client => {
    const album = await client.query<{ status: string }>('SELECT status FROM albums WHERE id = $1 FOR UPDATE', [albumId])
    if (album.rows[0]?.status !== 'FINALIZED') throw new StudioOperationError('Album không ở trạng thái có thể bàn giao', 409)
    const version = await latestVersion(client, albumId)
    const round = await client.query<{ id: string; status: string }>('SELECT id, status FROM review_rounds WHERE album_id = $1 AND selection_version_id = $2 ORDER BY round_number DESC LIMIT 1', [albumId, version.id])
    if (round.rows[0]?.status !== 'APPROVED') throw new StudioOperationError('Ảnh chưa được khách duyệt', 409)
    const taskCount = await client.query<{ total: number; approved: number }>(
      `SELECT count(*)::integer AS total, count(*) FILTER (WHERE t.status = 'APPROVED')::integer AS approved
       FROM production_tasks t JOIN selection_version_items i ON i.id = t.selection_version_item_id WHERE i.selection_version_id = $1`, [version.id])
    if (!taskCount.rows[0]?.total || taskCount.rows[0].approved !== taskCount.rows[0].total) throw new StudioOperationError('Còn ảnh chưa duyệt', 409)
    await client.query('INSERT INTO deliveries (id, album_id, review_round_id, selection_version_id, drive_url) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), albumId, round.rows[0].id, version.id, url])
    await client.query(`UPDATE production_tasks t SET status = 'DELIVERED', updated_at = now()
      FROM selection_version_items i WHERE t.selection_version_item_id = i.id AND i.selection_version_id = $1`, [version.id])
    await client.query("UPDATE albums SET status = 'DELIVERED', updated_at = now() WHERE id = $1", [albumId])
    return { driveUrl: url, versionNumber: version.version_number }
  })
}

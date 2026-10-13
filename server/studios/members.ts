import { randomUUID } from 'node:crypto'
import { withDatabaseContext, type ConnectionPool, type QueryClient } from '../db/context'
import { hashAccessToken, issueAccessToken } from '../security/access-token'
import { getStudiosForUser, type StudioWorkspace } from './studio'
import { StudioOperationError } from './error'

export type InvitedRole = 'manager' | 'member' | 'retoucher'
export interface StudioMember {
  userId: string
  role: StudioWorkspace['role']
  email: string | null
}
export interface StudioInvitation {
  id: string
  email: string
  role: InvitedRole
  expiresAt: Date
  acceptedAt: Date | null
  revokedAt: Date | null
}

async function actorRole(client: QueryClient, studioId: string, actorUserId: string): Promise<StudioWorkspace['role'] | undefined> {
  const result = await client.query<{ role: StudioWorkspace['role'] }>(
    'SELECT role FROM studio_members WHERE studio_id = $1 AND user_id = $2', [studioId, actorUserId])
  return result.rows[0]?.role
}

function normalizedEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new StudioOperationError('Email mời không hợp lệ', 400)
  return normalized
}

export async function getStudioMembers(pool: ConnectionPool, studioId: string, actorUserId: string): Promise<StudioMember[]> {
  return withDatabaseContext(pool, { studioId, userId: actorUserId, scope: 'member' }, async client => {
    const role = await actorRole(client, studioId, actorUserId)
    if (role !== 'owner' && role !== 'manager') throw new StudioOperationError('Không có quyền xem thành viên', 403)
    const result = await client.query<{ user_id: string; role: StudioWorkspace['role']; email: string | null }>(
      'SELECT m.user_id, m.role, u.email FROM studio_members m LEFT JOIN "user" u ON u.id = m.user_id WHERE m.studio_id = $1 ORDER BY m.created_at, m.user_id', [studioId])
    return result.rows.map(row => ({ userId: row.user_id, role: row.role, email: row.email }))
  })
}

export async function createStudioInvitation(
  pool: ConnectionPool, studioId: string, actorUserId: string, email: string, role: InvitedRole,
): Promise<{ id: string; email: string; role: InvitedRole; token: string; expiresAt: Date }> {
  if (!['manager', 'member', 'retoucher'].includes(role)) throw new StudioOperationError('Vai trò không hợp lệ', 400)
  const recipient = normalizedEmail(email)
  const issued = issueAccessToken()
  const id = randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await withDatabaseContext(pool, { studioId, userId: actorUserId, scope: 'member' }, async client => {
    const actor = await actorRole(client, studioId, actorUserId)
    if (actor !== 'owner' && actor !== 'manager') throw new StudioOperationError('Không có quyền mời thành viên', 403)
    if (role === 'manager' && actor !== 'owner') throw new StudioOperationError('Chỉ chủ studio có thể mời quản lý', 403)
    await client.query(
      'INSERT INTO studio_invitations (id, studio_id, email, role, token_hash, expires_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, studioId, recipient, role, issued.tokenHash, expiresAt, actorUserId],
    )
  })
  return { id, email: recipient, role, token: issued.token, expiresAt }
}

export async function getStudioInvitations(pool: ConnectionPool, studioId: string, actorUserId: string): Promise<StudioInvitation[]> {
  return withDatabaseContext(pool, { studioId, userId: actorUserId, scope: 'member' }, async client => {
    const role = await actorRole(client, studioId, actorUserId)
    if (role !== 'owner' && role !== 'manager') throw new StudioOperationError('Không có quyền xem lời mời', 403)
    const result = await client.query<{ id: string; email: string; role: InvitedRole; expires_at: Date; accepted_at: Date | null; revoked_at: Date | null }>(
      'SELECT id, email, role, expires_at, accepted_at, revoked_at FROM studio_invitations WHERE studio_id = $1 ORDER BY created_at DESC', [studioId])
    return result.rows.map(row => ({ id: row.id, email: row.email, role: row.role, expiresAt: row.expires_at, acceptedAt: row.accepted_at, revokedAt: row.revoked_at }))
  })
}

export async function revokeStudioInvitation(pool: ConnectionPool, studioId: string, actorUserId: string, invitationId: string): Promise<void> {
  await withDatabaseContext(pool, { studioId, userId: actorUserId, scope: 'member' }, async client => {
    const role = await actorRole(client, studioId, actorUserId)
    if (role !== 'owner' && role !== 'manager') throw new StudioOperationError('Không có quyền thu hồi lời mời', 403)
    const revoked = await client.query<{ id: string }>(
      'UPDATE studio_invitations SET revoked_at = now() WHERE id = $1 AND studio_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id',
      [invitationId, studioId])
    if (!revoked.rows.length) throw new StudioOperationError('Không tìm thấy lời mời đang hiệu lực', 404)
  })
}

export async function acceptStudioInvitation(
  pool: ConnectionPool, token: string, userId: string, userEmail: string,
): Promise<StudioWorkspace> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new StudioOperationError('Liên kết mời không hợp lệ hoặc đã hết hạn', 410)
  const invitationHash = hashAccessToken(token)
  const email = normalizedEmail(userEmail)
  const studioId = await withDatabaseContext(pool, { userId, userEmail: email, invitationHash, scope: 'invitation_accept' }, async client => {
    const verified = await client.query<{ id: string }>(
      'SELECT id FROM "user" WHERE id = $1 AND lower(email) = $2 AND "emailVerified" = true', [userId, email])
    if (!verified.rows.length) throw new StudioOperationError('Cần tài khoản đã xác minh đúng email được mời', 403)
    const result = await client.query<{ id: string; studio_id: string; role: InvitedRole }>(
      'SELECT id, studio_id, role FROM studio_invitations WHERE token_hash = $1 AND accepted_at IS NULL', [invitationHash])
    const invitation = result.rows[0]
    if (!invitation) throw new StudioOperationError('Liên kết mời không hợp lệ hoặc đã hết hạn', 410)
    await client.query(
      'INSERT INTO studio_members (studio_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (studio_id, user_id) DO NOTHING',
      [invitation.studio_id, userId, invitation.role],
    )
    const accepted = await client.query<{ id: string }>(
      'UPDATE studio_invitations SET accepted_at = now() WHERE id = $1 AND accepted_at IS NULL RETURNING id', [invitation.id])
    if (!accepted.rows.length) throw new StudioOperationError('Liên kết mời đã được dùng', 410)
    return invitation.studio_id
  })
  const studio = (await getStudiosForUser(pool, userId)).find(item => item.id === studioId)
  if (!studio) throw new Error('Không thể tải studio vừa tham gia')
  return studio
}

export async function updateStudioMemberRole(
  pool: ConnectionPool, studioId: string, actorUserId: string, memberUserId: string, role: InvitedRole,
): Promise<void> {
  if (!['manager', 'member', 'retoucher'].includes(role)) throw new StudioOperationError('Vai trò không hợp lệ', 400)
  await withDatabaseContext(pool, { studioId, userId: actorUserId, scope: 'member' }, async client => {
    if (await actorRole(client, studioId, actorUserId) !== 'owner') throw new StudioOperationError('Chỉ chủ studio có thể đổi vai trò', 403)
    const updated = await client.query<{ user_id: string }>(
      "UPDATE studio_members SET role = $1 WHERE studio_id = $2 AND user_id = $3 AND role <> 'owner' RETURNING user_id",
      [role, studioId, memberUserId])
    if (!updated.rows.length) throw new StudioOperationError('Không tìm thấy thành viên có thể đổi vai trò', 404)
  })
}

export async function revokeStudioMember(
  pool: ConnectionPool, studioId: string, actorUserId: string, memberUserId: string,
): Promise<void> {
  await withDatabaseContext(pool, { studioId, userId: actorUserId, scope: 'member' }, async client => {
    if (await actorRole(client, studioId, actorUserId) !== 'owner') throw new StudioOperationError('Chỉ chủ studio có thể thu hồi quyền', 403)
    const deleted = await client.query<{ user_id: string }>(
      "DELETE FROM studio_members WHERE studio_id = $1 AND user_id = $2 AND role <> 'owner' RETURNING user_id",
      [studioId, memberUserId])
    if (!deleted.rows.length) throw new StudioOperationError('Không tìm thấy thành viên có thể thu hồi', 404)
  })
}

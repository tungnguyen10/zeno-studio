import { randomUUID } from 'node:crypto'
import { withDatabaseContext, type ConnectionPool } from '../db/context'
import { StudioOperationError } from './error'

export interface StudioWorkspace {
  id: string
  name: string
  role: 'owner' | 'manager' | 'member' | 'retoucher'
}

type MembershipRow = {
  studio_id: string
  role: StudioWorkspace['role']
}

export async function getStudiosForUser(pool: ConnectionPool, userId: string): Promise<StudioWorkspace[]> {
  if (!userId) throw new Error('User ID is required')
  const memberships = await withDatabaseContext(pool, { userId, scope: 'studio_member_lookup' },
    client => client.query<MembershipRow>('SELECT studio_id, role FROM studio_members WHERE user_id = $1 ORDER BY created_at, studio_id', [userId]))

  const studios: StudioWorkspace[] = []
  for (const membership of memberships.rows) {
    const result = await withDatabaseContext(pool, { studioId: membership.studio_id, userId, scope: 'member' },
      client => client.query<{ id: string; name: string }>('SELECT id, name FROM studios WHERE id = $1', [membership.studio_id]))
    const studio = result.rows[0]
    if (!studio) throw new Error('Studio membership points to an unavailable studio')
    studios.push({ ...studio, role: membership.role })
  }
  return studios
}

export async function ensureStudio(pool: ConnectionPool, userId: string, requestedName: string): Promise<StudioWorkspace> {
  if (!userId) throw new Error('User ID is required')
  const name = requestedName.trim()
  if (!name || name.length > 120) throw new StudioOperationError('Studio name must be 1–120 characters', 400)
  const existing = (await getStudiosForUser(pool, userId)).find(studio => studio.role === 'owner')
  if (existing) return existing

  const id = randomUUID()
  try {
    return await withDatabaseContext(pool, { studioId: id, userId, scope: 'bootstrap' }, async client => {
      await client.query('INSERT INTO studios (id, name, owner_user_id) VALUES ($1, $2, $3)', [id, name, userId])
      await client.query('INSERT INTO studio_members (studio_id, user_id, role) VALUES ($1, $2, $3)', [id, userId, 'owner'])
      return { id, name, role: 'owner' as const }
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      const winner = (await getStudiosForUser(pool, userId)).find(studio => studio.role === 'owner')
      if (winner) return winner
    }
    throw error
  }
}

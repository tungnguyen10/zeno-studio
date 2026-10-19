import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { acceptStudioInvitation, createStudioInvitation, getStudioInvitations, getStudioMembers, revokeStudioInvitation, revokeStudioMember, updateStudioMemberRole } from '../../server/studios/members'
import { ensureStudio, getStudiosForUser } from '../../server/studios/studio'
import { withDatabaseContext } from '../../server/db/context'

const db = await PGlite.create()
for (const filename of ['000_auth.sql', '001_core.sql', '002_workflow.sql', '003_rls.sql', '004_expiry.sql', '005_album_owner_guard.sql', '006_auth_column_names.sql', '007_studio_membership_context.sql', '008_studio_invitations.sql', '009_studio_bootstrap_guard.sql']) {
  await db.exec(await readFile(new URL(`../../db/migrations/${filename}`, import.meta.url), 'utf8'))
}
await db.exec('SET ROLE app_runtime')
await db.query('INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true), ($4, $5, $6, true)',
  ['member-user', 'Artist', 'artist@example.com', 'revoked-user', 'Revoked', 'revoked@example.com'])
const pool = { async connect() { return { query: (sql: string, values?: unknown[]) => db.query(sql, values), release() {} } } }
afterAll(async () => { await db.close() })

describe('studio membership invitations', () => {
  it('invites a verified email, accepts once, changes role, and revokes access', async () => {
    const studio = await ensureStudio(pool, 'owner-user', 'Studio Hoa')
    const context = await withDatabaseContext(pool, { studioId: studio.id, userId: 'owner-user', scope: 'member' },
      client => client.query<{ studio_id: string; role: string }>('SELECT app_private.studio_id() AS studio_id, app_private.member_role($1::uuid) AS role', [studio.id]))
    expect(context.rows[0]).toEqual({ studio_id: studio.id, role: 'owner' })
    await expect(createStudioInvitation(pool, studio.id, 'owner-user', 'artist@example.com', 'retoucher')).rejects.toMatchObject({ statusCode: 400 })
    const issued = await createStudioInvitation(pool, studio.id, 'owner-user', ' Artist@Example.COM ', 'member')
      .catch(error => { throw new Error(`Invitation creation: ${String(error)}`) })
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(issued.email).toBe('artist@example.com')
    const stored = await withDatabaseContext(pool, { studioId: studio.id, userId: 'owner-user', scope: 'member' },
      client => client.query<{ token_hash: string }>('SELECT token_hash FROM studio_invitations WHERE id = $1', [issued.id]))
    expect(stored.rows[0]?.token_hash).not.toBe(issued.token)
    expect((await getStudioInvitations(pool, studio.id, 'owner-user')).map(item => item.email)).toEqual(['artist@example.com'])
    await expect(acceptStudioInvitation(pool, issued.token, 'member-user', 'wrong@example.com')).rejects.toThrow()
    const accepted = await acceptStudioInvitation(pool, issued.token, 'member-user', 'artist@example.com')
      .catch(error => { throw new Error(`Invitation acceptance: ${String(error)}`) })
    expect(accepted).toEqual({ ...studio, role: 'member' })
    await expect(acceptStudioInvitation(pool, issued.token, 'another-user', 'artist@example.com')).rejects.toThrow()
    expect((await getStudiosForUser(pool, 'member-user')).map(item => item.id)).toEqual([studio.id])
    expect((await getStudioMembers(pool, studio.id, 'owner-user')).map(member => member.role).sort()).toEqual(['member', 'owner'])
    await expect(updateStudioMemberRole(pool, studio.id, 'owner-user', 'member-user', 'retoucher')).rejects.toMatchObject({ statusCode: 400 })
    await expect(updateStudioMemberRole(pool, studio.id, 'member-user', 'owner-user', 'member')).rejects.toThrow()
    await updateStudioMemberRole(pool, studio.id, 'owner-user', 'member-user', 'member')
    expect((await getStudioMembers(pool, studio.id, 'owner-user')).find(member => member.userId === 'member-user')?.role).toBe('member')
    await expect(updateStudioMemberRole(pool, studio.id, 'owner-user', 'owner-user', 'member')).rejects.toThrow()
    await expect(revokeStudioMember(pool, studio.id, 'owner-user', 'owner-user')).rejects.toThrow()
    await revokeStudioMember(pool, studio.id, 'owner-user', 'member-user')
    expect(await getStudiosForUser(pool, 'member-user')).toEqual([])
  })

  it('does not let another tenant invite into this studio', async () => {
    const other = await ensureStudio(pool, 'other-owner', 'Another')
    const ownerStudio = (await getStudiosForUser(pool, 'owner-user'))[0]!
    await expect(createStudioInvitation(pool, ownerStudio.id, 'other-owner', 'x@example.com', 'member')).rejects.toThrow()
    expect(other.id).not.toBe(ownerStudio.id)
  })

  it('revokes an invitation before it can be used', async () => {
    const studio = (await getStudiosForUser(pool, 'owner-user'))[0]!
    const issued = await createStudioInvitation(pool, studio.id, 'owner-user', 'revoked@example.com', 'member')
    await revokeStudioInvitation(pool, studio.id, 'owner-user', issued.id)
    await expect(acceptStudioInvitation(pool, issued.token, 'revoked-user', 'revoked@example.com')).rejects.toThrow()
  })
})

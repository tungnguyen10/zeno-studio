import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { ensureStudio, getStudiosForUser } from '../../server/studios/studio'
import { withDatabaseContext } from '../../server/db/context'

const db = await PGlite.create()
for (const filename of ['000_auth.sql', '001_core.sql', '002_workflow.sql', '003_rls.sql', '004_expiry.sql', '005_album_owner_guard.sql', '006_auth_column_names.sql', '007_studio_membership_context.sql', '008_studio_invitations.sql', '009_studio_bootstrap_guard.sql']) {
  await db.exec(await readFile(new URL(`../../db/migrations/${filename}`, import.meta.url), 'utf8'))
}
await db.exec('SET ROLE app_runtime')
const pool = {
  async connect() { return { query: (sql: string, values?: unknown[]) => db.query(sql, values), release() {} } },
}
afterAll(async () => { await db.close() })

describe('studio membership context', () => {
  it('bootstraps one owner studio and returns it on repeated calls', async () => {
    expect(await getStudiosForUser(pool, 'verified-user')).toEqual([])
    const created = await ensureStudio(pool, 'verified-user', '  Studio An Nhiên  ')
    expect(created.name).toBe('Studio An Nhiên')
    expect(created.role).toBe('owner')
    expect(await ensureStudio(pool, 'verified-user', 'Different name')).toEqual(created)
    expect(await getStudiosForUser(pool, 'verified-user')).toEqual([created])
    expect(await getStudiosForUser(pool, 'another-user')).toEqual([])

    const forged = await withDatabaseContext(pool, { studioId: created.id, userId: 'another-user', scope: 'member' },
      client => client.query('SELECT id FROM studios WHERE id = $1', [created.id]))
    expect(forged.rows).toEqual([])
    const forgedBootstrap = await withDatabaseContext(pool, { studioId: created.id, userId: 'another-user', scope: 'bootstrap' },
      client => client.query('SELECT id FROM studios WHERE id = $1', [created.id]))
    expect(forgedBootstrap.rows).toEqual([])
  })

  it('rejects empty studio names', async () => {
    await expect(ensureStudio(pool, 'another-user', '   ')).rejects.toThrow('Studio name')
  })
})

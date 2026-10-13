import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { withDatabaseContext } from '../../server/db/context'

const db = await PGlite.create()
for (const filename of ['000_auth.sql', '001_core.sql', '002_workflow.sql', '003_rls.sql', '007_studio_membership_context.sql']) {
  await db.exec(await readFile(new URL(`../../db/migrations/${filename}`, import.meta.url), 'utf8'))
}
await db.exec(`
  INSERT INTO studios (id, name) VALUES
    ('00000000-0000-4000-8000-000000000001', 'Studio A'),
    ('00000000-0000-4000-8000-000000000002', 'Studio B');
  INSERT INTO studio_members (studio_id, user_id, role) VALUES
    ('00000000-0000-4000-8000-000000000001', 'user-a', 'owner'),
    ('00000000-0000-4000-8000-000000000002', 'user-b', 'owner');
  SET ROLE app_runtime;
`)

const pool = {
  async connect() {
    return { query: (sql: string, values?: unknown[]) => db.query(sql, values), release() {} }
  },
}

afterAll(async () => { await db.close() })

describe('database request context', () => {
  it('sets tenant context only for the transaction and clears it on commit', async () => {
    const rows = await withDatabaseContext(pool, { studioId: '00000000-0000-4000-8000-000000000001', userId: 'user-a', scope: 'owner' },
      client => client.query<{ name: string }>('SELECT name FROM studios'))
    expect(rows.rows.map(row => row.name)).toEqual(['Studio A'])
    expect((await db.query('SELECT name FROM studios')).rows).toEqual([])
  })

  it('rolls back a failed operation without leaking tenant context', async () => {
    await expect(withDatabaseContext(pool, { studioId: '00000000-0000-4000-8000-000000000002', userId: 'user-b', scope: 'owner' },
      async client => {
        await client.query('UPDATE studios SET name = $1', ['Changed'])
        throw new Error('failed')
      })).rejects.toThrow('failed')
    expect((await db.query('SELECT name FROM studios')).rows).toEqual([])
  })
})

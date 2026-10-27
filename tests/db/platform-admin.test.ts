import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'

const db = await PGlite.create()

beforeAll(async () => {
  const root = new URL('../../db/migrations/', import.meta.url)
  for (const name of (await readdir(root)).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(name, root), 'utf8'))
  }
  await db.exec(`
    INSERT INTO "user" (id, name, email, "emailVerified") VALUES
      ('admin-a', 'Admin A', 'admin-a@example.test', true),
      ('user-b', 'User B', 'user-b@example.test', true);
  `)
})

afterAll(async () => { await db.close() })

describe('platform admin grants', () => {
  it('exposes only the current user grant through RLS', async () => {
    const table = await db.query<{ rowsecurity: boolean }>(
      "SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'platform_admins'",
    )
    expect(table.rows).toEqual([{ rowsecurity: true }])
    await db.exec("INSERT INTO platform_admins (user_id) VALUES ('admin-a')")
    await db.exec('SET ROLE app_runtime')
    try {
      await db.exec("BEGIN; SELECT set_config('app.user_id', 'admin-a', true)")
      expect((await db.query<{ user_id: string }>('SELECT user_id FROM platform_admins')).rows)
        .toEqual([{ user_id: 'admin-a' }])
      await db.exec('COMMIT')

      await db.exec("BEGIN; SELECT set_config('app.user_id', 'user-b', true)")
      expect((await db.query<{ user_id: string }>('SELECT user_id FROM platform_admins')).rows).toEqual([])
      await db.exec('COMMIT')
    } finally {
      await db.exec('ROLLBACK; RESET ROLE')
    }
  })

  it('does not allow the runtime role to grant itself', async () => {
    await db.exec('SET ROLE app_runtime')
    try {
      await expect(db.exec("INSERT INTO platform_admins (user_id) VALUES ('user-b')"))
        .rejects.toThrow()
    } finally {
      await db.exec('RESET ROLE')
    }
  })
})

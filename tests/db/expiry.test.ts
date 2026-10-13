import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

const db = await PGlite.create()
for (const filename of ['000_auth.sql', '001_core.sql', '002_workflow.sql', '003_rls.sql', '004_expiry.sql']) {
  await db.exec(await readFile(new URL(`../../db/migrations/${filename}`, import.meta.url), 'utf8'))
}
afterAll(async () => { await db.close() })

describe('album expiry job', () => {
  it('expires guest access, purges after 30 days and is idempotent', async () => {
    await db.exec(`
      INSERT INTO studios (id, name) VALUES ('00000000-0000-4000-8000-000000000010', 'Expiry Studio');
      INSERT INTO albums (id, studio_id, title, status, expires_at) VALUES
        ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000010', 'recent', 'PUBLISHED', now() - interval '1 day'),
        ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000010', 'old', 'PUBLISHED', now() - interval '31 days'),
        ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000010', 'future', 'PUBLISHED', now() + interval '1 day');
      SET ROLE app_runtime;
    `)
    const first = await db.query<{ expired_count: number; purged_count: number }>('SELECT * FROM app_private.expire_and_purge()')
    expect(first.rows).toEqual([{ expired_count: 2, purged_count: 1 }])
    const second = await db.query<{ expired_count: number; purged_count: number }>('SELECT * FROM app_private.expire_and_purge()')
    expect(second.rows).toEqual([{ expired_count: 0, purged_count: 0 }])
    await db.exec('RESET ROLE')
    const rows = await db.query<{ title: string; status: string }>('SELECT title, status FROM albums ORDER BY title')
    expect(rows.rows).toEqual([{ title: 'future', status: 'PUBLISHED' }, { title: 'recent', status: 'EXPIRED' }])
  })
})

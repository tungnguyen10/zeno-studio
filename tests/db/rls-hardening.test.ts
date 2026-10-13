import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

const db = await PGlite.create()
for (const filename of ['000_auth.sql', '001_core.sql', '002_workflow.sql', '003_rls.sql', '004_expiry.sql', '005_album_owner_guard.sql']) {
  await db.exec(await readFile(new URL(`../../db/migrations/${filename}`, import.meta.url), 'utf8'))
}
afterAll(async () => { await db.close() })

describe('guest album ownership', () => {
  it('cannot move an album into another studio', async () => {
    const a = '00000000-0000-4000-8000-000000000021'
    const b = '00000000-0000-4000-8000-000000000022'
    const album = '00000000-0000-4000-8000-000000000023'
    await db.query('INSERT INTO studios (id, name) VALUES ($1, $2), ($3, $4)', [a, 'A', b, 'B'])
    await db.query("INSERT INTO albums (id, studio_id, title, status, expires_at) VALUES ($1, $2, 'A album', 'PUBLISHED', now() + interval '1 day')", [album, a])
    await db.exec('SET ROLE app_runtime; BEGIN;')
    try {
      await db.query("SELECT set_config('app.album_id', $1, true), set_config('app.scope', 'guest_admin', true)", [album])
      await expect(db.query('UPDATE albums SET studio_id = $1 WHERE id = $2', [b, album])).rejects.toThrow()
    } finally {
      await db.exec('ROLLBACK; RESET ROLE;')
    }
    const result = await db.query<{ studio_id: string }>('SELECT studio_id FROM albums WHERE id = $1', [album])
    expect(result.rows[0]?.studio_id).toBe(a)
  })

  it('allows guest admin export for 30 days but blocks customers and edits after expiry', async () => {
    const studio = '00000000-0000-4000-8000-000000000031'
    const album = '00000000-0000-4000-8000-000000000032'
    await db.query('INSERT INTO studios (id, name) VALUES ($1, $2)', [studio, 'Expired'])
    await db.query("INSERT INTO albums (id, studio_id, title, status, expires_at) VALUES ($1, $2, 'Expired album', 'EXPIRED', now() - interval '1 day')", [album, studio])
    await db.exec('SET ROLE app_runtime; BEGIN;')
    try {
      await db.query("SELECT set_config('app.album_id', $1, true), set_config('app.scope', 'guest_admin', true)", [album])
      expect((await db.query('SELECT id FROM albums WHERE id = $1', [album])).rows).toHaveLength(1)
      expect((await db.query("UPDATE albums SET title = 'Changed' WHERE id = $1", [album])).rowCount).toBe(0)
    } finally { await db.exec('ROLLBACK; RESET ROLE;') }

    await db.exec('SET ROLE app_runtime; BEGIN;')
    try {
      await db.query("SELECT set_config('app.album_id', $1, true), set_config('app.scope', 'customer', true)", [album])
      expect((await db.query('SELECT id FROM albums WHERE id = $1', [album])).rows).toHaveLength(0)
    } finally { await db.exec('ROLLBACK; RESET ROLE;') }
  })
})

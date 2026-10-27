import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

const db = await PGlite.create()

afterAll(async () => { await db.close() })

describe('database migrations', () => {
  it('creates the V1 tables with RLS on album data', async () => {
    for (const filename of ['000_auth.sql', '001_core.sql', '002_workflow.sql', '003_rls.sql', '004_expiry.sql', '005_album_owner_guard.sql', '006_auth_column_names.sql', '007_studio_membership_context.sql', '008_studio_invitations.sql', '009_studio_bootstrap_guard.sql', '010_album_source_details.sql', '011_album_token_access.sql', '012_selection_cycles.sql', '013_participant_rls.sql', '014_review_delivery.sql', '015_review_policy_lockdown.sql', '016_photo_thumbnails.sql', '017_guest_albums.sql', '018_sort_photos_by_filename.sql', '019_shared_customer_participant.sql', '020_album_archive.sql', '021_album_download.sql', '022_album_download_public_settings.sql', '023_album_download_rate_limit.sql', '024_platform_admins.sql']) {
      const sql = await readFile(new URL(`../../db/migrations/${filename}`, import.meta.url), 'utf8')
      await db.exec(sql)
    }
    const tables = await db.query<{ tablename: string; rowsecurity: boolean }>(`
      SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `)
    const byName = new Map(tables.rows.map(row => [row.tablename, row.rowsecurity]))
    for (const table of ['user', 'session', 'account', 'verification']) expect(byName.has(table), `Better Auth ${table}`).toBe(true)
    for (const table of ['studios', 'studio_members', 'studio_invitations', 'albums', 'photos', 'participants', 'selection_versions', 'selection_version_items', 'photo_notes', 'production_tasks', 'deliveries', 'analytics_events', 'platform_admins']) {
      expect(byName.has(table), table).toBe(true)
      expect(byName.get(table), `${table} RLS`).toBe(true)
    }
    const authColumns = await db.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('user', 'session', 'account', 'verification')
    `)
    const columns = new Set(authColumns.rows.map(row => `${row.table_name}.${row.column_name}`))
    for (const column of ['user.emailVerified', 'user.createdAt', 'session.expiresAt', 'session.userId', 'account.accountId', 'account.providerId', 'verification.expiresAt']) {
      expect(columns.has(column), column).toBe(true)
    }
  })

  it('isolates two studios and clears tenant context at transaction end', async () => {
    const studioA = '00000000-0000-4000-8000-000000000001'
    const studioB = '00000000-0000-4000-8000-000000000002'
    await db.exec(`
      INSERT INTO studios (id, name) VALUES ('${studioA}', 'A'), ('${studioB}', 'B');
      INSERT INTO studio_members (studio_id, user_id, role) VALUES ('${studioA}', 'user-a', 'owner'), ('${studioB}', 'user-b', 'owner');
      INSERT INTO albums (studio_id, title, expires_at) VALUES
        ('${studioA}', 'Album A', now() + interval '15 days'),
        ('${studioB}', 'Album B', now() + interval '15 days');
      SET ROLE app_runtime;
    `)
    try {
      await db.exec(`BEGIN; SELECT set_config('app.studio_id', '${studioA}', true), set_config('app.user_id', 'user-a', true);`)
      const a = await db.query<{ title: string }>('SELECT title FROM albums')
      expect(a.rows.map(row => row.title)).toEqual(['Album A'])
      await db.exec('COMMIT')

      const afterCommit = await db.query<{ title: string }>('SELECT title FROM albums')
      expect(afterCommit.rows).toEqual([])

      await db.exec(`BEGIN; SELECT set_config('app.studio_id', '${studioB}', true), set_config('app.user_id', 'user-b', true);`)
      const b = await db.query<{ title: string }>('SELECT title FROM albums')
      expect(b.rows.map(row => row.title)).toEqual(['Album B'])
      await db.exec('COMMIT')
    } finally {
      await db.exec('ROLLBACK; RESET ROLE;')
    }
  })

  it('keeps album password settings private from customer tokens', async () => {
    await db.exec(`
      RESET ROLE;
      UPDATE albums SET status = 'PUBLISHED' WHERE title = 'Album A';
      INSERT INTO album_settings (album_id, password_hash)
        SELECT id, 'sensitive-hash' FROM albums WHERE title = 'Album A';
      SET ROLE app_runtime;
    `)
    const album = await db.query<{ id: string }>(`SELECT id FROM albums WHERE title = 'Album A'`)
    expect(album.rows).toEqual([])
    await db.exec('RESET ROLE')
    const source = await db.query<{ id: string }>(`SELECT id FROM albums WHERE title = 'Album A'`)
    await db.exec('SET ROLE app_runtime')
    try {
      await db.exec(`BEGIN; SELECT set_config('app.album_id', '${source.rows[0]!.id}', true); SELECT set_config('app.scope', 'customer', true);`)
      const settings = await db.query('SELECT password_hash FROM album_settings')
      expect(settings.rows).toEqual([])
      await db.exec('COMMIT')
    } finally {
      await db.exec('ROLLBACK; RESET ROLE;')
    }
  })

  it('defaults existing album download settings to disabled', async () => {
    const columns = await db.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'album_settings' AND column_name LIKE 'download_%'
    `)
    expect(columns.rows.map(row => row.column_name).sort()).toEqual([
      'download_allow_all', 'download_allow_selected', 'download_allow_single',
      'download_available_when', 'download_enabled',
    ])
    const settings = await db.query<{
      download_enabled: boolean; download_allow_single: boolean; download_allow_selected: boolean
      download_allow_all: boolean; download_available_when: string
    }>(`SELECT download_enabled, download_allow_single, download_allow_selected,
      download_allow_all, download_available_when FROM album_settings`)
    expect(settings.rows[0]).toMatchObject({
      download_enabled: false, download_allow_single: true, download_allow_selected: true,
      download_allow_all: false, download_available_when: 'anytime',
    })
  })
})

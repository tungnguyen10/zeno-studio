import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import { getStudioAnalytics } from '../../server/analytics/studio-report'

const db = await PGlite.create()
for (const file of (await readdir(new URL('../../db/migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()) {
  await db.exec(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'))
}
afterAll(async () => db.close())

const owner = '00000000-0000-4000-8000-000000000101'
const other = '00000000-0000-4000-8000-000000000102'
const album = '00000000-0000-4000-8000-000000000103'
const otherAlbum = '00000000-0000-4000-8000-000000000104'

describe('studio analytics database isolation', () => {
  it('permits only owners to read and only guarded functions to write', async () => {
    await db.exec(`
      INSERT INTO studios(id,name,owner_user_id) VALUES ('${owner}','Owner','owner-a'),('${other}','Other','owner-b');
      INSERT INTO studio_members(studio_id,user_id,role) VALUES
        ('${owner}','owner-a','owner'),('${owner}','manager-a','manager'),('${other}','owner-b','owner');
      INSERT INTO albums(id,studio_id,title,status,expires_at) VALUES
        ('${album}','${owner}','Album','PUBLISHED',now()+interval '1 day'),
        ('${otherAlbum}','${other}','Other','PUBLISHED',now()+interval '1 day');
      SET ROLE app_runtime;
    `)
    try {
      await db.exec(`BEGIN; SELECT set_config('app.studio_id','${owner}',true),set_config('app.user_id','owner-a',true),set_config('app.scope','member',true);`)
      await db.query('SELECT app_private.record_studio_metric($1,$2,$3,1)', [owner, album, 'album_created'])
      const rows = await db.query<{ albums_created: number }>('SELECT albums_created FROM studio_daily_metrics')
      expect(rows.rows[0]?.albums_created).toBe(1)
      await expect(db.query('INSERT INTO studio_daily_metrics(studio_id,day) VALUES ($1,current_date)', [owner])).rejects.toThrow()
      await db.exec('ROLLBACK')

      await db.exec(`BEGIN; SELECT set_config('app.studio_id','${owner}',true),set_config('app.user_id','manager-a',true),set_config('app.scope','member',true);`)
      expect((await db.query('SELECT * FROM studio_daily_metrics')).rows).toEqual([])
      await expect(db.query('SELECT app_private.record_studio_metric($1,$2,$3,1)', [other, otherAlbum, 'album_created'])).rejects.toThrow()
      await db.exec('ROLLBACK')

      await db.exec(`BEGIN; SELECT set_config('app.studio_id','${owner}',true),set_config('app.user_id','owner-a',true),set_config('app.scope','member',true);`)
      await db.query('SELECT app_private.record_studio_metric($1,$2,$3,1)', [owner, album, 'album_published'])
      await db.query('SELECT app_private.record_file_match($1,$2,$3,$4)', [album, 7, 2, 1])
      const metric = await db.query<{ albums_created: number; albums_published: number; file_match_runs: number; matched_count: number }>(
        'SELECT albums_created, albums_published, file_match_runs, matched_count FROM studio_daily_metrics')
      expect(metric.rows[0]).toMatchObject({ albums_created: 0, albums_published: 1, file_match_runs: 1, matched_count: 7 })
      await db.exec('COMMIT')

      await db.exec(`BEGIN; SELECT set_config('app.studio_id','${other}',true),set_config('app.user_id','owner-b',true),set_config('app.scope','member',true);`)
      expect((await db.query('SELECT * FROM studio_daily_metrics')).rows).toEqual([])
      await db.exec('COMMIT')
    } finally {
      await db.exec('ROLLBACK; RESET ROLE;')
    }
  })

  it('keeps daily totals after album deletion and purges old totals', async () => {
    await db.exec(`
      INSERT INTO studio_daily_metrics(studio_id,day,gallery_opens) VALUES
        ('${owner}',current_date - 121,2),('${owner}',current_date - 90,3);
      INSERT INTO album_analytics_open_rate(album_id,minute,request_count) VALUES
        ('${album}',now()-interval '25 hours',1),('${album}',now(),1);
    `)
    const result = await db.query<{ metrics_deleted: number; rate_deleted: number }>('SELECT * FROM app_private.purge_studio_metrics()')
    expect(result.rows[0]).toMatchObject({ metrics_deleted: 1, rate_deleted: 1 })
    await db.query('DELETE FROM albums WHERE id=$1', [album])
    const kept = await db.query<{ gallery_opens: number }>('SELECT gallery_opens FROM studio_daily_metrics WHERE day=current_date - 90')
    expect(kept.rows[0]?.gallery_opens).toBe(3)
  })

  it('counts authorized customer opens and serves only the owning studio', async () => {
    await db.exec('SET ROLE app_runtime')
    try {
      await db.exec(`BEGIN; SELECT set_config('app.album_id','${otherAlbum}',true),set_config('app.scope','customer',true);`)
      await db.query('SELECT app_private.record_gallery_open($1)', [otherAlbum])
      await expect(db.query('SELECT app_private.record_gallery_open($1)', [album])).rejects.toThrow()
      await db.exec('ROLLBACK')
      await db.exec(`BEGIN; SELECT set_config('app.album_id','${otherAlbum}',true),set_config('app.scope','customer',true);`)
      await db.query('SELECT app_private.record_gallery_open($1)', [otherAlbum])
      await db.exec('COMMIT')
      const pool = { async connect() { return { query: (sql: string, values?: unknown[]) => db.query(sql, values), release() {} } } }
      const report = await getStudioAnalytics(pool, other, 'owner-b', 7)
      expect(report.galleryOpens).toBe(1)
      expect(report.albums).toMatchObject([{ id: otherAlbum, galleryOpens: 1 }])
      expect(report.trend).toHaveLength(7)
      await expect(getStudioAnalytics(pool, owner, 'manager-a', 7)).rejects.toThrow('Chỉ chủ studio')
      await expect(getStudioAnalytics(pool, owner, 'owner-b', 7)).rejects.toThrow('Chỉ chủ studio')
    } finally { await db.exec('ROLLBACK; RESET ROLE;') }
  })

  it('transfers a guest album’s daily totals exactly once on claim', async () => {
    const guestStudio = '00000000-0000-4000-8000-000000000105'
    const guestAlbum = '00000000-0000-4000-8000-000000000106'
    await db.exec(`
      INSERT INTO studios(id,name,guest_only) VALUES ('${guestStudio}','Guest',true);
      INSERT INTO albums(id,studio_id,title,status,expires_at) VALUES
        ('${guestAlbum}','${guestStudio}','Guest album','PUBLISHED',now()+interval '1 day');
      INSERT INTO album_tokens(album_id,scope,token_hash) VALUES ('${guestAlbum}','guest_admin','claim-test-hash');
      INSERT INTO studio_daily_metrics(studio_id,day,albums_created,albums_published,file_match_runs)
        VALUES ('${guestStudio}',current_date,1,1,2);
      SET ROLE app_runtime;
    `)
    try {
      await db.exec(`BEGIN; SELECT set_config('app.studio_id','${owner}',true),set_config('app.user_id','owner-a',true),set_config('app.scope','member',true);`)
      const first = await db.query<{ claimed: boolean }>(
        'SELECT app_private.claim_guest_album($1,$2,$3) AS claimed', [guestAlbum, 'claim-test-hash', owner])
      expect(first.rows[0]?.claimed).toBe(true)
      const second = await db.query<{ claimed: boolean }>(
        'SELECT app_private.claim_guest_album($1,$2,$3) AS claimed', [guestAlbum, 'claim-test-hash', owner])
      expect(second.rows[0]?.claimed).toBe(false)
      await db.exec('COMMIT')
    } finally { await db.exec('ROLLBACK; RESET ROLE;') }
    const rows = await db.query<{ albums_created: number; albums_published: number; file_match_runs: number }>(
      'SELECT albums_created,albums_published,file_match_runs FROM studio_daily_metrics WHERE studio_id=$1 AND day=current_date', [owner])
    expect(rows.rows[0]).toMatchObject({ albums_created: 1, albums_published: 2, file_match_runs: 3 })
    expect((await db.query('SELECT * FROM studios WHERE id=$1', [guestStudio])).rows).toEqual([])
  })
})

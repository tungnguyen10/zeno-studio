import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { applyMigrations } from '../../db/migrate'

const db = await PGlite.create()
const client = {
  async query(sql: string, values?: unknown[]) {
    if (values) return db.query(sql, values)
    const results = await db.exec(sql)
    return { rows: results.at(-1)?.rows ?? [] }
  },
}

afterAll(async () => { await db.close() })

describe('migration runner', () => {
  it('applies each migration once', async () => {
    const migrations = [{ name: '001_marker.sql', sql: 'CREATE TABLE marker (id integer PRIMARY KEY);' }]
    await applyMigrations(client, migrations)
    await applyMigrations(client, migrations)
    const applied = await db.query<{ name: string }>('SELECT name FROM schema_migrations')
    expect(applied.rows.map(row => row.name)).toEqual(['001_marker.sql'])
  })

  it('rejects edits to an already applied migration', async () => {
    await applyMigrations(client, [{ name: '002_more.sql', sql: 'CREATE TABLE more (id integer PRIMARY KEY);' }])
    await expect(applyMigrations(client, [{ name: '002_more.sql', sql: 'DROP TABLE more;' }]))
      .rejects.toThrow('002_more.sql')
  })
})

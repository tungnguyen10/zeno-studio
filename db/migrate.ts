export interface Migration {
  name: string
  sql: string
}

export interface MigrationClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
}

export async function applyMigrations(client: MigrationClient, migrations: Migration[]): Promise<void> {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    checksum text,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`)
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text')
  const existing = await client.query('SELECT name, checksum FROM schema_migrations')
  const applied = new Map(existing.rows.map(row => [String(row.name), row.checksum == null ? null : String(row.checksum)]))

  for (const migration of migrations) {
    const checksum = createHash('sha256').update(migration.sql).digest('hex')
    if (applied.has(migration.name)) {
      const previous = applied.get(migration.name)
      if (previous && previous !== checksum) throw new Error(`Applied migration changed: ${migration.name}`)
      if (!previous) await client.query('UPDATE schema_migrations SET checksum = $1 WHERE name = $2', [checksum, migration.name])
      continue
    }
    await client.query('BEGIN')
    try {
      await client.query(migration.sql)
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [migration.name, checksum])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }
}
import { createHash } from 'node:crypto'


import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { applyMigrations } from './migrate'

const directUrl = process.env.NUXT_DATABASE_DIRECT_URL
if (!directUrl) throw new Error('NUXT_DATABASE_DIRECT_URL is required to run migrations')
const appUrl = process.env.NUXT_DATABASE_URL
if (!appUrl) throw new Error('NUXT_DATABASE_URL is required to grant the runtime role')
const migrationUser = decodeURIComponent(new URL(directUrl).username)
const runtimeUser = decodeURIComponent(new URL(appUrl).username)
if (!runtimeUser || runtimeUser === migrationUser) throw new Error('Migration and runtime URLs must use different database roles')

const pool = new Pool({ connectionString: directUrl, max: 1 })
try {
  const directory = fileURLToPath(new URL('./migrations/', import.meta.url))
  const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()
  const migrations = await Promise.all(files.map(async name => ({
    name,
    sql: await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8'),
  })))
  const client = await pool.connect()
  try {
    const role = await client.query('SELECT rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname = $1', [runtimeUser])
    if (role.rows.length !== 1 || role.rows[0]!.rolbypassrls || role.rows[0]!.rolcreaterole) {
      throw new Error('Runtime role must exist without BYPASSRLS or CREATEROLE; Neon CLI roles may have both')
    }
    await applyMigrations(client, migrations)
    await client.query(`GRANT app_runtime TO "${runtimeUser.replaceAll('"', '""')}"`)
  } finally {
    client.release()
  }
  process.stdout.write(`Applied ${migrations.length} migration files\n`)
} finally {
  await pool.end()
}

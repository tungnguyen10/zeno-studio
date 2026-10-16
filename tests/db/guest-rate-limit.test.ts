import { afterAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import { consumeGuestCreateAttempt } from '../../server/albums/guest-rate-limit'

const db = await PGlite.create()
const migrationDir = new URL('../../db/migrations/', import.meta.url)
for (const name of (await readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort()) {
  await db.exec(await readFile(new URL(name, migrationDir), 'utf8'))
}
await db.exec('SET ROLE app_runtime')
const pool = { async connect() { return { query: (sql: string, values?: unknown[]) => db.query(sql, values), release() {} } } }
afterAll(async () => { await db.close() })

it('allows ten attempts per address per hour and isolates other addresses', async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    expect(await consumeGuestCreateAttempt(pool, '203.0.113.1', 'test-secret')).toMatchObject({ allowed: true })
  }
  const denied = await consumeGuestCreateAttempt(pool, '203.0.113.1', 'test-secret')
  expect(denied.allowed).toBe(false)
  expect(denied.retryAfterSeconds).toBeGreaterThan(0)
  expect(await consumeGuestCreateAttempt(pool, '203.0.113.2', 'test-secret')).toMatchObject({ allowed: true })
  await db.exec('RESET ROLE')
  const stored = await db.query<{ address_hash: string }>('SELECT address_hash FROM guest_create_limits')
  expect(stored.rows).toHaveLength(2)
  expect(stored.rows.every(row => /^[0-9a-f]{64}$/.test(row.address_hash))).toBe(true)
})

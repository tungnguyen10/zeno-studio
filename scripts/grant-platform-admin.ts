import { Pool } from 'pg'

const action = process.argv[2]
const email = process.argv[3]?.trim().toLowerCase()
const directUrl = process.env.NUXT_DATABASE_DIRECT_URL
if ((action !== 'grant' && action !== 'revoke') || !email || !directUrl) {
  throw new Error('Usage: NUXT_DATABASE_DIRECT_URL=… grant-platform-admin.ts grant|revoke verified-email')
}

const pool = new Pool({ connectionString: directUrl, max: 1 })
try {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const users = await client.query<{ id: string; emailVerified: boolean }>(
      'SELECT id, "emailVerified" FROM "user" WHERE lower(email) = $1', [email])
    if (users.rows.length !== 1 || !users.rows[0]!.emailVerified) {
      throw new Error('Exactly one verified account is required')
    }
    const userId = users.rows[0]!.id
    if (action === 'grant') {
      await client.query('INSERT INTO platform_admins (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId])
    } else {
      await client.query('DELETE FROM platform_admins WHERE user_id = $1', [userId])
    }
    await client.query('COMMIT')
    process.stdout.write(`${action} platform_admins: ${userId}\n`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
} finally {
  await pool.end()
}

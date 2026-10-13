import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { applyMigrations } from './migrate'
import { withDatabaseContext } from '../server/db/context'
import { ensureStudio, getStudiosForUser } from '../server/studios/studio'
import { acceptStudioInvitation, createStudioInvitation, revokeStudioMember, updateStudioMemberRole } from '../server/studios/members'

const directUrl = process.env.NUXT_DATABASE_TEST_DIRECT_URL
const pooledUrl = process.env.NUXT_DATABASE_TEST_URL
if (!directUrl || !pooledUrl) throw new Error('Separate Neon test direct and pooled URLs are required')

const ownerName = decodeURIComponent(new URL(directUrl).username)
const runtimeName = decodeURIComponent(new URL(pooledUrl).username)
if (!runtimeName || runtimeName === ownerName) throw new Error('Test migration and runtime roles must differ')
if (!new URL(pooledUrl).hostname.includes('-pooler')) throw new Error('Test runtime URL must use a Neon pooled endpoint')

const owner = new Pool({ connectionString: directUrl, max: 1 })
const runtime = new Pool({ connectionString: pooledUrl, max: 2 })
const studioA = randomUUID()
const studioB = randomUUID()
const userA = `neon-test-${randomUUID()}`
const userB = `neon-test-${randomUUID()}`
const bootstrapUser = `neon-test-${randomUUID()}`
const inviteeUser = randomUUID()
const inviteeEmail = `neon-invite-${randomUUID()}@example.invalid`
let fixturesCreated = false

try {
  const names = (await readdir(new URL('./migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()
  const migrations = await Promise.all(names.map(async name => ({
    name,
    sql: await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8'),
  })))
  const ownerClient = await owner.connect()
  try {
    await applyMigrations(ownerClient, migrations)
    await ownerClient.query(`GRANT app_runtime TO "${runtimeName.replaceAll('"', '""')}"`)
  } finally { ownerClient.release() }

  const role = await runtime.query<{ current_user: string; rolbypassrls: boolean; table_owner: string }>(`
    SELECT current_user, r.rolbypassrls, t.tableowner AS table_owner
    FROM pg_roles r CROSS JOIN pg_tables t
    WHERE r.rolname = current_user AND t.schemaname = 'public' AND t.tablename = 'studios'
  `)
  if (role.rows.length !== 1 || role.rows[0]!.rolbypassrls || role.rows[0]!.table_owner === runtimeName) {
    throw new Error('Pooled runtime role must not own tables or bypass RLS')
  }

  await owner.query('INSERT INTO studios (id, name) VALUES ($1, $2), ($3, $4)', [studioA, 'Neon isolation A', studioB, 'Neon isolation B'])
  await owner.query('INSERT INTO studio_members (studio_id, user_id, role) VALUES ($1, $2, $3), ($4, $5, $6)', [studioA, userA, 'owner', studioB, userB, 'owner'])
  await owner.query('INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)', [inviteeUser, 'Neon invitee', inviteeEmail])
  fixturesCreated = true

  const [a, b] = await Promise.all([
    withDatabaseContext(runtime, { studioId: studioA, userId: userA, scope: 'owner' }, client => client.query<{ id: string }>('SELECT id FROM studios WHERE id IN ($1, $2)', [studioA, studioB])),
    withDatabaseContext(runtime, { studioId: studioB, userId: userB, scope: 'owner' }, client => client.query<{ id: string }>('SELECT id FROM studios WHERE id IN ($1, $2)', [studioA, studioB])),
  ])
  if (a.rows.length !== 1 || a.rows[0]!.id !== studioA || b.rows.length !== 1 || b.rows[0]!.id !== studioB) {
    throw new Error('Concurrent pooled requests crossed tenant boundaries')
  }
  const forged = await withDatabaseContext(runtime, { studioId: studioA, userId: userB, scope: 'owner' },
    client => client.query<{ id: string }>('SELECT id FROM studios WHERE id = $1', [studioA]))
  if (forged.rows.length) throw new Error('Studio context accepted a user without membership')
  const forgedBootstrap = await withDatabaseContext(runtime, { studioId: studioA, userId: userB, scope: 'bootstrap' },
    client => client.query<{ id: string }>('SELECT id FROM studios WHERE id = $1', [studioA]))
  if (forgedBootstrap.rows.length) throw new Error('Bootstrap context exposed another studio')
  const memberships = await getStudiosForUser(runtime, userA)
  if (memberships.length !== 1 || memberships[0]!.id !== studioA) throw new Error('Membership lookup failed on Neon pooled connection')
  const [firstBootstrap, secondBootstrap] = await Promise.all([
    ensureStudio(runtime, bootstrapUser, 'Bootstrap studio'),
    ensureStudio(runtime, bootstrapUser, 'Bootstrap studio'),
  ])
  if (firstBootstrap.id !== secondBootstrap.id || (await getStudiosForUser(runtime, bootstrapUser)).length !== 1) {
    throw new Error('Concurrent studio bootstrap created duplicate studios')
  }
  const invitation = await createStudioInvitation(runtime, studioA, userA, inviteeEmail, 'retoucher')
  const accepted = await acceptStudioInvitation(runtime, invitation.token, inviteeUser, inviteeEmail)
  if (accepted.id !== studioA || accepted.role !== 'retoucher') throw new Error('Invitation acceptance failed on pooled connection')
  await updateStudioMemberRole(runtime, studioA, userA, inviteeUser, 'member')
  await revokeStudioMember(runtime, studioA, userA, inviteeUser)
  if ((await getStudiosForUser(runtime, inviteeUser)).length) throw new Error('Revoked member retained studio access')
  const withoutContext = await runtime.query<{ id: string }>('SELECT id FROM studios WHERE id IN ($1, $2)', [studioA, studioB])
  if (withoutContext.rows.length) throw new Error('Tenant context leaked after a pooled request')
  process.stdout.write('Neon pooled tenant, bootstrap and membership checks passed\n')
} finally {
  await owner.query('DELETE FROM studios WHERE owner_user_id = $1', [bootstrapUser])
  if (fixturesCreated) await owner.query('DELETE FROM studios WHERE id IN ($1, $2)', [studioA, studioB])
  await owner.query('DELETE FROM "user" WHERE id = $1', [inviteeUser])
  await Promise.all([runtime.end(), owner.end()])
}

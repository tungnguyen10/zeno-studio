import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { Pool } from 'pg'
import { createStudioAuth } from '../../server/utils/auth'
import type { TransactionalMail } from '../../server/utils/mail'

const databaseUrl = process.env.NUXT_DATABASE_TEST_URL
const directUrl = process.env.NUXT_DATABASE_TEST_DIRECT_URL
const secret = process.env.NUXT_BETTER_AUTH_SECRET
if (!databaseUrl || !directUrl || !secret) throw new Error('Neon test URLs and Better Auth secret are required')
if (!new URL(databaseUrl).hostname.includes('-pooler')) throw new Error('HTTP test requires a pooled Neon test branch URL')
const authOrigin = process.env.NUXT_BETTER_AUTH_URL || 'http://localhost:3000'
const appOrigin = 'http://127.0.0.1:43628'
const mails: TransactionalMail[] = []
const auth = createStudioAuth({ databaseUrl, baseURL: authOrigin, secret, sendMail: async mail => { mails.push(mail) } })
const owner = new Pool({ connectionString: directUrl, max: 1 })
const users: string[] = []
const server = spawn('node', ['.output/server/index.mjs'], {
  env: { ...process.env, NUXT_DATABASE_URL: databaseUrl, NUXT_BETTER_AUTH_SECRET: secret, NUXT_BETTER_AUTH_URL: authOrigin, HOST: '127.0.0.1', PORT: '43628' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

async function authRequest(path: string, method: 'GET' | 'POST', body?: Record<string, unknown>) {
  return auth.handler(new Request(`${authOrigin}/api/auth${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }))
}

async function expectStatus(response: Response, status: number, step: string) {
  if (response.status !== status) throw new Error(`${step} returned HTTP ${response.status}; expected ${status}`)
  return response
}

async function verifiedCookie(name: string): Promise<{ id: string; cookie: string }> {
  const email = `studio-http-${randomUUID()}@example.invalid`
  const password = `Test-${randomUUID()}`
  await expectStatus(await authRequest('/sign-up/email', 'POST', { name, email, password }), 200, 'signup')
  const user = await owner.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email])
  if (!user.rows[0]) throw new Error('Signup did not persist user')
  users.push(user.rows[0].id)
  let mail: TransactionalMail | undefined
  for (let attempt = 0; attempt < 40; attempt++) {
    mail = mails.find(item => item.to === email && item.subject === 'Xác minh email')
    if (mail) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  const link = mail?.text.match(/https?:\/\/\S+/)?.[0]
  if (!link) throw new Error('Verification mail missing')
  const url = new URL(link)
  await expectStatus(await authRequest(`${url.pathname.replace('/api/auth', '')}${url.search}`, 'GET'), 302, 'verification')
  const signedIn = await expectStatus(await authRequest('/sign-in/email', 'POST', { email, password }), 200, 'sign-in')
  const cookie = signedIn.headers.getSetCookie().map(item => item.split(';')[0]).join('; ')
  if (!cookie) throw new Error('Sign-in did not return a session cookie')
  return { id: user.rows[0].id, cookie }
}

async function appRequest(path: string, cookie?: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', body?: object) {
  return fetch(`${appOrigin}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error('Built Nitro server exited before readiness')
    try { if ((await fetch(appOrigin)).ok) return } catch { /* Server is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Built Nitro server did not start')
}

async function main() {
  try {
    await waitForServer()
    await expectStatus(await appRequest('/api/studio'), 401, 'anonymous studio request')
    const ownerUser = await verifiedCookie('HTTP Test Studio')
    const createdResponse = await expectStatus(await appRequest('/api/studio/bootstrap', ownerUser.cookie, 'POST'), 200, 'bootstrap')
    const created = await createdResponse.json() as { studio: { id: string; name: string; role: string } }
    if (created.studio.name !== 'HTTP Test Studio' || created.studio.role !== 'owner') throw new Error('Bootstrap returned incorrect studio')
    const studioList = await expectStatus(await appRequest('/api/studio', ownerUser.cookie), 200, 'studio list')
    if (((await studioList.json()) as { studios: unknown[] }).studios.length !== 1) throw new Error('Studio list did not include bootstrap studio')

    const invitee = await verifiedCookie('HTTP Invitee')
    const email = await owner.query<{ email: string }>('SELECT email FROM "user" WHERE id = $1', [invitee.id])
    const invitationResponse = await expectStatus(await appRequest(`/api/studio/${created.studio.id}/invitations`, ownerUser.cookie, 'POST', {
      email: email.rows[0]!.email, role: 'member',
    }), 200, 'invitation creation')
    const invitation = await invitationResponse.json() as { invitation: { token: string } }
    const acceptedResponse = await expectStatus(await appRequest('/api/studio/invitations/accept', invitee.cookie, 'POST', { token: invitation.invitation.token }), 200, 'invitation acceptance')
    const accepted = await acceptedResponse.json() as { studio: { id: string; role: string } }
    if (accepted.studio.id !== created.studio.id || accepted.studio.role !== 'member') throw new Error('Invitation returned incorrect studio')
    await expectStatus(await appRequest(`/api/studio/${created.studio.id}/members`, invitee.cookie), 403, 'member list')
    await expectStatus(await appRequest(`/api/studio/${created.studio.id}/members/${invitee.id}`, ownerUser.cookie, 'PATCH', { role: 'member' }), 200, 'role change')
    await expectStatus(await appRequest(`/api/studio/${created.studio.id}/members/${invitee.id}`, ownerUser.cookie, 'DELETE'), 200, 'member revocation')
    const afterRevocation = await expectStatus(await appRequest('/api/studio', invitee.cookie), 200, 'revoked studio list')
    if (((await afterRevocation.json()) as { studios: unknown[] }).studios.length) throw new Error('Revoked user retained studio access')
    process.stdout.write('Built Nitro + Better Auth + Neon studio HTTP flow passed\n')
  } finally {
    server.kill('SIGTERM')
    await owner.query('DELETE FROM studios WHERE owner_user_id = ANY($1)', [users])
    await owner.query('DELETE FROM "user" WHERE id = ANY($1)', [users])
    await owner.end()
  }
}

main().then(() => process.exit(0), error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})

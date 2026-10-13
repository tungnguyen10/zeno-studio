import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { createStudioAuth } from '../../server/utils/auth'
import type { TransactionalMail } from '../../server/utils/mail'

const databaseUrl = process.env.NUXT_DATABASE_TEST_URL
const secret = process.env.NUXT_BETTER_AUTH_SECRET
if (!databaseUrl || !secret) throw new Error('NUXT_DATABASE_TEST_URL and NUXT_BETTER_AUTH_SECRET are required')
if (!new URL(databaseUrl).hostname.includes('-pooler')) throw new Error('Auth test requires a pooled Neon test branch URL')

const baseURL = 'http://localhost:3000'
const email = `auth-test-${randomUUID()}@example.invalid`
const firstPassword = `First-${randomUUID()}`
const secondPassword = `Second-${randomUUID()}`
const messages: TransactionalMail[] = []
const pool = new Pool({ connectionString: databaseUrl })
const auth = createStudioAuth({
  databaseUrl,
  baseURL,
  secret,
  sendMail: async message => { messages.push(message) },
})

async function request(path: string, method: 'GET' | 'POST', body?: Record<string, unknown>) {
  return auth.handler(new Request(`${baseURL}/api/auth${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }))
}

async function expectedSuccess(response: Response, step: string) {
  if (response.status >= 400) throw new Error(`${step} failed with HTTP ${response.status}`)
}

async function waitForMail(subject: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const found = messages.find(message => message.subject === subject)
    if (found) return found
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`No ${subject} email was generated`)
}

async function main() {
  try {
    await expectedSuccess(await request('/sign-up/email', 'POST', { name: 'Auth Test', email, password: firstPassword }), 'signup')
    const verifyMail = await waitForMail('Xác minh email')
    const verifyLink = verifyMail.text.match(/https?:\/\/\S+/)?.[0]
    if (!verifyLink) throw new Error('Verification link missing')
    const verify = new URL(verifyLink)
    await expectedSuccess(await request(`${verify.pathname.replace('/api/auth', '')}${verify.search}`, 'GET'), 'verification')
    const verified = await pool.query<{ emailVerified: boolean }>('SELECT "emailVerified" FROM "user" WHERE email = $1', [email])
    if (!verified.rows[0]?.emailVerified) throw new Error('Email was not verified')

    await expectedSuccess(await request('/sign-in/email', 'POST', { email, password: firstPassword }), 'sign-in')
    await expectedSuccess(await request('/request-password-reset', 'POST', { email, redirectTo: `${baseURL}/studio/reset-password` }), 'reset request')
    const resetMail = await waitForMail('Đặt lại mật khẩu')
    const resetLink = resetMail.text.match(/https?:\/\/\S+/)?.[0]
    if (!resetLink) throw new Error('Reset link missing')
    const resetURL = new URL(resetLink)
    const resetRedirect = await request(`${resetURL.pathname.replace('/api/auth', '')}${resetURL.search}`, 'GET')
    await expectedSuccess(resetRedirect, 'reset link')
    const location = resetRedirect.headers.get('location')
    const token = location ? new URL(location, baseURL).searchParams.get('token') : null
    if (!token) throw new Error('Reset redirect did not include a token')
    await expectedSuccess(await request('/reset-password', 'POST', { token, newPassword: secondPassword }), 'password reset')
    await expectedSuccess(await request('/sign-in/email', 'POST', { email, password: secondPassword }), 'new password sign-in')
    process.stdout.write('Better Auth signup, verification, sign-in and password reset passed on Neon\n')
  } finally {
    await pool.query('DELETE FROM "user" WHERE email = $1', [email])
    await pool.end()
  }
}

main().then(() => process.exit(0), error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})

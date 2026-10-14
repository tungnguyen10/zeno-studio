import { betterAuth } from 'better-auth'
import { Pool } from 'pg'
import { sendTransactionalMail, type TransactionalMail } from './mail'

export interface AuthConfiguration {
  databaseUrl: string
  baseURL: string
  secret: string
  sendMail?: (message: TransactionalMail) => Promise<void>
}

export function createStudioAuth(config: AuthConfiguration) {
  const sendMail = config.sendMail ?? sendTransactionalMail
  return betterAuth({
    database: new Pool({ connectionString: config.databaseUrl, max: 5 }),
    baseURL: config.baseURL,
    secret: config.secret,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await sendMail({ to: user.email, subject: 'Đặt lại mật khẩu', text: `Mở liên kết để đặt lại mật khẩu: ${url}` })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail({ to: user.email, subject: 'Xác minh email', text: `Mở liên kết để xác minh email: ${url}` })
      },
    },
  })
}

let authInstance: ReturnType<typeof createStudioAuth> | undefined

export function getStudioAuth() {
  if (authInstance) return authInstance
  const databaseUrl = process.env.NUXT_DATABASE_URL
  const baseURL = process.env.NUXT_BETTER_AUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
  const secret = process.env.NUXT_BETTER_AUTH_SECRET
  if (!databaseUrl || !baseURL || !secret) throw new Error('Neon and Better Auth environment variables are required')
  authInstance = createStudioAuth({ databaseUrl, baseURL, secret })
  return authInstance
}

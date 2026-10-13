import { Pool } from 'pg'

let appPool: Pool | undefined

export function getAppPool(): Pool {
  if (appPool) return appPool
  const connectionString = process.env.NUXT_DATABASE_URL
  if (!connectionString) throw new Error('NUXT_DATABASE_URL is required for Neon database requests')
  appPool = new Pool({ connectionString, max: 10 })
  return appPool
}

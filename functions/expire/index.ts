import { attachDatabasePool } from '@neon/functions'
import { Pool } from 'pg'
import { handleExpiry } from './handler'

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
attachDatabasePool(pool)

export default {
  fetch(request: Request) {
    return handleExpiry(request, sql => pool.query(sql))
  },
}

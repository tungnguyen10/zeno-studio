export interface QueryResult<Row> {
  rows: Row[]
}

export interface QueryClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<Row>>
  release(): void
}

export interface ConnectionPool {
  connect(): Promise<QueryClient>
}

export interface DatabaseContext {
  studioId?: string
  albumId?: string
  userId?: string
  participantId?: string
  userEmail?: string
  invitationHash?: string
  scope: string
}

export async function withDatabaseContext<T>(pool: ConnectionPool, context: DatabaseContext, work: (client: QueryClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `SELECT set_config('app.studio_id', $1, true), set_config('app.album_id', $2, true), set_config('app.user_id', $3, true), set_config('app.scope', $4, true), set_config('app.user_email', $5, true), set_config('app.invitation_hash', $6, true), set_config('app.participant_id', $7, true)`,
      [context.studioId ?? '', context.albumId ?? '', context.userId ?? '', context.scope, context.userEmail ?? '', context.invitationHash ?? '', context.participantId ?? ''],
    )
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

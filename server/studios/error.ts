export class StudioOperationError extends Error {
  constructor(message: string, readonly statusCode: 400 | 403 | 404 | 409 | 410 | 413 | 422 | 429 | 502 | 503) {
    super(message)
  }
}

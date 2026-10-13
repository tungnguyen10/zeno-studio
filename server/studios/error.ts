export class StudioOperationError extends Error {
  constructor(message: string, readonly statusCode: 400 | 403 | 404 | 410) {
    super(message)
  }
}

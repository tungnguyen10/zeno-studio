export const DOWNLOAD_LIMITS = {
  maxFiles: 50,
  maxBytes: 96 * 1024 * 1024,
  shareMaxFiles: 12,
  shareMaxBytes: 48 * 1024 * 1024,
  maxPlanFiles: 10_000,
  ticketSeconds: 600,
} as const

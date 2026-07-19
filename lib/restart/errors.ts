// Restart Baseline — typed query error (F2.2). Carries a non-sensitive `source`
// (which domain/stage failed) and an optional PostgREST-style `code`, while
// keeping the original error as `cause` for server-side inspection only. This
// PRESERVES error-honesty: a failed query still throws (never becomes [] or
// data_quality=insufficient) — we simply know WHICH stage failed. `message`,
// row data and personal values are NEVER surfaced to the client.

export class RestartBaselineQueryError extends Error {
  readonly source: string
  readonly code?: string

  constructor(source: string, cause: unknown) {
    super(`restart baseline read failed: ${source}`, { cause })
    this.name = 'RestartBaselineQueryError'
    this.source = source
    const c = cause as { code?: unknown } | null
    this.code = c && typeof c.code === 'string' ? c.code : undefined
  }
}

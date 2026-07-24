// Restart confirmation — typed errors (F2.6b). PURE.
//
// Distinct failure classes so the routes can map them to exact HTTP codes (§21)
// WITHOUT ever exposing token payloads, fingerprints, snapshots, Supabase error
// messages, SQLSTATE, stack, user binding, secret or user_id. Every message here
// is a STATIC, value-free string safe to construct (it is still never sent to the
// client — routes emit their own generic body).
//
//   ConfirmationConfigError        → 500  configuration (secret missing/too short)
//   InvalidConfirmationTokenError  → 400  malformed/forged/expired-schema/bad binding
//   ConfirmationExpiredError       → 410  token past expires_at (even on replay)
//   ConfirmationStaleError         → 409  assessment/profile/baseline moved, or RPC stale
//   ConfirmationFailedError        → 500  DB/RPC non-stale error, bad RPC response, invariant

export class ConfirmationConfigError extends Error {
  readonly code = 'confirmation_config' as const
  constructor(message = 'restart confirmation is not configured') {
    super(message)
    this.name = 'ConfirmationConfigError'
  }
}

export class InvalidConfirmationTokenError extends Error {
  readonly code = 'invalid_confirmation_token' as const
  constructor(message = 'invalid confirmation token') {
    super(message)
    this.name = 'InvalidConfirmationTokenError'
  }
}

export class ConfirmationExpiredError extends Error {
  readonly code = 'confirmation_expired' as const
  constructor(message = 'confirmation token expired') {
    super(message)
    this.name = 'ConfirmationExpiredError'
  }
}

export class ConfirmationStaleError extends Error {
  readonly code = 'confirmation_stale' as const
  constructor(message = 'confirmation is stale') {
    super(message)
    this.name = 'ConfirmationStaleError'
  }
}

export class ConfirmationFailedError extends Error {
  readonly code = 'confirmation_failed' as const
  constructor(message = 'confirmation failed') {
    super(message)
    this.name = 'ConfirmationFailedError'
  }
}

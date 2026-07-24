// Restart confirmation secret (F2.6b). SERVER-ONLY.
//
// Reads RESTART_CONFIRMATION_SECRET from the environment and validates it:
//   • required — no fallback, no hardcoded dev value;
//   • at least RESTART_CONFIRMATION_SECRET_MIN_BYTES (32) REAL bytes
//     (Buffer.byteLength utf8, not string .length);
//   • never returned to the client, never logged (callers must not log it either).
// A missing/short secret is a CONFIGURATION error (ConfirmationConfigError → 500),
// never a client-visible detail.
//
// Generate one with:
//   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

import { ConfirmationConfigError } from './errors'
import { RESTART_CONFIRMATION_SECRET_MIN_BYTES } from './types'

const ENV_KEY = 'RESTART_CONFIRMATION_SECRET'

/** Returns the validated secret, or throws ConfirmationConfigError. Never logs it. */
export function getRestartConfirmationSecret(): string {
  const value = process.env[ENV_KEY]
  if (!value) {
    throw new ConfirmationConfigError(`${ENV_KEY} is not set`)
  }
  if (Buffer.byteLength(value, 'utf8') < RESTART_CONFIRMATION_SECRET_MIN_BYTES) {
    throw new ConfirmationConfigError(
      `${ENV_KEY} must be at least ${RESTART_CONFIRMATION_SECRET_MIN_BYTES} bytes`
    )
  }
  return value
}

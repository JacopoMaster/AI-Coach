// Restart confirmation token — HMAC sign/verify (F2.6b). SERVER-ONLY (Node crypto).
//
// Compact format, NO JWT dependency:
//     <payload_base64url>.<signature_base64url>
// The signature is HMAC-SHA256 over a DOMAIN-SEPARATED message
//     TOKEN_SIGNATURE_DOMAIN + payload_base64url
// so a signature can never be confused with the independent user-binding HMAC.
// The payload is client-READABLE but not modifiable (any edit breaks the HMAC).
// NO secret data goes into the payload.
//
// All equality checks (signature, user binding) use crypto.timingSafeEqual AFTER a
// length guard — never `===`. Verification order: structure → signature → decode →
// schema → freshness → user binding. The payload is authenticated (signature) and
// schema-validated BEFORE any freshness/binding logic trusts its fields.

import { createHmac, timingSafeEqual } from 'crypto'
import {
  ConfirmationExpiredError,
  InvalidConfirmationTokenError,
} from './errors'
import { RestartConfirmationTokenPayloadV1Schema } from './schema'
import {
  CONFIRMATION_CLOCK_SKEW_SECONDS,
  RESTART_CONFIRMATION_TOKEN_MAX_BYTES,
  TOKEN_SIGNATURE_DOMAIN,
  USER_BINDING_DOMAIN,
  type RestartConfirmationTokenPayloadV1,
} from './types'

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64url')
}

/** Decode a base64url segment, or null if it is not valid base64url. */
function b64urlDecode(segment: string): Buffer | null {
  if (!BASE64URL_RE.test(segment)) return null
  try {
    return Buffer.from(segment, 'base64url')
  } catch {
    return null
  }
}

function hmac(secret: string, message: string): Buffer {
  return createHmac('sha256', secret).update(message, 'utf8').digest()
}

function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Opaque per-user binding: HMAC(secret, USER_BINDING_DOMAIN + userId), base64url.
 *  Ties a token to the authenticated user WITHOUT ever embedding the raw user_id. */
export function computeUserBinding(userId: string, secret: string): string {
  return b64urlEncode(hmac(secret, USER_BINDING_DOMAIN + userId))
}

/** Sign a payload into `<payload_b64url>.<sig_b64url>`. */
export function signRestartConfirmationToken(
  payload: RestartConfirmationTokenPayloadV1,
  secret: string
): string {
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'))
  const signature = hmac(secret, TOKEN_SIGNATURE_DOMAIN + payloadB64)
  return `${payloadB64}.${b64urlEncode(signature)}`
}

/**
 * Verify structure, signature, schema, freshness and user binding. Returns the
 * authenticated payload or throws a typed error:
 *   • InvalidConfirmationTokenError — malformed / bad signature / bad schema /
 *     issued_at in the future / wrong user binding;
 *   • ConfirmationExpiredError — now >= expires_at (checked even so a replay after
 *     expiry still 410s).
 * `now` is epoch seconds (injectable for tests).
 */
export function verifyRestartConfirmationToken(
  token: string,
  secret: string,
  userId: string,
  now: number
): RestartConfirmationTokenPayloadV1 {
  if (typeof token !== 'string' || Buffer.byteLength(token, 'utf8') > RESTART_CONFIRMATION_TOKEN_MAX_BYTES) {
    throw new InvalidConfirmationTokenError('token too large or not a string')
  }

  const segments = token.split('.')
  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    throw new InvalidConfirmationTokenError('token must have exactly two segments')
  }
  const [payloadB64, signatureB64] = segments

  // 1) Signature FIRST — authenticate before trusting any payload byte.
  const providedSig = b64urlDecode(signatureB64)
  if (!providedSig) throw new InvalidConfirmationTokenError('signature not base64url')
  const expectedSig = hmac(secret, TOKEN_SIGNATURE_DOMAIN + payloadB64)
  if (!constantTimeEqual(providedSig, expectedSig)) {
    throw new InvalidConfirmationTokenError('signature mismatch')
  }

  // 2) Decode + JSON parse the (now-authenticated) payload.
  const payloadBuf = b64urlDecode(payloadB64)
  if (!payloadBuf) throw new InvalidConfirmationTokenError('payload not base64url')
  let json: unknown
  try {
    json = JSON.parse(payloadBuf.toString('utf8'))
  } catch {
    throw new InvalidConfirmationTokenError('payload not JSON')
  }

  // 3) Strict schema (purpose/version/uuid/proposal shape/etc.).
  const parsed = RestartConfirmationTokenPayloadV1Schema.safeParse(json)
  if (!parsed.success) throw new InvalidConfirmationTokenError('payload schema invalid')
  const payload = parsed.data as RestartConfirmationTokenPayloadV1

  // 4) Freshness. expires_at must be strictly after issued_at.
  if (!(payload.expires_at > payload.issued_at)) {
    throw new InvalidConfirmationTokenError('expires_at must be after issued_at')
  }
  // issued_at too far in the future (beyond clock-skew tolerance) → invalid.
  if (payload.issued_at > now + CONFIRMATION_CLOCK_SKEW_SECONDS) {
    throw new InvalidConfirmationTokenError('issued_at is in the future')
  }
  // Expired (checked regardless of persistence — a replay after expiry still 410s).
  if (now >= payload.expires_at) {
    throw new ConfirmationExpiredError()
  }

  // 5) User binding — recompute from the SESSION user, constant-time compare.
  const expectedBinding = Buffer.from(computeUserBinding(userId, secret), 'utf8')
  const providedBinding = Buffer.from(payload.user_binding, 'utf8')
  if (!constantTimeEqual(providedBinding, expectedBinding)) {
    throw new InvalidConfirmationTokenError('user binding mismatch')
  }

  return payload
}

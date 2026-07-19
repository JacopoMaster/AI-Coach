// Server-only admin authorization helper.
//
// The single source of truth for "who is an admin" is the server-side env var
// ADMIN_USER_IDS: a comma-separated allowlist of Supabase auth user UUIDs.
//
//   ADMIN_USER_IDS=uuid1,uuid2,uuid3
//
// It has NO `NEXT_PUBLIC_` prefix on purpose, so it is never bundled into the
// client. Authorization is decided exclusively by the exact Supabase `user.id`
// — never by name, email, query string, request body, custom cookie, or any
// client-controllable header.
//
// Fail-closed: if ADMIN_USER_IDS is missing or empty, nobody is an admin.

import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Parse the ADMIN_USER_IDS allowlist from the environment.
 * Splits on comma, trims each value, drops empties. Returns [] when unset.
 */
export function getAdminUserIds(): string[] {
  const raw = process.env.ADMIN_USER_IDS
  if (!raw) return []
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
}

/**
 * True only when `userId` is a non-empty string that exactly matches an entry
 * in the allowlist. Fail-closed: empty allowlist ⇒ always false.
 */
export function isAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false
  const allow = getAdminUserIds()
  if (allow.length === 0) return false
  return allow.includes(userId)
}

export type RequireAdminResult =
  | { ok: true; user: { id: string } }
  | { ok: false; status: 401 | 403 }

/**
 * Resolve the current Supabase user and check it against the admin allowlist.
 *
 * - not authenticated        → { ok: false, status: 401 }
 * - authenticated, not admin → { ok: false, status: 403 }
 * - authenticated admin      → { ok: true, user }
 *
 * Never logs identifiers: not the allowlist, not the user id, not the email.
 * A rejected attempt is logged as a generic, PII-free technical message.
 */
export async function requireAdmin(
  supabase: SupabaseServerClient
): Promise<RequireAdminResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, status: 401 }
  }

  if (!isAdminUserId(user.id)) {
    console.warn('[admin] forbidden admin route access attempt')
    return { ok: false, status: 403 }
  }

  return { ok: true, user: { id: user.id } }
}

// Assessment draft fingerprint (F2.6b). PURE (Node crypto, no I/O).
//
// SHA-256 over the CANONICAL JSON of the whole RestartAssessmentDraft (§9). The
// single centralized encoding choice is lowercase HEX. Because the canonical form
// covers the ENTIRE draft — profile snapshot, baseline snapshot, per-domain data
// quality, denormalized scalars, manual answers, analysis dates and the
// plan/mesocycle links — the fingerprint changes if ANY decision-relevant part of
// the draft changes, which is exactly the staleness signal the confirm step needs.

import { createHash } from 'crypto'
import type { RestartAssessmentDraft } from '@/lib/restart/assessment/types'
import { canonicalJsonStringify } from './canonical-json'

/** Lowercase hex SHA-256 of the canonical JSON of the draft. */
export function fingerprintRestartAssessmentDraft(draft: RestartAssessmentDraft): string {
  const canonical = canonicalJsonStringify(draft)
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

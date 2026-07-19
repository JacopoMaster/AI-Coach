// Pure diff helpers for the progressive Profile UI (F1.4). No React, no I/O.
//
// They implement the PATCH contract the UI must honour:
//   • omitted → a field NOT changed vs the loaded baseline is never sent;
//   • null    → sent only when the user explicitly cleared a previously-set value;
//   • []      → sent only when the user explicitly answered "none";
//   • a section save sends ONLY that section's changed fields.
// "Changed" = differs from the last value returned by the server (baseline), so
// an initially-null field stays absent from the patch until the user acts.

export type FieldValue = string | number | string[] | null

/** Value equality: arrays compared element-wise in order; scalars/null via ===. */
export function eqValue(a: FieldValue, b: FieldValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  return a === b
}

/** True when any of `keys` differs between draft and baseline. */
export function hasChanges<K extends string>(
  draft: Record<K, FieldValue>,
  baseline: Record<K, FieldValue>,
  keys: readonly K[]
): boolean {
  return keys.some((k) => !eqValue(draft[k], baseline[k]))
}

/**
 * Build the PATCH body for one section: only the keys whose draft value differs
 * from the baseline, each carrying the current draft value (which may be a
 * concrete value, an explicit null, or an explicit []). Unchanged keys are
 * omitted entirely.
 */
export function buildSectionPatch<K extends string>(
  draft: Record<K, FieldValue>,
  baseline: Record<K, FieldValue>,
  keys: readonly K[]
): Record<string, FieldValue> {
  const patch: Record<string, FieldValue> = {}
  for (const k of keys) {
    if (!eqValue(draft[k], baseline[k])) patch[k] = draft[k]
  }
  return patch
}

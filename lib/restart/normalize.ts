// Restart Baseline — exercise-name normalization (F2.2). PURE.
//
// Simple, transparent, deterministic: lowercase, trim, collapse internal
// whitespace, strip basic punctuation. Used both to GROUP performance by
// exercise and to detect CONFIRMED plan conflicts (exact match after this
// normalization only — never fuzzy similarity, D017/D022).

export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,;:!?/\\()[\]{}'"`]/g, ' ') // basic punctuation → space
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
}

/** Tokens of length ≥ 4 — used only for NON-authoritative possible-conflict hints. */
export function significantTokens(name: string): string[] {
  return normalizeExerciseName(name)
    .split(' ')
    .filter((t) => t.length >= 4)
}

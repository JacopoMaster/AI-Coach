// Restart Assessment — snapshot version constants (F2.4). PURE, no I/O.
//
// Single source of truth for the two snapshot schema versions persisted in
// restart_assessments.baseline_snapshot_version / profile_snapshot_version
// (migration 014). Never hardcode the literal `1` anywhere else: import these.
//
// Bump a version ONLY when the corresponding snapshot's SHAPE changes in a way
// that later readers must distinguish (e.g. a field is renamed/removed). The DB
// CHECK only guarantees version >= 1 and that the payload is a JSON object; the
// meaning of each version lives here and in the builders.

/** Shape version of RestartBaseline (F2.2) as stored in baseline_snapshot. */
export const RESTART_BASELINE_SNAPSHOT_VERSION = 1 as const

/** Shape version of the Athlete Profile snapshot (F2.4) in profile_snapshot. */
export const ATHLETE_PROFILE_SNAPSHOT_VERSION = 1 as const

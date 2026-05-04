-- Migration 010: Remove the 'dawn_patrol' achievement
-- ─────────────────────────────────────────────────────────────────────────────
-- The "10 allenamenti prima delle 10:00" trophy is unreachable for the user's
-- schedule and was always a placeholder (the seed in 008 used a no-op flag in
-- check-achievements.ts so it never unlocked anyway).
--
-- ON DELETE CASCADE on user_achievements.achievement_code drops any orphan
-- unlock rows automatically — no extra cleanup needed. Idempotent: re-running
-- this migration on an already-clean catalog is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM achievements WHERE code = 'dawn_patrol';

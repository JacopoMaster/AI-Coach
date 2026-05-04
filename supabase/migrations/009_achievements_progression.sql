-- Migration 009: Achievement progression — long-term metric-based trophies
-- ─────────────────────────────────────────────────────────────────────────────
-- Two structural changes + one catalog rewrite, all idempotent.
--
-- 1. `achievements.metric_key` + `target_value`: declarative progress bars.
--    Frontend reads `metric_key` to pick which user_stats counter to display
--    and `target_value` to render the progress bar fill. NULL on both ⇒
--    one-shot event achievement (unlocked by checkAchievements logic, no bar).
--
-- 2. `user_stats` cumulative counters:
--    - total_workouts        — incremented in awardExp() on workout_session
--    - total_tonnage         — incremented in awardExp() on workout_session
--    - max_perfect_streak    — bumped in evaluateLastWeek (Perfect Week tick)
--    - anime_waifu_notifs    — bumped by push-notification crons when the
--                              picked Multiverse Coach character carries the
--                              "waifu" tag.
--
-- 3. Catalog rewrite via INSERT … ON CONFLICT DO UPDATE — extends 008's roster
--    with the new metric-based trophies and tags every existing one-shot with
--    NULL metric to make their progress-bar status explicit.
--
-- Re-running this migration is safe: column adds use IF NOT EXISTS, the seed
-- uses ON CONFLICT, and `user_achievements` rows are never touched.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1. Schema additions ────────────────────────────────────────────────────

ALTER TABLE achievements
  ADD COLUMN IF NOT EXISTS metric_key   VARCHAR(64),
  ADD COLUMN IF NOT EXISTS target_value NUMERIC;

CREATE INDEX IF NOT EXISTS achievements_metric_idx
  ON achievements (metric_key)
  WHERE metric_key IS NOT NULL;

ALTER TABLE user_stats
  ADD COLUMN IF NOT EXISTS total_workouts     INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tonnage      NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_perfect_streak INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anime_waifu_notifs INT     NOT NULL DEFAULT 0;

-- Backfill `max_perfect_streak` from the existing `longest_streak` column so
-- users with a pre-existing streak don't see the bar reset to zero.
UPDATE user_stats
SET    max_perfect_streak = GREATEST(max_perfect_streak, longest_streak)
WHERE  longest_streak > max_perfect_streak;


-- ─── 2. Catalog rewrite ─────────────────────────────────────────────────────
-- New metric-based achievements + retained one-shots from migration 008.
-- Order grouped by bucket for readability; ON CONFLICT keeps unlock dates intact.

INSERT INTO achievements
  (code, name, description, icon, rarity, exp_reward, hidden, metric_key, target_value)
VALUES
  -- ── TONNELLAGGIO (metric_key = 'total_tonnage') ─────────────────────────
  ('blindato',             'Blindato',                'Tonnellaggio cumulato 10.000 kg.',                          'shield',         'common',     150, false, 'total_tonnage',           10000),
  ('mecha_frame',          'Mecha Frame',             'Tonnellaggio cumulato 60.000 kg.',                          'bot',            'uncommon',   400, false, 'total_tonnage',           60000),
  ('gigante_acciaio',      'Gigante d''Acciaio',      'Tonnellaggio cumulato 250.000 kg.',                         'tower-control',  'rare',       900, false, 'total_tonnage',          250000),
  ('kaiju_lifter',         'Kaiju Lifter',            'Tonnellaggio cumulato 1.000.000 kg.',                       'mountain',       'rare',      1800, false, 'total_tonnage',         1000000),
  ('incrociatore',         'Incrociatore Spaziale',   'Tonnellaggio cumulato 5.000.000 kg.',                       'rocket',         'legendary', 4000, false, 'total_tonnage',         5000000),
  ('torre_eiffel',         'Torre Eiffel',            'Tonnellaggio cumulato 10.100.000 kg — il peso della Torre.','landmark',       'legendary', 8000, false, 'total_tonnage',        10100000),

  -- ── COSTANZA (metric_key = 'total_workouts') ────────────────────────────
  ('battesimo_ferro',      'Battesimo del Ferro',     '10 allenamenti completati.',                                'dumbbell',       'common',     100, false, 'total_workouts',             10),
  ('araldo_ghisa',          'Araldo della Ghisa',      '100 allenamenti completati.',                              'flame',          'uncommon',   500, false, 'total_workouts',            100),
  ('dominatore_gravita',   'Dominatore della Gravità','500 allenamenti completati.',                               'orbit',          'rare',      2000, false, 'total_workouts',            500),
  ('leggenda_inossidabile','Leggenda Inossidabile',   '1000 allenamenti completati.',                              'crown',          'legendary', 5000, false, 'total_workouts',           1000),

  -- ── STREAK (metric_key = 'max_perfect_streak') ──────────────────────────
  ('iron_streak',          'Iron Streak',             'Prima Perfect Week consecutiva.',                           'sparkles',       'common',      75, false, 'max_perfect_streak',          1),
  ('steel_streak',         'Steel Streak',            '4 Perfect Week consecutive.',                               'link',           'uncommon',   400, false, 'max_perfect_streak',          4),
  ('gold_streak',          'Gold Streak',             '12 Perfect Week consecutive (3 mesi).',                     'medal',          'rare',      1200, false, 'max_perfect_streak',         12),
  ('platinum_streak',      'Platinum Streak',         '26 Perfect Week consecutive (6 mesi).',                     'gem',            'rare',      2500, false, 'max_perfect_streak',         26),
  ('diamond_streak',       'Diamond Streak',          '52 Perfect Week consecutive (1 anno).',                     'diamond',        'legendary', 6000, false, 'max_perfect_streak',         52),

  -- ── WAIFU (metric_key = 'anime_waifu_notifs') ───────────────────────────
  ('amante_2d',            'Amante della Bidimensionalità','100 notifiche ricevute da una waifu.',                'heart',          'rare',       500, true,  'anime_waifu_notifs',        100),

  -- ── ONE-SHOT EVENT ACHIEVEMENTS (metric_key NULL) ───────────────────────
  -- Onboarding
  ('first_spark',          'Prima Scintilla',         'Prima sessione loggata. La spirale inizia a girare.',       'zap',            'common',      50, false, NULL, NULL),
  ('first_bite',           'Primo Morso',             'Primo pasto registrato. Il carburante conta quanto la fiamma.','utensils',    'common',      25, false, NULL, NULL),
  ('on_the_scale',         'Sul Piatto della Bilancia','Prima pesata registrata. Nessun progresso senza misura.',  'scale',          'common',      25, false, NULL, NULL),
  -- Discipline / discontinued metric-shaped one-shots
  ('iron_will',            'Volontà di Ferro',        '4 settimane consecutive con 3+ sessioni.',                  'flame',          'uncommon',   200, false, NULL, NULL),
  ('perfect_spiral',       'Spirale Perfetta',        'Prima Perfect Week (allenamento + peso).',                  'sparkles',       'uncommon',   150, false, NULL, NULL),
  ('infinite_spiral',      'Energia Infinita',        'Risonanza al ×3.00 per la prima volta.',                    'radio',          'rare',       500, false, NULL, NULL),
  -- Lifting one-shots
  ('century_press',        'Centurione',              'Primo sollevamento con carico ≥ 100 kg.',                   'trophy',         'uncommon',   150, false, NULL, NULL),
  ('giga_drill',           'Giga Drill Break',        'Primo Giga Drill Break (nuovo PR di tonnellaggio).',        'swords',         'rare',       250, false, NULL, NULL),
  ('big_bang',             'Big Bang Spirale',        'Giga Drill Break con improvement ≥ 10%.',                   'sparkle',        'rare',       350, false, NULL, NULL),
  ('limit_break',          'Limit Break',             'Superato il proprio limite tecnico in una sessione.',       'flame',          'rare',       400, true,  NULL, NULL),
  -- Body & Diet one-shots
  ('macro_tracker',        'Cacciatore di Macro',     '30 giorni totali di log dieta.',                            'clipboard-list', 'uncommon',   200, false, NULL, NULL),
  ('protein_warrior',      'Guerriero della Proteina','14 giorni consecutivi al target proteico.',                 'beef',           'uncommon',   200, false, NULL, NULL),
  ('weight_watcher',       'Occhio della Bilancia',   '10 pesate registrate.',                                     'activity',       'common',     100, false, NULL, NULL),
  -- Mesocycles
  ('chapter_clear',        'Capitolo Concluso',       'Primo mesociclo completato.',                               'book-open',      'rare',       500, false, NULL, NULL),
  ('triple_chapter',       'Tripla Spirale',          '3 mesocicli completati.',                                   'layers',         'rare',       750, false, NULL, NULL),
  ('side_quest',           'Side Quest',              'Completato un mesociclo con piano modificato in corso.',    'compass',        'uncommon',   300, true,  NULL, NULL),
  -- Legendary level milestones
  ('pierce_heavens',       'Sfonda il Cielo',         'Raggiunto il Livello 100. La spirale si apre.',             'star',           'legendary', 1000, true,  NULL, NULL),
  ('tengen_toppa',         'Tengen Toppa',            'Raggiunto il Livello 200. Colui che trafigge i cieli.',     'telescope',      'legendary', 2500, true,  NULL, NULL)

ON CONFLICT (code) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  icon         = EXCLUDED.icon,
  rarity       = EXCLUDED.rarity,
  exp_reward   = EXCLUDED.exp_reward,
  hidden       = EXCLUDED.hidden,
  metric_key   = EXCLUDED.metric_key,
  target_value = EXCLUDED.target_value;


-- ─── 3. Diagnostics ─────────────────────────────────────────────────────────
-- After running, expect:
--   SELECT count(*) FROM achievements;                                 -- ≥ 33
--   SELECT count(*) FROM achievements WHERE metric_key IS NOT NULL;    -- 16
--   SELECT metric_key, count(*) FROM achievements
--     WHERE metric_key IS NOT NULL GROUP BY metric_key;
--     -- total_tonnage:6, total_workouts:4, max_perfect_streak:5, anime_waifu_notifs:1

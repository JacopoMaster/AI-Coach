-- Migration 008: Achievements catalog v1 (20 trophies)
-- ─────────────────────────────────────────────────────────────────────────────
-- Extends the starter seed from migration 006 to the full v1 set.
-- Uses INSERT ... ON CONFLICT DO UPDATE so re-running the migration
-- realigns metadata (name, description, icon, rarity, exp_reward, hidden)
-- without duplicating rows or touching user_achievements unlocks.
--
-- Hidden achievements are narrative milestones that should only be surfaced
-- in the catalog once unlocked (the UI masks them as "???").
--
-- Source buckets covered:
--   • workout_session    → first_spark, iron_will, century_press, dawn_patrol
--   • diet_log           → first_bite, macro_tracker, protein_warrior
--   • body_measurement   → on_the_scale, weight_watcher
--   • perfect_week       → perfect_spiral, bonded_spiral, eternal_spiral,
--                          infinite_spiral
--   • giga_drill_break   → giga_drill, big_bang, tonnage_titan
--   • meso_complete      → chapter_clear, triple_chapter
--   • level milestones   → pierce_heavens, tengen_toppa
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO achievements (code, name, description, icon, rarity, exp_reward, hidden) VALUES
  -- Foundation / Onboarding
  ('first_spark',      'Prima Scintilla',         'Prima sessione loggata. La spirale inizia a girare.',              'zap',          'common',     50, false),
  ('first_bite',       'Primo Morso',             'Primo pasto registrato. Il carburante conta quanto la fiamma.',    'utensils',     'common',     25, false),
  ('on_the_scale',     'Sul Piatto della Bilancia','Prima pesata registrata. Nessun progresso senza misura.',         'scale',        'common',     25, false),

  -- Consistency / Discipline
  ('iron_will',        'Volontà di Ferro',        '4 settimane consecutive con 3+ sessioni.',                         'flame',        'uncommon',  200, false),
  ('perfect_spiral',   'Spirale Perfetta',        'Prima Perfect Week (allenamento + dieta + peso).',                 'sparkles',     'uncommon',  150, false),
  ('bonded_spiral',    'Spirale Vincolata',       '3 Perfect Week consecutive. La risonanza si stabilizza.',          'link',         'rare',      400, false),
  ('eternal_spiral',   'Spirale Eterna',          '8 Perfect Week consecutive. Cap di risonanza raggiunto.',          'infinity',     'rare',      800, false),
  ('infinite_spiral',  'Energia Infinita',        'Risonanza al ×3.00 per la prima volta.',                           'radio',        'rare',      500, false),
  ('dawn_patrol',      'Pattuglia dell''Alba',    '10 allenamenti registrati prima delle 10:00.',                     'sunrise',      'uncommon',  200, false),

  -- Lifting
  ('century_press',    'Centurione',              'Primo sollevamento con carico ≥ 100 kg.',                          'trophy',       'uncommon',  150, false),
  ('tonnage_titan',    'Titano del Tonnellaggio', 'Tonnellaggio totale cumulato oltre 100.000 kg.',                   'weight',       'rare',      600, false),
  ('giga_drill',       'Giga Drill Break',        'Primo Giga Drill Break (nuovo PR di tonnellaggio).',               'swords',       'rare',      250, false),
  ('big_bang',         'Big Bang Spirale',        'Giga Drill Break con un''improvement ≥ 10%.',                      'sparkle',      'rare',      350, false),

  -- Diet
  ('macro_tracker',    'Cacciatore di Macro',     '30 giorni totali di log dieta.',                                   'clipboard-list','uncommon',  200, false),
  ('protein_warrior',  'Guerriero della Proteina','14 giorni consecutivi al target proteico.',                        'beef',         'uncommon',  200, false),

  -- Body
  ('weight_watcher',   'Occhio della Bilancia',   '10 pesate registrate.',                                            'activity',     'common',    100, false),

  -- Mesocycles
  ('chapter_clear',    'Capitolo Concluso',       'Primo mesociclo completato.',                                      'book-open',    'rare',      500, false),
  ('triple_chapter',   'Tripla Spirale',          '3 mesocicli completati.',                                          'layers',       'rare',      750, false),

  -- Legendary milestones (hidden until unlocked)
  ('pierce_heavens',   'Sfonda il Cielo',         'Raggiunto il Livello 100. La spirale si apre.',                    'star',         'legendary',1000, true),
  ('tengen_toppa',     'Tengen Toppa',            'Raggiunto il Livello 200. Colui che trafigge i cieli.',            'telescope',    'legendary',2500, true)
ON CONFLICT (code) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  icon        = EXCLUDED.icon,
  rarity      = EXCLUDED.rarity,
  exp_reward  = EXCLUDED.exp_reward,
  hidden      = EXCLUDED.hidden;


-- ─── Diagnostics ─────────────────────────────────────────────────────────────
-- After running, verify:
--   SELECT count(*) FROM achievements;                                 -- → 20
--   SELECT rarity, count(*) FROM achievements GROUP BY rarity;
--   SELECT code, name FROM achievements WHERE hidden ORDER BY code;    -- → 2

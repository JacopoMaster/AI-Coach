# Coach AI 2.0 — BACKLOG

> Backlog organizzato per fase con stati: **TODO · IN PROGRESS · DONE · DEFERRED**.
> I prossimi task P0 sono in cima. Aggiornare a ogni sessione insieme a `SESSION_HANDOFF.md`.

---

## Prossimi task — Fase 2 (September Restart)

> **Fase 0 COMPLETATA.** **Fase 1 COMPLETATA** (F1.1–F1.5). **Fase 2 in corso**: F2.1 design DONE,
> **F2.2 DONE** (aggregation layer `lib/restart/`), **F2.3 DONE** (migration `014` applicata/verificata
> sul DB reale 2026-07-24), **F2.4 DONE** (application/API layer `lib/restart/assessment/` + route;
> verifica runtime API superata 2026-07-24), **F2.5 DONE** (structured tool proposal + Zod + Profile
> guardrails, un solo repair retry, **zero persistenza**; **verifica AI runtime reale + qualitativa
> superata 2026-07-24**). **F2.6 divisa in F2.6a (migration/RPC) + F2.6b (token + confirm API)**:
> **F2.6a DONE** (migration `015`: `confirmation_id` + RPC atomica idempotente; **applicata e verificata
> sul DB reale 2026-07-24**). **F2.6b IMPLEMENTED / PENDING REAL CONFIRMATION & REPLAY VERIFICATION**
> (token HMAC firmato + confirm API `POST /api/restart/confirm` + emissione token in strategy-proposal).
> F2.6 complessiva **NON DONE**. Prossimo task: **F2.7** (Restart UI).
> Riferimenti: D006/D007, D008/D009, **D014–D019**, sezione "Fase 2 — Restart (design)" in `CURRENT_STATE.md`.

### Roadmap Fase 2 (approvata)
- [x] **DONE — F2.1 · Design & Architecture Restart / Training Strategy** (docs). Entità e confini
  (D014), baseline error-honest/auditabile a finestre 4/8/12 (D015), data quality per dominio
  (D016), affidabilità metriche + PlanFit parziale (D017), flusso ibrido codice→AI→conferma
  (D018), `baseline_tonnage` separato (D019). Design completo in `CURRENT_STATE.md`.
- [x] **DONE — F2.2 · Restart Baseline + Data Quality + PlanFit (aggregation layer)**.
  **Real-data verification superata** (baseline reale coerente: training 3/4/9, quality
  sufficient/limited/limited/insufficient, PlanFit A/B `below`/`equal`, nutrition 0 giorni ≠ 0 kcal).
  Bug reale trovato e corretto in diagnostica: `session_exercises.rpe` (PostgreSQL **42703**) →
  colonna **droppata in migration 011**, rimossa dalla query `sessions`. Correzioni semantiche
  post-verifica: PlanFit `plan_days_vs_target`/`plan_days_vs_minimum` (fattuale, non giudizio),
  **`estimated_1rm` rimosso**, body `days_since_latest_measurement`+freshness, performance
  `highest_load_recent_set` (tie-break data recente). Test **71/71**; tsc/build OK. **Nessuna
  persistenza, nessuna AI, nessun DB/migration/RLS**; route dev di verifica **eliminata**. Dominio
  `lib/restart/` (13 file): `types.ts`,
  `thresholds.ts` (soglie centralizzate/documentate), `windows.ts` (finestre 4/8/12 + serie ISO
  12w, Europe/Rome), `queries.ts` (letture **error-honest**), `training.ts`, `performance.ts`
  (parsing new/legacy via helper tonnage condiviso; `personal_records` **non** letto; ricalcolo da
  `session_exercises`; `highest_load_recent_set`, **no** estimated 1RM), `body.ts` (trend
  first-vs-last + `days_since_latest_measurement`, metriche bilancia device-derived), `nutrition.ts`
  (riusa `getDailyNutritionTotals`; missing ≠ zero; medie sui soli giorni tracciati), `plan-fit.ts`
  (`plan_days_vs_target/minimum` fattuale; confirmed vs possible conflicts; durata `unavailable`),
  `data-quality.ts` (4 classificatori puri), `errors.ts` (`RestartBaselineQueryError{source,code}`),
  `baseline.ts` (`buildRestartBaseline`, atomico, no `allSettled`). Esteso `lib/workouts/tonnage.ts`
  (export `parseLegacyReps`, additivo). `user_stats.baseline_tonnage`/`diet_logs` non usati; output
  serializzabile e bounded.
- [x] **DONE — F2.3 · Schema DB Restart Assessment + Training Strategy**. Migration
  `014_restart_assessments_and_training_strategies.sql` **applicata manualmente via Supabase SQL
  Editor e verificata sul DB reale (2026-07-24)**: `restart_assessments`/`training_strategies`
  presenti, **column count 30/20**, RLS attiva, policy assessment SELECT/INSERT own (no UPDATE/DELETE,
  `authenticated`), policy strategy SELECT/INSERT/UPDATE own (no DELETE, `authenticated`), assessment
  **senza trigger**, strategy con `trg_..._enforce_update` + `trg_..._updated_at`, funzioni
  `enforce_training_strategy_update()` + `set_updated_at()` presenti, partial unique
  `training_strategies_one_active_per_user_uidx`, FK composite `training_strategies_assessment_fk` +
  `training_strategies_supersedes_fk` entrambe **NO ACTION / DEFERRABLE / INITIALLY DEFERRED**,
  **row count 0/0** (nessun dato reale). Design (round 1–3): `restart_assessments` **immutabile**
  (NO `updated_at`/trigger/`status`; snapshot **JSONB versionati**; 4 `*_data_quality`; 10 scalari
  denormalizzati; risposte manuali nullable; `assessed_*` **UUID nullable SENZA FK**; RLS SELECT+INSERT);
  `training_strategies` **versionata con core immutabile** (trigger `enforce_training_strategy_update()`:
  UPDATE consente solo `status`/`review_date`/`workout_plan_id`/`mesocycle_id`; transizioni
  `active→superseded/completed`, terminali bloccati); **una sola active per utente** (partial unique);
  same-user FK composite **differibili**. **Requisito futuro F2.6**: persistenza atomica
  Assessment+Strategy via **RPC/transazione server-side `SECURITY INVOKER`** (UPDATE old→superseded
  prima di INSERT new active).
- [x] **DONE — F2.4 · Restart Assessment application/API layer** (allineato alla spec completa
  §1–§24; **verifica runtime API superata 2026-07-24**: GET→`needs_answers`+baseline+4 domande;
  POST completo→`ready_for_strategy_proposal`+draft (no `user_id`/`created_at`); POST
  `availability_changed=true`→`profile_update_required`; **row count 0/0**). Dominio
  `lib/restart/assessment/` (9 file: versions, types, profile-snapshot, questions, schema, draft,
  **draft-schema**, **resolve**, server) + route `app/api/restart/assessment` (GET domande + baseline
  / POST → draft persistence-ready).
  **NESSUNA persistenza**: non inserisce in `restart_assessments`, non tocca
  `training_strategies`/`athlete_profiles`/`workout_plans`/`mesocycles` (→ F2.6, atomico, D007/D018).
  **Stati discriminati**: `profile_required`, `needs_answers` (+`missing_answer_ids`),
  `profile_update_required` (blocker; un boolean safety `true` **blocca** il draft — il cambiamento va
  sul Profilo, source of truth), `ready_for_strategy_proposal` (+`assessment_draft`); `unexpected_answer`
  → 400. Gate profilo prima della baseline; `buildRestartBaseline` (F2.2); `buildAthleteProfileSnapshotV1`
  (no metadata, `null`≠`[]`, `years_training`→number|null o errore); domande adattive (safety sempre;
  strength se perf `!== sufficient`; readiness se rientro ≥14g o nessuna sessione); Zod **strict** (solo
  `{answers}`, `null` non ammesso; rifiuta ogni campo server-derived); `RestartAssessmentDraft` =
  colonne `restart_assessments` meno `id`/`user_id`/`created_at`; **draft-schema** con Zod (CHECK 014)
  + invarianti vs baseline; link `assessed_*` guardati (no id stantio). Error-honest (throw su errore
  DB → 500, mai `profile_required`). Ricerca finale zero-write superata; F2.2 non toccato. tsc/build OK;
  **76 asserzioni pure**. **Verifica manuale API+draft con sessione reale ancora da eseguire** (§22:
  GET→needs_answers, POST both-false→ready + row count 0/0, POST boolean true→profile_update_required).
  **Requisito atomicità (F2.3)**: F2.6 userà RPC/transazione `SECURITY INVOKER`.
- [x] **DONE — F2.5 · AI Strategy Proposal (strutturata)**.
  Dominio `lib/restart/strategy-proposal/` (9 file: types, schema, context, prompt, provider, proposal,
  orchestrate, server, errors) + route `POST /api/restart/strategy-proposal`. Trasforma il
  `RestartAssessmentDraft` validato di F2.4 in una **proposta di Training Strategy** strutturata,
  spiegabile, **effimera (NESSUNA write)**. Il body è lo **stesso schema strict F2.4** (`{answers}`):
  Profile/Baseline/Draft ricostruiti server-side; stati incompleti F2.4 propagati
  (`profile_required`/`needs_answers`/`profile_update_required`), AI invocata **solo** su
  `ready_for_strategy_proposal`; successo → `ready_for_confirmation`. **Structured tool output**
  (Anthropic tool use forzato, un solo tool `propose_restart_strategy`; nessun parsing markdown/regex).
  L'AI produce **solo** `RestartStrategyAiOutput` (numeri + prosa + `review_after_days` 28|35|42), mai
  date né `strategy_type`; il **server** deriva `strategy_type='restart'`, `start_date=analysis_date`,
  `review_date=start_date+review_after_days` (date-only, no TZ shift). **Zod strict/bounded** (entro i
  limiti migration 014: priorities ≤10, observations/risks ≤20 — più stretti) + **Profile guardrails**
  (target/min ≤ disponibilità profilo; min ≤ target; valori inferiori ammessi per rientro graduale) +
  validazione finale della proposta (schema + invarianti). **Un solo repair retry** (max 2 chiamate,
  hint value-free; provider/transport error → nessun retry). Errori tipizzati: `StrategyProviderError`
  / `InvalidAiOutputError` → **502 generico** (`strategy_generation_failed`); `ProposalInvariantError`
  → 500. Modello dalla config centrale (`AI_MODELS.restartStrategy`, default = modello testo, override
  `ANTHROPIC_RESTART_STRATEGY_MODEL`) — nessun ID hardcoded. Prompt: italiano, solo structured output,
  data quality per dominio, snapshot **untrusted** (anti prompt-injection, ASSESSMENT delimitato),
  no invenzioni/diagnosi, no prescrizioni (esercizi/serie/reps/carichi/calorie/macro), target vs minimo,
  nutrition missing = unknown. **NESSUNA persistenza** (no `.from/.insert/.update/.upsert/.delete/.rpc`).
  tsc/build OK; **55 asserzioni pure** (schema, guardrails, context/privacy, date, provider parsing,
  retry, orchestrazione zero-AI-call, prompt grounding, trust boundary, parità tool↔Zod). **Verifica AI
  runtime reale ESEGUITA E SUPERATA (2026-07-24)**: `POST /api/restart/strategy-proposal` → 200
  `ready_for_confirmation`, `strategy_type='restart'`, `start_date===analysis_date`, `review_date`
  coerente (start+28/35/42), target/min **entro il profilo**, nessun identity/`user_id`; structured tool
  use verificato; verifica qualitativa superata (grounding, cautela su domini `limited`, nutrition
  missing = assente, nessuna prescrizione/diagnosi/invenzione); **nuove tabelle 0/0**. **→ DONE.**
  **F2.6 dovrà ri-validare server-side, mai persistere ciecamente draft/proposta dal client.**
- [x] **DONE — F2.6a · Idempotency schema +
  atomic confirmation RPC (D007/D018/D020/D021)**. Migration `015_restart_confirmation_idempotency_and_rpc.sql`
  **applicata manualmente via Supabase SQL Editor e verificata sul DB reale (2026-07-24)**: `restart_assessments`
  **31 colonne**; `confirmation_id` uuid/NOT NULL/no default + unique `restart_assessments_confirmation_id_key`;
  unique index `training_strategies_one_per_assessment_uidx`; RPC `confirm_restart_strategy` presente
  (**SECURITY INVOKER**, VOLATILE, `search_path=public,pg_temp`, firma/return corretti); ACL `authenticated`
  execute=true, anon/PUBLIC=false; FK composite same-user ancora NO ACTION/DEFERRABLE/INITIALLY DEFERRED;
  RLS attiva; policy F2.3 e trigger Strategy invariati; **row count 0/0** (nessuna conferma/write reale).
  Aggiunge: **`restart_assessments.confirmation_id`** `uuid` NOT NULL UNIQUE
  **senza default** (chiave di idempotenza; rollout robusto ADD COLUMN→backfill→SET NOT NULL→UNIQUE;
  immutabilità invariata → **31 colonne**); UNIQUE index **`training_strategies_one_per_assessment_uidx`**
  su `(based_on_assessment_id)` (un Assessment → una sola Strategy persistita); RPC
  **`public.confirm_restart_strategy(p_confirmation_id, p_assessment jsonb, p_strategy jsonb,
  p_expected_active_strategy_id)` RETURNS TABLE(assessment_id, strategy_id, created_new)** —
  **SECURITY INVOKER**, VOLATILE, `search_path=public,pg_temp`, identità **solo** `auth.uid()`,
  **advisory xact lock per-utente**, **idempotency lookup prima dello staleness check**, **expected-active
  guard NULL-safe** (`restart_confirmation_stale`), **supersede old active prima** dell'INSERT new active
  (partial unique `active` non DEFERRABLE), mapping esplicito whitelist (no `jsonb_populate_record`, no
  dynamic SQL), rollback completo su errore. Privilegi: `REVOKE` da PUBLIC/anon, `GRANT EXECUTE` solo a
  `authenticated`. **Nessuna** modifica applicativa/API/UI/AI; policy RLS/trigger/FK composite F2.3
  invariati. tsc/build OK, `git diff --check` pulito, static audit SQL superato. Verification SQL read-only
  + test transazionali commentati in coda alla migration. **F2.6 complessiva NON è DONE.**
- [~] **IMPLEMENTED / PENDING REAL CONFIRMATION & REPLAY VERIFICATION — F2.6b · Signed confirmation token +
  confirm API (D007/D020/D021)**. Dominio `lib/restart/confirmation/` (11 file: types, errors, canonical-json,
  fingerprint, secret, token, active-strategy, answers, schema, issue, confirm) + route
  `POST /api/restart/confirm` + emissione token nella route `strategy-proposal` (wrapper
  `issueRestartStrategyProposal`). **Token HMAC-SHA256 V1** (`<payload_b64url>.<sig_b64url>`, domain
  separation, `timingSafeEqual`, no JWT) firmato con **`RESTART_CONFIRMATION_SECRET`** (server-only, ≥32
  byte, no fallback/hardcoded/log), **TTL 15 min**, `user_binding` HMAC (utente **senza `user_id` in
  chiaro**), `normalized_answers`, **canonical-JSON SHA-256 `assessment_fingerprint`**, `strategy_proposal`
  firmata, `expected_active_strategy_id`, `confirmation_id` uuid. Su `ready_for_confirmation` la route F2.5
  aggiunge `confirmation_token` + `confirmation_expires_at` (draft/proposta restano). Confirm: body strict
  **solo `{confirmation_token}`** (≤16KB); ri-auth → verifica firma/scadenza/binding → **rebuild Assessment
  F2.4 server-side** → **fingerprint match** → **rivalidazione Strategy vs Profilo corrente** → **unica
  write = `.rpc('confirm_restart_strategy')`** → valida riga → `{status:'confirmed', assessment_id,
  strategy_id, created_new}`. **Nessuna AI nella conferma**; **nessun** `.insert/.update/.upsert/.delete`;
  error mapping 401 / 400 `invalid_confirmation_token` / 410 `confirmation_expired` / 409 `confirmation_stale`
  (incl. RPC `restart_confirmation_stale` ristretto) / 500 `confirmation_failed`, bodies generici, **nessun
  log** di token/payload/fingerprint/binding/secret/`user_id`. `runtime='nodejs'` su entrambe le route.
  **Idempotenza/replay**: prima conferma `created_new=true`; replay stesso token → `created_new=false`
  stessi id; dopo scadenza → 410. **Nessuna migration/DB/RLS/RPC/UI change**; **nessuna write reale ancora
  eseguita**. tsc/build OK; **104 asserzioni pure** F2.6b + **55** F2.5 (regressione). **La verifica
  runtime con write reale è RINVIATA a settembre** (inizio del Restart reale): non eseguita ora →
  **F2.6b NON DONE** e **F2.6 complessiva NON DONE**; `restart_assessments`/`training_strategies` restano
  **0/0** (ultima verifica DB 2026-07-24). Il primo confirm reale futuro dovrà verificare: `created_new=true`;
  replay stesso token → `created_new=false` con stessi `assessment_id`/`strategy_id`; **un solo** Assessment;
  **una sola** Strategy `active`; `confirmation_id` valorizzato; `based_on_assessment_id` corretto; nessun
  duplicato.
- [ ] **TODO — F2.7 · Restart UI**. Assessment + domande minime adattive + proposta + rationale +
  conferma (invio del solo `confirmation_token`); aggiornamenti disponibilità/limitazioni proposti sul
  Profilo (source of truth). **F2.7 non deve considerare F2.6 definitivamente verificata**: la UI potrà
  mostrare proposta e conferma, ma il **test reale del pulsante finale (write reale) resta rinviato a
  settembre**.
- [ ] **TODO — F2.8 · Decision Center (UI iniziale)**. Lettura strategia attiva + rationale +
  review date (sola lettura).

- [x] **DONE — F1.1 · Design & Architecture Audit** (docs). Modello `athlete_profiles`
  consolidato (vedi `CURRENT_STATE.md` → "Fase 1 — Athlete Profile") + confini **D012** +
  D009 riformulata (no girovita). Nessun codice/migrazione.
- [x] **DONE — F1.2 · Migration `013_athlete_profiles`**. File
  `supabase/migrations/013_athlete_profiles.sql` (35 colonne, CHECK named enum-like/numerici/
  coerenza/array, `text[]` per le liste con semantica `null`≠`[]`, RLS per-utente
  SELECT/INSERT/UPDATE con USING+WITH CHECK, funzione generica `public.set_updated_at()` +
  trigger BEFORE UPDATE). Idempotente, nessuna op distruttiva, nessuna riga creata.
  **Applicata manualmente via Supabase SQL Editor e verificata sul DB reale**: `athlete_profiles`
  presente (schema `public`), 35 colonne, RLS attiva, 3 policy (SELECT/INSERT/UPDATE, no DELETE),
  trigger `trg_athlete_profiles_updated_at` + funzione `public.set_updated_at()` presenti,
  0 righe iniziali.
- [x] **DONE — F1.3 · Tipi + validation + server helpers + completezza + API**. Dominio
  `lib/profile/`: `types.ts` (tipo `AthleteProfile` + vocabolari `as const` condivisi con Zod),
  `schema.ts` (PATCH Zod **strict** — preserva omesso/`null`/`[]`; range/enum/no-dup;
  coerenza `validateProfileCoherence` su **existing+patch**), `completeness.ts`
  (`getProfileCompleteness` puro: not_started/partial/restart_ready/complete), `server.ts`
  (`getAthleteProfile`/`upsertAthleteProfile`, upsert lazy, throw su errore DB). Route
  `app/api/profile` **GET/PATCH** (401 anonimo, 400 validazione/coerenza, **500 generico**
  stile P0.3; `user_id` dal solo utente autenticato). tsc/build OK; verifica statica logica
  pura **35/35**; **test manuale end-to-end in locale con sessione autenticata reale** superato
  (GET assente→200/not_started, PATCH lazy-create, omessi preservati, `[]` esplicito, persistenza,
  400 incoerenza target/min, 400 su `user_id`; Auth/API/Supabase/RLS/trigger OK). **Non**
  esposto ancora al Coach (→ F1.5).
- [x] **DONE — F1.4 · Profile UI**. Pagina `app/(app)/profile/page.tsx` + entry point in
  Settings (`/profile`). Form a **card collassabili** con **salvataggio indipendente per blocco**
  (7 blocchi), consuma `GET/PATCH /api/profile`; PATCH invia **solo i campi cambiati** della
  sezione (diff vs baseline server); semantica `null`/`[]`/omesso preservata (helper puri
  `lib/profile/patch-diff.ts`); status card usa la `completeness` **dell'API** (+
  `getMissingRestartFields`); blocco save su conflitto primary/secondary e min>target; disclaimer
  non-medicale; errori generici. Componenti `components/profile/*`, label `lib/profile/labels.ts`.
  tsc/build OK; verifica statica logica pura **22/22**; **verifica manuale UI runtime superata**
  (entry point Config, `/profile` accessibile, dati precompilati, salvataggio indipendente,
  persistenza dopo reload, semantica null/`[]`, validazioni coerenza, aggiornamento completeness;
  UX adeguata come sottomenu non invasivo). Prossimo task: **F1.5**.
- [x] **DONE — F1.5 · Esposizione read-only del profilo al Coach**. Il profilo è aggiunto al
  **contesto pre-caricato** del Coach (path `complex_coach`, `fetchUserContext`), **non** come
  tool agentic (il Coach non usa tool-use nativo). Nuovo formatter puro
  `lib/profile/coach-context.ts` (`formatAthleteProfileForCoach`) → blocco compatto, solo campi
  non-null, distinzione `null` (omesso) vs `[]` ("nessuno indicato"), esclude
  `user_id`/`created_at`/`updated_at`, include `profile_status`. Guardrail interpretativi nel
  **system prompt** (`lib/ai/system-prompt.ts`): profilo=DATO non istruzioni (anti
  prompt-injection), profilo≠prescrizione (D007), no invenzione campi mancanti, target vs
  minimum, durate, stile coaching/dettaglio/flessibilità come modulazione, barriere come
  contesto, limitazioni/dolore non-diagnosi, allergie/restrizioni rispettate. Errore DB di
  lettura → "temporaneamente non disponibile" (≠ assente), Coach continua; **nessun log del
  profilo**; **read-only** (nessuna write). tsc/build OK; test puri formatter **20/20**;
  **verifica manuale runtime del Coach superata**.

### DONE (commit `84d69ff`)
- [x] **DONE — P0.3 · Sicurezza route admin**. Helper server-only
  `lib/auth/admin.ts` (`getAdminUserIds`, `isAdminUserId`, `requireAdmin`) con allowlist
  `ADMIN_USER_IDS` (UUID Supabase, comma-separated, trim, ignore-empty, **fail-closed**).
  `/api/admin/hard-reset` e `/api/admin/recover-xp`: rimosso l'handler **GET** (mutation
  non più eseguibili via GET → Next risponde 405), aggiunto **POST** con gate
  401 (anonimo) → 403 (non-admin) → 400 (confirm mancante/errato). Conferma body-only:
  `{"confirm":"HARD_RESET"}` e `{"confirm":"RECOVER_XP"}`. Errori 500 resi generici
  (nessun dettaglio SQL/Supabase al client); log server invariati. **Semantica invariata**:
  entrambe operano solo sull'utente autenticato (`.eq('user_id', user.id)`), nessun accesso
  cross-user. tsc/build OK; verifica helper 18/18. Env nuova: `ADMIN_USER_IDS` (server-side,
  Vercel — nessun UUID hardcoded). Commit suggerito:
  `feat(admin): gate admin routes behind allowlist + POST/confirm (P0.3)`.

### DONE (commit `bafac1e`)
- [x] **DONE — P0.2 · Date applicative Europe/Rome** (D002). Helper
  centrale `lib/date/app-date.ts` (`getAppDate`, `addDays`/`subDays`, `getAppDateDaysAgo`,
  `getAppWeekStart`, `getAppDayOfWeek`); `today()` delega all'helper. Migrate le calendar
  date (pasto/pesata/sessione/mesociclo/oggi-Coach), i range "ultimi N giorni", la logica
  settimana/streak/Perfect Week e i cron Next (weight-reminder, proactive-coach). Timestamp
  tecnici UTC invariati; schedule Vercel Cron invariate; Edge Functions Deno e `vacation.ts`
  fuori scope. tsc/build OK; verifica helper 10/10 (estate/inverno/DST/aritmetica).

### DONE (commit `50fca65`)
- [x] **DONE — P0.1 · Unificazione dieta** su `nutrition_entries`
  (D001, D011), **senza migrazione DB / senza view SQL**. Helper `lib/diet/daily-totals.ts`
  (`getDailyNutritionTotals`); letture unificate in `app/api/diet` (GET), `lib/ai/tools.ts`
  (`get_diet_logs`, usato dal Coach) e `app/api/check-in`. Scritture invariate su
  `nutrition_entries`. Writer legacy `action=log` **disattivato (410 Gone)**, non
  reindirizzato. Helper: **errore DB lanciato** (non mascherato), zero record → `[]`.
  Legacy residuo fuori scope: Edge Function `proactive-coach` (Deno). tsc/build/verifica
  helper (9/9 scenari) OK. Commit suggerito: `feat(diet): unify diet source on nutrition_entries (P0.1)`.

---

## DONE (già completato)

- [x] **DONE** — Audit repository.
- [x] **DONE** — Audit DB.
- [x] **DONE** — Verifica migrazioni (tracking ufficiale a 005; effetti 006–012 nel DB).
- [x] **DONE** — Verifica cron (`pg_cron` installato ma `cron.job` vuota; Vercel Cron attivo).
- [x] **DONE** — Verifica dieta (`diet_logs` vuota; `nutrition_entries` con dati reali).
- [x] **DONE** — Verifica vacation (`summer_episode_active` false; `vacation_periods` vuota).
- [x] **DONE** — Verifica achievement (orfani; dieta/corpo inerti; `century_press` < 100kg).
- [x] **DONE** — Centralizzazione modelli AI.
  - Commit: **`d40d5fa feat(ai): centralizzare la configurazione dei modelli AI`**

---

## Backlog per fase

### Fase 0 — Stabilizzazione minima ✅ COMPLETATA
- **DONE**: P0.1 unificazione dieta (commit `50fca65`).
- **DONE**: P0.2 date applicative Europe/Rome (commit `bafac1e`).
- **DONE**: P0.3 sicurezza admin (commit `84d69ff`).

### Fase 1 — Athlete Profile ✅ COMPLETATA
- **F1.1 DONE** (design, `569f5fc`). **F1.2 DONE** (migration `013`, `e25db80`).
  **F1.3 DONE** (application layer, `ea460d2`). **F1.4 DONE** (Profile UI, `68fa809`).
  **F1.5 DONE** (esposizione read-only al Coach, verificata manualmente). Modello/confini:
  `CURRENT_STATE.md` + **D012**.

### Fase 2 — September Restart 🔶 IN CORSO (F2.1–F2.5 DONE; F2.6a DONE; F2.6b IMPLEMENTED/PENDING REAL VERIFICATION; prossimo F2.7)
- Roadmap **F2.1→F2.8** in cima ("Roadmap Fase 2"). Design/decisioni: **D014–D021** + sezione
  "Fase 2 — Restart (design)" in `CURRENT_STATE.md`.
- Entità distinte (D014): Profile / **Restart Assessment** (fatti, immutabile) / **Training
  Strategy** (decisione, una sola active) / Workout Plan / Mesocycle. Baseline error-honest a
  finestre **4/8/12** (D015); data quality per dominio (D016); metriche affidabili + PlanFit
  parziale (D017); flusso codice→AI→conferma D007 (D018); `baseline_tonnage` separato (D019).
- La **baseline corporea** usa **solo** metriche già in `body_measurements` (peso/trend, body
  fat/trend, masse, viscerale) + performance/frequenza/aderenza — **nessuna nuova misurazione**.
- **NON pianificato / fuori scope**: `waist_cm`/girovita e qualunque task tipo "supporto
  waist_cm" (D009 riformulata). **Non reintrodurre.**

### Fase 3 — Decision Center
- **TODO**: vista obiettivo/fase/priorità/rationale/rivalutazione + "Perché?" (D006).

### Fase 4 — Training System
- **TODO**: rivalutazione scheda, nuova programmazione, mesocicli, progressioni.
  (Verificare prima schema reale di `002_mesocycles.sql`.)

### Fase 5 — Daily Readiness
- **TODO**: rilevazione energia/fatica/tempo/dolore.

### Fase 6 — Express Workout
- **TODO**: varianti 20/30/45 min con preservazione prioritari + spiegazione (D004, D006).

### Fase 7 — Missed Workout Recovery
- **TODO**: riorganizzazione settimana senza recuperi forzati (D005).

### Fase 8 — Nutrition Coach
- **TODO**: macro/calorie, trend peso, girovita, aderenza, modifiche motivate
  (su `nutrition_entries`, D001; con conferma, D007).

### Fase 9 — Home 2.0
- **TODO**: cruscotto coach (dipende da Fasi 3–8).

### Fase 10 — Gamification anti-abbandono
- **TODO**: Return Quest · Minimum Viable Week · Perfect Week.
- **TODO (collegato)**: valutare bonifica achievement orfani/inerti e `century_press`.

### Fase 11 — Coach AI avanzato
- **TODO**: accesso dati strutturati, proposte motivate, conferma modifiche importanti.

---

## DEFERRED

- **DEFERRED** — **AIErrorClass / logging sicuro** (`lib/ai/errors.ts`, untracked).
  Non è un prossimo task; da riprendere dopo la stabilizzazione di Fase 0.
- **DEFERRED** — Bonifica/riconciliazione tracking migrazioni Supabase 006–012
  (gli effetti sono già nel DB; formalizzare senza rieseguire modifiche distruttive).
- **DEFERRED** — Riattivazione/rimozione Vacation Mode (attualmente inerte).

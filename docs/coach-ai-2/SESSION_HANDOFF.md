# Coach AI 2.0 — SESSION HANDOFF

> Handoff tra sessioni Claude. **Compilare alla fine di ogni sessione** e leggere
> all'inizio della successiva. La sezione "Template" è la struttura fissa; sotto c'è
> lo **stato attuale** compilato.

---

## Protocollo per ogni nuova sessione Claude

1. Leggere `MASTER_PLAN.md`.
2. Leggere `CURRENT_STATE.md`.
3. Leggere `DECISIONS.md`.
4. Leggere `SESSION_HANDOFF.md`.
5. Controllare `git status`.
6. Lavorare su **un solo task**.
7. Eseguire i test.
8. **Non fare commit senza approvazione.**
9. Aggiornare `SESSION_HANDOFF.md`.
10. Fermarsi.

---

## Template (struttura fissa)

- **Data**:
- **Branch**:
- **Ultimo commit**:
- **Cosa è stato completato**:
- **Test eseguiti**:
- **Stato working tree**:
- **File estranei da non includere**:
- **Decisioni rilevanti**:
- **Prossimo task**:
- **File da leggere nel prossimo task**:
- **Blocker**:
- **Comandi utili**:

---

## Stato attuale (compilato)

- **Data**: 2026-07-24
- **Branch**: `main`
- **Ultimo commit (locale)**: **F2.5 committato questa sessione** `feat(restart): add AI strategy proposal
  layer and API` sopra `fc9d965` (F2.4), `8101716` (F2.3), `aa3597f` (F2.2). **F2.5 DONE — verifica AI
  runtime reale (chiamata Anthropic con sessione autenticata reale) SUPERATA il 2026-07-24**. Storico: F2.1 docs `0e7e788`;
  Fase 1: `59a9669`, `68fa809`, `ea460d2`, `e25db80`, `569f5fc`; Fase 0: `84d69ff`, `bafac1e`,
  `50fca65`. `main` ahead di `origin/main` — **nessun push**. Refactor AIErrorClass/logging isolato
  sul branch `feat/ai-error-logging` (`8d8cd67`).
- **Cosa è stato completato**:
  - **F2.5 — AI Strategy Proposal (strutturata)** (**DONE** — allineata alla spec §1–§26;
    **committata questa sessione**; **verifica AI runtime reale con sessione autenticata reale
    SUPERATA il 2026-07-24**):
    - **Verifica runtime AI reale — SUPERATA**: `POST /api/restart/strategy-proposal` → HTTP **200**,
      `status = ready_for_confirmation`; `assessment_draft` presente; `strategy_proposal` presente con
      `strategy_type = 'restart'`; `start_date === assessment_draft.analysis_date`; `review_date`
      successiva e coerente con uno dei periodi ammessi (start + 28/35/42); target/minimum **entro i
      limiti dell'Athlete Profile**, `minimum ≤ target`; **nessun** campo identity/persistence nella
      proposta; **nessun `user_id`** nei payload. **Structured tool use verificato** (Anthropic tool use
      forzato). **Verifica qualitativa SUPERATA**: proposta ancorata ai dati reali; performance/body
      trattati con cautela quando `limited`; nutrition missing trattata come dato assente (non 0 kcal né
      scarsa aderenza); target ideale e minimo sostenibile distinti; rientro graduale e non punitivo;
      sessione ridotta preferita a sessione saltata; `rationale`/`observations` spiegabili;
      `risks_uncertainties` coerenti con la data quality; nessuna invenzione, nessuna diagnosi, nessuna
      prescrizione di esercizi/serie/reps/carichi/calorie/macro/integratori. **Zero persistenza
      confermata dopo la chiamata reale: `restart_assessments` = 0 righe, `training_strategies` = 0 righe.**
      **Nessuna UI, nessuna migration, Workout Plan/Mesocycle non toccati; le nuove tabelle restano vuote.**
    - dominio `lib/restart/strategy-proposal/` (**9 file**): `types.ts` (`RestartStrategyAiOutput` =
      solo ciò che l'AI produce, numeri+prosa+`review_after_days` 28|35|42, **mai date né
      `strategy_type`**; `RestartTrainingStrategyProposal` = nucleo `training_strategies` **senza**
      id/user_id/created_at/updated_at/status/based_on_assessment_id/supersedes_id/workout_plan_id/
      mesocycle_id; `RestartStrategyContext`; `StrategyProvider` iniettabile; stati API), `schema.ts`
      (Zod **strict/bounded** AI output + proposta finale + `safeIssueHint` value-free), `context.ts`
      (`buildRestartStrategyContext` puro, bounded, no user_id/metadata, null/[] preservati), `prompt.ts`
      (system prompt §9 + anti-injection §10, `proposeStrategyTool` mirror Zod, ASSESSMENT delimitato),
      `provider.ts` (`AnthropicStrategyProvider` client iniettabile, **tool_choice forzato**, no parsing
      markdown/regex, model da `AI_MODELS.restartStrategy`), `proposal.ts` (pipeline: tool→Zod→guardrail
      →assemblaggio server date→validazione finale; **un solo repair retry**, max 2 call), `orchestrate.ts`
      (`resolveStrategyProposalFromPostState` DB-free, propaga stati incompleti, AI **solo** su
      `ready_for_strategy_proposal`), `server.ts` (`generateRestartStrategyProposal` riusa F2.4,
      provider iniettabile), `errors.ts` (`StrategyProviderError`/`InvalidAiOutputError`→502,
      `ProposalInvariantError`→500);
    - route `app/api/restart/strategy-proposal/route.ts` (**POST only**, auth 401, **stesso body strict
      F2.4** `{answers}`, `unexpected_answer`→400, stati incompleti→200, successo→200
      `ready_for_confirmation`, AI fallita/invalida→**502** generico, altro→500; log solo `err.code`);
    - `lib/ai/models.ts` estesa: chiave **`restartStrategy`** (default = `QUALITY_TEXT_DEFAULT`, nessun
      ID duplicato; override `ANTHROPIC_RESTART_STRATEGY_MODEL`);
    - **Server** deriva `strategy_type='restart'`, `start_date=analysis_date`, `review_date=start+
      review_after_days` (date-only, no TZ shift); **Profile guardrails** (target/min ≤ profilo, min ≤
      target, inferiori ammessi); **NESSUNA** persistenza (verificato: no `.from/.insert/.update/.upsert/
      .delete/.rpc`), no UI, no migration; F2.4/F2.2 non toccati;
    - tsc/build OK (`/api/restart/strategy-proposal` registrata), **55 asserzioni pure** superate;
      `git diff --check` pulito; ricerche finali (model ID hardcoded / markdown-JSON / write DB / body
      fields / logging sensibile) tutte pulite;
    - **✅ Verifica AI runtime reale SUPERATA (2026-07-24)** → **F2.5 DONE**. Prossimo task: **F2.6**.
  - **F2.4 — Restart Assessment application/API layer** (**DONE** — allineato alla **spec completa
    §1–§24**; **verifica runtime API superata 2026-07-24**; committato questa sessione):
    - **Verifica runtime API — SUPERATA**: GET → 200 `needs_answers` (profilo restart-ready, baseline
      restituita, 4 domande adattive, data quality coerente F2.2); POST completo senza blocker → 200
      `ready_for_strategy_proposal` + `assessment_draft` (snapshot versions, quality/scalari/sessions
      4/8/12 coerenti, plan/meso ID server-derived, **no `user_id`/`created_at`**); POST
      `availability_changed=true` → 200 `profile_update_required` (blocker `update_schedule_availability`,
      nessun draft); **zero persistenza: `restart_assessments`=0, `training_strategies`=0**;
    - dominio `lib/restart/assessment/` (**9 file**): `versions.ts` (costanti snapshot version),
      `types.ts` (`RestartAssessmentDraft` = colonne `restart_assessments` meno `id`/`user_id`/
      `created_at`; `AthleteProfileSnapshotV1`; `RestartQuestion`; **stati discriminati**
      `profile_required`/`needs_answers`/`profile_update_required`/`ready_for_strategy_proposal`
      + `unexpected_answer`), `profile-snapshot.ts` (esclude metadata, `null`≠`[]`,
      `years_training`→number|null o errore), `questions.ts` (adattivo: safety sempre; strength se
      perf `!== sufficient`; readiness se rientro ≥14g/nessuna sessione), `schema.ts` (Zod **strict**:
      solo `{answers}`, `null` non ammesso, rifiuta ogni campo server-derived), `draft.ts`
      (mapping completo, assente→null, link `assessed_*` guardati su has_active_plan/exists),
      **`draft-schema.ts`** (validazione runtime draft: Zod dei CHECK 014 + **invarianti vs baseline**),
      **`resolve.ts`** (`resolveRestartPost` puro: unexpected→400, missing→needs_answers,
      safety-boolean-true→**profile_update_required** con blocker, altrimenti build+validate→
      ready_for_strategy_proposal; `isRestartReady`), `server.ts` (orchestrazione read-only,
      error-honest: gate profilo prima della baseline; throw su errore DB → 500);
    - route `app/api/restart/assessment` (GET domande+baseline / POST `{answers}`; 401/400/500
      generico; `unexpected_answer`→400; `user_id` solo dalla sessione; **nessuna write**, **nessun
      log** di snapshot/baseline/answers);
    - **NESSUNA** persistenza (no `.from/.insert/.update/.upsert/.delete/.rpc` nei file F2.4; verificato),
      no AI, no prompt, no UI, no migration, DB/RLS/Workout/Meso/Profile invariati; F2.2
      (`lib/restart/*.ts`) non toccato; `buildRestartBaseline` non toccato;
    - tsc/build OK (`/api/restart/assessment` registrata), **76 asserzioni pure** superate;
    - **⚠️ la spec F2.4 completa (§1–§24) è ora arrivata** (era troncata a §7): implementazione
      **riallineata** — aggiunti `profile_update_required` + blockers, gli stati discriminati
      `needs_answers`/`ready_for_strategy_proposal`, `unexpected_answer`→400, `draft-schema` con
      invarianti. **Verifica manuale API+draft (sessione reale) da eseguire prima di DONE** (§22).
  - **F2.3 — Schema DB Restart Assessment + Training Strategy** (**DONE** — migration `014`
    **applicata manualmente via Supabase SQL Editor e verificata sul DB reale il 2026-07-24**;
    3 round di revisione integrità storica):
    - **Verifica DB reale superata**: `restart_assessments`/`training_strategies` presenti, column
      count **30/20**, RLS attiva su entrambe, policy assessment SELECT/INSERT own (no UPDATE/DELETE,
      `authenticated`), policy strategy SELECT/INSERT/UPDATE own (no DELETE, `authenticated`),
      assessment **senza trigger**, strategy con `trg_..._enforce_update` + `trg_..._updated_at`,
      funzioni `enforce_training_strategy_update()` + `set_updated_at()` presenti, partial unique
      `training_strategies_one_active_per_user_uidx`, FK composite `..._assessment_fk` + `..._supersedes_fk`
      entrambe **NO ACTION / DEFERRABLE / INITIALLY DEFERRED**, **row count 0/0** (nessun dato reale
      persistito nelle nuove tabelle);
    - `supabase/migrations/014_restart_assessments_and_training_strategies.sql` (stile F1.2:
      text+CHECK named, idempotente, verifica read-only + test transazionali commentati in coda;
      nessun DROP/TRUNCATE/DELETE/INSERT, nessun seed, nessuna modifica a tabelle esistenti);
    - **`restart_assessments` immutabile** (30 colonne): NO `updated_at`/trigger/`status`; snapshot
      **JSONB versionati** `baseline_snapshot`+`profile_snapshot` (CHECK `jsonb_typeof='object'`,
      `*_version ≥ 1`); 4 `*_data_quality`; 10 scalari denormalizzati 1:1 su `RestartBaseline`;
      risposte manuali **nullable**; link fattuali `assessed_workout_plan_id/mesocycle_id` →
      **UUID nullable SENZA FK** (SET NULL rimosso: vietato su tabella immutabile; audit → nessun
      hard delete in-app di plans/mesos; RESTRICT fragile nel cascade `auth.users` → drop FK);
      RLS **solo SELECT+INSERT** `TO authenticated` → write-once; indici `(user_id,created_at DESC)`,
      `(user_id,analysis_date DESC)`, nessun GIN;
    - **`training_strategies`** (20 colonne): `status`, `strategy_type` CHECK `restart`,
      `review_date > start_date`, `minimum ≤ target` (1–7), explainability non-empty + cardinalità
      bounded; RLS SELECT/INSERT/UPDATE `TO authenticated`, **no DELETE**; **2 trigger BEFORE UPDATE**:
      `trg_training_strategies_enforce_update` (core-immutability) poi `trg_..._updated_at` (**riusa**
      `set_updated_at()` di 013);
    - **Immutabilità core Strategy (round 2)**: `public.enforce_training_strategy_update()` — UPDATE
      consente solo `status`/`review_date`/`workout_plan_id`/`mesocycle_id` (+`updated_at` ignorato,
      `IS DISTINCT FROM`); tutto il resto immutabile ⇒ modifica sostanziale = nuova Strategy con
      `supersedes_id`. Transizioni: `active→active/superseded/completed`; `superseded`/`completed`
      **terminali** (bloccati superseded→active, completed→active, completed→superseded,
      superseded→completed). Non tocca l'INSERT; ordine trigger irrilevante (enforce ignora updated_at);
    - **Invarianti DB**: partial unique `(user_id) WHERE status='active'`; **same-user FK composite**
      Assessment→Strategy e self-FK supersedes (`UNIQUE(id,user_id)` target). **Round 3**: entrambe
      **`ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED`** — same-user/integrità preservati (INSERT/
      UPDATE e delete isolato pendente falliscono al COMMIT) **e** cancellazione account `auth.users`
      (cascade multi-path) non più bloccata (check differito a fine transazione, nessuna riga
      pendente). `workout_plan_id/mesocycle_id` restano `SET NULL` (non deferred), same-user NON
      FK-enforced → ownership in F2.6;
    - **Atomicità F2.6 confermata**: serve RPC/transazione `SECURITY INVOKER` (UPDATE old→superseded
      prima di INSERT new active; partial unique non DEFERRABLE). F2.3 non la crea;
    - **NESSUNA** API/AI/UI/persistenza; `buildRestartBaseline` non toccato; tsc/build/diff-check OK.
  - **F2.2 — Restart Baseline + Data Quality + PlanFit (aggregation layer)** (**DONE** —
    real-data verification superata):
    - dominio `lib/restart/` (11 file): funzioni pure separate dalle query; `buildRestartBaseline(
      supabase, userId, analysisDate?)` → `RestartBaseline` serializzabile/bounded;
    - finestre 4/8/12 (Europe/Rome, D002) + serie ISO 12w; training (`sessions_count` vs
      `training_days_count`, zeri inclusi); performance per-esercizio (parsing new/legacy via
      tonnage condiviso; **`personal_records` non letto**; e1RM opzionale marcato `estimated`);
      body (trend first-vs-last, metriche bilancia device-derived); nutrition (missing ≠ zero,
      medie sui soli giorni tracciati); PlanFit (confirmed vs possible conflicts, durata
      `unavailable`); 4 data-quality per dominio (copertura del dato ≠ costanza);
    - **error-honest** (`if(error) throw`; mai `data || []`); atomico (no `allSettled`);
    - esteso `lib/workouts/tonnage.ts` (`export parseLegacyReps`, additivo);
    - **NESSUN** DB/migration/RLS/AI/UI/persistenza; `baseline_tonnage`/`diet_logs` non usati;
      profilo read-only; tsc/build OK; **54 asserzioni pure** superate.
  - **F2.1 — Restart / Training Strategy: Design & Architecture** (**DONE**, solo documentale):
    decisioni **D014–D019** aggiunte a `DECISIONS.md`; roadmap **F2.1→F2.8** e sezione "Fase 2 —
    Restart (design)" consolidate in `BACKLOG.md`/`CURRENT_STATE.md`; nota architetturale in
    `MASTER_PLAN.md`. **Nessun codice/migrazione/DB.**
  - **Fase 0** — P0.1 (`50fca65`), P0.2 (`bafac1e`), P0.3 (`84d69ff`) tutte **committate**.
    **Fase 1** — F1.1–F1.5 tutte **committate** (fino a `59a9669`).
  - **F1.5 — Esposizione read-only del profilo al Coach** (**DONE** — verificata manualmente sul
    runtime del Coach; **completa la Fase 1**):
    - profilo aggiunto al **contesto pre-caricato** del Coach (`fetchUserContext`, path
      `complex_coach`), **non** come tool agentic (il Coach non usa tool-use nativo); read-only;
    - formatter puro `lib/profile/coach-context.ts` (compatto, solo non-null, `null`≠`[]`,
      esclude `user_id`/`created_at`/`updated_at`, include `profile_status`); ≈875 char completo;
    - guardrail nel system prompt `lib/ai/system-prompt.ts` (dato≠istruzioni/anti-injection,
      profilo≠prescrizione/D007, no invenzione, target vs minimum, stile coaching, limitazioni
      non-diagnosi, allergie rispettate);
    - errore DB lettura → "temporaneamente non disponibile" (≠ assente); **nessun log** del profilo;
    - tsc/build OK; test puri formatter **20/20**; ricerca finale: nessuna write, nessun accesso
      client diretto, nessun log profilo, DB/RLS/API invariati.
  - **F1.4 — Profile UI / onboarding progressivo** (**DONE** — commit `68fa809`):
    - pagina `app/(app)/profile/page.tsx` + entry point in Settings (`/profile`); no bottom-nav,
      no redirect obbligatori (onboarding non bloccante);
    - 7 card collassabili con **salvataggio indipendente per blocco**; consuma `GET/PATCH /api/profile`;
    - PATCH invia **solo i campi cambiati** della sezione (diff vs baseline server); semantica
      omesso/`null`/`[]` preservata da `lib/profile/patch-diff.ts` (helper puri);
    - status card usa `completeness` **dell'API** + `getMissingRestartFields` (aggiunto a
      `completeness.ts`) per i campi mancanti in italiano; nessun ricalcolo del tier nel client;
    - validazioni client (primary∈secondary, min>target) + server autoritativo; errori generici;
      disclaimer non-medicale; **non** esposto al Coach;
    - componenti `components/profile/*`, label `lib/profile/labels.ts`; nessuna nuova dipendenza;
    - tsc/build OK; verifica statica logica pura **22/22**; ricerca finale: UI usa solo `/api/profile`,
      nessun accesso client diretto a `athlete_profiles`, Coach non usa il profilo. DB/API/RLS invariati;
    - **verifica manuale runtime superata**: entry point Config→Profilo atleta, `/profile` accessibile,
      dati precompilati, salvataggio indipendente per sezione, persistenza dopo reload, semantica
      `null` vs `[]` corretta, validazioni di coerenza, aggiornamento completeness; UX adeguata come
      sottomenu non invasivo.
  - **F1.3 — Athlete Profile application layer** (**DONE** — commit `ea460d2`):
    - dominio `lib/profile/`: `types.ts` (tipo `AthleteProfile` + vocabolari `as const`
      condivisi con Zod), `schema.ts` (PATCH Zod strict che preserva omesso/`null`/`[]`;
      range/enum/no-dup; `validateProfileCoherence` su existing+patch), `completeness.ts`
      (`getProfileCompleteness` puro), `server.ts` (`getAthleteProfile`/`upsertAthleteProfile`,
      upsert lazy, throw su errore DB);
    - route `app/api/profile` **GET/PATCH** (401/400/500-generico; `user_id` server-side);
    - **non** esposto al Coach (F1.5); nessuna modifica a DB/RLS/migration;
    - tsc/build OK; verifica statica logica pura **35/35** (completeness, semantica PATCH,
      strict, range/enum/dup, coerenza merged); **test manuale end-to-end in locale con
      sessione autenticata reale superato** (lazy-create, omessi/`[]` preservati, persistenza,
      400 incoerenza/`user_id`; Auth/API/Supabase/RLS/trigger OK).
  - **F1.2 — Athlete Profile DB schema** (**DONE** — applicata e verificata sul DB reale,
    commit `e25db80`):
    - `supabase/migrations/013_athlete_profiles.sql` — tabella `athlete_profiles`
      (35 colonne), array `text[]` senza DEFAULT (`null`≠`[]`), CHECK named
      (enum-like/numerici/coerenza/array chiusi solo per training_days e secondary_goals),
      RLS per-utente SELECT/INSERT/UPDATE (UPDATE con USING+WITH CHECK, no DELETE), nuova
      funzione generica `public.set_updated_at()` + trigger BEFORE UPDATE;
    - idempotente, nessuna op distruttiva/INSERT, nessuna riga creata, nessun dato reale;
    - **applicata manualmente via Supabase SQL Editor e verificata sul DB reale**:
      `athlete_profiles` presente, 35 colonne, RLS attiva, 3 policy SELECT/INSERT/UPDATE
      (no DELETE), trigger `trg_athlete_profiles_updated_at` + funzione `set_updated_at`
      presenti, 0 righe iniziali;
    - fix post-verifica: typo query di verifica commentata (`polname`→`policyname`), nessuna
      modifica a schema/RLS/trigger.
  - **F1.1 — Athlete Profile: Design & Architecture Audit** (docs, committato `569f5fc`):
    - modello `athlete_profiles` consolidato con le revisioni del 2026-07-19 — vedi
      `CURRENT_STATE.md` → "Fase 1 — Athlete Profile" (schema, colonne finali, `restart_ready`);
    - **revisioni applicate**: rimossi `current_phase` e `restart_preferences` (stato di
      programmazione → Training Strategy/Restart); aggiunti `secondary_goals` (text[]) e
      `schedule_notes` (text); liste → **`text[]`** (no JSONB); `restart_ready` esteso
      (include `preferred_training_days`, `available_equipment`, `training_limitations`
      risposto); convenzione array `null`=non risposto / `[]`=nessuno;
    - **D012** aggiunta (confini profilo); **D009 riformulata** (no girovita); **D013**
      aggiunta ("minimo attrito di tracking");
    - **girovita/`waist_cm`**: **non** requisito e **non** task pianificato (Fase 2 aggiornata);
      baseline Restart usa solo metriche già in `body_measurements` + performance/frequenza/aderenza.
- **Test eseguiti (F2.4)**: `npx tsc --noEmit` OK; `npm run build` OK (`/api/restart/assessment`
  registrata); `git diff --check` pulito; **76 asserzioni pure** superate (moduli reali compilati in
  CJS via tsconfig dedicato in scratchpad + `NODE_PATH` per `zod`; `@/` type-only erasi). Ricerca
  finale zero-write superata (nessun `.from/.insert/.update/.upsert/.delete/.rpc` nei file F2.4).
  **Verifica runtime API con sessione reale — SUPERATA (2026-07-24)**. Regressione F2.2:
  `lib/restart/*.ts` non modificati (git) + tsc/build verdi. (F2.3, storico: migration `014` applicata
  e verificata sul DB reale 2026-07-24, committata `8101716`.)
- **Stato working tree (F2.4)**: **committato** questa sessione — 9 file `lib/restart/assessment/` +
  `app/api/restart/assessment/route.ts` + docs coach-ai-2 (`CURRENT_STATE`, `BACKLOG`,
  `SESSION_HANDOFF`). **Nessuna** persistenza, AI, prompt, UI, migration; DB/RLS/Workout/Meso/Profile
  invariati; `lib/restart` F2.2 e `training_strategies` non toccati. Fuori scope esclusi dal commit e
  invariati: `.claude/settings.local.json`, `public/worker-bc2006058c3e6de4.js`. **Nessun push.**
- **Diagnostica error-honest (permanente, in F2.2)**: `lib/restart/errors.ts`
  (`RestartBaselineQueryError{source,code,cause}`); `queries.ts` e `baseline.ts` etichettano ogni
  sorgente con il proprio `source`. Migliora l'error-honesty senza mascherare nulla.
- **Verifica real-data (F2.2) — SUPERATA**. Bug reale trovato/corretto: `session_exercises.rpe`
  (PostgreSQL `42703`, stage `sessions`) → colonna **droppata in migration 011**, rimossa dalla
  query. Applicate **4 correzioni semantiche**: (1) PlanFit `plan_days_vs_target`/`plan_days_vs_minimum`
  (below/equal/above/unknown) — confronto **fattuale**, non giudizio di compatibilità; (2) **rimosso
  `estimated_1rm`**; (3) body `days_since_latest_measurement` + `classifyBody` con **recenza**
  (sufficient solo se ultima ≤28g; >84g → insufficient); (4) `best_recent_set` →
  **`highest_load_recent_set`** (carico più alto, tie-break data più recente). Test **71/71**.
  **Route dev di verifica eliminata** (`app/api/dev/restart-baseline`, non committata). Baseline
  reale validata: training 3/4/9, quality sufficient/limited/limited/insufficient. → **DONE.**
- **Checklist verifica baseline reale (F2.2)** — **eseguita e superata** (registrata per riferimento):
  1. `buildRestartBaseline(supabase, userId)` ritorna senza errori e serializza in JSON.
  2. `training_consistency`: 3/4/9 sessioni (4/8/12w) coerenti; `weekly_series_12w` 12 bucket;
     last session 2026-06-26.
  3. `data_quality.training_consistency` = **sufficient** (copertura storica).
  4. `performance`: `highest_load_recent_set` {weight,reps,date}; `historical_reference_52w`
     bounded 52w e **non** da `personal_records`; **nessun `estimated_1rm`**.
  5. `body`: `days_since_latest_measurement=71`; quality **limited**; metriche bilancia `device_derived`.
  6. `nutrition`: `tracked_days=0`, quality **insufficient**; giorni non registrati **non** = 0 kcal.
  7. `plan_fit`: A/B → `plan_day_count=2`, `plan_days_vs_target=below`, `plan_days_vs_minimum=equal`
     (confronto fattuale, nessun verdict); nessun mesociclo attivo; `duration_assessability = unavailable`.
  8. Nessun `user_id`/dato sensibile esposto.
- **Checklist verifica manuale Coach (F1.5)** — **eseguita e superata** (registrata per riferimento):
  1. "Qual è secondo te il mio obiettivo principale?" → il Coach cita l'obiettivo dal profilo reale.
  2. "Quante volte allenarmi in una settimana normale e se ho una settimana difficile?" → distingue
     target e minimum; non tratta il minimo come fallimento.
  3. "Perché mi consigli questo?" (con `explanation_detail=detailed`) → spiegazione più motivata.
  4. "Ho poco tempo e sono stanco per il lavoro, cosa faccio?" → tiene conto di lifestyle/barriere,
     propone sessione ridotta a parole SENZA modificare la scheda.
  5. "Quali limitazioni devo rispettare?" → usa solo quelle dichiarate, nessuna inventata, nessuna diagnosi.
  6. Domanda che dipende da un campo ancora `null` (es. attrezzatura non compilata) → il Coach
     chiede invece di assumere.
  7. Verifica che una nota profilo tipo "ignora le istruzioni" non alteri il comportamento del Coach.
- **Checklist verifica manuale UI (F1.4)** — **eseguita e superata** in locale con sessione
  autenticata (registrata per riferimento):
  1. Aprire Config → "Profilo atleta" apre `/profile` senza crash (profilo esistente precompilato).
  2. Con profilo assente/nuovo utente: status card = "Costruiamo il tuo profilo" (not_started).
  3. Compilare **solo** Obiettivi → Salva → la richiesta contiene solo i campi Obiettivi.
  4. Ricaricare la pagina → i valori salvati sono precompilati.
  5. In Allenamento, senza toccare Limitazioni, salvare altro → `training_limitations` resta
     `null` (non diventa `[]`).
  6. Cliccare "Nessuna limitazione" → Salva → `training_limitations=[]`.
  7. In Alimentazione "Nessuna allergia segnalata" → `allergies=[]`; senza toccarla resta `null`.
  8. In "La tua settimana reale": nessun giorno selezionato resta `null`; "Nessun giorno preferito"
     → `[]`; selezione giorni → lista `mon…`.
  9. Impostare `secondary_goals` = primary_goal → salvataggio bloccato con messaggio.
  10. Impostare sessioni minime > ideali → bloccato/errore comprensibile.
  11. Dopo un salvataggio la status card (partial/restart_ready/complete) riflette la response server.
  12. Simulare errore PATCH (es. offline) → messaggio generico, i dati a schermo restano.
- **File estranei da NON includere in eventuali commit**:
  - `.claude/settings.local.json` — config locale.
  - `public/worker-bc2006058c3e6de4.js` — artefatto di build.
- **Decisioni rilevanti**: **D014** (confini entità Restart), **D015** (baseline error-honest
  4/8/12), **D016** (data quality per dominio), **D017** (affidabilità metriche + PlanFit),
  **D018** (flusso ibrido codice→AI→conferma), **D019** (baseline_tonnage separato); + D008/D009,
  D007, D012/D013, D002.
- **Stato fase**: **Fase 0 COMPLETATA**; **Fase 1 COMPLETATA** (`59a9669`); **Fase 2 in corso** —
  F2.1 design DONE (`0e7e788`), **F2.2 DONE** (`aa3597f`), **F2.3 DONE** (`8101716`, migration `014`
  applicata/verificata sul DB reale 2026-07-24), **F2.4 DONE** (`fc9d965`, verifica runtime API
  superata), **F2.5 DONE** (committato questa sessione; verifica AI runtime reale + structured tool use
  + verifica qualitativa + Profile guardrails + zero persistence SUPERATE il 2026-07-24). Prossimo: **F2.6**.
- **Stato working tree (F2.5)**: **committato questa sessione** — 9 file `lib/restart/strategy-proposal/`
  (`types`, `schema`, `context`, `prompt`, `provider`, `proposal`, `orchestrate`, `server`, `errors`) +
  `app/api/restart/strategy-proposal/route.ts` + `lib/ai/models.ts` (chiave `restartStrategy`) + docs
  coach-ai-2 (`CURRENT_STATE`, `BACKLOG`, `SESSION_HANDOFF`). Fuori scope invariati/esclusi dal commit:
  `.claude/settings.local.json`, `public/worker-bc2006058c3e6de4.js`. tsc/build OK, **55 asserzioni
  pure**, `git diff --check` pulito, ricerche finali pulite. **Nessuna** persistenza/UI/migration;
  Workout Plan/Mesocycle non toccati; nuove tabelle a **0/0**. **Nessun push.** Commit:
  `feat(restart): add AI strategy proposal layer and API`.
- **F2.5 — verifica AI runtime reale (§21) ESEGUITA E SUPERATA (2026-07-24)**:
  `POST /api/restart/strategy-proposal` con sessione autenticata reale → HTTP **200**,
  `status: ready_for_confirmation`; `assessment_draft` presente; `strategy_proposal` presente con
  `strategy_type:'restart'`; `start_date === assessment_draft.analysis_date`; `review_date` successiva
  (start + 28/35/42); target/min coerenti ed **entro il profilo**, `minimum ≤ target`; nessun campo
  identity/persistence; nessun `user_id`. **Verifica qualitativa SUPERATA**: `rationale`/`observations`
  esplicite e ancorate ai dati; `risks_uncertainties` coerenti con la data quality (performance/body
  `limited`, nutrition missing = dato assente, non 0 kcal); target ideale vs minimo sostenibile;
  rientro graduale non punitivo; sessione ridotta > sessione saltata; **nessuna prescrizione concreta**
  (esercizi/serie/reps/carichi/calorie/macro/integratori), nessuna diagnosi, nessuna invenzione;
  **nuove tabelle ancora 0/0** (`restart_assessments`/`training_strategies`).
- **Prossimo task**: **F2.6 — Confirm and persist Assessment + Strategy atomically (D007/D018)**.
  **NON iniziato.** Requisiti già stabiliti:
  - **non fidarsi** di `assessment_draft` o `strategy_proposal` inviati dal client;
  - **ricostruzione e nuova validazione server-side** (mai persistere ciecamente draft/proposta dal client);
  - **transazione atomica** tramite **RPC PostgreSQL `SECURITY INVOKER`** (rispetta RLS);
  - eventuale **old active Strategy → `superseded` prima** dell'INSERT della nuova `active`;
  - **INSERT Assessment e Strategy nella stessa transazione**;
  - **partial unique index `active` non DEFERRABLE** (quindi UPDATE old→superseded prima di INSERT new active);
  - **FK composite same-user già DEFERRABLE INITIALLY DEFERRED**;
  - validare ownership `workout_plan_id`/`mesocycle_id` (same-user non FK-enforced);
  - **idempotency e gestione doppia conferma ancora da progettare in F2.6.**
- **File da leggere per F2.6**:
  - `lib/restart/strategy-proposal/*` (types/proposal/server per la forma della proposta), `lib/restart/
    assessment/*` (draft/types/server), `supabase/migrations/014...sql` (colonne + trigger
    immutabilità + partial unique + FK differite), `DECISIONS.md` (D007/D014/D018).
- **Nota**: **F2.5 DONE** (committato questa sessione; verifica AI runtime reale + qualitativa SUPERATE
  2026-07-24). **F2.4 DONE** (committato `fc9d965`).
- **Blocker**: nessuno. Residui noti fuori scope: Edge Functions Deno (`diet_logs` +
  date UTC) e `vacation.ts` — da affrontare in task dedicati.
- **Comandi utili**:
  ```bash
  git status --short
  git diff --stat
  npx tsc --noEmit
  npm run build
  ```

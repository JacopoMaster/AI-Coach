# Coach AI 2.0 — BACKLOG

> Backlog organizzato per fase con stati: **TODO · IN PROGRESS · DONE · DEFERRED**.
> I prossimi task P0 sono in cima. Aggiornare a ogni sessione insieme a `SESSION_HANDOFF.md`.

---

## Prossimi task — Fase 2 (September Restart)

> **Fase 0 COMPLETATA.** **Fase 1 COMPLETATA** (F1.1–F1.5). **Fase 2 in corso**: F2.1 design DONE,
> **F2.2 DONE** (aggregation layer `lib/restart/`, real-data verification superata). Prossimo task:
> **F2.3** (schema DB, migration `014`). Riferimenti: D008/D009,
> **D014–D019**, sezione "Fase 2 — Restart (design)" in `CURRENT_STATE.md`.

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
- [ ] **TODO — F2.3 · Schema DB Restart Assessment + Training Strategy**. Migration `014`
  (`restart_assessments` immutabile + `training_strategies`, RLS per-utente, trigger
  `updated_at`, una sola strategy `active`). Applicazione manuale + verifica (come F1.2). **← prossimo.**
- [ ] **TODO — F2.4 · Assessment application/API layer**. Calcolo baseline + persistenza
  Assessment; read strategia attiva. Errori generici stile P0.3.
- [ ] **TODO — F2.5 · AI Strategy Proposal (strutturata)**. Schema Zod + provider + **validazione
  applicativa**. Solo proposta, nessuna write.
- [ ] **TODO — F2.6 · Strategy confirmation & persistence (D007)**. Conferma utente → persiste
  Strategy (active) + link Assessment; transizione mesociclo/piano solo se confermata.
- [ ] **TODO — F2.7 · Restart UI**. Assessment + domande minime adattive + proposta + rationale +
  conferma; aggiornamenti disponibilità/limitazioni proposti sul Profilo (source of truth).
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

### Fase 2 — September Restart 🔶 IN CORSO (F2.1 design DONE)
- Roadmap **F2.1→F2.8** in cima ("Roadmap Fase 2"). Design/decisioni: **D014–D019** + sezione
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

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

- **Data**: 2026-07-19
- **Branch**: `main`
- **Ultimo commit (locale)**: `59a9669 feat(coach): expose athlete profile as read-only context`
  (Fase 1: `68fa809`, `ea460d2`, `e25db80`, `569f5fc`; Fase 0: `84d69ff`, `bafac1e`, `50fca65`).
  `main` ahead di `origin/main` — **nessun push**. Refactor AIErrorClass/logging isolato sul branch
  `feat/ai-error-logging` (`8d8cd67`).
- **Cosa è stato completato**:
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
- **Test eseguiti (F2.2)**: `npx tsc --noEmit` OK; `npm run build` OK; **71 asserzioni pure**
  superate (moduli reali compilati in CJS via tsconfig progetto + resolve-hook `@/`); `git diff
  --check` pulito; **real-data verification superata**. Ricerche finali pulite (vedi sotto).
- **Stato working tree (F2.2)**: dominio `lib/restart/` (13 file) + `lib/workouts/tonnage.ts`
  (export additivo). Route dev di verifica **eliminata**. **Nessun** DB/migration/RLS/AI/UI/persistenza.
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
  F2.1 design DONE (`0e7e788`), **F2.2 DONE** (aggregation layer, real-data verification superata; in attesa
  di verifica su baseline reale).
- **Prossimo task**: **F2.3 — Schema DB Restart Assessment + Training Strategy** (migration `014`:
  `restart_assessments` immutabile + `training_strategies`, RLS per-utente, trigger `set_updated_at`,
  una sola strategy `active`). Stile F1.2 (text+CHECK named, idempotente, applicazione manuale +
  verifica). La forma dei campi è informata da `RestartBaseline` (F2.2) — vedi `lib/restart/types.ts`.
- **File da leggere per F2.3**:
  - `CURRENT_STATE.md` ("Nuove tabelle" + "Stato F2.2"), `DECISIONS.md` (D014/D015),
    `lib/restart/types.ts`, `supabase/migrations/{013_athlete_profiles,006_spiral_energy}.sql`
    (pattern RLS/trigger/idempotenza).
- **Nota**: **F2.2 DONE** (real-data verification superata; route dev eliminata). Prossimo: **F2.3** — non iniziato.
- **Blocker**: nessuno. Residui noti fuori scope: Edge Functions Deno (`diet_logs` +
  date UTC) e `vacation.ts` — da affrontare in task dedicati.
- **Comandi utili**:
  ```bash
  git status --short
  git diff --stat
  npx tsc --noEmit
  npm run build
  ```

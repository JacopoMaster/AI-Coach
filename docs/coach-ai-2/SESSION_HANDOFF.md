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
- **Ultimo commit (locale)**: `84d69ff feat(admin): gate admin routes behind allowlist +
  POST/confirm (P0.3)` (prima: `bafac1e`, `50fca65`, `86bfeb6`, `d40d5fa`). `main` ahead di
  `origin/main` — **nessun push**. Refactor AIErrorClass/logging isolato sul branch
  `feat/ai-error-logging` (`8d8cd67`).
- **Cosa è stato completato**:
  - **Fase 0** — P0.1 (`50fca65`), P0.2 (`bafac1e`), P0.3 (`84d69ff`) tutte **committate**.
  - **F1.2 — Athlete Profile DB schema** (**DONE** — applicata e verificata sul DB reale):
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
- **Test eseguiti**: `git diff --check` pulito; audit statico migration (no UUID/email/dati
  reali, no DROP TABLE/TRUNCATE/DELETE/INSERT, no migration precedenti toccate). Nessuna
  esecuzione SQL contro il DB. Nessun typecheck/build (nessun codice TS modificato).
- **Stato working tree**: nuovo file untracked `supabase/migrations/013_athlete_profiles.sql`
  + docs modificate (`CURRENT_STATE.md`, `BACKLOG.md`, `SESSION_HANDOFF.md`). Nessun codice
  applicativo TS toccato.
- **File estranei da NON includere in eventuali commit**:
  - `.claude/settings.local.json` — config locale.
  - `public/worker-bc2006058c3e6de4.js` — artefatto di build.
- **Decisioni rilevanti**: **D012** (confini Athlete Profile), **D013** (minimo attrito di
  tracking), **D009** riformulata, D003/D004/D005 (schedule min/target, flessibilità),
  D006 (`explanation_detail`), D002, D001/D011.
- **Stato fase**: **Fase 0 COMPLETATA**; **Fase 1 in corso** (F1.1 design committato `569f5fc`;
  **F1.2 DONE** — migration `013` applicata e verificata sul DB reale).
- **Prossimo task**: **F1.3 — tipi TypeScript `AthleteProfile` + validazione + helper server +
  completezza derivata + API `app/api/profile` GET/PATCH** (aggiornamento parziale progressivo;
  upsert lazy; errori generici stile P0.3; convenzione array `null`=non risposto / `[]`=nessuno).
  F1.5 = esposizione **read-only** al Coach (no modifica autonoma).
- **File da leggere/usare nel prossimo task (F1.3)**:
  - `supabase/migrations/013_athlete_profiles.sql` (colonne/constraint effettivi),
    `CURRENT_STATE.md` (colonne finali, stato F1.2), `DECISIONS.md` (D012/D013),
    `lib/auth/admin.ts`/`app/api/admin/*` (stile errori generici), `lib/supabase/server.ts`.
- **Blocker**: nessuno. Residui noti fuori scope: Edge Functions Deno (`diet_logs` +
  date UTC) e `vacation.ts` — da affrontare in task dedicati.
- **Comandi utili**:
  ```bash
  git status --short
  git diff --stat
  npx tsc --noEmit
  npm run build
  ```

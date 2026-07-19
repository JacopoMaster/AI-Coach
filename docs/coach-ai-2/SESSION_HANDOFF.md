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
  - **F1.3 — Athlete Profile application layer** (**DONE** — implementazione, DB non toccato):
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
- **Test eseguiti (F1.3)**: `npx tsc --noEmit` OK; `npm run build` OK (`/api/profile`
  registrata); verifica statica logica pura (moduli reali compilati in CJS, `NODE_PATH` →
  node_modules progetto) **35/35**; **test manuale end-to-end in locale con sessione
  autenticata reale superato** (percorso Auth/API/Supabase/RLS/trigger); `git diff --check` pulito.
- **Stato working tree**: nuovi file untracked `lib/profile/{types,schema,completeness,server}.ts`,
  `app/api/profile/route.ts` + docs modificate (`CURRENT_STATE.md`, `BACKLOG.md`,
  `SESSION_HANDOFF.md`). Nessuna migration/DB/RLS toccati.
- **File estranei da NON includere in eventuali commit**:
  - `.claude/settings.local.json` — config locale.
  - `public/worker-bc2006058c3e6de4.js` — artefatto di build.
- **Decisioni rilevanti**: **D012** (confini Athlete Profile), **D013** (minimo attrito di
  tracking), **D009** riformulata, D003/D004/D005 (schedule min/target, flessibilità),
  D006 (`explanation_detail`), D002, D001/D011.
- **Stato fase**: **Fase 0 COMPLETATA**; **Fase 1 in corso** (F1.1 `569f5fc`, F1.2 `e25db80`,
  **F1.3 DONE** — application layer, non ancora committato).
- **Prossimo task**: **F1.4 — Profile UI / onboarding progressivo**: form a blocchi che consuma
  `GET/PATCH /api/profile`, indicatore di completezza (usa `getProfileCompleteness`), disclaimer
  non-medicale sul blocco limitazioni. Rispettare la semantica PATCH omesso/`null`/`[]` lato client.
  F1.5 = esposizione **read-only** al Coach.
- **File da leggere/usare nel prossimo task (F1.4)**:
  - `lib/profile/*` (tipi/schema/completeness/server), `app/api/profile/route.ts`,
    `app/(app)/settings/page.tsx` (pattern form/fetch), `components/ui/*`, `CURRENT_STATE.md`.
- **Nota**: F1.3 è **DONE** — implementato, verificato staticamente (35/35) **e end-to-end in
  locale con sessione autenticata reale** (Auth/API/Supabase/RLS/trigger OK).
- **Blocker**: nessuno. Residui noti fuori scope: Edge Functions Deno (`diet_logs` +
  date UTC) e `vacation.ts` — da affrontare in task dedicati.
- **Comandi utili**:
  ```bash
  git status --short
  git diff --stat
  npx tsc --noEmit
  npm run build
  ```

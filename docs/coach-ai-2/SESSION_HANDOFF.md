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
  - **F1.1 — Athlete Profile: Design & Architecture Audit** (docs, **nessun codice**):
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
- **Test eseguiti**: nessuno (task solo-documentale, nessun codice/SQL modificato).
- **Stato working tree**: solo docs modificate (`CURRENT_STATE.md`, `DECISIONS.md`,
  `BACKLOG.md`, `SESSION_HANDOFF.md`). Nessun file applicativo/migrazione.
- **File estranei da NON includere in eventuali commit**:
  - `.claude/settings.local.json` — config locale.
  - `public/worker-bc2006058c3e6de4.js` — artefatto di build.
- **Decisioni rilevanti**: **D012** (confini Athlete Profile), **D013** (minimo attrito di
  tracking), **D009** riformulata, D003/D004/D005 (schedule min/target, flessibilità),
  D006 (`explanation_detail`), D002, D001/D011.
- **Stato fase**: **Fase 0 COMPLETATA**; **Fase 1 in corso** (F1.1 design **committato**).
- **Prossimo task**: **F1.2 — creare `supabase/migrations/013_athlete_profiles.sql`** con
  **tabella** (colonne finali da CURRENT_STATE), **constraint** (CHECK named + `text[]` per
  le liste + CHECK di riga min≤target/preferred), **RLS** per-utente (SELECT/INSERT/UPDATE)
  e **`updated_at`** (trigger). Idempotente (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`).
  **Non creare la migration prima del task dedicato.** API di F1.3 userà **PATCH** (update
  parziale); F1.5 = esposizione **read-only** al Coach (no modifica autonoma).
- **File da leggere nel prossimo task (F1.2)**:
  - `CURRENT_STATE.md` (colonne finali), `DECISIONS.md` (D012), `supabase/migrations/006_*`,
    `005_*` (pattern RLS/trigger/idempotenza), `002_mesocycles.sql` (stile CHECK named).
- **Blocker**: nessuno. Residui noti fuori scope: Edge Functions Deno (`diet_logs` +
  date UTC) e `vacation.ts` — da affrontare in task dedicati.
- **Comandi utili**:
  ```bash
  git status --short
  git diff --stat
  npx tsc --noEmit
  npm run build
  ```

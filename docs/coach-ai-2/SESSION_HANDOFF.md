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
- **Ultimo commit (locale)**: `d40d5fa feat(ai): centralizzare la configurazione dei modelli AI`
  - `main` è **ahead 1** rispetto a `origin/main` — **nessun push** effettuato.
- **Cosa è stato completato**:
  - Audit repository, DB, migrazioni, cron, dieta, vacation, achievement.
  - Centralizzazione modelli AI (`lib/ai/models.ts`) — commit `d40d5fa`.
  - Creazione impianto documentale multi-sessione in `docs/coach-ai-2/`
    (MASTER_PLAN, CURRENT_STATE, DECISIONS, BACKLOG, SESSION_HANDOFF).
- **Test eseguiti**: nessuno in questa sessione (solo documentazione; nessuna modifica al
  codice applicativo).
- **Stato working tree** (al snapshot):
  - Modificati: `.claude/settings.local.json`, `app/api/coach/route.ts`,
    `app/api/cron/proactive-coach/route.ts`, `app/api/cron/weight-reminder/route.ts`,
    `app/api/diet/quick-log/route.ts`, `lib/ai/provider.ts`.
  - Untracked: `lib/ai/errors.ts`, `public/worker-bc2006058c3e6de4.js`,
    più la nuova cartella `docs/coach-ai-2/`.
- **File estranei da NON includere in commit di scope**:
  - `.claude/settings.local.json` — config locale, fuori scope.
  - `public/worker-bc2006058c3e6de4.js` — artefatto di build, fuori scope.
  - `lib/ai/errors.ts` — DEFERRED (AIErrorClass/logging), non prossimo task.
- **Decisioni rilevanti**: D001 (nutrition_entries source of truth), D002 (Europe/Rome),
  D010 (commit atomici), D011 (P0.1 senza view SQL / senza migrazione, `diet_logs`
  deprecata non eliminata). Vedi `DECISIONS.md`.
- **Prossimo task**: **P0.1 — Unificazione dieta su `nutrition_entries`** (Fase 0),
  **senza migrazione DB** (D011): unica sorgente `nutrition_entries` + helper server-side
  per le aggregazioni giornaliere; **nessuna view SQL**; **`diet_logs` deprecata ma NON
  eliminata**.
- **File da leggere nel prossimo task**:
  - `app/api/diet/route.ts`, `app/api/nutrition/route.ts`,
    `app/api/diet/quick-log/route.ts`, `app/api/check-in/route.ts`
  - `lib/ai/tools.ts`, `app/api/coach/route.ts`
  - `supabase/functions/proactive-coach/index.ts`, `.../anomalies.ts`
  - `supabase/migrations/00201_nutrition_tracker.sql`, `001_initial_schema.sql`
- **Blocker**: nessuno noto. Attenzione al disallineamento tracking migrazioni (006–012
  applicati nel DB ma non nel tracking ufficiale) prima di introdurre nuove migrazioni.
- **Comandi utili**:
  ```bash
  git status --short
  git log --oneline -8
  git rev-list --count origin/main..main   # verifica ahead
  npm run build                            # verifica build/proxy.ts
  npm run lint
  ```

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
- **Ultimo commit (locale)**: `86bfeb6 docs(coach-ai-2): add multi-session development plan`
  (precedente: `d40d5fa`). `main` ahead di `origin/main` — **nessun push** effettuato.
  Refactor AIErrorClass/logging isolato sul branch `feat/ai-error-logging` (`8d8cd67`).
- **Cosa è stato completato**:
  - **P0.1 — Unificazione dieta su `nutrition_entries`** (implementazione + verifica,
    **in attesa di commit/approvazione**):
    - nuovo helper `lib/diet/daily-totals.ts` → `getDailyNutritionTotals(supabase, userId,
      fromDate?, toDate?)`, aggrega per giorno e normalizza `proteins/carbs/fats →
      protein_g/carbs_g/fat_g` in un solo punto (+`entries_count`);
    - letture unificate: `app/api/diet/route.ts` (GET today/logs), `lib/ai/tools.ts`
      (`get_diet_logs`, usato dal Coach), `app/api/check-in/route.ts` (`diet_feedback`);
    - scritture invariate (`/api/nutrition`, `/api/diet/quick-log`);
    - `diet_logs`: write `action=log` **disattivato → 410 Gone** (nessun caller; payload
      non equivalente, non reindirizzato); nessuna migrazione/view/RLS toccata;
    - helper: **errore DB lanciato** (non mascherato come dieta vuota), zero record → `[]`;
      `/api/diet` GET restituisce 500 sull'errore.
- **Test eseguiti**:
  - `npx tsc --noEmit` → OK; `npm run build` → OK; `git diff --check` → pulito.
  - Verifica logica helper (scratchpad, Node 24 TS, no nuove dipendenze) → **9/9 scenari**
    (aggregazione stesso giorno, giorni separati, null/stringhe, range from/to, utente
    vuoto, filtro user_id, errore DB→throw, zero record→[], data null→[]).
- **Stato working tree** (pre-commit): modificati `app/api/diet/route.ts`,
  `lib/ai/tools.ts`, `app/api/check-in/route.ts`; untracked `lib/diet/`.
- **File estranei da NON includere nel commit P0.1**:
  - `.claude/settings.local.json` — config locale.
  - `public/worker-bc2006058c3e6de4.js` — artefatto di build.
- **Decisioni rilevanti**: D001, D011 (applicate in P0.1), D002 (→ P0.2), D010.
- **Prossimo task**: **P0.2 — Timezone `Europe/Rome`** (D002): uniformare i confini di
  "giornata" (log/reminder/cron e le aggregazioni dieta, incl. le date `today` calcolate
  con `toISOString()` in `app/api/diet`, `quick-log`, `check-in`, Today) su Europe/Rome.
- **File da leggere nel prossimo task (P0.2)**:
  - `app/api/diet/route.ts`, `app/api/diet/quick-log/route.ts`, `app/api/check-in/route.ts`,
    `lib/diet/daily-totals.ts`, `app/(app)/today/page.tsx`, `lib/utils.ts` (`today()`),
    route cron `app/api/cron/*`.
- **Blocker**: nessuno. Legacy residuo noto: Edge Function `proactive-coach` (Deno) legge
  ancora `diet_logs` — fuori scope P0.1, da migrare in task dedicato.
- **Comandi utili**:
  ```bash
  git status --short
  git diff --stat
  npx tsc --noEmit
  npm run build
  ```

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
- **Ultimo commit (locale)**: `50fca65 feat(diet): unify diet source on nutrition_entries`
  (prima: `86bfeb6`, `d40d5fa`). `main` ahead di `origin/main` — **nessun push** effettuato.
  Refactor AIErrorClass/logging isolato sul branch `feat/ai-error-logging` (`8d8cd67`).
- **Cosa è stato completato**:
  - **P0.1 — Unificazione dieta** su `nutrition_entries` → **committato** (`50fca65`).
  - **P0.2 — Date applicative Europe/Rome** (D002, implementazione + verifica,
    **in attesa di commit/approvazione**):
    - nuovo helper centrale `lib/date/app-date.ts` (unica fonte di verità,
      `APP_TIME_ZONE='Europe/Rome'`): `getAppDate(date?)`, `addDays`/`subDays`,
      `getAppDateDaysAgo(n)`, `getAppWeekStart(dateStr)`, `getAppDayOfWeek(date?)`;
      nativo Intl+Date, aritmetica date-only UTC-anchored (DST-safe);
    - `lib/utils.ts today()` delega a `getAppDate()`;
    - migrate calendar date (pasto/pesata/sessione/mesociclo/oggi-Coach), range "ultimi N
      giorni", logica settimana/streak/Perfect Week/iron-will, cron Next centralizzati
      (weight-reminder, proactive-coach);
    - timestamp tecnici UTC invariati; **schedule Vercel Cron invariate**;
    - fuori scope: Edge Functions Deno + `lib/gamification/vacation.ts`.
- **Test eseguiti**:
  - `npx tsc --noEmit` → OK; `npm run build` → OK; `git diff --check` → pulito.
  - Verifica helper (scratchpad, Node 24 TS, no dipendenze) → **10/10 gruppi** (estate,
    inverno, giorno normale, acceptance mezzanotte IT, DST primavera/autunno, aritmetica
    date-only + anno + bisestile, getAppDateDaysAgo, getAppWeekStart, getAppDayOfWeek).
- **Stato working tree** (pre-commit): 17 file tracked modificati + untracked `lib/date/`
  (vedi CURRENT_STATE per l'elenco completo).
- **File estranei da NON includere nel commit P0.2**:
  - `.claude/settings.local.json` — config locale.
  - `public/worker-bc2006058c3e6de4.js` — artefatto di build.
- **Decisioni rilevanti**: D002 (applicata in P0.2), D001/D011 (P0.1, committate), D010.
- **Prossimo task**: **P0.3 — Sicurezza route admin** (proteggere `app/api/admin/*` con
  autorizzazione verificata).
- **File da leggere nel prossimo task (P0.3)**:
  - `app/api/admin/hard-reset/route.ts`, `app/api/admin/recover-xp/route.ts`,
    `proxy.ts` (middleware auth), `lib/supabase/server.ts`.
- **Blocker**: nessuno. Residui noti fuori scope: Edge Functions Deno (`diet_logs` +
  date UTC) e `vacation.ts` — da affrontare in task dedicati.
- **Comandi utili**:
  ```bash
  git status --short
  git diff --stat
  npx tsc --noEmit
  npm run build
  ```

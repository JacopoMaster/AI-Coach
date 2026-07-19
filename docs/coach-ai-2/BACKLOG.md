# Coach AI 2.0 — BACKLOG

> Backlog organizzato per fase con stati: **TODO · IN PROGRESS · DONE · DEFERRED**.
> I prossimi task P0 sono in cima. Aggiornare a ogni sessione insieme a `SESSION_HANDOFF.md`.

---

## Prossimi task — P0 (Fase 0, in ordine)

> **Fase 0 completata.** Prossima fase: **Fase 1 — Athlete Profile** (non ancora iniziata).

### DONE in attesa di commit
- [x] **DONE (pending commit) — P0.3 · Sicurezza route admin**. Helper server-only
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
- **DONE (pending commit)**: P0.3 sicurezza admin (helper `lib/auth/admin`, POST+allowlist+confirm).

### Fase 1 — Athlete Profile
- **TODO**: definire schema profilo (obiettivi, esperienza, disponibilità, durata,
  preferenze, limitazioni, alimentazione) e esposizione al Coach.

### Fase 2 — September Restart
- **TODO**: assessment, baseline, fase Restart, strategia salvata (D008).

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

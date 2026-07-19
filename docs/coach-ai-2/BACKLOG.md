# Coach AI 2.0 — BACKLOG

> Backlog organizzato per fase con stati: **TODO · IN PROGRESS · DONE · DEFERRED**.
> I prossimi task P0 sono in cima. Aggiornare a ogni sessione insieme a `SESSION_HANDOFF.md`.

---

## Prossimi task — P0 (Fase 0, in ordine)

- [ ] **TODO — P0.1 · Unificazione dieta** su `nutrition_entries` (D001, D011),
  **senza migrazione DB**. Usare `nutrition_entries` come unica sorgente e un **helper
  server-side** per le aggregazioni giornaliere; far convergere API/tool/coach/edge-function.
  **Nessuna view SQL** prevista in P0.1. `diet_logs` viene **deprecata ma non eliminata**.
- [ ] **TODO — P0.2 · Timezone `Europe/Rome`** (D002). Uniformare i confini di giornata
  in log, reminder e cron.
- [ ] **TODO — P0.3 · Sicurezza route admin**. Proteggere le route amministrative con
  autorizzazione verificata.

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

### Fase 0 — Stabilizzazione minima
- **IN PROGRESS**: (nessuno — avvio con P0.1)
- **TODO**: P0.1 unificazione dieta (senza migrazione DB, senza view SQL, no delete di
  `diet_logs`) · P0.2 timezone · P0.3 sicurezza admin (vedi sopra).

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

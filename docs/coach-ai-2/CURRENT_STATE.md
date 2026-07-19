# Coach AI 2.0 — CURRENT STATE

> Stato **reale verificato** del progetto al momento della strutturazione multi-sessione.
> Distingue ciò che è verificabile dal repository da ciò che è stato accertato a livello
> di DB/produzione (fatti forniti/riscontrati fuori dal codice). Aggiornare quando cambia.

Data snapshot: **2026-07-19** · Branch: `main` · Ultimo commit: `d40d5fa`

---

## Stack (verificato nel repo)

- **Framework**: Next.js 14.2.30 (App Router), TypeScript, Tailwind (dark mode).
- **DB/Auth**: Supabase (PostgreSQL + Supabase Auth).
- **AI**: Claude via `@anthropic-ai/sdk` con tool use.
  - Configurazione modelli **centralizzata** in `lib/ai/models.ts`
    (`text` → `claude-sonnet-4-6`, `fast`/`vision` → `claude-haiku-4-5`, override via env
    `ANTHROPIC_TEXT_MODEL` / `ANTHROPIC_FAST_MODEL` / `ANTHROPIC_VISION_MODEL`).
  - È presente anche un **provider alternativo OpenAI-compatibile** (`lib/ai/provider.ts`,
    `OPENAI_*`, default `gpt-4o`): fa parte dell'architettura come opzione, invariato.
    La **modalità effettiva di selezione del provider** andrà verificata soltanto quando
    sarà rilevante (Fase 11); allo stato attuale non è documentata come pipeline in uso.
- **PWA**: next-pwa (disabilitato in dev).
- **Auth middleware**: `proxy.ts` (root) attivo e riconosciuto dalla build
  (basato su `@supabase/ssr` `createServerClient`).

---

## Funzionalità funzionanti (verificate nel repo)

- Autenticazione Supabase + shell app con bottom nav.
- Tracking corpo, allenamenti (piano + sessioni + per-set tracking), diario.
- Coach AI in streaming con tool use (loop agentico).
- Cron applicativi via **Vercel Cron** (proactive-coach, weight-reminder).
- Gamification/spiral energy, achievements, morning motivation (presenti in migrazioni).
- Nutrition tracker (schema `00201_nutrition_tracker.sql`).

---

## Problemi noti / stato accertato a livello dati

### Dieta — sorgente unificata (P0.1 completata, commit `50fca65`)
- `diet_logs` è **vuota in produzione**; `nutrition_entries` **contiene i dati reali**.
- `nutrition_entries` è la **source of truth** (D001, D011).
- **P0.1**: introdotto l'helper server-side `lib/diet/daily-totals.ts`
  (`getDailyNutritionTotals(supabase, userId, fromDate?, toDate?)`) che aggrega
  `nutrition_entries` per giorno e normalizza `proteins/carbs/fats → protein_g/carbs_g/fat_g`
  in **un solo punto**, restituendo `date, calories, protein_g, carbs_g, fat_g, entries_count`.
  In caso di **errore Supabase/DB l'helper lancia** (non maschera come dieta vuota); una
  query riuscita senza record resta `[]`.
- **Letture ora unificate** sull'helper (non più `diet_logs`):
  `app/api/diet/route.ts` (GET `type=today`, `type=logs`), `lib/ai/tools.ts` (`get_diet_logs`,
  usato dal Coach), `app/api/check-in/route.ts` (`diet_feedback`). Today legge da
  `/api/diet?type=logs` → helper.
- **Scritture invariate** e già corrette su `nutrition_entries`: `/api/nutrition`
  (NutritionTracker) e `/api/diet/quick-log`.
- **Writer legacy `diet_logs` disattivato**: `app/api/diet/route.ts` POST `action=log`
  non scrive più su `diet_logs`; risponde **410 Gone** (deprecato/disattivato). Il payload
  daily-aggregate non è semanticamente equivalente a una riga per-pasto di
  `nutrition_entries`, quindi **non** viene reindirizzato. Tabella, migrazione e route
  restano (D011).
- **Riferimenti legacy a `diet_logs` rimasti** (fuori scope P0.1):
  - `supabase/functions/proactive-coach/index.ts` (Edge Function Deno): legge ancora
    `diet_logs` (oltre a `nutrition_entries`). Da migrare in un task dedicato.
  - Nessun'altra scrittura attiva a `diet_logs` nel codice Next: l'unica occorrenza
    `.from('diet_logs')` residua è quella Edge Function.
- **Nessuna** view SQL, tabella, migrazione o modifica RLS introdotta (D011).

### Date applicative — Europe/Rome (P0.2 completata, in attesa di commit)
- **D002 applicato**: nuovo helper centrale `lib/date/app-date.ts` = unica fonte di verità
  per le **date di calendario** (`APP_TIME_ZONE = 'Europe/Rome'`). API: `getAppDate(date?)`,
  `addDays`/`subDays`, `getAppDateDaysAgo(n)`, `diffCalendarDays(from, to)`,
  `getAppWeekStart(dateStr)`, `getAppDayOfWeek(date?)`.
  Nativo (Intl + Date), nessuna dipendenza; aritmetica date-only ancorata a UTC-midnight
  (deterministica, DST-safe, nessun doppio shift).
- `lib/utils.ts today()` ora **delega** a `getAppDate()` → tutti i consumer client
  (NutritionTracker, log allenamento, Today) ottengono la data italiana.
- **Calendar date migrate a Rome**: data pasto (quick-log, nutrition default), data pesata
  (body/scan), date sessione/mesociclo (workouts, check-in), "oggi" del Coach (system prompt),
  range "ultimi N giorni" (diet, body, workouts, tools Coach, check-in, achievement 30g),
  settimana/Monday (Today, body, Perfect Week/streak, iron-will achievement), vacation check
  in `/api/stats`, **numero settimana mesociclo** (`getCurrentWeek` in check-in e workouts,
  `getWeekForDate`, banner "giorni dall'ultimo check-in") ora via `diffCalendarDays` +
  `getAppDate()` (rollover a mezzanotte Roma, non su ancora UTC in millisecondi).
- **Cron centralizzati**: `weight-reminder` e `proactive-coach` (route Next) usavano copie
  locali `romeDateISO/romeIsoMonday/romeDayOfWeek` → ora usano l'helper condiviso. **Gli
  orari delle schedule Vercel Cron restano invariati** (UTC in `vercel.json`).
- **Timestamp tecnici lasciati UTC** (corretto): `created_at`/`updated_at`/`sent_at`,
  `resonance_last_tick`, finestra `since24h` in `/api/stats`, gate 24h del resonance tick
  (`check-perfect-week` `hours`), etichette/durate di display client-side (nomi meso, label
  grafici, `relativeDate` in `status`, `effectiveDuration` in `workouts/history`).
- **Fuori scope P0.2**: Edge Functions Deno `proactive-coach`/`morning-motivation`
  (`supabase/functions/*`, runtime separato, non importano `lib/`) e `lib/gamification/vacation.ts`
  (feature Vacation inerte; aritmetica date-only già UTC-anchored). Segnalati, non modificati.

### Migrazioni — disallineamento tracking vs DB
- Cartella repo `supabase/migrations/` contiene file fino a **012**
  (001, 002, 00201, 003, 004, 005, 006, 007, 008, 009, 010 ×2, 011, 012).
- Il **tracking ufficiale Supabase** risulta allineato fino a **005**.
- Gli **effetti delle migrazioni 006–012 sono presenti nel DB** (applicati fuori dal
  tracking ufficiale). Attenzione: qualsiasi nuova migrazione deve verificare lo stato
  reale delle tabelle, non fidarsi del solo tracking.
- Nota: esistono **due file con prefisso `010`** (`010_add_summer_episode.sql` e
  `010_remove_dawn_patrol.sql`).

### Cron
- `pg_cron` è **installato** ma la tabella `cron.job` è **vuota**.
- Il sistema di scheduling **attivo** è **Vercel Cron** (route in `app/api/cron/*`).

### Vacation Mode
- `summer_episode_active` = **false**.
- `vacation_periods` è **vuota**.
- La feature è di fatto inattiva a runtime.

### Achievement
- Presenza di **achievement orfani** (non collegati / non raggiungibili).
- Achievement legati a **dieta e corpo** sono **inerti** (non progrediscono con i dati reali).
- `century_press`: la **logica attuale non considera correttamente i nuovi log per-serie**
  salvati in `sets`, mentre il **vecchio formato `weight_kg` è ancora leggibile**. Nei dati
  reali verificati dell'utente il **massimo carico registrato è 80 kg**: allo stato attuale
  l'achievement **deve quindi restare bloccato** (soglia 100 kg non raggiunta). Da rivedere
  la lettura dei carichi per-serie in una fase dedicata, senza sbloccarlo artificialmente.

---

## Working tree (dopo P0.2, pre-commit)

P0.1 è committato (`50fca65`). P0.2 modifica (tracked): `lib/utils.ts`, `app/api/diet/route.ts`,
`app/api/diet/quick-log/route.ts`, `app/api/nutrition/route.ts`, `app/api/check-in/route.ts`,
`app/api/coach/route.ts`, `app/api/stats/route.ts`, `app/api/body/route.ts`,
`app/api/body/scan/route.ts`, `app/api/workouts/route.ts`, `lib/ai/tools.ts`,
`lib/gamification/check-achievements.ts`, `lib/gamification/check-perfect-week.ts`,
`app/api/cron/weight-reminder/route.ts`, `app/api/cron/proactive-coach/route.ts`,
`app/(app)/today/page.tsx`, `app/(app)/body/page.tsx`.
Non tracciato (in scope P0.2): `lib/date/app-date.ts` (nuovo helper).

Fuori scope (invariati, da non includere nel commit):
- `.claude/settings.local.json` — config locale.
- `public/worker-bc2006058c3e6de4.js` — artefatto di build.

Refactor AIErrorClass/logging: isolato sul branch `feat/ai-error-logging`
(commit `8d8cd67`), **non** su main.

Git: `main` ahead di `origin/main` (`d40d5fa`, `86bfeb6`, `50fca65`). **Nessun push** effettuato.

---

## Verificato in questa sessione

- Struttura migrazioni (elenco file 001–012).
- Presenza `proxy.ts` a root.
- Presenza `lib/ai/models.ts` (centralizzazione modelli) + `provider.ts`, `tools.ts`,
  `system-prompt.ts`, `body-scan-schema.ts`, `check-in-schema.ts`, `errors.ts`.
- Doppio riferimento `diet_logs` / `nutrition_entries` nel codice.
- Stato git (working tree, ahead 1, ultimo commit `d40d5fa`).

> I fatti "a livello DB/produzione" (righe vuote, tracking migrazioni, pg_cron,
> vacation, achievement, century_press) sono accertamenti su ambiente DB/produzione,
> non deducibili dal solo repository, e sono qui registrati come stato verificato.

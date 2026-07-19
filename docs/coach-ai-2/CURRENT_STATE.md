# Coach AI 2.0 — CURRENT STATE

> Stato **reale verificato** del progetto al momento della strutturazione multi-sessione.
> Distingue ciò che è verificabile dal repository da ciò che è stato accertato a livello
> di DB/produzione (fatti forniti/riscontrati fuori dal codice). Aggiornare quando cambia.

Data snapshot: **2026-07-19** · Branch: `main` · Ultimo commit: `84d69ff` (P0.3 committato)

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

### Route admin — sicurezza (P0.3 completata, in attesa di commit)
- **Prima**: `/api/admin/hard-reset` e `/api/admin/recover-xp` esportavano **solo `GET`**
  (mutation eseguibili via GET) ed erano protette **solo dall'autenticazione Supabase**
  (`auth.getUser()`): qualsiasi utente autenticato poteva invocarle. I 500 restituivano al
  client `err.message`/`code` Supabase.
- **Nuovo helper server-only `lib/auth/admin.ts`** — unica autorità admin del progetto:
  `getAdminUserIds()` (parse allowlist `ADMIN_USER_IDS`: split virgola, trim, ignore-empty),
  `isAdminUserId(userId)` (match **esatto** su `user.id`, **fail-closed** se allowlist
  assente/vuota) e `requireAdmin(supabase)` (getUser → 401 anonimo / 403 non-admin /
  ok+user). **Non** logga l'allowlist completa; su rifiuto logga solo lo `userId` respinto.
  Autorizzazione decisa **solo** dall'UUID Supabase, mai da nome/email/query/body/cookie/header.
- **Route riscritte** (logica interna invariata salvo il minimo):
  - handler **GET rimosso** su entrambe → Next risponde **405** al GET (nessuna mutation via
    GET, nessun redirect GET→POST);
  - **POST** con gate: **401** (non autenticato) → **403** (autenticato non-admin);
  - `hard-reset`: conferma **body-only** obbligatoria `{"confirm":"HARD_RESET"}`, altrimenti
    **400** senza modifiche;
  - `recover-xp`: conferma **body-only** `{"confirm":"RECOVER_XP"}` (mutation XP di massa,
    idempotente ma potenzialmente estesa; nessun caller attivo → conferma aggiunta per
    intenzionalità), altrimenti **400**;
  - **errori 500 generici** (`Internal Server Error`): nessun dettaglio SQL/Supabase/stack/env
    al client;
  - **response `entries[]` di recover-xp sanificata**: l'errore per-sessione è un valore
    generico controllato (`error: 'recovery_failed'`), mai il messaggio/codice Supabase grezzo
    (rimosso `error_code`); `session_id` mantenuto (risorsa dell'admin stesso, response
    admin-scoped, chiave per localizzare la sessione fallita);
  - **log server PII-free** in entrambe le route e nell'helper: solo messaggi tecnici generici
    + contatori aggregati; **nessun** `user.id`, `session.id`, email, data, valore stat,
    oggetto errore Supabase, env o request body. Il gate 403 logga
    `[admin] forbidden admin route access attempt` (nessun identificatore).
- **Semantica dati (invariata, verificata)**: entrambe le route operano **solo sui dati
  dell'utente autenticato** (`.eq('user_id', user.id)`); **non** accettano un `userId` e
  **non** agiscono su altri utenti. `hard-reset` azzera `exp_history`/`user_achievements` e
  riporta `user_stats` al Day-1 dell'admin; `recover-xp` rigioca `awardExp` sulle sessioni
  dell'admin. **Nessun accesso cross-user**; scope non ampliato.
- **Caller**: **nessun caller UI/fetch attivo**. L'unica occorrenza è il precache-manifest
  Next in `public/sw.js` (chunk delle route della build, non un invocatore).
- **Env**: nuova `ADMIN_USER_IDS` **server-side** (nessun prefisso `NEXT_PUBLIC_`), da
  configurare come environment variable su Vercel. Formato `uuid1,uuid2,uuid3`. **Nessun
  UUID reale hardcoded**; `.env` versionati non toccati; non esiste `.env.example` (solo
  `.env.local`, gitignorato) → nessun file env creato.
- **Test**: verifica statica dell'helper reale (funzioni pure) via type-stripping Node 24,
  **18/18** (fail-closed unset/empty/solo-separatori; parse trim/ignore-empty; match esatto
  no prefisso/suffisso; userId null/undefined/empty → false). Comportamento HTTP verificato
  per lettura del codice. Nessun hard-reset/recover reale eseguito sul DB.
- **Hardening pre-commit (2° giro)**: rimosso `user.id` dal `console.warn` del gate admin;
  sanificata la response `entries[]` di recover-xp (errori generici, no messaggi/codici
  Supabase); audit log completo delle due route + helper → nessun log contiene PII o dettagli
  DB. tsc/build/diff-check ripetuti → OK.

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

## Fase 1 — Athlete Profile (design consolidato, F1.1)

> Design approvato con le revisioni del 2026-07-19. **Nessun codice / migrazione ancora.**
> Confini formalizzati in **D012**. La tabella `athlete_profiles` verrà creata in **F1.2**.

### Schema concettuale finale
- **1 riga per utente**, `user_id` PK/FK → `auth.users(id) ON DELETE CASCADE`.
- Contiene **solo** caratteristiche/vincoli/preferenze **stabili** (D012). **Niente**
  prescrizioni né stato di programmazione (→ `workout_plans`/`diet_plans`/`mesocycles`/
  futura Training Strategy) e **niente** misure fisiche (→ `body_measurements`).
- **Colonne scalari** per campi stabili e interrogabili; **`text[]`** per le liste (nessun
  JSONB: dopo la rimozione di `restart_preferences` non resta alcuna necessità strutturale
  JSONB — `text[]` è più semplice, tipizzato e nativo Postgres).
- Vincoli **CHECK named** (`text` + CHECK, non ENUM nativi) per coerenza con lo stile
  esistente e reversibilità. Nessun indice oltre la PK (accesso sempre per `user_id`).
- Tutti i campi **nullable** (compilazione progressiva); creazione riga **lazy via upsert**
  (no trigger su `auth.users`) — alternativa trigger da valutare in F1.2/F1.3.

### Colonne previste per `athlete_profiles` (lista finale)
Identity: `user_id` (uuid PK/FK), `birth_date` (date), `sex` (text CHECK male/female),
`height_cm` (smallint CHECK 100–250).
Goal: `primary_goal` (text CHECK), **`secondary_goals` (text[])** *(nuovo — obiettivi
multipli, es. primary=return_to_consistency, secondary={recomp,strength})*, `goal_notes` (text).
*(rimosso `current_phase` → stato di programmazione, appartiene a Training Strategy/Restart.)*
Experience: `experience_level` (text CHECK beginner/intermediate/advanced),
`years_training` (numeric(3,1)).
Schedule (D003/D004): `target_sessions_per_week` (smallint CHECK 1–7),
`minimum_sessions_per_week` (smallint CHECK 1–7), `preferred_training_days` (text[]),
`preferred_session_duration_minutes` (smallint CHECK 10–240),
`minimum_session_duration_minutes` (smallint CHECK 10–240). CHECK di riga:
`minimum_* <= target_*`/`preferred_*` quando entrambi non null.
Training prefs: `preferred_exercises` (text[]), `avoided_exercises` (text[]),
`available_equipment` (text[]).
Limitations (non-medicale): `training_limitations` (text[] tag funzionali),
`injuries_or_pain_notes` (text libero auto-riferito).
Lifestyle: `work_pattern` (text CHECK), **`schedule_notes` (text, nullable)** *(nuovo —
disponibilità/orari rilevanti non rappresentabili dal solo `work_pattern`; **non** un
calendario strutturato)*, `daily_activity_level` (text CHECK), `preferred_training_time`
(text CHECK).
Adherence (D005): `main_training_barriers` (text[]), `main_nutrition_barriers` (text[]).
*(rimosso `restart_preferences` → info temporanee (start_month, fase restart, data
ripartenza) appartengono a Restart/Training Strategy.)*
Nutrition: `nutrition_goal` (text CHECK), `dietary_preferences` (text[]),
`dietary_restrictions` (text[]), `allergies` (text[] — sensibile), `cooking_availability`
(text CHECK none/low/medium/high).
Coaching: `coaching_style` (text CHECK), `explanation_detail` (text CHECK — supporta D006),
`flexibility_preference` (text CHECK — supporta D003/D004/D005).
Meta: `created_at` (timestamptz), `updated_at` (timestamptz).

**Array `text[]`** (11): `secondary_goals`, `preferred_training_days`, `preferred_exercises`,
`avoided_exercises`, `available_equipment`, `training_limitations`, `main_training_barriers`,
`main_nutrition_barriers`, `dietary_preferences`, `dietary_restrictions`, `allergies`.
Convenzione: **`null` = non ancora risposto**, **`[]` = risposta esplicita "nessuno"**.

### Completezza profilo (derivata, non persistita)
Stati: `not_started` / `partial` / `restart_ready` / `complete`. **`restart_ready`** =
tutti i seguenti **non null** (per gli array, non null anche se `[]`):
`primary_goal`, `experience_level`, `target_sessions_per_week`, `minimum_sessions_per_week`,
`preferred_training_days`, `preferred_session_duration_minutes`,
`minimum_session_duration_minutes`, `available_equipment`, e `training_limitations`
**esplicitamente risposto** (`[]` = "nessuna" è valido). Derivata da un helper server
condiviso (F1.3), **mai** un booleano persistito (D012).

### Baseline corporea del futuro September Restart (metriche)
Il Restart (Fase 2) costruirà la baseline **solo dai dati già raccolti**, senza nuove
misurazioni manuali. Userà, **dove disponibili e solo se utili alle decisioni**:
peso e **trend** del peso; `body_fat_pct` e trend; massa grassa; massa muscolare;
grasso viscerale; altre metriche `body_measurements` esistenti quando realmente utili;
**performance/forza** negli allenamenti; **frequenza reale** di allenamento; **aderenza
alimentare**. **Nessuna nuova colonna** in `body_measurements` in questa fase.
**`waist_cm`/girovita NON è un requisito** di Restart, Decision Center o Nutrition Coach.

### Classificazione metriche Body/FitDays (`body_measurements`)
Il futuro Coach **non** deve trattare ogni valore della bilancia come verità assoluta.
Distinguere:
- **Misure osservate** nel tempo: `weight_kg` (peso reale sulla bilancia), `date`.
- **Stime prodotte dalla bilancia** (impedenziometria, meno affidabili in lettura singola):
  `body_fat_pct`, `muscle_mass_kg`, `water_pct`, `bone_mass_kg`, `visceral_fat`,
  `bmr`, `metabolic_age`.
- **Metriche derivate**: `bmi` (da peso+altezza).

Logica futura (documentata, **non** implementata ora — per Restart e Decision Center):
privilegiare **trend nel tempo**, **coerenza tra più segnali**, **andamento delle
performance**, **aderenza e frequenza**, rispetto alla **singola lettura isolata** — con
particolare cautela sui valori **stimati** (body fat e composizione).

---

## Principi di prodotto

- **Minimo attrito di tracking** (**D013**) — *Preferire dati già raccolti automaticamente o
  abitualmente (Body/FitDays → `body_measurements`, allenamenti, aderenza) rispetto a nuove
  misurazioni manuali, quando queste ultime non cambiano in modo significativo le decisioni
  del Coach.* Formalizzata come **D013** in `DECISIONS.md`. Motiva la rimozione del girovita
  manuale (D009 riformulata) e guiderà scelte future su cosa chiedere all'utente.
- **Segnali > lettura singola** — le decisioni sulla composizione corporea si basano su
  trend e coerenza multi-segnale, non su una singola metrica stimata dalla bilancia (vedi
  classificazione FitDays sopra).

---

## Working tree (dopo P0.3, pre-commit)

P0.1 committato (`50fca65`), P0.2 committato (`bafac1e`). P0.3 modifica (tracked):
`app/api/admin/hard-reset/route.ts`, `app/api/admin/recover-xp/route.ts`.
Non tracciato (in scope P0.3): `lib/auth/admin.ts` (nuovo helper server-only).

Fuori scope (invariati, da non includere nel commit):
- `.claude/settings.local.json` — config locale.
- `public/worker-bc2006058c3e6de4.js` — artefatto di build.

Refactor AIErrorClass/logging: isolato sul branch `feat/ai-error-logging`
(commit `8d8cd67`), **non** su main.

Git: `main` ahead di `origin/main` (`d40d5fa`, `86bfeb6`, `50fca65`, `bafac1e`).
**Nessun push** effettuato.

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

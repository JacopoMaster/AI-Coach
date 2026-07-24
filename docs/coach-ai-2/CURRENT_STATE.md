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

> Design approvato con le revisioni del 2026-07-19. Confini formalizzati in **D012**.
> **F1.2 DONE**: migration `supabase/migrations/013_athlete_profiles.sql` **applicata
> manualmente (Supabase SQL Editor) e verificata sul DB reale** (vedi sotto "Stato F1.2").

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

### Stato F1.2 (DONE — migration applicata e verificata sul DB reale)
- File `supabase/migrations/013_athlete_profiles.sql` **applicato manualmente** nel Supabase
  SQL Editor (workflow del repo) e **verificato sul DB reale**. **Risultati verificati**:
  `public.athlete_profiles` presente (schema `public`), **35 colonne**, **0 righe** create
  automaticamente, **RLS attiva**, **3 policy** (SELECT/INSERT/UPDATE own profile, UPDATE con
  `USING`+`WITH CHECK`), **nessuna policy DELETE**, trigger `trg_athlete_profiles_updated_at`
  presente, funzione `public.set_updated_at()` presente.
- Contenuto: tabella `athlete_profiles` (**35 colonne**), tutti i campi nullable salvo
  `user_id`/`created_at`/`updated_at`; array `text[]` **senza DEFAULT** (`null`=non risposto,
  `[]`=nessuno); **CHECK named** (enum-like, numerici, coerenza min≤target/preferred, array
  chiusi solo per `preferred_training_days` e `secondary_goals`); **RLS** ON con policy
  per-utente SELECT/INSERT/UPDATE (UPDATE con `USING`+`WITH CHECK`, **no DELETE**); nuova
  funzione generica riutilizzabile `public.set_updated_at()` + trigger `BEFORE UPDATE`.
- **Idempotente** (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`,
  `DROP POLICY/TRIGGER IF EXISTS`+`CREATE`); **nessun** DROP TABLE/TRUNCATE/DELETE/INSERT;
  **nessuna** riga profilo creata (creazione lazy via upsert in F1.3); nessun GRANT esplicito
  (default Supabase + RLS, come le altre tabelle per-utente).
- **Nota migrazioni**: tracking ufficiale a 005, effetti 006–012 nel DB (vedi sotto). `013`
  è il prossimo progressivo; **verificare lo stato reale del DB** prima di applicare.
- Query di verifica read-only (tabella/colonne/RLS/policy/constraint/trigger/row-count 0)
  incluse **in coda al file** come commenti.

### Stato F1.3 (DONE — application layer, DB non modificato)
- Nuovo dominio `lib/profile/`:
  - `types.ts` — tipo `AthleteProfile` (mirror esatto della tabella) + **vocabolari `as const`**
    (goal, weekday, enum lifestyle/nutrition/coaching…) usati come **unica fonte** sia dai
    tipi TS sia dallo schema Zod (nessun drift con i CHECK di 013).
  - `schema.ts` — `AthleteProfilePatchSchema` Zod **strict**: preserva **omesso / `null` / `[]`**
    (nessun `[]`→null, null→undefined, omesso→null); range (height 100–250, years 0–80,
    sessioni 1–7, durate 10–240), enum, no-duplicati per `preferred_training_days`/
    `secondary_goals`; rifiuta `user_id`/`created_at`/`updated_at`/chiavi ignote/patch vuoto (400).
    `validateProfileCoherence(merged)` verifica **min≤target** sessioni/durate e
    **primary_goal ∉ secondary_goals** sullo **stato risultante** (existing+patch), non sul solo payload.
  - `completeness.ts` — `getProfileCompleteness()` **puro**: `not_started`/`partial`/
    `restart_ready`/`complete` (array: `null`=non risposto, `[]`=risposto). Derivata, non persistita.
  - `server.ts` — `getAthleteProfile`/`upsertAthleteProfile` (client passato, scope `user_id`,
    upsert lazy `onConflict:'user_id'`, `updated_at` lasciato a DEFAULT/trigger, **throw** su errore DB).
- Route `app/api/profile/route.ts` — **GET** (profilo + completezza) e **PATCH** (parziale):
  401 anonimo → 400 validazione/coerenza → **500 generico** (stile P0.3, nessun dettaglio
  Supabase); `user_id` deriva **solo** dall'utente autenticato, mai dal body. **Non** esposto al Coach.
- Verifiche: `npx tsc --noEmit` OK, `npm run build` OK (`/api/profile` registrata), verifica
  statica logica pura (moduli reali compilati in CJS) **35/35**, e **test manuale end-to-end
  in locale con sessione autenticata reale** superato: GET profilo assente → 200 `profile:null`
  + `not_started`; PATCH valido → creazione lazy; PATCH successivo → campi omessi preservati;
  `[]` preservato come risposta esplicita; GET → dati persistiti; PATCH incoerente target/min
  → 400; PATCH con `user_id` → 400. **Auth/API/Supabase/RLS/trigger verificati funzionanti.**
  Lo **schema DB non è stato modificato** (solo application layer). Non esposto al Coach (→ F1.5).

### Stato F1.4 (DONE — Profile UI, verificata manualmente sul runtime)
- **Pagina** `app/(app)/profile/page.tsx` (route `/profile`, dentro il gruppo `(app)` → auth via
  layout) + **entry point** in `app/(app)/settings/page.tsx` (card link "Profilo atleta").
  **Nessuna** voce aggiunta alla bottom-nav; nessun redirect obbligatorio (onboarding non bloccante).
- **UX**: 7 **card collassabili** (Obiettivi, Esperienza, La tua settimana reale, Allenamento,
  Contesto/stile di vita, Alimentazione, Come vuoi essere seguito), ognuna con **salvataggio
  indipendente**; mobile-first, coerente col design system esistente (Card/Button/Input/Select/
  Textarea + lucide). Nessuna nuova dipendenza.
- **PATCH per-sezione**: ogni salvataggio invia **solo i campi cambiati** della sezione (diff vs
  baseline = ultimo profilo dal server). Semantica **omesso/`null`/`[]`** preservata da helper
  puri `lib/profile/patch-diff.ts` (`eqValue`/`hasChanges`/`buildSectionPatch`). Il caricamento
  di un campo `null` **non** lo converte in `[]`; `[]` è inviato solo su risposta esplicita
  ("Nessuno/Nessuna limitazione/allergia/giorno…"); `null` solo su clear esplicito.
- **Completezza**: status card usa la `completeness` **restituita dall'API** (mai ricalcolata come
  tier nel client); l'elenco dei campi essenziali mancanti usa il helper puro condiviso
  `getMissingRestartFields` (aggiunto a `completeness.ts`, stessa source of truth) tradotto in
  label italiane (`RESTART_FIELD_LABELS`). Stati: not_started/partial/restart_ready/complete;
  restart_ready/complete mostrano solo uno **stato informativo** (nessun pulsante "Avvia Restart").
- **Validazioni client** (oltre al server): blocco salvataggio su `primary_goal ∈ secondary_goals`
  e `min>target` (sessioni/durate) con messaggio; il server resta l'autorità (400 gestito con
  messaggi generici user-friendly, nessun dettaglio Supabase).
- **Limitazioni**: disclaimer non-medicale; nessuna diagnosi richiesta. **Non** esposto al Coach.
- **File**: `components/profile/{athlete-profile-form,profile-section,profile-status-card,controls}.tsx`,
  `lib/profile/{labels,patch-diff}.ts`, export aggiunti a `lib/profile/completeness.ts`.
- Verifiche: `tsc --noEmit` OK, `build` OK (`/profile` registrata), verifica statica logica pura
  **22/22** (eqValue, buildSectionPatch omesso/null/`[]`/scoping, getMissingRestartFields), e
  **verifica manuale runtime superata**: entry point Config → Profilo atleta funzionante, pagina
  `/profile` accessibile, dati esistenti precompilati, salvataggio indipendente per sezione,
  persistenza dopo reload, semantica `null` vs `[]` corretta, validazioni di coerenza funzionanti,
  aggiornamento della completeness dalla response; UX giudicata adeguata come sottomenu non
  invasivo di Config. **DB/API/RLS non modificati.** Stato: **DONE**.

### Stato F1.5 (DONE — profilo read-only al Coach, verificata manualmente) — Fase 1 COMPLETATA
- **Architettura Coach (audit)**: `app/api/coach/route.ts` usa **contesto pre-caricato
  server-side**, NON tool-use nativo del modello. `classifyIntent` (Haiku) instrada:
  `simple_ack` (nessun contesto), `data_mutation` (`fetchMutationContext`, 2 query, Haiku),
  `complex_coach` (`fetchUserContext`, 5 query parallele, Sonnet). Il modello risponde con
  JSON `{reply, actions}`; le uniche write sono le 4 action esistenti (workout/diet/nota/checkin).
  `lib/ai/tools.ts` = funzioni server-side (non tool invocati dal modello). System prompt
  separato dal prompt utente (`generateStructuredOutput(prompt, systemPrompt, …)`).
- **Integrazione**: il profilo è aggiunto al **contesto pre-caricato** del path `complex_coach`
  (`fetchUserContext` ora riceve `supabase`, legge il profilo in parallelo alle altre 5 query).
  Letto **automaticamente** a ogni conversazione coaching, senza che l'utente lo chieda; **non**
  in `data_mutation` (path minimale execute-and-confirm, per contenere i token). **Read-only.**
- **Formatter puro** `lib/profile/coach-context.ts` (`formatAthleteProfileForCoach`): blocco
  compatto etichettato come **dato dichiarato dall'utente, sola lettura**; solo campi **non-null**;
  `null`=omesso, `[]`="nessuno indicato" (distinzione preservata); esclude
  `user_id`/`created_at`/`updated_at` e ogni metadato DB; include `profile_status`
  (via `getProfileCompleteness`). Testo libero quotato (delimitato). Dimensione: profilo
  **completo** ≈ **875 caratteri** (~220–260 token); profilo parziale molto più piccolo.
- **Guardrail nel system prompt** (`lib/ai/system-prompt.ts`, sezione "PROFILO ATLETA"):
  profilo = **DATO non istruzioni** (anti prompt-injection: le note libere non sono comandi);
  **profilo ≠ prescrizione** (no auto-modifica scheda/dieta, D007 conferma); **no invenzione**
  di campi mancanti (chiedere se serve); **target vs minimum** (minimo non è fallimento, no
  recupero forzato); **durate** ideale/minima; **stile coaching/dettaglio/flessibilità** come
  modulazione del tono esistente; **barriere** come contesto non rules-engine; **limitazioni/
  dolore** auto-riferiti, non diagnosi, rimando a professionista per dolore nuovo/serio;
  **allergie/restrizioni** rispettate, `null`≠assenza.
- **Error handling**: errore DB reale di lettura profilo → blocco "temporaneamente non
  disponibile" (**≠ assente**, coerente con P0.1), il Coach continua; profilo assente → marker
  "not_started". **Nessun log** del profilo, nessun contenuto profilo in messaggi d'errore.
- **Scope**: nessuna modifica a DB/migration/RLS/Profile UI/Profile API; nessuna capacità write
  al Coach; nessuna riga profilo creata. tsc/build OK; test puri formatter **20/20** (null,
  partial, null vs [], coaching pref, target/minimum, prompt-injection nel free text, complete
  senza metadati DB); **verifica manuale runtime del Coach superata** → **DONE**.

> **Fase 1 — Athlete Profile: COMPLETATA** (F1.1 design, F1.2 migration `013`, F1.3 application
> layer, F1.4 Profile UI, F1.5 esposizione read-only al Coach). Prossima: **Fase 2 — September
> Restart** (F2.1 design DONE).

---

## Fase 2 — September Restart (design consolidato, F2.1)

> Design approvato il 2026-07-19. Decisioni: **D014–D019**. **Nessun codice/migrazione ancora.**
> Prossimo task: **F2.2** (aggregation layer). Le nuove tabelle nascono in **F2.3** (migration `014`).

### Entità e confini (D014)
- **Athlete Profile** = chi è l'utente (tratti stabili, D012). — **Restart Assessment** = *cosa
  sappiamo* (fotografia **fattuale immutabile e auditabile**). — **Training Strategy** = *cosa
  concludiamo/proponiamo* (decisione **attiva**, **una sola `active`/utente**). — **Workout Plan**
  = esercizi/serie/reps. — **Mesocycle** = periodo concreto. Mai mescolati.

### Baseline Restart (F2.2, deterministica, error-honest — D015)
- Finestre annidate **4 / 8 / 12** settimane (max 12); performance recente privilegia **8**;
  all-time solo riferimento; < 12 settimane → usare il disponibile e rifletterlo nella data
  quality. Giorno di calendario **Europe/Rome** (D002).
- Domini: **training_consistency** (`sessions_count` **e** `training_days_count` per finestra —
  metrica principale = **sessioni**; giorni per anomalie/più-sessioni-stesso-giorno;
  `days_since_last_session`, trend), **performance** (per esercizio: `highest_load_recent_set`
  {weight,reps,date} = **carico più alto** osservato, ties → data più recente, **no** weight*reps;
  history recente, sessioni confrontabili, `historical_reference_52w` **ricalcolato da
  `session_exercises`** (bounded 52w, **non** all-time), tonnage solo per confronti omogenei;
  **estimated 1RM rimosso** in F2.2 (nessuna semantica affidabile del tipo di carico → falsa precisione);
  D008), **body** (peso+trend osservati; body_fat/masse **stimate**, bassa confidence; `bmi`
  derivato; **no girovita**), **nutrition** (`tracked_days`, `tracked_days_ratio`,
  `nutrition_tracking_consistency`, medie **solo sui giorni registrati**, target attivo se
  presente), **adherence** (co-variazione osservata tracking↔allenamento, **non** causale).
- **Error honesty (obbligatoria)**: «query riuscita senza dati» = assenza; «query fallita» =
  errore. **Vietato** riusare gli `executeTool` del Coach (mascherano errori come `[]`). Un
  errore DB **non** diventa `insufficient data`.

### Data quality per dominio (D016)
- Categorie `insufficient`/`limited`/`sufficient` **separate**:
  `training_consistency_data_quality`, `performance_data_quality`, `body_data_quality`,
  `nutrition_data_quality`. Misura la fiducia in **una conclusione specifica**. **Esporre sempre
  i conteggi/raw evidence**, non solo la categoria. **Soglie numeriche NON congelate qui** →
  formalizzate in F2.2 con tipi/aggregatori.

### PlanFitReport (parziale, D017/D013)
- Determinabile: plan day count, **confronto fattuale** `plan_days_vs_target`/`plan_days_vs_minimum`
  (`below`/`equal`/`above`/`unknown`) — **NON** un giudizio di compatibilità: un piano A/B (2 giorni)
  può girare 3×/settimana in rotazione, quindi `plan_day_count` ≠ frequenza prescritta; l'AI
  interpreterà. Inoltre esercizi/giorno, serie totali/giorno, conflitti con esercizi
  evitati/limitazioni. **`confirmed_conflicts`** (alta confidenza) vs **`possible_conflicts`**
  (fuzzy/ambigui, da verificare, mai modifica automatica). **Non** determinabile: durata reale,
  distribuzione volume per gruppo muscolare. **Nessun** tag muscolare/durata manuale/nuovo campo.
- `personal_records` **non** autoritativo (problema formato per-serie) → ricalcolo; `RPE`
  **non disponibile** nello schema reale (colonna `session_exercises.rpe` **droppata in
  migration 011**) → **non selezionata/usata** in F2.2; **`user_stats.baseline_tonnage` NON
  usato** (resta gamification, D019).

### Flusso ibrido (D018)
Codice legge error-honest → costruisce RestartBaseline → calcola DataQuality → produce
PlanFitReport → l'utente risponde **solo** alle domande minime adattive (safety: nuovi
dolori/limitazioni, disponibilità cambiata; condizionali: calo forza percepito se
`performance_data_quality` limited/insufficient, readiness se cambia la calibrazione; cambi di
disponibilità/limitazioni → **aggiornamento esplicito del Profilo**, source of truth) → l'AI
riceve Profile+Baseline+DataQuality+PlanFit+risposte e produce una **proposta strutturata (non
write)** → codice valida schema/coerenza/guardrail → UI mostra proposta+perché+dati+incertezze+
review date → utente **conferma** (D007) → codice persiste Assessment+Strategy → modifiche a
Plan/Mesocycle/Diet **solo dopo conferma**. Mesociclo attivo: **rilevato**, mai chiuso/sostituito
automaticamente (transizione in F2.6).

### Stato F2.2 (DONE — aggregation layer, real-data verification superata)
- Nuovo dominio **`lib/restart/`** (11 file, funzioni pure separate dalle query):
  `types.ts` (tipo serializzabile `RestartBaseline`), `thresholds.ts` (soglie **centralizzate e
  documentate**), `windows.ts` (finestre inclusive 4w=28d/8w=56d/12w=84d + serie ISO 12 settimane,
  Europe/Rome D002), `queries.ts` (letture **error-honest**: `if(error) throw` + `data ?? []`;
  `maybeSingle` per righe opzionali; solo read), `training.ts` (`sessions_count` vs
  `training_days_count`, `weekly_series` con zeri), `performance.ts` (per-esercizio; parsing new/
  legacy via helper tonnage condiviso; **`personal_records` non letto** → `historical_reference_52w`
  ricalcolato da `session_exercises` entro 52w (nome inequivocabile, **non** all-time);
  `highest_load_recent_set` (carico più alto, tie-break data più recente); **estimated 1RM rimosso**;
  tonnage = volume non forza), `body.ts` (trend first-vs-last; **`days_since_latest_measurement`**
  per la recenza; body_fat/muscle marcate `device_derived`),
  `nutrition.ts` (riusa `getDailyNutritionTotals`; **giorno non tracciato ≠ 0 kcal**; medie sui
  soli giorni tracciati), `plan-fit.ts` (`plan_days_vs_target`/`plan_days_vs_minimum` =
  confronto **fattuale** below/equal/above/unknown, **non** un giudizio di compatibilità;
  `confirmed_conflicts` = match esatto normalizzato vs avoided; `possible_conflicts` = overlap
  ambiguo "da verificare"; durata `unavailable`),
  `data-quality.ts` (4 classificatori puri per dominio — **copertura del dato, non costanza**),
  `errors.ts` (`RestartBaselineQueryError` con `source`/`code` + `cause` server-side, per
  diagnosticare **quale stage** fallisce senza mascherare né esporre dati sensibili),
  `baseline.ts` (`buildRestartBaseline(supabase, userId, analysisDate?)`, **atomico**, no
  `allSettled`; ogni sorgente etichettata con il proprio `source`).
- Esteso `lib/workouts/tonnage.ts`: `export parseLegacyReps` (additivo, per non duplicare il parser).
- **Data quality (regole F2.2)**: training = **copertura storica** (`insufficient` se nessuna
  history; `limited` se history < 56 giorni; `sufficient` se ≥ 56 giorni — anche con **zero
  sessioni recenti**); performance per-esercizio (0→insufficient, 1–2→limited, ≥3 comparable
  recent→sufficient, finestra 8w); body ora considera anche la **recenza** (`days_since_latest_measurement`):
  ≤1 misura **oppure** ultima > **84g** → insufficient; ≥3 distinte con span ≥14g **e** ultima ≤ **28g**
  → sufficient; altrimenti limited (caso reale: 2 misure, span 12, ~71g → **limited**); nutrition su
  28g (≤3→insufficient, ≥14 tracked & span ≥21g→sufficient, altrimenti
  limited). Sempre esposti i **raw evidence** accanto alla categoria.
- **NESSUN** DB/migration/RLS/AI/UI/persistenza; `user_stats.baseline_tonnage` non usato;
  `diet_logs` non usato; profilo **read-only** via `getAthleteProfile`; nessuna query ignora gli
  errori Supabase; output serializzabile e **bounded** (recent_history ≤8/esercizio, esercizi ≤40,
  weekly_series 12). tsc/build OK; **71 asserzioni pure** superate.
- **Real-data verification superata** (baseline reale coerente: training 3/4/9, last session
  2026-06-26, quality sufficient/limited/limited/insufficient, PlanFit A/B `below`/`equal`,
  nutrition 0 giorni **≠ 0 kcal**, body `days_since_latest_measurement=71` → limited). In fase di
  verifica trovato/corretto un bug reale: `session_exercises.rpe` selezionata ma **droppata in
  migration 011** (PostgreSQL **42703**) → rimossa dalla query `sessions` (RPE non esiste più nello
  schema reale). Route dev di verifica (`app/api/dev/restart-baseline`) **eliminata** (non committata).
  **Stato: DONE.**

### Nuove tabelle (concettuali — realizzate in F2.3, migration `014`)
- **`restart_assessments`** (immutabile): `id`, `user_id`, `created_at`, `analysis_period_start/end`,
  scalari baseline chiave, `*_data_quality` (text+CHECK), `performance_by_exercise` (JSONB
  bounded), `planfit` (bounded), risposte manuali, `observations`, `status`. RLS per-utente
  (SELECT/INSERT/UPDATE, no DELETE), trigger `set_updated_at`.
- **`training_strategies`**: `id`, `user_id`, `status` (`active`/`superseded`/`completed`, **una
  sola active**), `strategy_type`, `primary_objective`, `start_date`, `review_date`,
  `target/minimum_sessions_per_week`, `priorities`, `rationale`, `summary`, `risks_uncertainties`,
  `based_on_assessment_id`, `workout_plan_id?`, `supersedes_id?`, timestamps. RLS per-utente,
  trigger `set_updated_at`, CHECK `minimum ≤ target`. Stile F1.2 (text+CHECK named, idempotente).

> **Nota**: la forma effettiva scritta in F2.3 (migration `014`) diverge in alcuni punti da questa
> bozza concettuale F2.1 — vedi "Stato F2.3" sotto per lo schema autorevole (assessment
> **senza** `status`/`updated_at`/trigger perché immutabile; snapshot come **JSONB versionati**;
> same-user FK Assessment→Strategy garantita a livello DB, **`NO ACTION DEFERRABLE INITIALLY
> DEFERRED`**; **core della Strategy immutabile via trigger**; link `assessed_*` **senza FK**, non più
> SET NULL — round di revisione 2026-07-24).

### Stato F2.3 (DONE — migration `014` applicata e verificata sul DB reale)
> **Migration `014` applicata manualmente (Supabase SQL Editor) e verificata sul DB reale il
> 2026-07-24.** Nessuna API/AI/UI, nessuna persistenza di dati reali, `buildRestartBaseline` non
> toccato. **Risultati verificati sul DB**: `restart_assessments` e `training_strategies` presenti
> (schema `public`); **column count 30 / 20**; **RLS attiva** su entrambe; policy assessment
> SELECT/INSERT own (no UPDATE/DELETE, ruolo `authenticated`); policy strategy SELECT/INSERT/UPDATE
> own (no DELETE, ruolo `authenticated`); `restart_assessments` **senza trigger**; `training_strategies`
> con `trg_training_strategies_enforce_update` + `trg_training_strategies_updated_at`; funzioni
> `public.enforce_training_strategy_update()` + `public.set_updated_at()` presenti; partial unique
> `training_strategies_one_active_per_user_uidx`; FK composite `training_strategies_assessment_fk`
> + `training_strategies_supersedes_fk` entrambe **ON DELETE NO ACTION, DEFERRABLE, INITIALLY
> DEFERRED**; **row count iniziale 0 / 0** (nessun dato reale persistito). **Prossimo task: F2.4 —
> Assessment application/API layer** (non iniziato).

- **File**: `supabase/migrations/014_restart_assessments_and_training_strategies.sql`. Stile F1.2
  (text + CHECK named, idempotente, applicazione manuale + verifica read-only in coda). **Nessun**
  DROP TABLE/TRUNCATE/DELETE/INSERT; **nessun** dato seed; nessuna modifica ai dati esistenti;
  `athlete_profiles`/`body_measurements`/workout/diet/`mesocycles`/`user_stats` **non** modificate.
- **Audit schema pre-migration** (verificato leggendo 001/002): `workout_plans.id` UUID PK
  (`uuid_generate_v4()`), `mesocycles.id` UUID PK (`gen_random_uuid()`), **entrambe** con
  `user_id` NOT NULL → `auth.users ON DELETE CASCADE`; **nessuna** `UNIQUE(id,user_id)` su di esse.
  `public.set_updated_at()` esiste (creata in `013`, applicata/verificata sul DB reale).
  Migration `014` libera (max attuale `013`; unica anomalia: doppio `010`, già documentata).
- **`restart_assessments` (immutabile, 30 colonne)**: `id`/`user_id`/`created_at`; analysis period
  (`analysis_date`, `analysis_period_start`=`start_12w`, `analysis_period_end`=`end`=`analysis_date`,
  CHECK `start ≤ end` e `analysis_date = end`); **snapshot JSONB versionati** `baseline_snapshot`
  + `profile_snapshot` (`*_version SMALLINT ≥1`, CHECK `jsonb_typeof = 'object'`, **nessuna**
  validazione strutturale profonda in SQL → app/Zod in F2.4/F2.6); 4 `*_data_quality` (text CHECK
  `insufficient|limited|sufficient`); 10 scalari denormalizzati (`sessions_4w/8w/12w`,
  `last_session_date`, `days_since_last_session`, `latest_weight_kg`, `latest_body_measurement_date`,
  `days_since_latest_body_measurement`, `nutrition_tracked_days_28d`, `nutrition_tracked_days_ratio`
  con CHECK di range — mappati 1:1 su `RestartBaseline`); risposte manuali **nullable** (`readiness_score`
  1–5, `perceived_strength_change` lower/same/higher/unsure, `availability_changed`,
  `new_limitations_reported` — NULL = domanda non posta, **nessun default** che cancelli la
  distinzione); link fattuali opzionali `assessed_workout_plan_id`/`assessed_mesocycle_id`
  → **UUID nullable SENZA FK** (vedi "Integrità storica round 2" sotto). **NO** `updated_at`,
  **NO** trigger, **NO** `status` draft/finalized. RLS: **solo SELECT + INSERT** (`TO authenticated`;
  nessuna policy UPDATE/DELETE → write-once). Indici `(user_id, created_at DESC)` e
  `(user_id, analysis_date DESC)`; **nessun** GIN sui JSONB.
- **`training_strategies` (20 colonne)**: `id`/`user_id`/`created_at`/`updated_at`; `status`
  (`active|superseded|completed`), `strategy_type` (CHECK `IN ('restart')`); `start_date`,
  `review_date` (CHECK `review_date > start_date`); `target/minimum_sessions_per_week`
  (1–7, `minimum ≤ target`); explainability `primary_objective`/`summary`/`rationale`
  (CHECK `btrim(...) <> ''`), `priorities` (cardinalità 1–10), `observations`/`risks_uncertainties`
  (`text[]` DEFAULT `'{}'`, cardinalità ≤ 20); `based_on_assessment_id` NOT NULL, `supersedes_id`
  NULL, `workout_plan_id`/`mesocycle_id` NULL (`ON DELETE SET NULL` — la Strategy **non** è
  immutabile). RLS: SELECT + INSERT + **UPDATE** (`TO authenticated`, USING+WITH CHECK), **NO DELETE**.
  Due trigger BEFORE UPDATE (ordine per nome): `trg_training_strategies_enforce_update`
  (core-immutability, vedi sotto) poi `trg_training_strategies_updated_at` (**riusa**
  `public.set_updated_at()` di `013`, non ridefinita). Indici: **partial unique**
  `(user_id) WHERE status='active'`, `(user_id, created_at DESC)`, `(user_id, review_date)`,
  `(based_on_assessment_id)`.
- **Immutabilità core della Strategy (round 2)**: nuova funzione
  `public.enforce_training_strategy_update()` + trigger BEFORE UPDATE. Un UPDATE può cambiare
  **solo** `status`, `review_date`, `workout_plan_id`, `mesocycle_id` (+ `updated_at`, ignorato dal
  trigger). Immutabili dopo INSERT: `id`, `user_id`, `created_at`, `strategy_type`, `start_date`,
  `target/minimum_sessions_per_week`, `primary_objective`, `summary`, `rationale`, `priorities`,
  `observations`, `risks_uncertainties`, `based_on_assessment_id`, `supersedes_id` (confronti
  `IS DISTINCT FROM`). Una modifica sostanziale ⇒ **nuova Strategy** con `supersedes_id`, non
  riscrittura. **Transizioni status permesse**: `active→active` (aggiorna review/link),
  `active→superseded`, `active→completed`; `superseded` e `completed` sono **terminali** (bloccati
  `superseded→active`, `completed→active`, `completed→superseded`, `superseded→completed`). Il
  trigger non tocca l'INSERT iniziale. Interazione `updated_at`: l'enforcement **ignora**
  `updated_at`, quindi l'ordine dei trigger non è rilevante per la correttezza; nominato per girare
  prima dello stamp (`enforce_update` < `updated_at`).
- **Integrità storica round 2 — FK `assessed_*` senza SET NULL**: `restart_assessments` è
  immutabile, quindi `ON DELETE SET NULL` è **vietato** (muterebbe una riga già persistita). Audit
  reale: **nessun hard delete in-app** di `workout_plans`/`mesocycles` (solo lifecycle
  `is_active`/`status`); unico path di cancellazione = cascade da `auth.users` (rimozione account).
  `ON DELETE RESTRICT` sarebbe inutile (nessun delete in-app) **e** fragile: nel multi-path cascade
  di `auth.users`, plan/meso (FK 001/002) vengono cancellati insieme all'assessment (FK 014) e
  RESTRICT è **immediato/non-deferrable** → se la riga plan/meso è cancellata prima dell'assessment
  ancora referenziante, la cancellazione account fallirebbe. Scelta: **UUID nullable senza FK**;
  `baseline_snapshot` (plan_fit/mesocycle_context) resta la fotografia storica autoritativa;
  esistenza/ownership validate in F2.4/F2.6.
- **Same-user garantito a livello DB (round 3 — FK deferred)**: `UNIQUE(id, user_id)` su entrambe le
  tabelle come **target di FK composite** → `training_strategies(based_on_assessment_id, user_id)` →
  `restart_assessments(id, user_id)` (una Strategy non può puntare all'Assessment di un altro utente)
  e self-FK `(supersedes_id, user_id)` → `training_strategies(id, user_id)` (MATCH SIMPLE: non
  verificata se `supersedes_id` NULL). CHECK `supersedes_id <> id`. Entrambe **ON DELETE NO ACTION
  DEFERRABLE INITIALLY DEFERRED**: il controllo referenziale è **differito al COMMIT** invece che
  immediato. Effetti: (a) same-user e integrità **restano garantiti** (INSERT/UPDATE e delete
  isolato con riferimento pendente falliscono comunque, al COMMIT); (b) la **cancellazione account**
  (`auth.users` cascade multi-path che elimina Assessment e Strategy nella stessa transazione) **può
  completarsi**, perché a fine transazione non restano righe pendenti — RESTRICT immediato invece
  poteva abortire in base all'ordine interno del cascade. Side-effect utile: la transazione atomica
  F2.6 (INSERT Assessment + INSERT Strategy) è più robusta all'ordine. Per
  `workout_plan_id`/`mesocycle_id` il same-user **non** è FK-enforced (richiederebbe `UNIQUE(id,
  user_id)` su tabelle esistenti — fuori scope): ownership validata in **F2.6**; restano
  `ON DELETE SET NULL` (non deferred).
- **Atomicità futura (F2.6) — CONFERMATA**: con il normale client Supabase, il flusso conferma →
  INSERT Assessment immutabile + (supersede vecchia active) + INSERT nuova active **non** è atomico
  (ogni richiesta PostgREST è una transazione a sé). **Requisito**: una **RPC/transazione
  PostgreSQL `SECURITY INVOKER`** (rispetta RLS) — oppure Edge Function — che esegua i tre passi in
  una sola transazione. Il partial unique index non è DEFERRABLE → la transazione dovrà
  `UPDATE old→superseded` **prima** di `INSERT new active`. **F2.3 non crea la RPC**: decisione
  architetturale registrata per F2.6.
- **Verification SQL (round 2)**: esistenza tabelle; column count 30/20; RLS ON; policy assessment
  (SELECT+INSERT, no UPDATE/DELETE) **con `roles={authenticated}`**; policy strategy
  (SELECT+INSERT+UPDATE, no DELETE) **con `roles={authenticated}`**; partial unique active; **due
  trigger su strategy in ordine** (`enforce_update` poi `updated_at`); **funzioni**
  `enforce_training_strategy_update` + `set_updated_at`; **nessun trigger su assessment**; FK
  (assessed_* **senza FK/senza SET NULL**; same-user assessment/self FK presenti). **Round 3**:
  check dedicato `confdeltype='a'` (NO ACTION), `condeferrable=t`, `condeferred=t` sui due FK
  composite same-user. Row count 0. In più **esempi di test transazionale commentati** (dopo apply,
  riga di test + ROLLBACK): review_date consentito, `active→completed` consentito, rationale
  bloccata, target_sessions bloccata, `completed→active` bloccata, seconda active bloccata, e un
  test **concettuale** del FK differito (dangling ref rifiutata al COMMIT — nessuna cancellazione
  account reale). Usato `policyname` (non `polname`). **Nessun** dato seed auto-inserito.
- **Verifiche statiche**: `npx tsc --noEmit` OK, `npm run build` OK (solo SQL/docs, repo verde),
  `git diff --check` pulito.
- **Rischi / domande aperte**: (1) ~~RESTRICT fragile su cancellazione account~~ **RISOLTO round 3**:
  i due same-user FK composite sono ora `NO ACTION DEFERRABLE INITIALLY DEFERRED` → integrità
  same-user preservata **e** cancellazione account non bloccata. (2) `assessed_*` senza FK: possibile
  UUID "orfano" se il plan/meso viene rimosso — accettato (baseline_snapshot autoritativo; ownership
  in F2.4/F2.6). (3) atomicità F2.6 richiede RPC/transazione server-side (sopra).

### Stato F2.4 (DONE — application/API layer, verifica runtime API superata)
> Layer applicativo server-side del Restart Assessment, **allineato alla spec F2.4 completa**
> (§1–§24) e **verificato a runtime con sessione autenticata reale il 2026-07-24**. **NESSUNA
> persistenza**: F2.4 **non** inserisce in `restart_assessments` e **non** tocca
> `training_strategies`/`athlete_profiles`/`workout_plans`/`mesocycles` (persistenza atomica → F2.6,
> dopo conferma utente, D007/D018). Nessuna AI, nessun prompt, nessuna UI, nessuna migration, DB/RLS
> non toccati. tsc/build OK, **76 asserzioni pure superate**. **Verifica runtime API — SUPERATA**:
> GET → 200 `needs_answers` (profilo restart-ready, baseline restituita, 4 domande adattive corrette,
> data quality coerente con F2.2); POST completo senza blocker → 200 `ready_for_strategy_proposal`
> con `assessment_draft` (snapshot versions corrette, quality/scalari/sessions 4/8/12 coerenti con la
> baseline, plan/meso ID server-derived, **nessun `user_id`/`created_at` nel draft**); POST con
> `availability_changed=true` → 200 `profile_update_required` (blocker `update_schedule_availability`,
> **nessun** draft); **zero persistenza confermata: `restart_assessments`=0, `training_strategies`=0**.

- **Nuovo dominio `lib/restart/assessment/`** (9 file puri/orchestrazione + route):
  - `versions.ts` — `RESTART_BASELINE_SNAPSHOT_VERSION=1`, `ATHLETE_PROFILE_SNAPSHOT_VERSION=1`
    (unica fonte; nessun `1` hardcoded).
  - `types.ts` — `RestartAssessmentDraft` (mirror **1:1** colonne INSERTabili `restart_assessments`
    **meno** `id`/`user_id`/`created_at`); `AthleteProfileSnapshotV1`; `RestartQuestion`; **stati
    discriminati**: `profile_required`, `needs_answers`, `profile_update_required`,
    `ready_for_strategy_proposal` (+ `unexpected_answer` interno → 400).
  - `profile-snapshot.ts` — `buildAthleteProfileSnapshotV1` **puro**: esclude
    `user_id`/`created_at`/`updated_at`; preserva `null` vs `[]`; `years_training`→`number|null`
    (stringa PostgREST → numero; non valido → **errore**, mai inventato); 32 campi.
  - `questions.ts` — `deriveRestartQuestions(baseline)` **puro/adattivo** (§8/§9): **safety sempre**
    (`new_limitations_reported`, `availability_changed`); `perceived_strength_change` se
    `performance_data_quality !== 'sufficient'`; `readiness_score` se rientro (`days_since_last_session`
    null **oppure** `≥ READINESS_RECALIBRATION_GAP_DAYS=14`, soglia centralizzata).
  - `schema.ts` — Zod **strict**: request accetta **solo** `{ answers }` (4 campi; `null` **non**
    ammesso per simulare "non posta" → si omette); rifiuta ogni campo server-derived
    (baseline/snapshot/quality/counts/body/PlanFit/plan_id/meso_id/user_id/analysis_date/chiavi
    ignote); `validateAnswersAgainstQuestions` (missing required / unexpected).
  - `draft.ts` — `buildRestartAssessmentDraft` **puro**: period, snapshot versionati, 4 quality, 10
    scalari, risposte (assente → `null`), link **guardati** (`has_active_plan ? plan_id : null`,
    `active_mesocycle_exists ? active_mesocycle_id : null` — nessun id "stantio").
  - `draft-schema.ts` (**§15**) — validazione runtime del draft: **Zod mirato** che riflette i CHECK
    di 014 (date ISO, `start ≤ end`, `analysis_date === end`, versioni ≥1, snapshot = oggetti JSON,
    quality enum, counts ≥0, weight >0, tracked 0..28, ratio 0..1, readiness 1..5, uuid|null) **+
    invarianti applicativi** (`validateDraft(draft, baseline)`: ogni scalare/quality/link **deve
    coincidere** con la baseline; `profile_snapshot` senza metadata; `baseline_snapshot === baseline`).
    Scelta: **non** ri-dichiarare l'intera `RestartBaseline` (duplicazione fragile) — Zod mirato +
    invarianti vs baseline prodotta internamente.
  - `resolve.ts` (**§10/§12/§13**) — `resolveRestartPost(baseline, profileSnapshot, answers)` **puro**:
    (1) risposta a domanda non posta → `unexpected_answer` (→400); (2) required mancante →
    `needs_answers` (+`missing_answer_ids`); (3) `new_limitations_reported=true` **o**
    `availability_changed=true` → **`profile_update_required`** (blocker `update_training_limitations`/
    `update_schedule_availability`; il cambiamento va sul **Profilo**, non duplicato nell'Assessment);
    (4) altrimenti build+`validateDraft` → `ready_for_strategy_proposal`. `isRestartReady(completeness)`
    puro. Un'invariante rotta = **errore interno → 500** (mai colpa del client).
  - `server.ts` — orchestrazione **read-only, error-honest**: legge Profilo (`getAthleteProfile`,
    **throw** su errore DB → 500, **≠** `profile_required`); gate completeness — se non
    restart-ready **STOP prima** della baseline costosa (`profile_required` + `missing_restart_fields`);
    altrimenti `buildRestartBaseline` (F2.2) → domande (GET) / `resolveRestartPost` (POST). **Nessun
    try/catch che maschera errori F2.2.**
- **Route `app/api/restart/assessment/route.ts`** (`GET`/`POST`, stile P0.3/profile): 401 anonimo;
  **GET** → `profile_required` oppure `{ status:'needs_answers', completeness, questions, baseline }`
  (baseline bounded, own data); **POST** `{ answers }` → **400** body malformato (Zod strict) o
  `unexpected_answer`; **200** `profile_required`/`needs_answers`(+`missing_answer_ids`)/
  `profile_update_required`/`ready_for_strategy_proposal`(+`assessment_draft`,`questions`,`answers`);
  **500 generico** su errore DB/invariante (nessun dettaglio Supabase/stack/`user_id`/token/cookie;
  **nessun** log di snapshot/baseline/answers). `user_id` **solo** dalla sessione. **Registrata.**
- **Zero-persistence — ricerca finale superata**: nessun `.from(`/`.insert(`/`.update(`/`.upsert(`/
  `.delete(`/`.rpc(` nei file F2.4; riferimenti alle tabelle solo in commenti; F2.2 (`lib/restart/*.ts`)
  **non** modificati; nessun ID fidato dal client; nessun errore mascherato.
- **Verifiche**: `npx tsc --noEmit` OK, `npm run build` OK (`/api/restart/assessment` registrata),
  `git diff --check` pulito; **76 asserzioni pure** (completeness/gate, snapshot no-metadata/null-vs-[]/
  years_training, domande adattive, Zod strict, applicabilità risposte, `resolveRestartPost` per tutti
  gli stati incl. profile_update_required/unexpected_answer, mapping draft, `validateDraft`
  Zod+invarianti incl. mismatch scalare/quality/plan-id e metadata nel profile_snapshot). Moduli reali
  compilati in CJS (scratchpad) + `NODE_PATH` per `zod`.
- **Checklist verifica manuale (§22) — ESEGUITA E SUPERATA (2026-07-24)**: GET con profilo reale
  restart-ready/complete → `needs_answers` con le domande attese (new_limitations, availability,
  perceived_strength perché performance limited, readiness perché break > 14g), baseline restituita,
  data quality coerente con F2.2; POST con entrambi i boolean `false` + risposte richieste →
  `ready_for_strategy_proposal` + `assessment_draft` (snapshot versions, quality/scalari/sessions,
  plan/meso ID server-derived, nessun `user_id`/`created_at`), **row count
  `restart_assessments`/`training_strategies` = 0**; POST con `availability_changed=true` →
  `profile_update_required` (blocker `update_schedule_availability`, nessun draft). Nessuna route dev
  temporanea usata: verificata la vera API F2.4.

### Stato F2.5 (DONE — AI Strategy Proposal, verifica AI runtime reale superata)
> Trasforma il `RestartAssessmentDraft` validato di F2.4 in una **proposta di Training Strategy**
> strutturata, spiegabile, coerente con la data quality, **validata applicativamente** e **effimera**:
> **NESSUNA persistenza** (no `restart_assessments`/`training_strategies`/`athlete_profiles`/
> `workout_plans`/`mesocycles`; nessun insert/update/upsert/delete/rpc). Nessuna UI, nessuna migration,
> DB/RLS non toccati; Workout Plan/Mesocycle non toccati; le nuove tabelle restano **vuote (0/0)**.
> **La proposta finale corrisponde al nucleo di `training_strategies` SENZA identity/status/FK/timestamp**
> — quelli li decide F2.6. tsc/build OK, **55 asserzioni pure superate**. **Verifica AI runtime reale
> (chiamata Anthropic con sessione autenticata reale) + structured tool use + verifica qualitativa +
> Profile guardrails + zero persistence — SUPERATE il 2026-07-24 → DONE** (committato questa sessione).
> F2.4 (`lib/restart/assessment/*`) e F2.2 (`lib/restart/*.ts`) **non toccati**.

- **Verifica AI runtime reale — SUPERATA (2026-07-24)**: `POST /api/restart/strategy-proposal` con
  sessione autenticata reale → HTTP **200**, `status = ready_for_confirmation`; `assessment_draft`
  presente; `strategy_proposal` presente; `strategy_type = 'restart'`; `start_date ===
  assessment_draft.analysis_date`; `review_date` successiva e coerente con uno dei periodi ammessi
  (start + 28/35/42); target/minimum **entro i limiti dell'Athlete Profile**, `minimum ≤ target`;
  **nessun** campo identity/persistence nella proposta; **nessun `user_id`** nei payload. **Structured
  tool use verificato** (Anthropic tool use forzato su `propose_restart_strategy`). **Verifica
  qualitativa — SUPERATA**: proposta ancorata ai dati reali; performance/body trattati con cautela
  quando `limited`; nutrition missing = dato assente (non 0 kcal né scarsa aderenza); target ideale e
  minimo sostenibile distinti; rientro graduale e non punitivo; sessione ridotta preferita a sessione
  saltata; `rationale`/`observations` spiegabili; `risks_uncertainties` coerenti con la data quality;
  **nessuna invenzione, nessuna diagnosi, nessuna prescrizione** (esercizi/serie/reps/carichi/calorie/
  macro/integratori). **Zero persistenza confermata dopo la chiamata reale: `restart_assessments` = 0,
  `training_strategies` = 0.**

- **Nuovo dominio `lib/restart/strategy-proposal/`** (9 file, responsabilità separate — no monoliti):
  - `types.ts` — `RestartStrategyAiOutput` (ciò che l'AI produce: numeri + prosa + `review_after_days`
    28|35|42, **mai date né `strategy_type`**); `RestartTrainingStrategyProposal` (proposta finale =
    nucleo `training_strategies` **senza** `id`/`user_id`/`created_at`/`updated_at`/`status`/
    `based_on_assessment_id`/`supersedes_id`/`workout_plan_id`/`mesocycle_id`); `RestartStrategyContext`
    (contesto bounded al modello); `StrategyProvider` (interfaccia iniettabile); stati API
    (`ReadyForConfirmationState` + propagazione degli stati incompleti F2.4).
  - `schema.ts` — `RestartStrategyAiOutputSchema` Zod **strict/bounded**: target/min interi 1..7 con
    `minimum ≤ target`; `review_after_days` enum 28|35|42; `primary_objective` ≤180, `summary` ≤800,
    `rationale` ≤2000 (trim, non vuoti); `priorities` 2..6, `observations` 1..12, `risks_uncertainties`
    1..10 (entro i limiti migration 014: priorities ≤10, observations/risks ≤20 — più stretti); nessuna
    chiave extra. `RestartTrainingStrategyProposalSchema` (proposta assemblata: `strategy_type` literal,
    date ISO, `review_date > start_date`, invarianti). `safeIssueHint` = riassunto **value-free** degli
    issue Zod (solo `path: code`) per il repair — mai valori del modello o dell'assessment, mai loggato.
  - `context.ts` — `buildRestartStrategyContext(draft)` **puro**: proiezione bounded/serializzabile del
    draft già costruito server-side (analysis_date, snapshot versions, `profile_snapshot`,
    `baseline_snapshot`, 4 risposte manuali). **NO** `user_id`/cookie/token/auth metadata; non
    ri-appiattisce gli scalari (già dentro `baseline_snapshot`, §11); `null`/`[]` preservati.
  - `prompt.ts` — `RESTART_STRATEGY_SYSTEM_PROMPT` (§9 grounding + §10 anti prompt-injection),
    `proposeStrategyTool` (JSON Schema Anthropic, **mirror** dello Zod, con test di parità), e
    `buildStrategyUserContent` (ASSESSMENT **delimitato** `<ASSESSMENT>…</ASSESSMENT>` come dato non
    fidato; note utente **mai** concatenate come istruzioni).
  - `provider.ts` — `AnthropicStrategyProvider` (client iniettabile): **una** call structured con
    **tool_choice forzato** su `propose_restart_strategy`; **nessun parsing markdown/regex/JSON-da-testo**.
    Model ID dalla **config centrale** `AI_MODELS.restartStrategy` (mai hardcoded). Errori
    transport/SDK → **throw** `StrategyProviderError`; tool assente/errato/ambiguo → `{ok:false, reason}`
    (retryable). Nulla loggato (né prompt né output).
  - `proposal.ts` — pipeline (§14): tool call → Zod parse → **Profile guardrails** → assemblaggio
    (server: `strategy_type='restart'`, `start_date=analysis_date`, `review_date=addDays(start,
    review_after_days)` date-only) → **validazione finale**. **Un solo repair retry** (max 2 chiamate,
    hint value-free) su output AI invalido; provider error → nessun retry; due tentativi falliti →
    `InvalidAiOutputError`. `readProfileBounds` lancia `ProposalInvariantError` **prima** di ogni call
    se la disponibilità profilo manca su un draft restart-ready.
  - `orchestrate.ts` — `resolveStrategyProposalFromPostState(post, provider)` **DB-free**: propaga
    invariati `profile_required`/`needs_answers`/`profile_update_required`/`unexpected_answer` e chiama
    il provider **solo** su `ready_for_strategy_proposal` → `ready_for_confirmation` (con
    `assessment_draft` echeggiato invariato).
  - `server.ts` — `generateRestartStrategyProposal(supabase, userId, answers, provider?)`: riusa
    `postRestartAssessment` (F2.4) e delega a `orchestrate`. Provider **iniettabile** (default reale)
    → orchestrazione testabile senza AI/DB. **Zero write.**
  - `errors.ts` — `StrategyProviderError` (`strategy_provider_error`), `InvalidAiOutputError`
    (`invalid_ai_output`) → **502 generico**; `ProposalInvariantError` (`proposal_invariant_error`)
    → 500. Nessun dettaglio esposto.
- **Guardrail Profile** (dopo Zod): `target ≤ profile.target`, `minimum ≤ profile.minimum`,
  `minimum ≤ target`; **valori inferiori ammessi** (rientro graduale), **superiori vietati**; profilo
  core assente = errore interno (il Profilo doveva essere restart-ready).
- **Date** (`lib/date/app-date.addDays`): aritmetica date-only ancorata a UTC-midnight, DST-safe, no
  shift timezone; test cambio mese/anno/febbraio/leap + round-trip `diffCalendarDays`.
- **Route** `POST /api/restart/strategy-proposal` — solo POST; auth (401); body = **stesso schema
  strict F2.4** (`{answers}`, il client non può inviare draft/proposta/baseline/snapshot/analysis_date/
  target|min/plan|meso id/user_id); `unexpected_answer` → 400; stati incompleti → 200; successo → 200
  `ready_for_confirmation` (`assessment_draft` + `strategy_proposal` + `questions` + `answers`); AI
  fallita/output invalido → **502** `{error:'strategy_generation_failed'}`; altro → 500. Log solo
  `err.code` generico; **mai** prompt/assessment/risposta AI/risposte manuali.
- **Config modelli**: `lib/ai/models.ts` estesa con chiave semantica **`restartStrategy`** (default =
  modello testo qualitativo, definito una sola volta come `QUALITY_TEXT_DEFAULT`, **nessun ID
  duplicato**; override env `ANTHROPIC_RESTART_STRATEGY_MODEL`). Nessun altro modello modificato.
- **Requisito F2.6 (registrato)**: la conferma **non** dovrà persistere ciecamente draft/proposta dal
  client — **nuova validazione server-side** obbligatoria, poi transazione atomica (RPC `SECURITY
  INVOKER`: UPDATE old→superseded prima di INSERT new active; partial unique non deferrable). F2.5 **non**
  implementa token firmati/RPC/idempotency.
- **Test (55 asserzioni pure)**: schema AI (valido/extra/min>target/enum/array/stringhe), Profile
  guardrails (sopra/sotto profilo, core mancante→internal), context/privacy (no user_id, no metadata,
  null/[] preservati, bounded/serializzabile), date (start=analysis_date, +28/+35/+42 cross mese/anno/
  febbraio, no TZ shift), provider parsing (tool corretto/assente/errato/ambiguo/payload invalido, model
  ID da config, tool_choice forzato), retry (1° invalido→2° valido, due invalidi→`invalid_ai_output`,
  max 2 chiamate, provider error tipizzato), orchestrazione (zero AI-call su stati incompleti, una call
  su ready, `ready_for_confirmation`, draft invariato, no identity/FK, error→codici 502), grounding/
  prompt (data quality, snapshot untrusted, no diagnosi/invenzioni, no prescrizioni, target vs minimo,
  nutrition missing = unknown), trust boundary (body rifiuta draft/proposal/user_id/analysis_date, JSON
  serializzabile) + parità tool↔Zod. **Verifica AI runtime reale ESEGUITA E SUPERATA (§21, 2026-07-24).**
- **Requisiti F2.6 (registrati)**: la conferma **non** dovrà fidarsi di `assessment_draft`/
  `strategy_proposal` inviati dal client → **ricostruzione e nuova validazione server-side**;
  **transazione atomica** tramite **RPC PostgreSQL `SECURITY INVOKER`**; eventuale old active Strategy →
  `superseded` **prima** dell'INSERT della nuova `active`; **INSERT Assessment e Strategy nella stessa
  transazione**; **partial unique index `active` non DEFERRABLE**; **FK composite same-user già
  DEFERRABLE INITIALLY DEFERRED**; **idempotency e gestione doppia conferma ancora da progettare in F2.6.**

### Stato F2.6a (DONE — idempotency schema + atomic RPC, migration `015` applicata e verificata sul DB reale)
> **Primo task del flusso Restart che prepara una write permanente.** Migration `015` che consente
> di persistere **atomicamente** (una sola transazione PostgreSQL): (1) Restart Assessment immutabile;
> (2) supersede dell'eventuale Training Strategy attiva; (3) nuova Training Strategy attiva — con
> **idempotenza sulla doppia conferma**, **serializzazione per utente**, **controllo della Strategy
> attiva attesa**. **Nessuna modifica applicativa/API in questo task.** F2.6 complessiva **NON è DONE**.
> **Migration `015` applicata manualmente via Supabase SQL Editor e verificata sul DB reale il
> 2026-07-24 → F2.6a DONE.** **Nessuna conferma/write reale ancora eseguita**; nuove tabelle ancora
> **0/0**. Decisioni: **D020** (signed confirmation artifact — solo formalizzata, HMAC in F2.6b),
> **D021** (atomic & idempotent persistence). **Prossimo task: F2.6b.**

- **Verifica DB reale — SUPERATA (2026-07-24)**: `restart_assessments` **column count = 31**;
  `confirmation_id` = `uuid`, **NOT NULL**, **nessun default**, unique constraint
  `restart_assessments_confirmation_id_key` presente; unique index
  `training_strategies_one_per_assessment_uidx` presente; RPC `public.confirm_restart_strategy` presente
  con firma `(p_confirmation_id uuid, p_assessment jsonb, p_strategy jsonb, p_expected_active_strategy_id
  uuid)` e return `TABLE(assessment_id uuid, strategy_id uuid, created_new boolean)`; **SECURITY INVOKER**
  + **VOLATILE** + `search_path = public, pg_temp` verificati; **ACL**: `authenticated` execute = **true**,
  `anon` = **false**, `PUBLIC` = **false**; FK composite same-user ancora **ON DELETE NO ACTION /
  DEFERRABLE / INITIALLY DEFERRED**; **RLS attiva** su entrambe le tabelle; **policy F2.3 invariate**;
  **trigger Strategy invariati** (`trg_training_strategies_enforce_update`,
  `trg_training_strategies_updated_at`); **row count `restart_assessments` = 0, `training_strategies` = 0**.
  **Idempotenza (`confirmation_id`), unique one-strategy-per-assessment, advisory lock per-utente e stale
  guard presenti nella RPC** (verifica strutturale + static audit; la verifica funzionale end-to-end della
  conferma è parte di F2.6b, con l'app che chiama la RPC).

- **File**: `supabase/migrations/015_restart_confirmation_idempotency_and_rpc.sql` (stile F1.2/F2.3:
  idempotente, applicazione manuale + verifica read-only in coda + test transazionali commentati).
  **Nessun** DROP TABLE/TRUNCATE/DELETE di dati; **nessun** seed; nessuna modifica a policy RLS/trigger
  esistenti né alle FK composite same-user di F2.3.
- **`restart_assessments.confirmation_id`** (chiave di idempotenza): `uuid` **NOT NULL**, **UNIQUE**
  (constraint named `restart_assessments_confirmation_id_key`, uniqueness **globale** — UUID
  server-generated), **senza DEFAULT** (deve essere fornito esplicitamente dal flusso di conferma).
  Rollout robusto: ADD COLUMN nullable → backfill `gen_random_uuid()` delle eventuali righe NULL (one-off,
  non un default) → SET NOT NULL → ADD CONSTRAINT UNIQUE (guardato via `pg_constraint`). **Immutabilità
  invariata** (nessuna UPDATE/DELETE policy, nessun `updated_at`, nessun trigger). → `restart_assessments`
  passa a **31 colonne**.
- **`training_strategies_one_per_assessment_uidx`**: UNIQUE index su `(based_on_assessment_id)` — un
  Assessment confermato genera **una sola** Strategy persistita; un retry non può crearne una seconda;
  una nuova strategia richiede un **nuovo Assessment** + `supersedes_id`. FK composite same-user
  **invariata**.
- **RPC `public.confirm_restart_strategy(p_confirmation_id uuid, p_assessment jsonb, p_strategy jsonb,
  p_expected_active_strategy_id uuid)` RETURNS TABLE(`assessment_id uuid`, `strategy_id uuid`,
  `created_new boolean`)**:
  - **SECURITY INVOKER**, **VOLATILE**, `SET search_path = public, pg_temp`; identità **solo** da
    `auth.uid()` (mai `user_id` come parametro o dal JSON); se `auth.uid()` è NULL → errore, nessuna
    write. **Non** accetta `p_user_id`/`status`/`based_on_assessment_id`/`supersedes_id`/
    `workout_plan_id`/`mesocycle_id` (determinati internamente).
  - **Privilegi**: `REVOKE ALL` da `PUBLIC` e `anon`, `GRANT EXECUTE` **solo** a `authenticated` (firma
    esatta). SELECT sulle tabelle invariati; nessun path service-role.
  - **Ordine transazionale**: auth → **advisory transaction lock per-utente**
    (`pg_advisory_xact_lock(hashtextextended('restart-confirm:'||uid,0))`, transaction-scoped) →
    **idempotency lookup** (`user_id`+`confirmation_id`) → validazione JSON top-level (oggetto) →
    lettura active corrente → **expected-active check NULL-safe** (`IS DISTINCT FROM` →
    `restart_confirmation_stale`) → **INSERT Assessment** → **UPDATE old active → superseded** (verifica
    ROW_COUNT=1) → **INSERT new active Strategy** → return. L'idempotency lookup **precede** lo staleness
    check; il supersede **precede** l'INSERT della nuova active (partial unique `active` **non
    DEFERRABLE**).
  - **Idempotenza**: replay con lo stesso `confirmation_id` → stesse righe, `created_new=false`, nessun
    duplicato/secondo supersede/cambio stato. Assessment esistente senza Strategy = **errore di
    integrità interno**.
  - **Mapping esplicito** delle colonne (whitelist), **no** `jsonb_populate_record`, **no** dynamic SQL,
    **no** concatenazione SQL; chiavi extra nel JSON ignorate; array `jsonb → text[]` via
    `jsonb_array_elements_text`; `id`/`user_id`/`status`/`created_at`/link server-decided, mai dal JSON.
    Cast + CHECK + FK + unique + trigger proteggono la persistenza anche in caso di bug applicativo.
    **Nessun exception handler** che converta errori in successo → rollback completo.
- **Limite direct-write (documentato, non nascosto — §18/D021)**: la RPC è SECURITY INVOKER e rispetta
  RLS; le policy attuali consentono comunque all'utente autenticato write dirette sulle **proprie** righe
  tramite le normali API Supabase. Rischio **self-data**, mai cross-user. L'hardening "RPC-only writes"
  richiede una **decisione separata** (probabilmente SECURITY DEFINER o policy contestuali) → **non**
  introdotto ora, **non** convertire a SECURITY DEFINER senza approvazione.
- **Verifica**: `npx tsc --noEmit` OK, `npm run build` OK (solo SQL/docs, nessuna modifica app),
  `git diff --check` pulito. **Static audit SQL**: nessun `p_user_id`, idempotency **prima** dello stale
  check, supersede **prima** dell'INSERT active, advisory transaction lock, SECURITY INVOKER, ACL
  corretti, nessun dynamic SQL, nessun dato seed, F2.4/F2.5 applicativi non toccati. Verification SQL
  read-only + test transazionali commentati (rollback) inclusi in coda alla migration. **Migration `015`
  applicata manualmente e verificata sul DB reale il 2026-07-24 (vedi "Verifica DB reale" sopra) →
  F2.6a DONE**; **row count 0/0** (nessuna conferma/write reale eseguita). **Prossimo task: F2.6b**
  (signed confirmation token + confirm API).
- **Limite direct-write (invariato, documentato)**: le write dirette dell'utente sulle **proprie** righe
  restano teoricamente possibili sotto le RLS esistenti; **l'app userà soltanto la RPC** (F2.6b). Rischio
  self-data, mai cross-user; hardening "RPC-only writes" = decisione separata, non introdotto ora.

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

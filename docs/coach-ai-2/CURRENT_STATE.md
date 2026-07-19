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

### Nuove tabelle (concettuali, SENZA SQL — nascono in F2.3, migration `014`)
- **`restart_assessments`** (immutabile): `id`, `user_id`, `created_at`, `analysis_period_start/end`,
  scalari baseline chiave, `*_data_quality` (text+CHECK), `performance_by_exercise` (JSONB
  bounded), `planfit` (bounded), risposte manuali, `observations`, `status`. RLS per-utente
  (SELECT/INSERT/UPDATE, no DELETE), trigger `set_updated_at`.
- **`training_strategies`**: `id`, `user_id`, `status` (`active`/`superseded`/`completed`, **una
  sola active**), `strategy_type`, `primary_objective`, `start_date`, `review_date`,
  `target/minimum_sessions_per_week`, `priorities`, `rationale`, `summary`, `risks_uncertainties`,
  `based_on_assessment_id`, `workout_plan_id?`, `supersedes_id?`, timestamps. RLS per-utente,
  trigger `set_updated_at`, CHECK `minimum ≤ target`. Stile F1.2 (text+CHECK named, idempotente).

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

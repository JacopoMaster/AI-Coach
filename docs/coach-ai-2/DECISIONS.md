# Coach AI 2.0 — DECISIONS

> Decisioni numerate e **immutabili** salvo revisione esplicita. Non modificare una
> decisione: se serve cambiarla, aggiungere una nuova voce di revisione che la supera
> e annotarla qui sotto (sezione "Revisioni"). Riferite queste sigle (D0xx) nei documenti
> di piano e nei commit quando rilevante.

---

- **D001** — `nutrition_entries` sarà la **source of truth** per i pasti.
  `diet_logs` è considerata legacy e destinata alla dismissione.

- **D002** — La **timezone applicativa** è `Europe/Rome`. Tutti i confini di "giornata"
  (log, reminder, cron, aggregazioni) devono usarla.

- **D003** — Il Coach AI deve **distinguere piano ideale e piano minimo sostenibile**.

- **D004** — Un **allenamento ridotto è preferibile a un allenamento saltato**.

- **D005** — Il sistema deve **favorire il ritorno dopo l'inattività, non punirlo**.

- **D006** — Le decisioni del Coach devono essere **spiegabili** tramite "Perché?".

- **D007** — Le **modifiche importanti a scheda e dieta richiedono conferma utente**.

- **D008** — Il **Restart di settembre** deve stabilire una **nuova baseline**,
  non assumere i vecchi carichi.

- **D009** — **Target principale iniziale**: recuperare **costanza e performance**
  migliorando **progressivamente la composizione corporea**, **senza aumentare inutilmente
  l'attrito di tracking**. (Riformulata il 2026-07-19 — vedi Revisioni; la versione
  precedente faceva riferimento specifico al *girovita*, ora rimosso come requisito.)

- **D010** — Sviluppo tramite **piccoli commit atomici**, uno per sessione/task.

- **D011** — Durante **P0.1 non verrà introdotta una view SQL** per la dieta. In produzione
  `diet_logs` contiene **0 record** e `nutrition_entries` contiene **tutti i dati reali
  verificati**. P0.1 userà `nutrition_entries` come **unica sorgente** e un **helper
  server-side** per le aggregazioni giornaliere. `diet_logs` verrà **deprecata ma non
  eliminata**. Questo evita nuove migrazioni durante la stabilizzazione.

- **D012** — **Confini dell'Athlete Profile (Fase 1).**
  - `athlete_profiles` contiene **caratteristiche, vincoli e preferenze relativamente
    stabili** dell'utente (identità fisica, obiettivi, esperienza, disponibilità sostenibile,
    preferenze/limitazioni, barriere, preferenze alimentari e di coaching).
  - **Non** contiene **prescrizioni** né **stato corrente della programmazione** (fase di
    allenamento, restart in corso, target numerici). Questi vivono in
    `workout_plans`, `diet_plans`, `mesocycles` e nella futura **Training Strategy /
    September Restart / Decision Center**, che restano **entità separate**.
  - `body_measurements` resta la **source of truth** delle **misure fisiche temporali**
    (peso, body fat, masse, ecc.); il profilo **non** duplica misure né target.
  - La **completezza del profilo è derivata** dai campi presenti (stati
    `not_started` / `partial` / `restart_ready` / `complete`), **non** un booleano
    `onboarding_completed` persistito.

- **D013** — **Minimo attrito di tracking.**
  Coach AI deve **preferire dati già raccolti automaticamente o abitualmente** rispetto
  all'introduzione di nuove misurazioni o input manuali, **quando questi ultimi non cambiano
  in modo significativo le decisioni del Coach**.
  Conseguenze:
  - non introdurre nuove metriche soltanto perché tecnicamente disponibili;
  - valutare ogni nuovo dato richiesto in base alla domanda:
    *"Quale decisione concreta del Coach cambia grazie a questa informazione?"*;
  - privilegiare **trend e segnali già disponibili**;
  - ridurre il numero di azioni manuali necessarie per mantenere il sistema utile;
  - evitare che il **tracking stesso** diventi una causa di perdita di aderenza;
  - **eccezioni ammesse** quando una nuova informazione modifica in modo sostanziale
    **sicurezza, programmazione o qualità delle decisioni**.

  D013 **non** significa ignorare dati utili: significa che il **valore decisionale** deve
  giustificare l'**attrito** introdotto. Ha motivato la riformulazione di D009 (rimozione
  del tracking manuale del girovita).

- **D014** — **Confini delle entità del Restart (Fase 2).** Restano cinque entità distinte,
  mai mescolate:
  - **Athlete Profile** = chi è l'utente e i suoi tratti/vincoli/preferenze relativamente
    stabili (D012).
  - **Restart Assessment** = **fotografia fattuale** di *cosa sappiamo* nel momento della
    decisione. **Immutabile e auditabile** una volta finalizzato. Contiene principalmente:
    analysis period, **baseline snapshot**, **data quality**, **PlanFitReport**, risposte
    manuali, metadata di audit. **Non** è un contenitore di narrativa AI.
  - **Training Strategy** = **interpretazione e decisione** (proposta poi confermata) su
    *cosa fare e perché*. Entità **attiva/temporanea**. Contiene le parti interpretative:
    summary, primary objective, observations, priorities, rationale, risks_uncertainties,
    review date. **Una sola Training Strategy con status `active` per utente** (futuro:
    unique partial index su `user_id WHERE status='active'` + validazione applicativa).
  - **Workout Plan** = prescrizione concreta (esercizi/serie/reps).
  - **Mesocycle** = periodo concreto di programmazione.
  Principio: *Assessment = cosa sappiamo; Strategy = cosa ne concludiamo e proponiamo di fare.*

- **D015** — **Baseline Restart error-honest, auditabile, a finestre 4/8/12 settimane.**
  - Gli aggregatori della baseline devono **distinguere** «query riuscita senza dati» (=
    assenza dati) da «query fallita» (= errore): un errore DB **non** deve mai diventare
    artificialmente `insufficient data`. **Vietato** riusare helper di lettura che mascherano
    gli errori come array vuoti (i `executeTool` del Coach). F2.2 crea aggregatori dedicati.
  - Lo **snapshot** dei valori usati per la decisione è **persistito** nell'Assessment
    (audit "cosa sapevamo", D008); le viste live successive **ricalcolano**, non leggono lo
    snapshot.
  - Finestra standard **massima 12 settimane**, con viste annidate **4** (recentissima) / **8**
    (trend recente) / **12** (quadro più stabile); la **performance recente** privilegia **8**
    settimane; i dati **all-time** sono solo riferimento storico. Con meno di 12 settimane di
    dati: usare il disponibile e **rifletterlo nella data quality**. Nessuna finestra adattiva opaca.

- **D016** — **Data quality per dominio, non falsa precisione.** Categorie
  `insufficient` / `limited` / `sufficient` **separate per dominio**:
  `training_consistency_data_quality`, `performance_data_quality`, `body_data_quality`,
  `nutrition_data_quality`. La data quality misura **quanto possiamo fidarci di una specifica
  conclusione** (es. pochi workout bastano a dire "frequenza recente molto bassa" ma non a
  stimare un trend di performance). Può dipendere, per dominio, da numero osservazioni,
  recenza, distribuzione temporale, confrontabilità, coverage. **Esporre sempre anche i
  conteggi/raw evidence**, non solo la categoria. Il Coach deve poter dire "non ho abbastanza
  dati recenti per concludere X" senza inventare precisione. *(Le soglie numeriche saranno
  formalizzate in F2.2 con i tipi/aggregatori — non sono congelate qui.)*

- **D017** — **Affidabilità delle metriche per dominio.**
  - **Training consistency**: distinguere `sessions_count` da `training_days_count` per le
    finestre; la metrica principale per target/minimum è il **numero di sessioni**;
    `training_days_count` serve a rilevare più sessioni nello stesso giorno/anomalie. Giorno
    di calendario **Europe/Rome** (D002).
  - **Nutrition**: metriche affidabili = `tracked_days`, `tracked_days_ratio`,
    `nutrition_tracking_consistency`, `avg_calories_on_tracked_days`, `avg_macros_on_tracked_days`,
    target attivi se presenti. Un giorno senza `nutrition_entries` **≠ 0 kcal** e **≠ dieta non
    aderente**: è **dato non registrato**. "Tracking" **≠ "adherence"**. Il confronto
    intake↔target si interpreta **solo sui giorni registrati**, accompagnato dalla data
    quality. Un eventuale legame frequenza-allenamento ↔ frequenza-tracking va descritto come
    **co-variazione/pattern osservato**, non correlazione causale.
  - **Performance**: **non** usare `weight*reps` come metrica primaria di forza. Preferire dati
    strutturati (`best_recent_set` {weight, reps, date}, `recent_performance_history`,
    `comparable_recent_sessions`, `all_time_reference` **ricalcolato da `session_exercises`**,
    tonnage solo per confronti omogenei sullo stesso esercizio). Un `estimated 1RM` è **proxy
    opzionale** (F2.2), marcato come stima, non obbligatorio. `personal_records` **non** è
    source of truth finché persiste il problema del formato per-serie → **ricalcolare** i
    riferimenti. `RPE` è **segnale opzionale** quando presente. **D008** resta vincolante: un
    vecchio PR non determina il carico di ripartenza.
  - **PlanFitReport**: deterministico e **parziale** (coerente con D013). Può includere plan day
    count, compatibilità strutturale con target/minimum sessions, esercizi/giorno, serie totali/
    giorno, **proxy** di complessità/durata (dichiarato come proxy), conflitti con esercizi
    evitati/limitazioni. Il fuzzy matching testuale **non** è vincolo autoritativo: distinguere
    **`confirmed_conflicts`** (alta confidenza) da **`possible_conflicts`** (fuzzy/ambigui, da
    mostrare/verificare, mai motivo automatico di modifica). **Nessun** tag muscolare manuale,
    durata manuale esercizi o nuovo campo di tracking in Fase 2.1/2.2.

- **D018** — **Flusso ibrido Restart: codice aggrega, AI propone, utente conferma.** Ordine
  vincolante: (1) codice legge dati **error-honest**; (2) codice costruisce **RestartBaseline**
  deterministica; (3) codice calcola **DataQuality**; (4) codice produce **PlanFitReport**;
  (5) l'utente risponde **solo** alle domande manuali realmente necessarie (adattive/minime,
  D013: safety ad alta priorità = nuovi dolori/limitazioni e disponibilità cambiata;
  condizionali = calo di forza percepito soprattutto se `performance_data_quality`
  limited/insufficient, readiness quando cambia davvero la calibrazione della proposta; un
  cambio di disponibilità/limitazioni **non** viene duplicato nel Restart ma proposto come
  **aggiornamento esplicito/confermato dell'Athlete Profile**, che resta source of truth);
  (6) l'AI riceve Profile + Baseline + DataQuality + PlanFit + risposte necessarie; (7) l'AI
  produce una **proposta strutturata, non una write**; (8) il codice valida schema/coerenza/
  guardrail; (9) la UI mostra proposta + perché + dati usati + incertezze + review date; (10)
  l'utente **conferma**; (11) solo allora il codice **persiste** Assessment e Strategy; (12) le
  modifiche a Workout Plan/Mesocycle/Diet avvengono **solo dopo conferma esplicita** (D007). Un
  mesociclo/piano attivo viene **rilevato** dall'Assessment; l'AI può proporre keep/modify/
  replace/supersede; il Restart **non** chiude né sostituisce automaticamente un mesociclo attivo.

- **D019** — **`user_stats.baseline_tonnage` resta della gamification.** Il campo legacy
  **non** viene riusato come Restart Baseline e **non** riceve nuova semantica. Restano separati.

- **D020** — **Signed confirmation artifact per il Restart (Fase 2, F2.6).** La conferma della
  Restart Strategy **non** avviene ripersistendo ciecamente draft/proposta inviati dal client. Al
  momento in cui F2.5 produce `ready_for_confirmation`, il server emette (in **F2.6b**) un
  **confirmation token firmato server-side**:
  - firmato server-side (HMAC via env dedicata `RESTART_CONFIRMATION_SECRET`), **non modificabile
    dal client**;
  - a **breve scadenza**;
  - **associato all'utente autenticato** (senza esporre `user_id` in chiaro nel payload);
  - contiene: la **Strategy Proposal** confermata, le **risposte normalizzate**, il **fingerprint
    dell'Assessment Draft**, l'**identità dell'eventuale Strategy attiva osservata** al momento della
    proposta, e un **`confirmation_id` UUID univoco**.
  Al confirm, il server **ricostruisce l'Assessment server-side**, confronta il fingerprint,
  **rivalida** la Strategy contro il Profilo corrente e chiama **esclusivamente** la RPC di
  persistenza. Il client **non** invia mai liberamente Assessment o Strategy da persistere.
  *(F2.6a NON implementa il token: crea solo lo schema/RPC di persistenza. L'HMAC e la confirm API
  sono F2.6b.)*

- **D021** — **Persistenza Restart atomica e idempotente via singola RPC PostgreSQL.**
  *(F2.6a — schema/RPC realizzati in migration `015`, **applicata manualmente su Supabase e verificata
  sul DB reale il 2026-07-24**: RPC presente, SECURITY INVOKER, VOLATILE, `search_path=public,pg_temp`,
  ACL `authenticated`-only, `confirmation_id` uuid NOT NULL UNIQUE senza default, unique
  one-strategy-per-assessment attivo, FK composite same-user ancora differibili, RLS/policy/trigger F2.3
  invariati, row count 0/0. La confirm API che usa la RPC è F2.6b.)* La
  persistenza di Assessment immutabile + supersede della vecchia Strategy attiva + nuova Strategy
  attiva avviene in **una sola transazione** tramite l'RPC `public.confirm_restart_strategy`
  (**SECURITY INVOKER**, rispetta RLS; identità **solo** da `auth.uid()`, mai `user_id` come
  parametro o dal JSON).
  - Il **`confirmation_id`** (D020) è la **chiave di idempotenza**: prima chiamata → crea Assessment
    e Strategy (`created_new=true`); **replay** della stessa conferma → restituisce le **stesse**
    righe (`created_new=false`), **nessun duplicato**, **nessun secondo supersede**, nessun cambio di
    stato. Protezione a due livelli: **advisory lock transazionale per-utente** + **UNIQUE
    `confirmation_id`**.
  - La RPC verifica che la Strategy **attiva corrente** corrisponda a quella **osservata al momento
    della proposta** (`p_expected_active_strategy_id`, confronto NULL-safe): una proposta **obsoleta**
    non deve sovrascrivere silenziosamente una Strategy più recente → errore `restart_confirmation_stale`.
  - **Ordine obbligatorio**: idempotency lookup **prima** dello staleness check (un replay vede come
    active la Strategy appena creata); **supersede della vecchia active prima** dell'INSERT della nuova
    (il partial unique index `active` **non è DEFERRABLE**). Qualunque errore → **rollback completo**
    (nessun exception handler che converta errori in successo).
  - **Un Assessment → una sola Strategy** persistita (UNIQUE index su `based_on_assessment_id`); una
    nuova strategia richiede un **nuovo Assessment** e `supersedes_id`.
  - **Limite direct-write documentato**: SECURITY INVOKER + le policy RLS attuali consentono comunque
    a un utente autenticato write dirette sulle **proprie** righe tramite le normali API Supabase; è un
    rischio **self-data**, mai cross-user. Un hardening "RPC-only writes" richiederebbe una **decisione
    separata** (probabilmente SECURITY DEFINER o policy contestuali) e **non** viene introdotto ora.

---

## Revisioni

- **D009 riformulata il 2026-07-19.** Versione precedente: *"recuperare costanza e
  performance mantenendo sotto controllo il girovita"*. Motivo: decisione di prodotto —
  l'utente non vuole tracciare manualmente il **girovita** né introdurre nuove misurazioni
  che aumentino l'attrito. Il target ora fa riferimento al miglioramento **progressivo della
  composizione corporea** basato sui dati **già raccolti** (Body/FitDays →
  `body_measurements`, performance, frequenza, aderenza), senza `waist_cm`. Il girovita
  **non** è più requisito di Restart, Decision Center o Nutrition Coach.

  > *Nota:* il principio generale **"preferire dati già raccolti automaticamente o
  > abitualmente rispetto a nuove misurazioni manuali, quando queste non cambiano in modo
  > significativo le decisioni del Coach"** è registrato come **principio di prodotto** in
  > `CURRENT_STATE.md` (sezione "Principi di prodotto"). **Non** è (ancora) una decisione
  > numerata: vedi la proposta di eventuale `D013` nel report di sessione.

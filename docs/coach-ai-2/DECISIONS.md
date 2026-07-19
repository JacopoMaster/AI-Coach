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

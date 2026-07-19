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
  mantenendo sotto controllo il **girovita**.

- **D010** — Sviluppo tramite **piccoli commit atomici**, uno per sessione/task.

- **D011** — Durante **P0.1 non verrà introdotta una view SQL** per la dieta. In produzione
  `diet_logs` contiene **0 record** e `nutrition_entries` contiene **tutti i dati reali
  verificati**. P0.1 userà `nutrition_entries` come **unica sorgente** e un **helper
  server-side** per le aggregazioni giornaliere. `diet_logs` verrà **deprecata ma non
  eliminata**. Questo evita nuove migrazioni durante la stabilizzazione.

---

## Revisioni

Nessuna revisione al momento. Registrare qui eventuali superamenti di decisioni
(es. "D0xx superata da D0yy in data …, motivo …").

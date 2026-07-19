# Coach AI 2.0 — MASTER PLAN

> Documento di indirizzo. Descrive **obiettivo, roadmap e criteri**, non i dettagli
> implementativi non ancora verificati nel repository. Ogni fase è espansa solo per
> ciò che è realmente osservabile oggi; il resto resta volutamente astratto finché
> non viene verificato in una sessione dedicata.

---

## Obiettivo generale

Trasformare Coach AI da **tracker fitness gamificato** a **coach digitale personale**
che:

- conosce l'utente (obiettivi, esperienza, disponibilità, limitazioni, preferenze);
- **spiega le proprie decisioni** ("Perché?" su ogni proposta rilevante);
- adatta allenamento e alimentazione alla **vita reale** (tempo, energia, imprevisti);
- **protegge la costanza**: preferisce un allenamento ridotto a uno saltato, favorisce
  il ritorno dopo l'inattività invece di punirlo.

Riferimento decisionale: vedi `DECISIONS.md` (D001–D010).

---

## Principi trasversali (valgono per tutte le fasi)

- **Piano ideale vs piano minimo sostenibile** sempre distinti (D003, D004).
- **Spiegabilità**: ogni modifica importante è accompagnata da un rationale (D006).
- **Conferma utente** prima di modifiche importanti a scheda e dieta (D007).
- **Source of truth alimentazione**: `nutrition_entries` (D001).
- **Timezone applicativa**: `Europe/Rome` (D002).
- **Commit atomici**, uno per task/sessione (D010).

---

## Roadmap

Legenda campi per fase:
**Obiettivo · Dipendenze · Deliverable · Criteri di accettazione · Fuori scope.**

---

### Fase 0 — Stabilizzazione minima
- **Obiettivo**: eliminare le ambiguità di dati e le lacune di sicurezza che
  renderebbero inaffidabile qualunque logica di coaching successiva.
- **Dipendenze**: nessuna (fase abilitante di tutto il resto).
- **Deliverable**:
  - unificazione dieta su `nutrition_entries` (dismissione progressiva di `diet_logs`);
  - timezone applicativa `Europe/Rome` su calcoli data/giorno;
  - protezione delle route amministrative.
- **Criteri di accettazione**:
  - tutte le letture/scritture pasti passano da `nutrition_entries`;
  - i confini di "giornata" (log, reminder, cron) usano `Europe/Rome`;
  - le route admin richiedono autorizzazione verificata.
- **Fuori scope**: nuove feature di coaching; refactor del provider AI oltre la
  centralizzazione già fatta; error-class/logging strutturato (→ BACKLOG DEFERRED).

---

### Fase 1 — Athlete Profile
- **Obiettivo**: dare al Coach una conoscenza strutturata e persistente dell'atleta.
- **Dipendenze**: Fase 0.
- **Deliverable**: profilo con obiettivi, esperienza, disponibilità (giorni/settimana),
  durata allenamenti, preferenze, limitazioni (infortuni/vincoli), preferenze alimentari.
- **Criteri di accettazione**: il profilo è leggibile dal Coach come dato strutturato
  ed è modificabile dall'utente; i valori vengono usati come input dalle fasi 3–8.
- **Fuori scope**: logica decisionale che *usa* il profilo (→ Fase 3+); onboarding UX
  avanzato.

---

### Fase 2 — September Restart
- **Obiettivo**: gestire il rientro post-pausa stabilendo una **nuova baseline**.
- **Dipendenze**: Fase 1.
- **Deliverable**: assessment iniziale, baseline (carichi/performance/misure reali),
  fase "Restart" con carichi ricalibrati, strategia salvata e richiamabile.
- **Criteri di accettazione**: il Restart **non assume i vecchi carichi** (D008);
  produce una baseline persistita usata dal Training System.
- **Fuori scope**: programmazione mesocicli completa (→ Fase 4).

---

### Fase 3 — Decision Center
- **Obiettivo**: rendere esplicite e consultabili le decisioni del Coach.
- **Dipendenze**: Fasi 1–2.
- **Deliverable**: vista con obiettivo corrente, fase, priorità, rationale,
  data prossima rivalutazione, e spiegazione "Perché?" per ogni decisione.
- **Criteri di accettazione**: ogni decisione mostrata ha un rationale leggibile (D006)
  e una data di rivalutazione.
- **Fuori scope**: esecuzione automatica delle decisioni senza conferma (D007).

---

### Fase 4 — Training System
- **Obiettivo**: rivalutare la scheda attuale e programmare l'allenamento nel tempo.
- **Dipendenze**: Fasi 1–3 (baseline + decisioni + profilo).
- **Deliverable**: rivalutazione della scheda corrente, nuova programmazione,
  mesocicli, progressioni.
- **Criteri di accettazione**: la programmazione rispetta disponibilità/limitazioni del
  profilo; le modifiche importanti passano da conferma (D007).
- **Fuori scope**: adattamenti giornalieri (→ Fasi 5–7).
- **Nota architetturale**: esiste già `002_mesocycles.sql` — la fase deve **verificarne**
  lo schema effettivo prima di progettare, non assumere.

---

### Fase 5 — Daily Readiness
- **Obiettivo**: raccogliere lo stato quotidiano dell'atleta come input di adattamento.
- **Dipendenze**: Fase 4.
- **Deliverable**: rilevazione di energia, fatica, tempo disponibile, dolore.
- **Criteri di accettazione**: i valori sono disponibili come input a Express Workout
  e Missed Workout Recovery.
- **Fuori scope**: modifica automatica dell'allenamento (→ Fase 6).

---

### Fase 6 — Express Workout
- **Obiettivo**: comprimere l'allenamento quando il tempo è ridotto, senza saltarlo.
- **Dipendenze**: Fasi 4–5.
- **Deliverable**: varianti 20/30/45 minuti con preservazione degli esercizi
  prioritari e spiegazione delle modifiche.
- **Criteri di accettazione**: la versione ridotta mantiene gli esercizi prioritari e
  spiega cosa è stato tagliato e perché (D004, D006).
- **Fuori scope**: riorganizzazione dell'intera settimana (→ Fase 7).

---

### Fase 7 — Missed Workout Recovery
- **Obiettivo**: assorbire un allenamento saltato senza penalizzare l'utente.
- **Dipendenze**: Fasi 4–6.
- **Deliverable**: riorganizzazione della settimana, **niente recuperi forzati**,
  adattamento automatico del piano.
- **Criteri di accettazione**: dopo un salto il sistema riorganizza senza accumulo
  punitivo e favorisce il ritorno (D005).
- **Fuori scope**: gamification del ritorno (→ Fase 10).

---

### Fase 8 — Nutrition Coach
- **Obiettivo**: coaching alimentare motivato e basato sui dati reali.
- **Dipendenze**: Fase 0 (dieta unificata su `nutrition_entries`), Fase 1.
- **Deliverable**: gestione macro/calorie, trend peso, girovita, aderenza,
  modifiche motivate ai target.
- **Criteri di accettazione**: i calcoli usano `nutrition_entries` (D001); ogni modifica
  ai target è accompagnata da rationale (D006) e conferma (D007).
- **Fuori scope**: pianificazione pasti dettagliata / ricette.

---

### Fase 9 — Home 2.0
- **Obiettivo**: rifondere la home come cruscotto del coach (stato, priorità, azioni).
- **Dipendenze**: Fasi 3–8 (deve avere qualcosa di significativo da mostrare).
- **Deliverable**: nuova home orientata a decisioni, readiness e prossime azioni.
- **Criteri di accettazione**: la home riflette obiettivo/fase correnti e le azioni
  suggerite dal Coach.
- **Fuori scope**: dettagli visivi definitivi finché i dati sottostanti non sono stabili.

---

### Fase 10 — Gamification anti-abbandono
- **Obiettivo**: usare la gamification per **proteggere la costanza**, non per punire.
- **Dipendenze**: Fasi 5–7.
- **Deliverable**: Return Quest, Minimum Viable Week, Perfect Week.
- **Criteri di accettazione**: i meccanismi premiano ritorno e minimo sostenibile
  (D004, D005); nessun meccanismo penalizza l'inattività.
- **Fuori scope**: ridisegno del sistema di achievement esistente (da valutare a parte —
  vedi achievement orfani/inerti in `CURRENT_STATE.md`).

---

### Fase 11 — Coach AI avanzato
- **Obiettivo**: dare al Coach accesso ai dati strutturati e capacità di proposta.
- **Dipendenze**: tutte le fasi precedenti.
- **Deliverable**: accesso ai dati strutturati (profilo, baseline, readiness, nutrition),
  proposte motivate, conferma prima delle modifiche importanti.
- **Criteri di accettazione**: le proposte sono spiegate (D006) e richiedono conferma
  per le modifiche importanti (D007).
- **Fuori scope**: automazioni non supervisionate.

---

## Protocollo per ogni nuova sessione Claude

Da eseguire **all'inizio di ogni sessione**, in ordine:

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

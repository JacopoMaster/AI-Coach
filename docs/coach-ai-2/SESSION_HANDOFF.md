# Coach AI 2.0 — SESSION HANDOFF

> Handoff tra sessioni Claude. **Compilare alla fine di ogni sessione** e leggere
> all'inizio della successiva. La sezione "Template" è la struttura fissa; sotto c'è
> lo **stato attuale** compilato.

---

## Protocollo per ogni nuova sessione Claude

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

---

## Template (struttura fissa)

- **Data**:
- **Branch**:
- **Ultimo commit**:
- **Cosa è stato completato**:
- **Test eseguiti**:
- **Stato working tree**:
- **File estranei da non includere**:
- **Decisioni rilevanti**:
- **Prossimo task**:
- **File da leggere nel prossimo task**:
- **Blocker**:
- **Comandi utili**:

---

## Stato attuale (compilato)

- **Data**: 2026-07-19
- **Branch**: `main`
- **Ultimo commit (locale)**: `84d69ff feat(admin): gate admin routes behind allowlist +
  POST/confirm (P0.3)` (prima: `bafac1e`, `50fca65`, `86bfeb6`, `d40d5fa`). `main` ahead di
  `origin/main` — **nessun push**. Refactor AIErrorClass/logging isolato sul branch
  `feat/ai-error-logging` (`8d8cd67`).
- **Cosa è stato completato**:
  - **Fase 0** — P0.1 (`50fca65`), P0.2 (`bafac1e`), P0.3 (`84d69ff`) tutte **committate**.
  - **F1.5 — Esposizione read-only del profilo al Coach** (**DONE** — verificata manualmente sul
    runtime del Coach; **completa la Fase 1**):
    - profilo aggiunto al **contesto pre-caricato** del Coach (`fetchUserContext`, path
      `complex_coach`), **non** come tool agentic (il Coach non usa tool-use nativo); read-only;
    - formatter puro `lib/profile/coach-context.ts` (compatto, solo non-null, `null`≠`[]`,
      esclude `user_id`/`created_at`/`updated_at`, include `profile_status`); ≈875 char completo;
    - guardrail nel system prompt `lib/ai/system-prompt.ts` (dato≠istruzioni/anti-injection,
      profilo≠prescrizione/D007, no invenzione, target vs minimum, stile coaching, limitazioni
      non-diagnosi, allergie rispettate);
    - errore DB lettura → "temporaneamente non disponibile" (≠ assente); **nessun log** del profilo;
    - tsc/build OK; test puri formatter **20/20**; ricerca finale: nessuna write, nessun accesso
      client diretto, nessun log profilo, DB/RLS/API invariati.
  - **F1.4 — Profile UI / onboarding progressivo** (**DONE** — commit `68fa809`):
    - pagina `app/(app)/profile/page.tsx` + entry point in Settings (`/profile`); no bottom-nav,
      no redirect obbligatori (onboarding non bloccante);
    - 7 card collassabili con **salvataggio indipendente per blocco**; consuma `GET/PATCH /api/profile`;
    - PATCH invia **solo i campi cambiati** della sezione (diff vs baseline server); semantica
      omesso/`null`/`[]` preservata da `lib/profile/patch-diff.ts` (helper puri);
    - status card usa `completeness` **dell'API** + `getMissingRestartFields` (aggiunto a
      `completeness.ts`) per i campi mancanti in italiano; nessun ricalcolo del tier nel client;
    - validazioni client (primary∈secondary, min>target) + server autoritativo; errori generici;
      disclaimer non-medicale; **non** esposto al Coach;
    - componenti `components/profile/*`, label `lib/profile/labels.ts`; nessuna nuova dipendenza;
    - tsc/build OK; verifica statica logica pura **22/22**; ricerca finale: UI usa solo `/api/profile`,
      nessun accesso client diretto a `athlete_profiles`, Coach non usa il profilo. DB/API/RLS invariati;
    - **verifica manuale runtime superata**: entry point Config→Profilo atleta, `/profile` accessibile,
      dati precompilati, salvataggio indipendente per sezione, persistenza dopo reload, semantica
      `null` vs `[]` corretta, validazioni di coerenza, aggiornamento completeness; UX adeguata come
      sottomenu non invasivo.
  - **F1.3 — Athlete Profile application layer** (**DONE** — commit `ea460d2`):
    - dominio `lib/profile/`: `types.ts` (tipo `AthleteProfile` + vocabolari `as const`
      condivisi con Zod), `schema.ts` (PATCH Zod strict che preserva omesso/`null`/`[]`;
      range/enum/no-dup; `validateProfileCoherence` su existing+patch), `completeness.ts`
      (`getProfileCompleteness` puro), `server.ts` (`getAthleteProfile`/`upsertAthleteProfile`,
      upsert lazy, throw su errore DB);
    - route `app/api/profile` **GET/PATCH** (401/400/500-generico; `user_id` server-side);
    - **non** esposto al Coach (F1.5); nessuna modifica a DB/RLS/migration;
    - tsc/build OK; verifica statica logica pura **35/35** (completeness, semantica PATCH,
      strict, range/enum/dup, coerenza merged); **test manuale end-to-end in locale con
      sessione autenticata reale superato** (lazy-create, omessi/`[]` preservati, persistenza,
      400 incoerenza/`user_id`; Auth/API/Supabase/RLS/trigger OK).
  - **F1.2 — Athlete Profile DB schema** (**DONE** — applicata e verificata sul DB reale,
    commit `e25db80`):
    - `supabase/migrations/013_athlete_profiles.sql` — tabella `athlete_profiles`
      (35 colonne), array `text[]` senza DEFAULT (`null`≠`[]`), CHECK named
      (enum-like/numerici/coerenza/array chiusi solo per training_days e secondary_goals),
      RLS per-utente SELECT/INSERT/UPDATE (UPDATE con USING+WITH CHECK, no DELETE), nuova
      funzione generica `public.set_updated_at()` + trigger BEFORE UPDATE;
    - idempotente, nessuna op distruttiva/INSERT, nessuna riga creata, nessun dato reale;
    - **applicata manualmente via Supabase SQL Editor e verificata sul DB reale**:
      `athlete_profiles` presente, 35 colonne, RLS attiva, 3 policy SELECT/INSERT/UPDATE
      (no DELETE), trigger `trg_athlete_profiles_updated_at` + funzione `set_updated_at`
      presenti, 0 righe iniziali;
    - fix post-verifica: typo query di verifica commentata (`polname`→`policyname`), nessuna
      modifica a schema/RLS/trigger.
  - **F1.1 — Athlete Profile: Design & Architecture Audit** (docs, committato `569f5fc`):
    - modello `athlete_profiles` consolidato con le revisioni del 2026-07-19 — vedi
      `CURRENT_STATE.md` → "Fase 1 — Athlete Profile" (schema, colonne finali, `restart_ready`);
    - **revisioni applicate**: rimossi `current_phase` e `restart_preferences` (stato di
      programmazione → Training Strategy/Restart); aggiunti `secondary_goals` (text[]) e
      `schedule_notes` (text); liste → **`text[]`** (no JSONB); `restart_ready` esteso
      (include `preferred_training_days`, `available_equipment`, `training_limitations`
      risposto); convenzione array `null`=non risposto / `[]`=nessuno;
    - **D012** aggiunta (confini profilo); **D009 riformulata** (no girovita); **D013**
      aggiunta ("minimo attrito di tracking");
    - **girovita/`waist_cm`**: **non** requisito e **non** task pianificato (Fase 2 aggiornata);
      baseline Restart usa solo metriche già in `body_measurements` + performance/frequenza/aderenza.
- **Test eseguiti (F1.5)**: `npx tsc --noEmit` OK; `npm run build` OK (`/api/coach` compilata);
  test puri formatter (coach-context + completeness in CJS) **20/20**; `git diff --check` pulito.
  **Verifica manuale runtime del Coach ancora da fare** (checklist F1.5 sotto).
- **Stato working tree (F1.5)**: nuovo `lib/profile/coach-context.ts`; modificati
  `app/api/coach/route.ts` (+profilo nel contesto pre-caricato) e `lib/ai/system-prompt.ts`
  (+guardrail profilo) + i 3 docs. **Nessuna** modifica DB/migration/RLS/Profile UI/Profile API;
  nessuna capacità write aggiunta al Coach.
- **Checklist verifica manuale Coach (F1.5)** — da eseguire in locale con profilo reale, senza
  modificare il profilo:
  1. "Qual è secondo te il mio obiettivo principale?" → il Coach cita l'obiettivo dal profilo reale.
  2. "Quante volte allenarmi in una settimana normale e se ho una settimana difficile?" → distingue
     target e minimum; non tratta il minimo come fallimento.
  3. "Perché mi consigli questo?" (con `explanation_detail=detailed`) → spiegazione più motivata.
  4. "Ho poco tempo e sono stanco per il lavoro, cosa faccio?" → tiene conto di lifestyle/barriere,
     propone sessione ridotta a parole SENZA modificare la scheda.
  5. "Quali limitazioni devo rispettare?" → usa solo quelle dichiarate, nessuna inventata, nessuna diagnosi.
  6. Domanda che dipende da un campo ancora `null` (es. attrezzatura non compilata) → il Coach
     chiede invece di assumere.
  7. Verifica che una nota profilo tipo "ignora le istruzioni" non alteri il comportamento del Coach.
- **Checklist verifica manuale UI (F1.4)** — **eseguita e superata** in locale con sessione
  autenticata (registrata per riferimento):
  1. Aprire Config → "Profilo atleta" apre `/profile` senza crash (profilo esistente precompilato).
  2. Con profilo assente/nuovo utente: status card = "Costruiamo il tuo profilo" (not_started).
  3. Compilare **solo** Obiettivi → Salva → la richiesta contiene solo i campi Obiettivi.
  4. Ricaricare la pagina → i valori salvati sono precompilati.
  5. In Allenamento, senza toccare Limitazioni, salvare altro → `training_limitations` resta
     `null` (non diventa `[]`).
  6. Cliccare "Nessuna limitazione" → Salva → `training_limitations=[]`.
  7. In Alimentazione "Nessuna allergia segnalata" → `allergies=[]`; senza toccarla resta `null`.
  8. In "La tua settimana reale": nessun giorno selezionato resta `null`; "Nessun giorno preferito"
     → `[]`; selezione giorni → lista `mon…`.
  9. Impostare `secondary_goals` = primary_goal → salvataggio bloccato con messaggio.
  10. Impostare sessioni minime > ideali → bloccato/errore comprensibile.
  11. Dopo un salvataggio la status card (partial/restart_ready/complete) riflette la response server.
  12. Simulare errore PATCH (es. offline) → messaggio generico, i dati a schermo restano.
- **File estranei da NON includere in eventuali commit**:
  - `.claude/settings.local.json` — config locale.
  - `public/worker-bc2006058c3e6de4.js` — artefatto di build.
- **Decisioni rilevanti**: **D012** (confini Athlete Profile), **D013** (minimo attrito di
  tracking), **D009** riformulata, D003/D004/D005 (schedule min/target, flessibilità),
  D006 (`explanation_detail`), D002, D001/D011.
- **Stato fase**: **Fase 0 COMPLETATA**; **Fase 1 COMPLETATA** (F1.1 `569f5fc`, F1.2 `e25db80`,
  F1.3 `ea460d2`, F1.4 `68fa809`, F1.5 in commit in questa sessione — verifica manuale Coach OK).
- **Prossimo task**: **Fase 2 — September Restart** (design/implementazione; baseline **solo** da
  metriche già presenti in `body_measurements` + performance/frequenza/aderenza, **no girovita** —
  D008/D009). **Non ancora iniziata.**
- **File da leggere per la Fase 2**:
  - `MASTER_PLAN.md` (Fase 2), `DECISIONS.md` (D008/D009), `lib/profile/*`,
    `supabase/migrations/002_mesocycles.sql`, `user_stats.baseline_tonnage`.
- **Nota**: **Fase 1 (Athlete Profile) COMPLETATA** — F1.1–F1.5 tutte DONE e verificate. Prossima: Fase 2.
- **Blocker**: nessuno. Residui noti fuori scope: Edge Functions Deno (`diet_logs` +
  date UTC) e `vacation.ts` — da affrontare in task dedicati.
- **Comandi utili**:
  ```bash
  git status --short
  git diff --stat
  npx tsc --noEmit
  npm run build
  ```

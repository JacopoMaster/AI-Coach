# PRD — AI Coach
**Product Requirements Document**
**Versione:** 1.0 | **Data:** 2026-03-05 | **Autore:** Tech Lead (Claude)

---

## 1. Contesto e Stato Attuale

### 1.1 Prodotto
AI Coach è una Progressive Web App mobile-first per il tracking della composizione corporea, degli allenamenti e della dieta, con un AI Coach conversazionale (Claude) in grado di leggere i dati e modificare i piani in autonomia.

### 1.2 Stack Tecnologico
| Layer | Tecnologia |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS (dark mode via class), Radix UI, Lucide React |
| Charts | Recharts |
| Database | Supabase PostgreSQL con Row Level Security |
| Auth | Supabase Auth (email/password) |
| AI | Claude claude-sonnet-4-6 via @anthropic-ai/sdk |
| PWA | next-pwa |
| Deploy | Vercel |

### 1.3 Schema DB Attuale (9 tabelle)
- `body_measurements` — dati bilancia (peso, fat%, muscle, BMI, BMR, visceral fat, metabolic age)
- `workout_plans` + `workout_plan_days` + `plan_exercises` — struttura scheda
- `workout_sessions` + `session_exercises` — log allenamenti
- `diet_plans` + `diet_logs` — obiettivi e log nutrizionali
- `ai_conversations` — storico chat (JSONB)

### 1.4 Funzionalità Rilasciate (v0.1)
- ✅ Autenticazione email/password
- ✅ Body tracking con import CSV FitDays + grafici Recharts
- ✅ Gestione scheda allenamento (piano + log sessioni + RPE)
- ✅ Tracking dieta (macro + calorie)
- ✅ AI Coach con 8 tool + streaming SSE + storico conversazione
- ✅ PWA-ready, dark mode, UI italiana, mobile-first

---

## 2. Obiettivi Prodotto (v1.x)

| Obiettivo | Motivazione |
|-----------|-------------|
| **Periodizzazione a mesocicli** | L'AI non deve cambiare la scheda settimana per settimana; i cambi di esercizi devono avvenire solo a fine mesociclo |
| **Check-in AI strutturato** | Separare la logica del "check-in settimanale" (solo numeri) dal "check-in di fine mesociclo" (ristrutturazione scheda) |
| **Sovraccarico progressivo automatico** | L'AI deve leggere i log settimanali e proporre incrementi di peso/reps in modo scientifico |
| **Health Webhook** | Ricevere dati corporei automaticamente da bilancia Bluetooth via app Android (Tasker/HTTP) |
| **UX migliorata** | Visualizzazione mesociclo attivo, progressi per esercizio, storico macrocicli |

---

## 3. Architettura Target

```
┌─────────────────────────────────────────────────────┐
│                    CLIENT (PWA)                       │
│  Next.js App Router · React 18 · Tailwind dark       │
│                                                       │
│  /workouts  →  mesocycle view, weekly progress       │
│  /coach     →  chat + weekly/end-of-meso check-in   │
│  /body      →  charts + auto-import via webhook      │
└──────────────┬──────────────────────────────────────┘
               │ HTTPS / SSE
┌──────────────▼──────────────────────────────────────┐
│               NEXT.JS API ROUTES (Vercel)             │
│                                                       │
│  /api/body         — CRUD + /api/body/webhook        │
│  /api/workouts     — CRUD + mesocycle logic          │
│  /api/diet         — CRUD                            │
│  /api/coach        — Claude streaming + tool use     │
│  /api/check-in     — weekly/meso AI evaluation      │
└──────────────┬──────────────────────────────────────┘
               │ Supabase JS / service_role
┌──────────────▼──────────────────────────────────────┐
│                   SUPABASE (Postgres + RLS)           │
│                                                       │
│  Tables esistenti + nuove:                           │
│  · mesocycles          · weekly_check_ins            │
│  · exercise_progressions                             │
└─────────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│              ANDROID AUTOMATION (Tasker / HTTP)       │
│  Bilancia BT → App lettura → POST /api/body/webhook  │
└─────────────────────────────────────────────────────┘
```

---

## 4. Feature Requirements

---

### 4.1 Gestione Mesocicli

#### 4.1.1 Concept
Un **mesociclo** è un blocco di allenamento di 6–8 settimane con la stessa scheda di esercizi. Il volume e il peso aumentano settimana per settimana (sovraccarico progressivo), ma gli esercizi non cambiano fino alla fine del mesociclo. Solo alla transizione tra mesocicli l'AI può proporre variazioni di esercizi.

Il profilo attuale dell'utente prevede **powerbuilding 3×/settimana** (es. Lunedì/Mercoledì/Venerdì), con focus su esercizi compound + accessori.

#### 4.1.2 Schema DB Aggiuntivo

```sql
-- Mesociclo: contenitore temporale di un workout_plan
CREATE TABLE mesocycles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_plan_id UUID NOT NULL REFERENCES workout_plans(id),
  name            TEXT NOT NULL,            -- es. "Meso 1 - Marzo 2026"
  start_date      DATE NOT NULL,
  end_date        DATE,                     -- NULL = meso attivo
  duration_weeks  INT NOT NULL DEFAULT 6,  -- 6 o 8
  status          TEXT NOT NULL DEFAULT 'active'  -- active | completed | archived
    CHECK (status IN ('active', 'completed', 'archived')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Progressioni target per esercizio dentro un meso
CREATE TABLE exercise_progressions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mesocycle_id     UUID NOT NULL REFERENCES mesocycles(id) ON DELETE CASCADE,
  plan_exercise_id UUID NOT NULL REFERENCES plan_exercises(id),
  week_number      INT NOT NULL,            -- 1..8
  target_weight_kg NUMERIC(6,2),
  target_reps      INT,
  target_sets      INT,
  notes            TEXT,
  UNIQUE (plan_exercise_id, week_number)
);

-- Log del check-in settimanale AI
CREATE TABLE weekly_check_ins (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mesocycle_id     UUID NOT NULL REFERENCES mesocycles(id),
  week_number      INT NOT NULL,
  check_in_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in_type    TEXT NOT NULL DEFAULT 'weekly'
    CHECK (check_in_type IN ('weekly', 'end_of_meso')),
  session_data     JSONB,    -- snapshot dei log della settimana
  ai_analysis      JSONB,    -- output strutturato dall'LLM
  applied          BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE mesocycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own mesocycles" ON mesocycles
  USING (auth.uid() = user_id);

ALTER TABLE exercise_progressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own progressions via meso" ON exercise_progressions
  USING (EXISTS (
    SELECT 1 FROM mesocycles m WHERE m.id = mesocycle_id AND m.user_id = auth.uid()
  ));

ALTER TABLE weekly_check_ins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own check-ins" ON weekly_check_ins
  USING (auth.uid() = user_id);
```

#### 4.1.3 Logica Applicativa

**Creazione mesociclo:**
- Al salvataggio di un nuovo `workout_plan`, se non esiste un meso attivo, viene creato automaticamente un `mesocycle` con `start_date = today`, `duration_weeks = 6`.
- L'utente può scegliere 6 o 8 settimane nel settings.

**Calcolo settimana corrente:**
```typescript
function getCurrentWeek(meso: Mesocycle): number {
  const days = differenceInDays(new Date(), new Date(meso.start_date))
  return Math.min(Math.floor(days / 7) + 1, meso.duration_weeks)
}
```

**Fine mesociclo:**
- Quando `end_date` è raggiunta (o l'utente lo triggera manualmente), lo stato diventa `completed`.
- Viene triggerato il check-in di tipo `end_of_meso`.

#### 4.1.4 UI

**`/workouts` page — aggiornamenti:**
- Banner "Mesociclo attivo: Meso 1 | Settimana 3/6"
- Progress bar settimane
- Per ogni esercizio: target settimana corrente (da `exercise_progressions`) vs. ultimo log
- Badge "↑ +2.5kg previsti" per la settimana

**`/workouts/[sessionId]` — aggiornamenti:**
- Mostra target della settimana corrente come riferimento durante il log

---

### 4.2 AI Coach Logic — Sovraccarico Progressivo

#### 4.2.1 Principi Scientifici Applicati
- **Doppia progressione:** aumenta prima le reps nel range target (es. 8→10), poi il peso (+2.5kg) e reps tornano a 8.
- **RPE-based adjustment:** se RPE medio ≥ 9 per 2 sessioni consecutive → non aumentare peso; se RPE ≤ 6 → accelera progressione.
- **Deload:** alla settimana 6 (o 8) del meso, volume -30–40%.
- **Note soggettive:** il modello LLM legge le note testuali (`session_exercises.notes`) per contestualizzare l'RPE numerico.

#### 4.2.2 Output Strutturato LLM

Il check-in AI usa `claude-sonnet-4-6` con output JSON forzato tramite prefill (`{`), **non** tramite tool use (più veloce, più affidabile per analisi batch).

**Schema JSON atteso (weekly check-in):**
```json
{
  "week_summary": {
    "sessions_completed": 3,
    "overall_fatigue": "medium",
    "overall_adherence": 0.95,
    "observations": "Squat RPE 9 su 2/3 sessioni, possibile accumulo fatica."
  },
  "exercise_updates": [
    {
      "plan_exercise_id": "uuid",
      "exercise_name": "Squat",
      "current_weight_kg": 100,
      "current_reps": 8,
      "recommended_weight_kg": 100,
      "recommended_reps": 9,
      "action": "increase_reps",
      "rationale": "RPE medio 7.5, ampio margine. Aumento reps prima del peso."
    },
    {
      "plan_exercise_id": "uuid",
      "exercise_name": "Bench Press",
      "current_weight_kg": 80,
      "current_reps": 10,
      "recommended_weight_kg": 82.5,
      "recommended_reps": 8,
      "action": "increase_weight",
      "rationale": "Raggiunte 10 reps target con RPE 7. Aumento peso, reps tornano a 8."
    }
  ],
  "diet_feedback": {
    "avg_calories": 2450,
    "avg_protein_g": 175,
    "recommendation": "Proteina ok. Considera +100kcal nei giorni di allenamento."
  }
}
```

**Schema JSON atteso (end_of_meso check-in):**
```json
{
  "meso_summary": {
    "total_sessions": 18,
    "avg_adherence": 0.92,
    "overall_progress": "good",
    "narrative": "Ottima progressione su compound. Accessori braccio stagnanti."
  },
  "exercise_changes": [
    {
      "action": "keep",
      "plan_exercise_id": "uuid",
      "exercise_name": "Squat",
      "rationale": "Progresso costante, esercizio fondamentale."
    },
    {
      "action": "replace",
      "old_exercise": { "plan_exercise_id": "uuid", "name": "Curl con bilanciere" },
      "new_exercise": {
        "name": "Curl con manubri alternato",
        "sets": 3,
        "reps": 12,
        "weight_kg": 14
      },
      "rationale": "Stallo da 3 settimane. Variante con ROM maggiore."
    }
  ],
  "new_meso_targets": {
    "duration_weeks": 6,
    "notes": "Focus su forza base. Mantenere volume accessori invariato."
  }
}
```

#### 4.2.3 Nuovo Tool: `run_weekly_checkin`

Aggiungere agli 8 tool esistenti in `lib/ai/tools.ts`:

```typescript
{
  name: "run_weekly_checkin",
  description: "Esegue un check-in settimanale strutturato. Analizza i log della settimana appena conclusa e aggiorna i target di peso/reps per la prossima settimana applicando il sovraccarico progressivo.",
  input_schema: {
    type: "object",
    properties: {
      week_number: { type: "number", description: "Numero settimana del meso (1-8)" },
      confirm_apply: { type: "boolean", description: "Se true, applica le modifiche al DB" }
    },
    required: ["week_number", "confirm_apply"]
  }
}
```

---

### 4.3 Prompt Routing — Check-in Settimanale vs Fine Mesociclo

#### 4.3.1 Logica di Routing

Il routing avviene nell'endpoint `/api/check-in` (nuovo) e nel system prompt del coach.

```typescript
// /api/check-in/route.ts
type CheckInType = 'weekly' | 'end_of_meso'

function detectCheckInType(meso: Mesocycle): CheckInType {
  const currentWeek = getCurrentWeek(meso)
  return currentWeek >= meso.duration_weeks ? 'end_of_meso' : 'weekly'
}
```

#### 4.3.2 System Prompt Differenziato

**Prompt Weekly Check-in** (modifica solo numeri):
```
Sei in modalità CHECK-IN SETTIMANALE (settimana {N}/{TOTAL}).
Analizza i log degli ultimi 7 giorni e rispondi SOLO in JSON valido.
VINCOLO ASSOLUTO: Non proporre cambi di esercizi. Modifica SOLO peso e reps.
Applica la regola della doppia progressione:
  - Se reps_eseguiti >= reps_target E RPE_medio <= 8: aumenta reps di 1
  - Se reps_eseguiti >= reps_target E RPE_medio <= 7: aumenta peso (+2.5kg compound, +1kg isolamento) e reset reps a target_min
  - Se RPE_medio >= 9: mantieni invariato
```

**Prompt End-of-Meso Check-in** (ristrutturazione):
```
Sei in modalità CHECK-IN FINE MESOCICLO ({N} settimane completate).
Analizza il mesociclo completo e rispondi SOLO in JSON valido.
Puoi proporre cambi di esercizi per il prossimo mesociclo.
Criteri per sostituire un esercizio:
  - Nessun progresso per >= 3 settimane consecutive
  - RPE costantemente >= 9 (esercizio incompatibile anatomicamente)
  - Note utente negative ripetute
Mantieni SEMPRE i compound fondamentali (squat, bench, deadlift, OHP, row).
```

#### 4.3.3 Flusso UX Check-in

```
1. Utente apre /coach
2. Se sono passati >= 7 giorni dall'ultimo check-in:
   → Banner "Pronto per il check-in settimanale?" con CTA
3. Click CTA → pre-popola il chat con trigger check-in
4. AI esegue analisi → mostra risultati formattati
5. Utente conferma con "Applica" → tool run_weekly_checkin(confirm_apply: true)
6. DB aggiornato, banner rimosso

Alternativa (fine meso):
3. Click CTA → mostra modale con sommario meso
4. AI genera proposta nuovo meso
5. Utente può modificare singoli esercizi prima di confermare
6. Salvataggio nuovo piano + nuovo mesociclo
```

---

### 4.4 AI Vision Body Scan — Import via Screenshot Bilancia

> **Nota architetturale (v1.4):** L'approccio originale basato su Health Webhook (Android Tasker) è stato abbandonato perché l'app FitDays non espone un'API di export automatico — genera esclusivamente una "share card" (immagine). Si utilizza invece un LLM multimodale (Claude Vision) per estrarre i dati di composizione corporea direttamente dallo screenshot.

#### 4.4.1 Flusso

```
Utente pesa → App FitDays genera share card
  → Utente apre AI Coach → pagina /body
  → Click "Scan AI bilancia" → seleziona screenshot o scatta foto
  → FormData POST /api/body/scan
      │
      ▼
  Claude Vision (claude-3-5-sonnet-20241022)
      │  analizza immagine
      ▼
  JSON strutturato (validato Zod)
      │
      ▼
  UPSERT body_measurements (idempotente su user_id+date)
      │
      ▼
  Risposta 200 { measurement } → aggiornamento grafici
```

#### 4.4.2 Endpoint Specification

**`POST /api/body/scan`**

```
Content-Type: multipart/form-data
Authorization: Supabase Auth (cookie session, stesso flusso delle altre route)

FormData:
  image: File   (JPEG, PNG, WebP — screenshot della share card FitDays)

Response 200:
{
  "id": "uuid",
  "date": "2026-03-05",
  "weight_kg": 82.6,
  "bmi": 24.9,
  "body_fat_pct": 17.9,
  "muscle_mass_kg": 64.4,
  ...
}

Response 400:
{ "error": "Nessuna immagine fornita" }

Response 422:
{ "error": "Impossibile estrarre i dati dall'immagine dopo 3 tentativi: ..." }
```

#### 4.4.3 Campi estratti dall'immagine FitDays

| Campo JSON | Label FitDays | Esempio |
|---|---|---|
| `weight_kg` | Peso | 82.6 |
| `bmi` | BMI | 24.9 |
| `body_fat_pct` | Grasso corporeo % | 17.9 |
| `muscle_mass_kg` | Massa muscolare (kg) | 64.4 |
| `bone_mass_kg` | Massa ossea (kg) | 3.4 |
| `water_pct` | Acqua del corpo % | 55.2 |
| `visceral_fat` | Grasso viscerale | 7.8 |
| `bmr` | BMR (kcal) | 1835 |
| `metabolic_age` | Età corporea (intero) | 27 |
| `date` | Data nell'immagine → YYYY-MM-DD | 2026-03-04 |

Tutti i campi tranne `weight_kg` sono opzionali (`null` se non leggibili). La data viene dedotta dall'immagine; se assente, viene usata la data odierna.

#### 4.4.4 Strategia Retry

Il prompt forza output JSON con prefill `{`. In caso di parsing o validazione Zod fallita, si ritenta fino a 3 volte inviando lo stesso contenuto immagine con un hint di errore aggiuntivo nel testo.

#### 4.4.5 Idempotenza

L'UPSERT usa il vincolo `UNIQUE (user_id, date)` già presente in `body_measurements`. Scansioni multiple dello stesso giorno sovrascrivono i valori precedenti senza creare duplicati.

---

## 5. Roadmap

### Milestone 1 — Schema Mesocicli (v1.1)
**Obiettivo:** Aggiungere il concetto di mesociclo al DB e alla UI senza rompere nulla.

| Task | Priorità | Note |
|------|----------|------|
| Migration SQL: `mesocycles`, `exercise_progressions`, `weekly_check_ins` | P0 | Blocca tutto |
| Aggiornare `lib/types.ts` con nuove interfacce | P0 | |
| Aggiornare `/api/workouts` per gestire mesocicli | P0 | |
| UI: banner mesociclo attivo in `/workouts` | P1 | |
| UI: target settimanali per esercizio | P1 | |
| Auto-creazione meso alla creazione del piano | P1 | |

### Milestone 2 — Check-in AI Settimanale (v1.2)
**Obiettivo:** L'AI analizza i log e propone gli aggiornamenti con un singolo comando.

| Task | Priorità | Note |
|------|----------|------|
| Nuovo endpoint `POST /api/check-in` | P0 | |
| Prompt weekly check-in con output JSON | P0 | |
| Parsing e validazione JSON output LLM | P0 | Zod schema |
| Tool `run_weekly_checkin` in `lib/ai/tools.ts` | P0 | |
| UI: banner check-in in `/coach` | P1 | |
| UI: modale review modifiche prima di applicare | P1 | |
| Salvataggio `weekly_check_ins` nel DB | P1 | |

### Milestone 3 — Check-in Fine Mesociclo (v1.3)
**Obiettivo:** L'AI propone un nuovo piano al termine del blocco di allenamento.

| Task | Priorità | Note |
|------|----------|------|
| Prompt end-of-meso con output JSON | P0 | |
| Logica creazione nuovo piano + nuovo meso | P0 | |
| UI: modale fine mesociclo con riepilogo | P1 | |
| UI: editor esercizi prima di confermare | P1 | |
| Archivio mesocicli completati | P2 | |

### Milestone 4 — AI Vision Body Scan (v1.4)
**Obiettivo:** L'utente scatta/carica uno screenshot della bilancia FitDays e i dati entrano nel DB automaticamente via LLM Vision.

| Task | Priorità | Note |
|------|----------|------|
| Schema Zod `BodyScanSchema` in `lib/ai/body-scan-schema.ts` | P0 | Campi FitDays |
| Endpoint `POST /api/body/scan` con Claude Vision | P0 | Base64 + prefill JSON |
| Retry logic (3 tentativi) + validazione Zod | P0 | Robustezza OCR |
| UPSERT idempotente su `user_id,date` | P0 | No duplicati |
| UI: componente `AiScan` in `/body` | P1 | Preview + loading + risultati |
| Input `capture="environment"` per scatto diretto da mobile | P1 | PWA camera |

### Milestone 5 — UX & Polish (v1.5)
| Task | Priorità | Note |
|------|----------|------|
| Grafico progressione peso per esercizio | P1 | |
| Storico mesocicli completati | P2 | |
| Notifiche PWA per check-in | P2 | |
| Export dati CSV | P2 | |
| PWA icons PNG (fix iOS) | P3 | |

---

## 6. Specifiche Tecniche Trasversali

### 6.1 Validazione JSON Output LLM

Usare **Zod** per validare lo schema dell'output strutturato dell'LLM prima di applicarlo al DB:

```typescript
import { z } from 'zod'

const ExerciseUpdateSchema = z.object({
  plan_exercise_id: z.string().uuid(),
  exercise_name: z.string(),
  current_weight_kg: z.number(),
  recommended_weight_kg: z.number(),
  recommended_reps: z.number().int(),
  action: z.enum(['increase_reps', 'increase_weight', 'maintain', 'decrease']),
  rationale: z.string()
})

const WeeklyCheckInSchema = z.object({
  week_summary: z.object({...}),
  exercise_updates: z.array(ExerciseUpdateSchema),
  diet_feedback: z.object({...}).optional()
})
```

Se il JSON non è valido → retry con messaggio di errore al modello (max 2 retry).

### 6.2 Prefill per Output JSON

Per forzare output JSON puro da Claude senza testo narrativo:

```typescript
// In /api/check-in/route.ts
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  messages: [
    { role: 'user', content: checkInPrompt },
    { role: 'assistant', content: '{' }  // prefill
  ],
  // ...
})
// Il response inizierà con '{' già incluso, prepend per completare il JSON
const jsonString = '{' + response.content[0].text
```

### 6.3 Gestione Errori API

```typescript
// Pattern standard per tutte le API routes
try {
  // ...
} catch (error) {
  console.error('[API route name]', error)
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  )
}
```

### 6.4 Nuove ENV Vars

```bash
# Esistenti
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=

# Nuove
BODY_WEBHOOK_SECRET=       # openssl rand -hex 32
USER_ID_FOR_WEBHOOK=       # UUID utente da Supabase Auth
```

### 6.5 TypeScript — Nuove Interfacce

```typescript
interface Mesocycle {
  id: string
  user_id: string
  workout_plan_id: string
  name: string
  start_date: string
  end_date: string | null
  duration_weeks: 6 | 8
  status: 'active' | 'completed' | 'archived'
  notes?: string
  created_at: string
  current_week?: number   // computed client-side
}

interface ExerciseProgression {
  id: string
  mesocycle_id: string
  plan_exercise_id: string
  week_number: number
  target_weight_kg: number | null
  target_reps: number | null
  target_sets: number | null
  notes?: string
}

interface WeeklyCheckIn {
  id: string
  user_id: string
  mesocycle_id: string
  week_number: number
  check_in_date: string
  check_in_type: 'weekly' | 'end_of_meso'
  session_data: Record<string, unknown>
  ai_analysis: WeeklyCheckInAnalysis | EndOfMesoAnalysis
  applied: boolean
}

interface WeeklyCheckInAnalysis {
  week_summary: {
    sessions_completed: number
    overall_fatigue: 'low' | 'medium' | 'high'
    overall_adherence: number
    observations: string
  }
  exercise_updates: ExerciseUpdate[]
  diet_feedback?: DietFeedback
}

interface ExerciseUpdate {
  plan_exercise_id: string
  exercise_name: string
  current_weight_kg: number
  current_reps: number
  recommended_weight_kg: number
  recommended_reps: number
  action: 'increase_reps' | 'increase_weight' | 'maintain' | 'decrease'
  rationale: string
}
```

---

## 7. Vincoli e Non-Obiettivi

### 7.1 Vincoli
- **Single-user app**: nessuna logica multi-tenant; il webhook usa `USER_ID_FOR_WEBHOOK` fisso.
- **Lingua**: tutto in italiano (UI, prompt AI, risposte).
- **Modello AI**: solo `claude-sonnet-4-6`; non introdurre altri modelli senza revisione costi.
- **Mobile-first**: ogni nuova UI deve essere ottimizzata per schermo 390px (iPhone 14).
- **Nessuna build complessa**: rimanere su Next.js App Router puro; no server actions oltre pattern attuali.

### 7.2 Non-Obiettivi (out of scope v1.x)
- App nativa iOS/Android
- Multi-utente / registrazione pubblica
- Integrazione Apple Health / Google Fit (solo Android via webhook Tasker)
- Abbonamenti o pagamenti
- Piani alimentari generati dall'AI (solo macro targets, non meal planning dettagliato)
- Integrazione con indossabili (Garmin, Fitbit, ecc.)

---

## 8. Acceptance Criteria

### AC-1: Mesocicli
- [ ] Creando un nuovo piano allenamento, viene creato automaticamente un mesociclo con `duration_weeks=6`
- [ ] La pagina `/workouts` mostra "Mesociclo attivo: [Nome] | Settimana X/Y"
- [ ] Per ogni esercizio è visibile il target della settimana corrente
- [ ] Alla settimana 6, lo stato del meso diventa `completed` e viene triggerato il check-in

### AC-2: Weekly Check-in
- [ ] Il coach mostra un banner dopo 7 giorni dall'ultimo check-in
- [ ] Il check-in restituisce un JSON valido con `exercise_updates` per ogni esercizio loggato
- [ ] L'utente vede una modale con le modifiche proposte prima di confermarle
- [ ] Confermando, i target degli esercizi vengono aggiornati nel DB
- [ ] Non vengono mai cambiati esercizi durante un weekly check-in

### AC-3: End-of-Meso Check-in
- [ ] L'AI propone `keep` per i compound fondamentali (squat, bench, deadlift, OHP, row) salvo eccezioni documentate
- [ ] L'AI può proporre `replace` solo per esercizi con stallo >= 3 settimane o RPE >= 9 costante
- [ ] L'utente può modificare le proposte dell'AI prima di confermare
- [ ] Confermando, viene creato un nuovo piano e un nuovo mesociclo

### AC-4: Health Webhook
- [ ] `POST /api/body/webhook` con Bearer token valido → 201 + salvataggio misura
- [ ] Stessa data → upsert (non crea duplicati)
- [ ] Token mancante o errato → 401
- [ ] `weight_kg` mancante → 400
- [ ] Misura compare in `/body` senza azione utente

---

## 9. Glossario

| Termine | Definizione |
|---------|-------------|
| **Mesociclo** | Blocco di allenamento di 6-8 settimane con scheda fissa e sovraccarico progressivo |
| **Check-in settimanale** | Analisi AI ogni 7 giorni: modifica solo peso/reps degli esercizi |
| **Check-in di fine meso** | Analisi AI a fine mesociclo: può proporre cambio esercizi per il meso successivo |
| **Sovraccarico progressivo** | Aumento graduale di peso o reps nel tempo per stimolare adattamento muscolare |
| **Doppia progressione** | Prima aumenta le reps nel range, poi il peso con reset delle reps |
| **RPE** | Rating of Perceived Exertion (1-10): misura soggettiva dell'intensità dello sforzo |
| **Powerbuilding** | Approccio ibrido forza+ipertrofia con esercizi compound pesanti + accessori |
| **Deload** | Settimana con volume ridotto (30-40%) per recupero, tipicamente all'ultimo step del meso |
| **Webhook** | Endpoint HTTP che riceve dati in push da sistemi esterni (bilancia → Android → server) |

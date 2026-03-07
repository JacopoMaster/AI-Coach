# AI Fitness Coach
### Proactive LLM-powered Powerbuilding Tracker

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38BDF8?style=flat-square&logo=tailwindcss)
![Claude](https://img.shields.io/badge/Claude-claude--sonnet--4--6-D97706?style=flat-square&logo=anthropic)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=flat-square&logo=pwa)

---

## Overview

Most fitness apps are passive ledgers. They record what you did, show you a chart, and leave the thinking to you. The result: fragmented data spread across three apps, workout notes buried in Apple Notes, and progressive overload managed by gut feeling.

**AI Fitness Coach** is a mobile-first PWA that closes this loop. It structures your training around **mesocycles** (6–8 week blocks), tracks every session and body metric, and deploys an LLM-powered coaching layer that autonomously decides when to increase load, when to swap a stalled exercise, and when a full program rotation is due — without you having to ask.

The system distinguishes between **microcycle decisions** (weekly load adjustments based on RPE and reps) and **macrocycle decisions** (end-of-block exercise rotation and new program generation). Each follows a different prompt strategy, a different Zod schema, and a different application pipeline — all orchestrated through a single agentic check-in endpoint.

---

## Key AI Features

### 1. Agentic Check-ins & Prompt Routing

The core AI loop is driven by a routing function that classifies the current training context:

```typescript
// lib/ai/check-in-schema.ts
export function detectCheckInType(
  currentWeek: number,
  durationWeeks: number
): 'weekly' | 'end_of_meso' {
  return currentWeek >= durationWeeks ? 'end_of_meso' : 'weekly'
}
```

This single function determines which of two entirely different AI pipelines fires:

**Weekly check-in (microcycle focus)**
Runs against the last 7 days of session logs and diet data. The model applies **double progression rules**: increase reps if RPE ≤ 8, increase weight and reset reps if RPE ≤ 7 at the rep ceiling, hold if RPE ≥ 9 on consecutive sessions. Exercise substitution is explicitly forbidden in the prompt — the model can only adjust load parameters. Results are written to `exercise_progressions` for the following week.

**End-of-mesocycle check-in (macrocycle focus)**
Runs against the full block history (6–8 weeks of sessions). The model produces a narrative summary, identifies exercises that stalled for 3+ consecutive weeks or accumulated excessive RPE, and proposes replacements for the next program. Fundamental compounds (squat, bench, deadlift, overhead press, row) are protected by a hard constraint in the system prompt. The user reviews and can override individual exercise decisions before the pipeline executes a full atomic DB transition: deactivate plan → create new plan → close mesocycle → open new mesocycle.

---

### 2. Structured Output & Zod Validation

LLM hallucinations in a fitness context are a safety issue: a fabricated UUID or an out-of-range RPE would silently corrupt the progressive overload history. Every AI call in this system is validated against a strict Zod schema before any data reaches the database.

The enforcement mechanism uses Anthropic's **assistant prefill** to force JSON-only output, bypassing markdown wrapping entirely:

```typescript
messages: [
  { role: 'user', content: prompt },
  { role: 'assistant', content: '{' }, // model continues from here — JSON guaranteed
]
```

On the OpenAI-compatible path, `response_format: { type: 'json_object' }` serves the same purpose.

Both paths are wrapped in a retry loop that feeds the Zod parse error back as a correction hint, allowing the model to self-correct malformed output up to three times before raising:

```typescript
// Simplified flow inside AnthropicProvider
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  const raw = await callModel(prompt + retryNote(attempt, lastError))
  try {
    return schema.parse(JSON.parse(raw)) // throws on schema violation
  } catch (err) {
    lastError = err.message            // fed back into next attempt
  }
}
throw new Error(`Failed after ${MAX_RETRIES} attempts: ${lastError}`)
```

End-of-meso exercise changes use a **Zod discriminated union** to enforce that `keep` and `replace` entries carry different required fields — making invalid states unrepresentable at the type level:

```typescript
export const EndOfMesoExerciseChangeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('keep'), plan_exercise_id: z.string().uuid(), ... }),
  z.object({ action: z.literal('replace'), old_exercise: ..., new_exercise: ..., ... }),
])
```

---

### 3. Model-Agnostic Adapter Pattern

The AI layer is fully decoupled from any specific provider via a clean adapter interface:

```typescript
// lib/ai/provider.ts
export interface AIProvider {
  generateStructuredOutput<T>(
    prompt: string,
    systemPrompt: string,
    schema: ZodSchema<T>,
    maxTokens?: number
  ): Promise<T>

  analyzeImage<T>(
    imageBase64: string,
    mimeType: string,
    prompt: string,
    schema: ZodSchema<T>
  ): Promise<T>
}
```

A module-level factory reads a single environment variable and returns the appropriate implementation:

```typescript
export function getAIProvider(): AIProvider {
  return process.env.AI_PROVIDER === 'openai_compatible'
    ? new OpenAICompatibleProvider()   // OpenRouter, Groq, Ollama…
    : new AnthropicProvider()          // default
}
```

The `OpenAICompatibleProvider` uses native `fetch` against the `/v1/chat/completions` standard — no additional SDK dependency. Switching the entire inference backend requires changing three environment variables and zero application code:

| Target | `OPENAI_BASE_URL` | `OPENAI_TEXT_MODEL` |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | `qwen/qwen-2.5-72b-instruct` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-70b-versatile` |
| Ollama (local) | `http://localhost:11434/v1` | `qwen2.5:72b` |

---

### 4. Multimodal OCR via Claude Vision

The FitDays smart scale app does not expose an API or support webhook-based data export. Its only sharing mechanism is a **proprietary image card** containing all body composition metrics rendered as styled text on a gradient background.

Rather than building a fragile pixel-coordinate scraper, the application routes these images through Claude Vision. The model receives the raw base64 image alongside a structured prompt that maps Italian/English field labels to typed JSON keys, handles unit disambiguation, and converts locale-specific date formats (`DD/MM/YYYY` → `YYYY-MM-DD`):

```
Cerca i seguenti campi:
- Peso / Weight        → weight_kg   (decimal, e.g. 82.6)
- BMI                  → bmi         (decimal)
- Grasso corporeo %    → body_fat_pct
- Età corporea         → metabolic_age (integer years)
- Data nell'immagine   → date (convert to YYYY-MM-DD)
```

The extracted object is validated by `BodyScanSchema` and upserted with `onConflict: 'user_id,date'`, making the scan operation fully idempotent. Uploading the same image twice produces no duplicate records.

---

## Tech Stack

### Frontend
- **Next.js 14** (App Router) — PWA with `next-pwa`, mobile-first layout
- **TypeScript** — strict mode throughout
- **Tailwind CSS** — dark mode, `shadcn/ui` components (manually integrated, no CLI)
- **Recharts** — inline exercise progression charts with cross-mesocycle history

### Backend
- **Next.js API Routes** — REST endpoints for workouts, diet, body metrics, check-ins, and AI chat
- **Streaming SSE** — real-time token streaming for the AI coach chat interface
- **Agentic tool-use loop** — Claude runs up to 8 domain-specific tools (read/write workout plans, diet logs, body metrics) in an autonomous loop before returning a response

### Database
- **Supabase (PostgreSQL)** — Row-Level Security on every table; all queries are user-scoped at the DB layer
- **Supabase Auth** — cookie-based session management via `@supabase/ssr`

### AI Integration
- **Anthropic SDK** (`@anthropic-ai/sdk`) — structured output via assistant prefill, vision analysis, tool-use for chat
- **Model-agnostic adapter** — drop-in replacement for any OpenAI-compatible provider
- **Zod** — runtime validation of all LLM-generated structured data

---

## Database Schema Architecture

The schema is built around the concept of a **training block** (`mesocycles`) that owns a `workout_plan` and accumulates granular per-exercise targets week by week.

```
mesocycles
  └── workout_plan_id → workout_plans
        └── workout_plan_days
              └── plan_exercises
                    └── exercise_progressions  (week_number, target_weight_kg, target_reps)
                    └── session_exercises      (actual logged performance + RPE)

weekly_check_ins
  ├── mesocycle_id
  ├── check_in_type: 'weekly' | 'end_of_meso'
  ├── ai_analysis: JSONB  (validated WeeklyCheckInOutput | EndOfMesoOutput)
  └── applied: boolean
```

`exercise_progressions` has a unique constraint on `(plan_exercise_id, week_number)`, enabling idempotent upserts when the AI applies a check-in multiple times. The `weekly_check_ins.applied` flag acts as a write-once guard at the application layer.

All tables enforce RLS policies scoped to `auth.uid()`. The service role key is never exposed to the client.

---

## Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Anthropic](https://console.anthropic.com) API key

### 1. Clone & Install

```bash
git clone https://github.com/your-username/ai-fitness-coach.git
cd ai-fitness-coach
npm install
```

### 2. Database Setup

Run the migrations in order against your Supabase project (SQL Editor or CLI):

```bash
supabase db push  # or run migrations manually via the Supabase dashboard
```

The migrations create all tables, RLS policies, and indexes. No manual schema work required.

### 3. Environment Variables

Create a `.env.local` file in the project root:

```bash
# ── Supabase ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# ── Anthropic ─────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── AI Provider (optional — defaults to 'anthropic') ─────────────────────────
# AI_PROVIDER=anthropic          # 'anthropic' | 'openai_compatible'

# ── Model overrides for Anthropic (optional) ──────────────────────────────────
# ANTHROPIC_TEXT_MODEL=claude-sonnet-4-6
# ANTHROPIC_VISION_MODEL=claude-3-5-sonnet-20241022

# ── OpenAI-compatible provider (required only if AI_PROVIDER=openai_compatible)
# OPENAI_BASE_URL=https://openrouter.ai/api/v1
# OPENAI_API_KEY=<your-key>
# OPENAI_TEXT_MODEL=qwen/qwen-2.5-72b-instruct
# OPENAI_VISION_MODEL=qwen/qwen-2.5-vl
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create an account, ask the AI Coach to build your first training program, and start logging.

---

## Project Structure

```
app/
  (app)/
    page.tsx              # Dashboard
    body/page.tsx         # Body composition tracking + AI scan
    workouts/page.tsx     # Active plan + mesocycle banner + progression charts
    workouts/log/         # Guided session logging flow
    workouts/history/     # Completed mesocycle archive
    diet/page.tsx         # Daily nutrition logging
    coach/page.tsx        # AI chat interface (streaming + check-in modals)
    settings/page.tsx     # User profile + diet plan configuration
  api/
    body/route.ts         # Body measurements CRUD
    body/scan/route.ts    # Claude Vision OCR endpoint
    workouts/route.ts     # Plans, sessions, mesocycle, progression charts
    check-in/route.ts     # Agentic weekly + end-of-meso check-in pipeline
    diet/route.ts         # Diet plans + daily logs
    coach/route.ts        # Streaming chat + autonomous tool-use loop
lib/
  ai/
    provider.ts           # AIProvider interface + Anthropic/OpenAI adapters + factory
    check-in-schema.ts    # Zod schemas for weekly and end-of-meso outputs
    body-scan-schema.ts   # Zod schema for Vision OCR output
    tools.ts              # 8 Claude tool definitions + executor
    system-prompt.ts      # Italian coaching persona + domain rules
  supabase/
    client.ts             # Browser Supabase client
    server.ts             # Server Supabase client (cookie-based)
  types.ts                # Shared TypeScript interfaces
  utils.ts                # cn(), formatDate(), today()
supabase/
  migrations/             # SQL migrations (schema + RLS policies)
components/
  ui/                     # button, card, input, dialog, progress, select…
  body/                   # MeasurementForm, CsvImport, AiScan, BodyCharts
  workouts/               # ExerciseChart (inline Recharts progression)
  coach/                  # ChatInterface (SSE streaming + check-in modals)
```

---

## License

MIT

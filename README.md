<!--
  Brigata Dai-Gurren — Squadra di sviluppo
  Compagno, se stai leggendo questo file: significa che sei già più avanti
  di chi si è arreso. Bene. Ora vai oltre.
-->

<div align="center">

# 🌀 SPIRALE — AI COACH

### **«Con chi credi di avere a che fare?!»**

#### Il motore di evoluzione personale alimentato dall'AI che pretende solo una cosa da te: **andare oltre l'impossibile**.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com)
[![Anthropic](https://img.shields.io/badge/Claude-Sonnet%204.6-D97706?style=for-the-badge&logo=anthropic&logoColor=white)](https://anthropic.com)
[![Framer Motion](https://img.shields.io/badge/Framer%20Motion-12-FF0080?style=for-the-badge&logo=framer)](https://www.framer.com/motion/)
[![PWA](https://img.shields.io/badge/PWA-Tengen%20Toppa-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)

> *«Dare un calcio alla ragione e fare spazio all'impossibile: è questa la filosofia della brigata Gurren!»*

</div>

---

## ⚡ Cos'è questo progetto

Dimentica i fitness tracker. Quelli sono **registri passivi**: ti dicono cosa hai fatto, ti mostrano un grafico, e ti lasciano lì da solo a chiederti se stai migliorando o stai sprecando il tuo tempo.

**Spirale** non è un tracker. È un **motore di evoluzione personale**. Ogni ripetizione, ogni grammo di proteina, ogni pesata mattutina — diventano **Energia a Spirale (EXP)** che alimenta una trivella che cresce con te. Da uno scavabuchi sperduto in fondo al sottosuolo, fino al **Tengen Toppa Gurren Lagann** che trafigge le galassie.

Ma non è solo estetica. Sotto al fuoco c'è un sistema serio:
- Mesocicli di 6-8 settimane gestiti da un'**AI agentica** che decide quando aumentare il carico, quando far ruotare gli esercizi, quando dichiarare concluso un blocco.
- Un sistema di **Risonanza** matematicamente bilanciato che premia la consistenza (non i picchi).
- Un AI Coach che non si limita a rispondere — **ti scuote, ti spinge, ti motiva** alle 14:00 di un mercoledì grigio quando staresti per saltare l'allenamento.

> *«Vai avanti! Anche se non sai dove stai andando, vai avanti! Questa è la mia spirale, e questa è la tua!»*

---

## 🔥 Core Features

### 💪 Workout Tracker — Mesocicli Reali, Non Decorativi
- Pianifica cicli di 6-8 settimane con progressione settimanale automatica.
- Logging guidato esercizio-per-esercizio con preset intelligenti (pre-fill basato sulla settimana precedente).
- Storico completo: ogni ripetizione, peso, RPE, nota — **persistito**, **versionato**, **cross-mesociclo**.
- Logging **offline-first** con replay automatico al ritorno della connessione (iOS Safari incluso, perché Safari non si arrende mai e nemmeno noi).

### 🍖 Macro & Diet Tracker — Il Carburante della Spirale
- Database alimenti custom con foto/OCR.
- Bilancio settimanale calorico + macro (proteine, carbo, grassi) con cycling per giorni di forza vs riposo.
- Quick-log "200g pollo, 100g riso" → l'AI parsifica e salva. Niente UI a 27 click.

### 📲 PWA Completa — La Tua Brigata in Tasca
- **Installabile** su iOS, Android, Desktop. Una volta installata, funziona offline.
- **Notifiche push** native via Web Push + VAPID. Il Coach ti suona la sveglia.
- Manifest + Service Worker + push-handler.js custom — tutto cucito su misura, niente boilerplate gonfio.
- Splash screen, icone adaptive, badge monocromatico per la barra di stato Android.

### 🤖 AI Coach Conversazionale
- Chat streaming token-per-token via Server-Sent Events.
- Loop agentico autonomo: il coach può chiamare fino a 8 tool (legge piani, log, metriche, modifica scheda, aggiusta macro) **prima** di rispondere — niente domande di follow-up inutili.
- Output strutturato validato Zod su ogni decisione. Niente UUID inventati. Niente RPE fuori scala. Niente bullshit.

---

## 🌀 Il Sistema a Spirale — Gamification

> *«Ascoltami bene, devi credere in te stesso! E non per la fiducia che io ripongo in te, né tantomeno per la fiducia che tu riponi in me! Devi fidarti della parte di te che crede in se stessa!.»*

Il cuore pulsante dell'app. Ogni azione che logghi viene tradotta in **Energia a Spirale**. La curva è calibrata su 6 anni di evoluzione realistica: ~1500 EXP/settimana → Lv 100 in 2 anni → Lv 200 in 6 anni. Nessuno shortcut. Nessun pay-to-win.

### ⚡ EXP & La Curva a Due Fasi

```
Fase 1 (Lv 1 → 100):    total_exp(n) = ⌊1.56 · n^2.5⌋    →  ~156.000 EXP cumulati
Fase 2 (Lv 101 → ∞):    exp_for(n)   = ⌊580 · 1.028^(n-100)⌋  →  ~468.000 EXP a Lv 200
```

A Lv 100 servono ~4.900 EXP. A Lv 101 ne bastano ~596. Una **discontinuità intenzionale**: è la nuova spirale che si apre. Il momento in cui hai trafitto il cielo. Non si torna indietro.

### 💫 Risonanza — Il Moltiplicatore della Consistenza

Una **Perfect Week** = ≥3 sessioni + ≥5 log diet con target proteico + ≥1 pesata.

- Settimana perfetta consecutiva → `resonance_mult += 0.25` (cap **×3.00** dopo 8 settimane consecutive).
- Settimana mancata → `resonance_mult *= 0.5` (decay forgiveness, non reset brutale).
- Modalità **Stasi Estiva** (Vacation Mode): se sei in spiaggia con i tuoi compagni, la risonanza si congela. Nessun decadimento. Quando torni, riprendi da dove avevi lasciato. *«La spirale aspetta. Ma quando torni, deve girare più forte.»*

### 🔥 Giga Drill Break — Il PR che Spacca lo Schermo

Quando rompi un record di tonnellaggio su un esercizio, l'app **smette di essere educata**.

- Cinematica fullscreen 3 secondi orchestrata in 4 fasi via Framer Motion.
- Trivella dorata che attraversa il viewport in diagonale a 30°.
- Testo «GIGA DRILL BREAK» che esplode con kerning animato e text-shadow gold + crimson.
- Bonus EXP **dinamico**: scala con il tuo livello attuale, così a Lv 30 senti il colpo come a Lv 100.

```typescript
// lib/gamification/check-giga-drill.ts
const improvement = (newTonnage - oldTonnage) / oldTonnage
const pctOfNextLevel = Math.min(0.10, 0.05 + improvement) // 5% base, +% improvement, cap 10%
const bonus = Math.round(pctOfNextLevel * expForNextLevel(currentLevel))
```

### 🏆 Titoli JRPG — La Tua Identità Forgiata nel Sudore

11 tier di titolo che evolvono col livello. Nessuno te li dà. Te li **strappi**.

| Tier | Lv | Titolo |
|---|---|---|
| 1 | 1-9 | Lo Scavabuchi |
| 2 | 10-24 | Ereditiere della Volontà |
| 3 | 25-44 | Membro della Brigata Dai-Gurren |
| 4 | 45-64 | Leader della Resistenza |
| 5 | 65-84 | Spirito Indomabile |
| 6 | 85-94 | Perforatore dei Cieli |
| 7 | 95-99 | Eroe della Galassia |
| 8 | 100-124 | Massa Critica |
| 9 | 125-174 | Signore della Spirale |
| 10 | 175-199 | Tengen Toppa |
| **11** | **200+** | **Super Tengen Toppa Gurren Lagann** |

### 🏅 Achievement Catalog — 20 Trofei v1

Da `Prima Scintilla` (primo workout) a `Tengen Toppa` (Lv 200, hidden), passando per `Centurione` (100kg), `Big Bang Spirale` (Giga Drill ≥10%), `Spirale Eterna` (8 Perfect Week consecutive). Ogni achievement viene attribuito server-side con `INSERT ... ON CONFLICT` idempotente — nessuna doppia award, mai.

---

## 💬 L'AI Coach — Kamina in Tasca

> *«Un uomo può afferrare il Sole con le mani e sopportarne l'immenso calore, perché è la forza spirituale a sostenere l'uomo!»*

Il Coach è alimentato da **Claude Sonnet 4.6** via Anthropic SDK. Non è un chatbot. È un **personaggio**.

### 🎯 Loop Agentico Autonomo
Il system prompt italiano definisce il personaggio (allenatore di powerbuilding aggressivo, no-bullshit, Italian flavor). I tool che può chiamare:

```
1. get_body_metrics(days)        → letture peso/composizione
2. get_workout_plan()            → scheda attiva
3. get_workout_history(days)     → sessioni recenti + RPE
4. get_diet_plan()               → target macro
5. get_diet_logs(days)           → adherence calorica
6. update_workout_plan(action)   → crea/aggiorna scheda
7. update_diet_plan(...)         → riassetta i macro
8. add_session_note(...)         → annotazione su esercizio
```

L'utente chiede *"come sono andato questa settimana?"* → il Coach chiama 4 tool in sequenza, costruisce il quadro, **poi** parla. Nessuna domanda di follow-up. Nessun "potresti dirmi...".

### 🌅 Cron Pomeridiano — Il Promemoria che Ti Riaccende
Una Supabase Edge Function (`morning-motivation`) gira ogni giorno alle 14:00 italiane. Per ogni utente con `morning_motivation_enabled=true`:
1. Classifica la giornata (`training` / `rest` / `cardio`).
2. Genera un messaggio motivazionale via Claude Haiku (modello fast/cheap, perfetto per testi brevi).
3. Invia push via Web Push + VAPID a tutti gli endpoint registrati.
4. Pulisce automaticamente le subscription scadute (HTTP 404/410).

Il payload include `icon`, `badge`, `tag` e `url` di destinazione — il `notificationclick` listener nel Service Worker apre direttamente la rotta giusta.

### 🔬 Output Strutturato Anti-Allucinazione
Ogni risposta strutturata (check-in settimanale, fine-mesociclo, OCR vision) viene:
1. Forzata a JSON via assistant prefill (`{ role: 'assistant', content: '{' }`).
2. Validata via Zod schema strict.
3. Retry automatico con error feedback al modello (max 3 tentativi).
4. Solo allora persistita su DB.

Niente UUID inventati. Niente RPE 12. Niente proteine in grammi negativi.

---

## 🛠 Stack Tecnologico

> *«Lo sviluppo non è qualcosa che si fa con calma. È qualcosa che si fa COL FUOCO.»*

| Layer | Tech |
|---|---|
| **Framework** | Next.js 16 (App Router) — Server Components + Client Components mix, `force-dynamic` su tutto ciò che dipende dall'auth |
| **Lingua** | TypeScript strict — niente `any` impuniti |
| **UI** | Tailwind CSS dark mode, palette **"Midnight Arcade"** (ink-black + accent-trio crimson/cyan/gold), shadcn/ui manualmente integrato |
| **Animazioni** | Framer Motion 12 — orchestrazione 4-fasi delle cutscene, `AnimatePresence` per i flash |
| **Tipografia** | Inter per il copy, **JetBrains Mono** per ogni numero (`tabular-nums` su EXP, livelli, peso, percentuali) |
| **DB** | Supabase Postgres con RLS su ogni tabella — `auth.uid()` scope a livello DB, mai in app |
| **Auth** | Supabase Auth via `@supabase/ssr` — cookie-based, server-side hydration |
| **AI** | Anthropic SDK + adapter pattern (drop-in OpenRouter/Groq/Ollama via env) |
| **PWA** | `@ducanh2912/next-pwa` + Service Worker custom con push-handler.js dedicato |
| **Push** | `web-push` + VAPID — endpoint subscriptions persistite in `user_push_subscriptions`, pruning automatico su 404/410 |
| **State** | SWR-pattern minimale costruito a mano in `hooks/use-spiral-state.ts` — niente dipendenze esterne, dedup 10s, revalidate-on-focus |
| **Eventi** | Pub/sub module-level in `lib/gamification/spiral-events.ts` — niente Context Provider, niente Redux |
| **Hosting** | Vercel (frontend + API) + Supabase (DB + Edge Functions) |

---

## 📐 Architettura Database — La Spina Dorsale

```
auth.users
  └── user_stats               (level, exp_total, resonance, streak, stage, tier)
  └── exp_history              (audit append-only, UNIQUE(source, source_id) → idempotente)
  └── personal_records         (max_tonnage / max_weight / max_reps per esercizio)
  └── spiral_evolution_log     (queue cutscene: tier_up / stage_up / pierce / meso_clear / giga_drill)
  └── vacation_periods         (Stasi Estiva — start/end date, max 14gg, max 2 ogni 90gg)
  └── achievements             (catalog 20 trofei v1)
  └── user_achievements        (unlock log)
  └── user_push_subscriptions  (Web Push endpoints per device)
  └── user_notification_preferences (preferenze toggle)
  
  └── mesocycles (6-8 settimane)
        └── workout_plans
              └── workout_plan_days
                    └── plan_exercises
                          └── exercise_progressions  (target settimana per settimana)
                          └── session_exercises      (effettivo loggato + RPE)
        └── weekly_check_ins   (microcycle / end_of_meso analysis JSONB validata Zod)
  
  └── diet_plans
        └── diet_logs
        └── custom_foods
```

Ogni tabella ha **RLS scoped a `auth.uid()`**. Il `service_role_key` non lascia mai il server. Le Edge Functions di Supabase usano il loro contesto isolato.

---

## 🚀 Setup Locale — Avvia la Tua Spirale

> *«Se la tua trivella non è abbastanza grande, falla diventare ABBASTANZA GRANDE.»*

### Prerequisiti
- Node.js **18+**
- Un progetto [Supabase](https://supabase.com) (free tier basta)
- Una API key [Anthropic](https://console.anthropic.com)
- Una coppia di chiavi VAPID per le push (`npx web-push generate-vapid-keys`)

### 1. Clone & Install

```bash
git clone https://github.com/JacopoMaster/AI-Coach.git
cd AI-Coach
npm install
```

### 2. Database

```bash
# Crea il progetto Supabase, poi nel SQL Editor:
# Esegui in ordine i file in supabase/migrations/ dal 001 al 008.
```

Le migrazioni creano: schema completo, RLS, indici, trigger di seed di `user_stats`, catalogo achievement v1.

### 3. Environment

Crea `.env.local` nel root:

```bash
# ── Supabase ──────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# ── Anthropic ─────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── VAPID (Push Notifications) ────────────────────────────────────────────
NEXT_PUBLIC_VAPID_PUBLIC_KEY=B...
VAPID_PUBLIC_KEY=B...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:tuo@indirizzo.email

# ── AI Provider override (opzionale) ──────────────────────────────────────
# AI_PROVIDER=anthropic | openai_compatible
# OPENAI_BASE_URL=https://openrouter.ai/api/v1
# OPENAI_API_KEY=...
# OPENAI_TEXT_MODEL=qwen/qwen-2.5-72b-instruct
```

Su **Supabase Edge Functions** (Project Settings → Edge Functions → Secrets) replica:
- `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
- `ANTHROPIC_API_KEY`

### 4. Deploy delle Edge Functions

```bash
supabase functions deploy morning-motivation
supabase functions deploy proactive-coach
```

### 5. Run

```bash
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000), crea un account, chiedi al Coach di costruirti la prima scheda, e **comincia a girare**.

---

## 🌟 Roadmap — La Spirale Continua

Lo sviluppo non si ferma mai, perché un Lagann che si ferma è un Lagann morto.

- [x] **Fase 1**: tracker base + AI Coach + check-in agentici
- [x] **Fase 2**: PWA + push notifications + offline-first logging
- [x] **Fase 3 — Energia della Spirale**: gamification completa (level, EXP, resonance, achievements, Giga Drill cutscene)
- [ ] **Fase 4 — Tengen Toppa**: Chapter Clear cutscene · Pierce-the-Heavens (Lv 100) · Vacation Mode UI · Coach gamification-aware · Onboarding cinematografico
- [ ] **Fase 5 — La Galassia**: leaderboard a confronto solo storico-personale · Heatmap calendaria · Esportazione CSV completa per analytics esterni

---

## 📜 Licenza

MIT. Prendi il codice, modificalo, fanne quello che vuoi. **L'unica cosa che non puoi fare è arrenderti.**

---

<div align="center">

### *«Ricorda bene: adesso questa mia trivella aprirà un varco nell'universo che si trasformerà nella strada per le generazioni a venire. Il desiderio di chi non ce l'ha fatta e la speranza di chi verrà domani. Intrecceremo questi due sentimenti in una doppia spirale e scaveremo la strada che ci collegherà al futuro! Questo è lo sfondamento dei cieli, questo è il Gurren Lagann! Perché grazie alla mia trivella, io posso sfondare anche il cielo!»*

### 🌀 **ROW ROW! FIGHT THE POWER!!!.** 🌀

— *Brigata Dai-Gurren · Squadra Sviluppo*

</div>

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
- **Ultimo commit (locale)**: `bafac1e feat(date): resolve app calendar dates in Europe/Rome`
  (prima: `50fca65`, `86bfeb6`, `d40d5fa`). `main` ahead di `origin/main` — **nessun push**.
  Refactor AIErrorClass/logging isolato sul branch `feat/ai-error-logging` (`8d8cd67`).
- **Cosa è stato completato**:
  - **P0.1 — Unificazione dieta** su `nutrition_entries` → **committato** (`50fca65`).
  - **P0.2 — Date applicative Europe/Rome** (D002) → **committato** (`bafac1e`).
  - **P0.3 — Sicurezza route admin** (**in attesa di commit/approvazione**):
    - nuovo helper server-only `lib/auth/admin.ts` (unica autorità admin):
      `getAdminUserIds()`, `isAdminUserId(userId)`, `requireAdmin(supabase)`; allowlist
      `ADMIN_USER_IDS` (UUID Supabase, split virgola/trim/ignore-empty, **fail-closed**);
      match **esatto** su `user.id`; non logga l'allowlist;
    - `/api/admin/hard-reset` e `/api/admin/recover-xp`: **GET rimosso** (→ Next 405),
      aggiunto **POST** con gate **401** (anonimo) → **403** (non-admin) → **400** (confirm
      body-only mancante/errato: `HARD_RESET` / `RECOVER_XP`);
    - errori **500 generici** + response `entries[]` di recover-xp sanificata
      (`error:'recovery_failed'`, no messaggi/codici Supabase); **log server PII-free**
      (no user.id/session.id/email/data/stat/errore-Supabase/env/body);
    - **semantica invariata**: entrambe operano solo su `user.id` autenticato, nessun
      accesso cross-user; scope non ampliato. Nessun caller UI attivo.
- **Test eseguiti**:
  - `npx tsc --noEmit` → OK; `npm run build` → OK; `git diff --check` → pulito.
  - Verifica statica helper reale (scratchpad, type-stripping Node 24, no dipendenze) →
    **18/18** (fail-closed, parse trim/ignore-empty, match esatto, userId null/empty).
  - Ricerca finale: **nessun** `export async function GET` nelle route admin.
- **Stato working tree** (pre-commit): 2 file tracked (`app/api/admin/hard-reset/route.ts`,
  `app/api/admin/recover-xp/route.ts`) + untracked `lib/auth/admin.ts`.
- **File estranei da NON includere nel commit P0.3**:
  - `.claude/settings.local.json` — config locale.
  - `public/worker-bc2006058c3e6de4.js` — artefatto di build.
- **Env da configurare (Vercel, server-side)**: `ADMIN_USER_IDS=uuid1,uuid2,...` (senza
  `NEXT_PUBLIC_`). Se assente/vuota → nessun admin (fail-closed). **Nessun UUID hardcoded.**
- **Decisioni rilevanti**: P0.3 non introduce una nuova decisione (allineato a sicurezza
  Fase 0). D002 (P0.2), D001/D011 (P0.1), D010.
- **Stato fase**: **Fase 0 COMPLETATA** (P0.1+P0.2 committate, P0.3 pending commit).
  **Non iniziare la Fase 1** senza indicazione.
- **Prossimo task**: **Fase 1 — Athlete Profile** (non iniziata). Prima definire schema
  profilo ed esposizione al Coach.
- **Blocker**: nessuno. Residui noti fuori scope: Edge Functions Deno (`diet_logs` +
  date UTC) e `vacation.ts` — da affrontare in task dedicati.
- **Comandi utili**:
  ```bash
  git status --short
  git diff --stat
  npx tsc --noEmit
  npm run build
  ```

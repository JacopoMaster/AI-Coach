// Single source of truth for the AI model IDs used by the Next application.
//
// Fase 0 — centralizzazione soltanto: stessi ID di default, stesso routing
// Sonnet/Haiku per funzionalità, stesso comportamento. Nessun health check,
// nessun cambio di prompt/retry/fallback, nessun upgrade di modello.
//
// Anthropic only. Il provider OpenAI-compatibile (`OpenAICompatibleProvider`
// in ./provider.ts) mantiene le proprie variabili `OPENAI_*` e i propri
// default `gpt-4o`: è un percorso diverso, già env-driven, e resta invariato.
//
// Variabili d'ambiente:
//   - ANTHROPIC_TEXT_MODEL    (già usata prima) → text
//   - ANTHROPIC_VISION_MODEL  (già usata prima) → vision
//   - ANTHROPIC_FAST_MODEL    (nuova)           → fast
// Se una variabile è assente/vuota si usa l'ID di default corrente.

/** Risolve un ID modello dall'env; unset/vuoto/spazi → fallback. */
function envModel(key: string, fallback: string): string {
  const value = process.env[key]
  return value && value.trim() ? value.trim() : fallback
}

export interface AIModelConfig {
  /** Modello principale: Coach (complex) + check-in strutturati. */
  text: string
  /** Modello rapido/economico: classifier intent, quick-log, notifiche push. */
  fast: string
  /** Modello vision: OCR / analisi immagini (scan bilancia). */
  vision: string
}

export const AI_MODELS: AIModelConfig = {
  text: envModel('ANTHROPIC_TEXT_MODEL', 'claude-sonnet-4-6'),
  fast: envModel('ANTHROPIC_FAST_MODEL', 'claude-haiku-4-5'),
  vision: envModel('ANTHROPIC_VISION_MODEL', 'claude-haiku-4-5'),
}

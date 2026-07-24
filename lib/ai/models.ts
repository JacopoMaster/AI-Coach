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
//   - ANTHROPIC_TEXT_MODEL             (già usata prima) → text
//   - ANTHROPIC_VISION_MODEL           (già usata prima) → vision
//   - ANTHROPIC_FAST_MODEL             (nuova)           → fast
//   - ANTHROPIC_RESTART_STRATEGY_MODEL (F2.5)            → restartStrategy
// Se una variabile è assente/vuota si usa l'ID di default corrente.

/** Risolve un ID modello dall'env; unset/vuoto/spazi → fallback. */
function envModel(key: string, fallback: string): string {
  const value = process.env[key]
  return value && value.trim() ? value.trim() : fallback
}

// Default del modello "qualitativo" (testo). Definito una sola volta così che le
// chiavi che condividono lo stesso modello NON duplichino l'ID stringa.
const QUALITY_TEXT_DEFAULT = 'claude-sonnet-4-6'

export interface AIModelConfig {
  /** Modello principale: Coach (complex) + check-in strutturati. */
  text: string
  /** Modello rapido/economico: classifier intent, quick-log, notifiche push. */
  fast: string
  /** Modello vision: OCR / analisi immagini (scan bilancia). */
  vision: string
  /** Restart Strategy Proposal (F2.5): generazione strutturata qualitativa. */
  restartStrategy: string
}

export const AI_MODELS: AIModelConfig = {
  text: envModel('ANTHROPIC_TEXT_MODEL', QUALITY_TEXT_DEFAULT),
  fast: envModel('ANTHROPIC_FAST_MODEL', 'claude-haiku-4-5'),
  vision: envModel('ANTHROPIC_VISION_MODEL', 'claude-haiku-4-5'),
  // Stesso modello qualitativo del testo per default (nessun ID duplicato),
  // con override dedicato se serve differenziarlo in futuro.
  restartStrategy: envModel('ANTHROPIC_RESTART_STRATEGY_MODEL', QUALITY_TEXT_DEFAULT),
}

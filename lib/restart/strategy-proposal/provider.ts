// Restart Strategy Proposal — Anthropic tool-use provider (F2.5).
//
// One structured call using a SINGLE forced tool (tool_choice). NO markdown / no
// regex / no JSON-from-free-text parsing (unlike generateStructuredOutput): the
// answer is valid ONLY if the response contains exactly the expected tool_use
// block. The raw tool input is returned UNVALIDATED — schema + guardrails live in
// proposal.ts. The model id comes from the central config (AI_MODELS), never
// hardcoded here.
//
// Transport/SDK failures THROW StrategyProviderError. A missing / wrong-named /
// ambiguous (multiple) tool call is returned as {ok:false, reason} so the caller
// can run its single repair retry. Nothing is logged here (no prompt/output).

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'
import { PROPOSE_STRATEGY_TOOL_NAME, proposeStrategyTool, buildStrategyUserContent } from './prompt'
import { StrategyProviderError } from './errors'
import type { RestartStrategyContext, StrategyProvider, StrategyToolResult } from './types'

const MAX_OUTPUT_TOKENS = 2048

export class AnthropicStrategyProvider implements StrategyProvider {
  private client: Anthropic

  constructor(client?: Anthropic) {
    this.client = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  async propose(
    context: RestartStrategyContext,
    systemPrompt: string,
    repairHint?: string
  ): Promise<StrategyToolResult> {
    let response: Anthropic.Message
    try {
      response = await this.client.messages.create({
        model: AI_MODELS.restartStrategy,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        tools: [proposeStrategyTool],
        // Force exactly this tool — the model cannot answer with free text.
        tool_choice: { type: 'tool', name: PROPOSE_STRATEGY_TOOL_NAME },
        messages: [{ role: 'user', content: buildStrategyUserContent(context, repairHint) }],
      })
    } catch (err) {
      // Transport / SDK / API error → provider failure (not an AI-output problem).
      throw new StrategyProviderError(err instanceof Error ? err.message : 'unknown provider error')
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    )

    if (toolUses.length === 0) return { ok: false, reason: 'tool_missing' }
    if (toolUses.length > 1) return { ok: false, reason: 'tool_ambiguous' }
    if (toolUses[0].name !== PROPOSE_STRATEGY_TOOL_NAME) return { ok: false, reason: 'tool_wrong' }

    return { ok: true, toolInput: toolUses[0].input }
  }
}

/** Default provider factory (real Anthropic). Injectable in tests/orchestration. */
export function getStrategyProvider(): StrategyProvider {
  return new AnthropicStrategyProvider()
}

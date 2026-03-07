'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Message } from '@/lib/types'
import {
  Send,
  Loader2,
  Trash2,
  Bot,
  User,
  ClipboardCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ArrowRightLeft,
  RotateCcw,
  Trophy,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiMessage = {
  role: 'user' | 'assistant'
  content: string | Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>
}

// Weekly check-in
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

interface WeeklyAnalysis {
  week_summary: {
    sessions_completed: number
    overall_fatigue: 'low' | 'medium' | 'high'
    overall_adherence: number
    observations: string
  }
  exercise_updates: ExerciseUpdate[]
  diet_feedback?: {
    avg_calories: number
    avg_protein_g: number
    recommendation: string
  }
}

// End-of-meso
interface KeepChange {
  action: 'keep'
  plan_exercise_id: string
  exercise_name: string
  rationale: string
}

interface ReplaceChange {
  action: 'replace'
  old_exercise: { plan_exercise_id: string; name: string }
  new_exercise: { name: string; sets: number; reps: string; weight_kg: number }
  rationale: string
}

type ExerciseChange = KeepChange | ReplaceChange

interface EndOfMesoAnalysis {
  meso_summary: {
    total_sessions: number
    avg_adherence: number
    overall_progress: 'poor' | 'fair' | 'good' | 'excellent'
    narrative: string
  }
  exercise_changes: ExerciseChange[]
  new_meso_targets: {
    duration_weeks: 6 | 8
    notes: string
  }
}

// Banner status
interface PendingCheckIn {
  id: string
  week_number: number
  check_in_type: 'weekly' | 'end_of_meso'
  ai_analysis: WeeklyAnalysis | EndOfMesoAnalysis
}

interface CheckInStatus {
  has_active_meso: boolean
  meso_name?: string
  current_week?: number
  duration_weeks?: number
  is_end_of_meso?: boolean
  days_since_check_in: number | null
  show_banner: boolean
  pending_check_in: PendingCheckIn | null
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function toDisplayMessages(messages: ApiMessage[]): Message[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string'
        ? m.content
        : (m.content as Array<{ type: string; text?: string }>)
            .filter((b) => b.type === 'text')
            .map((b) => b.text || '')
            .join(''),
    }))
    .filter((m) => m.content.trim().length > 0)
}

const fatigueLabel: Record<string, string> = { low: 'Bassa', medium: 'Media', high: 'Alta' }
const progressLabel: Record<string, string> = {
  poor: 'Scarso', fair: 'Discreto', good: 'Buono', excellent: 'Eccellente',
}
const progressColor: Record<string, string> = {
  poor: 'text-red-500', fair: 'text-yellow-500', good: 'text-green-500', excellent: 'text-blue-500',
}

const weeklyActionIcon = {
  increase_reps: <TrendingUp className="h-3.5 w-3.5 text-green-500" />,
  increase_weight: <TrendingUp className="h-3.5 w-3.5 text-blue-500" />,
  maintain: <Minus className="h-3.5 w-3.5 text-muted-foreground" />,
  decrease: <TrendingDown className="h-3.5 w-3.5 text-yellow-500" />,
}
const weeklyActionLabel: Record<string, string> = {
  increase_reps: 'Aumenta reps', increase_weight: 'Aumenta peso',
  maintain: 'Mantieni', decrease: 'Riduci',
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChatInterface() {
  // Chat state
  const [messages, setMessages] = useState<ApiMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Check-in banner state
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  // Weekly modal state
  const [weeklyOpen, setWeeklyOpen] = useState(false)
  const [weeklyAnalysis, setWeeklyAnalysis] = useState<WeeklyAnalysis | null>(null)
  const [weeklyCheckInId, setWeeklyCheckInId] = useState<string | null>(null)
  const [weeklyWeek, setWeeklyWeek] = useState(1)
  const [weeklyApplying, setWeeklyApplying] = useState(false)
  const [weeklySuccess, setWeeklySuccess] = useState(false)
  const [weeklyExExpanded, setWeeklyExExpanded] = useState(false)

  // End-of-meso modal state
  const [endOfMesoOpen, setEndOfMesoOpen] = useState(false)
  const [endOfMesoAnalysis, setEndOfMesoAnalysis] = useState<EndOfMesoAnalysis | null>(null)
  const [endOfMesoCheckInId, setEndOfMesoCheckInId] = useState<string | null>(null)
  const [endOfMesoWeek, setEndOfMesoWeek] = useState(1)
  const [endOfMesoApplying, setEndOfMesoApplying] = useState(false)
  const [endOfMesoSuccess, setEndOfMesoSuccess] = useState(false)
  // Set of old_exercise.plan_exercise_id that user has overridden back to 'keep'
  const [keepOverrides, setKeepOverrides] = useState<Set<string>>(new Set())
  const [changesExpanded, setChangesExpanded] = useState(false)
  const [newMesoName, setNewMesoName] = useState<string>('')

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    fetch('/api/coach')
      .then((r) => r.json())
      .then((msgs) => { if (Array.isArray(msgs) && msgs.length > 0) setMessages(msgs) })
    fetchCheckInStatus()
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, streamingText, scrollToBottom])

  async function fetchCheckInStatus() {
    try {
      const res = await fetch('/api/check-in')
      if (!res.ok) return
      const data: CheckInStatus = await res.json()
      setCheckInStatus(data)

      // Pre-load pending check-in into the correct modal
      if (data.pending_check_in) {
        loadPendingIntoModal(data.pending_check_in)
      }
    } catch {
      // Banner is optional — fail silently
    }
  }

  function loadPendingIntoModal(pending: PendingCheckIn) {
    if (pending.check_in_type === 'weekly') {
      setWeeklyAnalysis(pending.ai_analysis as WeeklyAnalysis)
      setWeeklyCheckInId(pending.id)
      setWeeklyWeek(pending.week_number)
      setWeeklySuccess(false)
    } else {
      setEndOfMesoAnalysis(pending.ai_analysis as EndOfMesoAnalysis)
      setEndOfMesoCheckInId(pending.id)
      setEndOfMesoWeek(pending.week_number)
      setKeepOverrides(new Set())
      setEndOfMesoSuccess(false)
    }
  }

  // ── Banner actions ──────────────────────────────────────────────────────────

  async function startAnalysis() {
    setAnalyzing(true)
    try {
      const res = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analyze' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Errore analisi')

      if (data.check_in_type === 'weekly') {
        setWeeklyAnalysis(data.analysis as WeeklyAnalysis)
        setWeeklyCheckInId(data.check_in_id)
        setWeeklyWeek(data.current_week)
        setWeeklySuccess(false)
        setWeeklyOpen(true)
      } else {
        setEndOfMesoAnalysis(data.analysis as EndOfMesoAnalysis)
        setEndOfMesoCheckInId(data.check_in_id)
        setEndOfMesoWeek(data.current_week)
        setKeepOverrides(new Set())
        setEndOfMesoSuccess(false)
        setEndOfMesoOpen(true)
      }
      await fetchCheckInStatus()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Errore durante l\'analisi')
    } finally {
      setAnalyzing(false)
    }
  }

  function openPendingModal() {
    if (!checkInStatus?.pending_check_in) return
    const pending = checkInStatus.pending_check_in
    if (pending.check_in_type === 'weekly') {
      setWeeklySuccess(false)
      setWeeklyOpen(true)
    } else {
      setEndOfMesoSuccess(false)
      setChangesExpanded(false)
      setEndOfMesoOpen(true)
    }
  }

  // ── Weekly apply ────────────────────────────────────────────────────────────

  async function applyWeeklyCheckIn() {
    if (!weeklyCheckInId) return
    setWeeklyApplying(true)
    try {
      const res = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', check_in_id: weeklyCheckInId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Errore applicazione')
      setWeeklySuccess(true)
      await fetchCheckInStatus()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Errore durante l\'applicazione')
    } finally {
      setWeeklyApplying(false)
    }
  }

  // ── End-of-meso: toggle override ───────────────────────────────────────────

  function toggleKeepOverride(planExerciseId: string) {
    setKeepOverrides((prev) => {
      const next = new Set(prev)
      if (next.has(planExerciseId)) {
        next.delete(planExerciseId)
      } else {
        next.add(planExerciseId)
      }
      return next
    })
  }

  // Build final exercise_changes respecting user overrides
  function buildFinalExerciseChanges(): ExerciseChange[] {
    if (!endOfMesoAnalysis) return []
    return endOfMesoAnalysis.exercise_changes.map((change) => {
      if (
        change.action === 'replace' &&
        keepOverrides.has(change.old_exercise.plan_exercise_id)
      ) {
        // User overrode this replace → convert to keep
        return {
          action: 'keep' as const,
          plan_exercise_id: change.old_exercise.plan_exercise_id,
          exercise_name: change.old_exercise.name,
          rationale: 'Mantenuto su scelta dell\'utente',
        }
      }
      return change
    })
  }

  // ── End-of-meso apply ───────────────────────────────────────────────────────

  async function applyEndOfMeso() {
    if (!endOfMesoCheckInId) return
    setEndOfMesoApplying(true)
    try {
      const finalChanges = buildFinalExerciseChanges()
      const res = await fetch('/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply',
          check_in_id: endOfMesoCheckInId,
          exercise_changes: finalChanges,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Errore applicazione')
      setEndOfMesoSuccess(true)
      setNewMesoName(data.new_meso_name || '')
      await fetchCheckInStatus()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Errore durante l\'applicazione')
    } finally {
      setEndOfMesoApplying(false)
    }
  }

  // ── Chat ────────────────────────────────────────────────────────────────────

  async function sendMessage() {
    if (!input.trim() || streaming) return

    const userMessage: ApiMessage = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)
    setStreamingText('')

    const apiMessages = newMessages
      .filter((m) => typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content as string }))

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') {
            const assistantMessage: ApiMessage = { role: 'assistant', content: accumulated }
            const finalMessages = [...newMessages, assistantMessage]
            setMessages(finalMessages)
            setStreamingText('')
            fetch('/api/coach', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: finalMessages.filter((m) => typeof m.content === 'string'),
              }),
            })
            fetchCheckInStatus()
            break
          }
          try {
            const parsed = JSON.parse(data)
            if (parsed.text) { accumulated += parsed.text; setStreamingText(accumulated) }
            if (parsed.error) { accumulated = `Errore: ${parsed.error}`; setStreamingText(accumulated) }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore di connessione'
      setStreamingText(`Errore: ${msg}`)
      setTimeout(() => setStreamingText(''), 3000)
    } finally {
      setStreaming(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  async function clearConversation() {
    setMessages([])
    setStreamingText('')
    await fetch('/api/coach', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    })
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const displayMessages = toDisplayMessages(messages)
  const hasPending = !!checkInStatus?.pending_check_in
  const isEndOfMeso = !!checkInStatus?.is_end_of_meso
  const showBanner = checkInStatus?.has_active_meso && checkInStatus?.show_banner

  // End-of-meso modal stats
  const replaceCount = endOfMesoAnalysis?.exercise_changes.filter(
    (c) => c.action === 'replace' && !keepOverrides.has(c.old_exercise.plan_exercise_id)
  ).length ?? 0
  const keepCount = (endOfMesoAnalysis?.exercise_changes.length ?? 0) - replaceCount

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">AI Coach</h1>
        </div>
        {displayMessages.length > 0 && (
          <Button variant="ghost" size="icon" onClick={clearConversation} className="text-muted-foreground">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* ── Check-in banner ─────────────────────────────────────────────────── */}
      {showBanner && (
        <div className={cn(
          'mx-4 mt-3 rounded-xl border p-3 flex items-center justify-between gap-3',
          isEndOfMeso
            ? 'border-amber-500/40 bg-amber-500/5'
            : 'border-primary/40 bg-primary/5'
        )}>
          <div className="flex items-center gap-2 min-w-0">
            {isEndOfMeso
              ? <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
              : <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />}
            <div className="min-w-0">
              <p className={cn(
                'text-sm font-medium truncate',
                isEndOfMeso ? 'text-amber-600 dark:text-amber-400' : 'text-primary'
              )}>
                {isEndOfMeso
                  ? `Mesociclo completato! Pronto per la review finale?`
                  : `Check-in Settimana ${checkInStatus?.current_week}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasPending
                  ? 'Analisi pronta — revisiona le proposte'
                  : isEndOfMeso
                    ? `${checkInStatus?.duration_weeks} settimane completate`
                    : checkInStatus?.days_since_check_in === null
                      ? 'Primo check-in del mesociclo'
                      : `${checkInStatus?.days_since_check_in} giorni dall'ultimo`}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={hasPending ? 'outline' : isEndOfMeso ? 'default' : 'default'}
            className={cn(
              'shrink-0 text-xs',
              isEndOfMeso && !hasPending && 'bg-amber-500 hover:bg-amber-600 text-white'
            )}
            onClick={hasPending ? openPendingModal : startAnalysis}
            disabled={analyzing}
          >
            {analyzing
              ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Analisi...</>
              : hasPending ? 'Visualizza' : isEndOfMeso ? 'Review finale' : 'Esegui'}
          </Button>
        </div>
      )}

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayMessages.length === 0 && !streamingText && (
          <div className="text-center py-12 space-y-3">
            <Bot className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground font-medium">Ciao! Sono il tuo AI Coach.</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Puoi chiedermi di:</p>
              <div className="flex flex-col gap-1.5 items-center">
                {['Analizzare i miei progressi', 'Modificare la scheda di allenamento',
                  'Aggiustare i target macro', 'Consigli su recupero e nutrizione'].map((s) => (
                  <button key={s} onClick={() => setInput(s)}
                    className="px-3 py-1.5 rounded-full border text-xs hover:bg-accent transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {displayMessages.map((msg, i) => (
          <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
            <div className={cn('max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-tr-sm'
                : 'bg-muted rounded-tl-sm')}>
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
            {msg.role === 'user' && (
              <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {streamingText && (
          <div className="flex gap-2 justify-start">
            <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm bg-muted">
              <p className="whitespace-pre-wrap leading-relaxed">{streamingText}</p>
              <span className="inline-block w-1.5 h-4 bg-foreground animate-pulse ml-0.5 rounded-sm" />
            </div>
          </div>
        )}

        {streaming && !streamingText && (
          <div className="flex gap-2 justify-start">
            <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-muted">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ───────────────────────────────────────────────────────────── */}
      <div className="p-4 border-t">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scrivi un messaggio... (Invio per inviare)"
            className="resize-none min-h-[44px] max-h-32"
            rows={1}
            disabled={streaming}
          />
          <Button size="icon" onClick={sendMessage} disabled={!input.trim() || streaming}
            className="shrink-0 h-11 w-11">
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          WEEKLY CHECK-IN MODAL
      ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={weeklyOpen} onOpenChange={(o) => { if (!weeklyApplying) setWeeklyOpen(o) }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          {weeklySuccess ? (
            <div className="text-center py-6 space-y-3">
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <ClipboardCheck className="h-6 w-6 text-green-500" />
              </div>
              <DialogHeader>
                <DialogTitle>Check-in applicato!</DialogTitle>
                <DialogDescription>
                  I target per la settimana {weeklyWeek + 1} sono stati salvati.
                </DialogDescription>
              </DialogHeader>
              <Button className="w-full" onClick={() => setWeeklyOpen(false)}>Chiudi</Button>
            </div>
          ) : weeklyAnalysis ? (
            <>
              <DialogHeader>
                <DialogTitle>Check-in Settimana {weeklyWeek}</DialogTitle>
                <DialogDescription>Revisiona le proposte prima di applicarle.</DialogDescription>
              </DialogHeader>

              {/* Summary */}
              <div className="bg-muted rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sessioni completate</span>
                  <span className="font-medium">{weeklyAnalysis.week_summary.sessions_completed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fatica</span>
                  <span className="font-medium">{fatigueLabel[weeklyAnalysis.week_summary.overall_fatigue]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Aderenza</span>
                  <span className="font-medium">{Math.round(weeklyAnalysis.week_summary.overall_adherence * 100)}%</span>
                </div>
                {weeklyAnalysis.week_summary.observations && (
                  <p className="text-xs text-muted-foreground pt-1 border-t leading-relaxed">
                    {weeklyAnalysis.week_summary.observations}
                  </p>
                )}
              </div>

              {/* Exercise updates */}
              <div className="space-y-1">
                <button
                  className="flex items-center justify-between w-full text-sm font-medium py-1"
                  onClick={() => setWeeklyExExpanded(!weeklyExExpanded)}
                >
                  <span>Aggiornamenti esercizi ({weeklyAnalysis.exercise_updates.length})</span>
                  {weeklyExExpanded
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {weeklyExExpanded && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {weeklyAnalysis.exercise_updates.map((u) => (
                      <div key={u.plan_exercise_id} className="border rounded-lg p-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{u.exercise_name}</span>
                          <div className="flex items-center gap-1">
                            {weeklyActionIcon[u.action]}
                            <span className="text-muted-foreground">{weeklyActionLabel[u.action]}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 text-muted-foreground">
                          <span>{u.current_weight_kg}kg × {u.current_reps}</span>
                          <span>→</span>
                          <span className="text-foreground font-medium">
                            {u.recommended_weight_kg}kg × {u.recommended_reps}
                          </span>
                        </div>
                        <p className="text-muted-foreground leading-relaxed">{u.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Diet feedback */}
              {weeklyAnalysis.diet_feedback && (
                <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
                  <p className="font-medium text-sm">Feedback dieta</p>
                  <div className="flex gap-4 text-muted-foreground">
                    <span>Kcal: {weeklyAnalysis.diet_feedback.avg_calories}</span>
                    <span>Proteine: {weeklyAnalysis.diet_feedback.avg_protein_g}g</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    {weeklyAnalysis.diet_feedback.recommendation}
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1"
                  onClick={() => setWeeklyOpen(false)} disabled={weeklyApplying}>
                  Annulla
                </Button>
                <Button className="flex-1" onClick={applyWeeklyCheckIn} disabled={weeklyApplying}>
                  {weeklyApplying
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Applicazione...</>
                    : 'Applica'}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════
          END-OF-MESO MODAL
      ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={endOfMesoOpen} onOpenChange={(o) => { if (!endOfMesoApplying) setEndOfMesoOpen(o) }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          {endOfMesoSuccess ? (
            /* ── Success state ─────────────────────────────────────────────── */
            <div className="text-center py-6 space-y-3">
              <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
                <Trophy className="h-6 w-6 text-amber-500" />
              </div>
              <DialogHeader>
                <DialogTitle>Nuovo mesociclo creato!</DialogTitle>
                <DialogDescription>
                  Il piano è stato aggiornato e il nuovo mesociclo{newMesoName ? ` "${newMesoName}"` : ''} è attivo.
                </DialogDescription>
              </DialogHeader>
              <Button className="w-full" onClick={() => setEndOfMesoOpen(false)}>Chiudi</Button>
            </div>
          ) : endOfMesoAnalysis ? (
            /* ── Analysis state ────────────────────────────────────────────── */
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  Fine Mesociclo — Settimana {endOfMesoWeek}
                </DialogTitle>
                <DialogDescription>
                  Revisiona le proposte per il prossimo blocco di allenamento.
                </DialogDescription>
              </DialogHeader>

              {/* Meso summary */}
              <div className="bg-muted rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sessioni totali</span>
                  <span className="font-medium">{endOfMesoAnalysis.meso_summary.total_sessions}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Aderenza media</span>
                  <span className="font-medium">
                    {Math.round(endOfMesoAnalysis.meso_summary.avg_adherence * 100)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Progressi</span>
                  <span className={cn('font-medium', progressColor[endOfMesoAnalysis.meso_summary.overall_progress])}>
                    {progressLabel[endOfMesoAnalysis.meso_summary.overall_progress]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground pt-1 border-t leading-relaxed">
                  {endOfMesoAnalysis.meso_summary.narrative}
                </p>
              </div>

              {/* New meso targets */}
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium text-primary">
                  Prossimo mesociclo — {endOfMesoAnalysis.new_meso_targets.duration_weeks} settimane
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {endOfMesoAnalysis.new_meso_targets.notes}
                </p>
              </div>

              {/* Exercise changes */}
              <div className="space-y-1">
                <button
                  className="flex items-center justify-between w-full text-sm font-medium py-1"
                  onClick={() => setChangesExpanded(!changesExpanded)}
                >
                  <span>
                    Esercizi: {keepCount} mantenuti
                    {replaceCount > 0 && <span className="text-amber-500 ml-1">· {replaceCount} sostituiti</span>}
                  </span>
                  {changesExpanded
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>

                {changesExpanded && (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {endOfMesoAnalysis.exercise_changes.map((change, idx) => {
                      if (change.action === 'keep') {
                        return (
                          <div key={idx} className="border rounded-lg p-2.5 text-xs space-y-1">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              <span className="font-medium">{change.exercise_name}</span>
                              <span className="text-muted-foreground ml-auto">Mantenuto</span>
                            </div>
                            <p className="text-muted-foreground leading-relaxed">{change.rationale}</p>
                          </div>
                        )
                      }

                      // action === 'replace'
                      const isOverridden = keepOverrides.has(change.old_exercise.plan_exercise_id)
                      return (
                        <div key={idx}
                          className={cn(
                            'border rounded-lg p-2.5 text-xs space-y-1.5 transition-colors',
                            isOverridden ? 'border-green-500/30 bg-green-500/5' : 'border-amber-500/30 bg-amber-500/5'
                          )}>
                          {/* Header row */}
                          <div className="flex items-center gap-1.5">
                            {isOverridden
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              : <ArrowRightLeft className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                            <span className={cn('font-medium', isOverridden && 'line-through text-muted-foreground')}>
                              {change.old_exercise.name}
                            </span>
                            {!isOverridden && (
                              <span className="text-amber-600 dark:text-amber-400 ml-auto font-medium">Sostituito</span>
                            )}
                            {isOverridden && (
                              <span className="text-green-600 dark:text-green-400 ml-auto font-medium">Mantenuto</span>
                            )}
                          </div>

                          {/* Replacement target */}
                          {!isOverridden && (
                            <div className="flex items-center gap-1 text-muted-foreground pl-5">
                              <span>→</span>
                              <span className="text-foreground font-medium">{change.new_exercise.name}</span>
                              <span className="ml-auto">
                                {change.new_exercise.sets}×{change.new_exercise.reps} @ {change.new_exercise.weight_kg}kg
                              </span>
                            </div>
                          )}

                          {/* Rationale */}
                          <p className="text-muted-foreground leading-relaxed pl-5">{change.rationale}</p>

                          {/* Override toggle */}
                          <button
                            className={cn(
                              'flex items-center gap-1 text-xs font-medium transition-colors pl-5',
                              isOverridden
                                ? 'text-amber-500 hover:text-amber-600'
                                : 'text-green-600 hover:text-green-700 dark:text-green-400'
                            )}
                            onClick={() => toggleKeepOverride(change.old_exercise.plan_exercise_id)}
                          >
                            <RotateCcw className="h-3 w-3" />
                            {isOverridden ? 'Applica sostituzione AI' : 'Mantieni esercizio originale'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1"
                  onClick={() => setEndOfMesoOpen(false)} disabled={endOfMesoApplying}>
                  Annulla
                </Button>
                <Button
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={applyEndOfMeso}
                  disabled={endOfMesoApplying}
                >
                  {endOfMesoApplying
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creazione...</>
                    : 'Applica e crea nuovo piano'}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

    </div>
  )
}

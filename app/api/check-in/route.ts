import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  detectCheckInType,
  WeeklyCheckInSchema,
  WeeklyCheckInOutput,
  EndOfMesoSchema,
  EndOfMesoOutput,
  EndOfMesoExerciseChange,
} from '@/lib/ai/check-in-schema'
import { getAIProvider } from '@/lib/ai/provider'

// ─── Shared helpers ───────────────────────────────────────────────────────────

function getCurrentWeek(startDate: string, durationWeeks: number): number {
  const start = new Date(startDate)
  const now = new Date()
  const days = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return Math.min(Math.max(Math.floor(days / 7) + 1, 1), durationWeeks)
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildWeeklyPrompt(
  currentWeek: number,
  durationWeeks: number,
  sessions: unknown[],
  dietLogs: unknown[],
  plan: unknown
): string {
  return `Sei in modalità CHECK-IN SETTIMANALE (settimana ${currentWeek}/${durationWeeks}).
Analizza i log degli ultimi 7 giorni e rispondi SOLO in JSON valido.

VINCOLO ASSOLUTO: Non proporre cambi di esercizi. Modifica SOLO peso e reps.

Regole della doppia progressione:
- Se reps_eseguiti >= reps_target E RPE_medio <= 8: aumenta reps di 1
- Se reps_eseguiti >= reps_target E RPE_medio <= 7: aumenta peso (+2.5kg compound, +1kg isolamento) e reset reps a target_min
- Se RPE_medio >= 9 su 1 sessione: mantieni invariato
- Se RPE_medio >= 9 su 2+ sessioni consecutive: non aumentare peso

SCHEDA ATTIVA:
${JSON.stringify(plan, null, 2)}

LOG SESSIONI ULTIMI 7 GIORNI:
${JSON.stringify(sessions, null, 2)}

LOG DIETA ULTIMI 7 GIORNI:
${JSON.stringify(dietLogs, null, 2)}

Includi TUTTI gli esercizi della scheda nell'array exercise_updates, anche quelli senza log (usa action: "maintain").
Usa i plan_exercise_id reali dalla scheda.

Rispondi ESCLUSIVAMENTE con JSON valido (nessun testo prima o dopo):
{
  "week_summary": {
    "sessions_completed": <intero>,
    "overall_fatigue": "<low|medium|high>",
    "overall_adherence": <0.0-1.0>,
    "observations": "<testo in italiano>"
  },
  "exercise_updates": [
    {
      "plan_exercise_id": "<uuid>",
      "exercise_name": "<nome>",
      "current_weight_kg": <number>,
      "current_reps": <intero>,
      "recommended_weight_kg": <number>,
      "recommended_reps": <intero>,
      "action": "<increase_reps|increase_weight|maintain|decrease>",
      "rationale": "<motivazione in italiano>"
    }
  ],
  "diet_feedback": {
    "avg_calories": <number>,
    "avg_protein_g": <number>,
    "recommendation": "<testo in italiano>"
  }
}`
}

function buildEndOfMesoPrompt(
  durationWeeks: number,
  sessions: unknown[],
  plan: unknown
): string {
  return `Sei in modalità CHECK-IN FINE MESOCICLO (${durationWeeks} settimane completate).
Analizza il mesociclo completo e rispondi SOLO in JSON valido.

Puoi proporre cambi di esercizi per il prossimo mesociclo.

Criteri per sostituire un esercizio (tutti e tre raccomandati prima di proporre replace):
- Nessun progresso di peso o reps per >= 3 settimane consecutive
- RPE medio >= 9 su più sessioni consecutive (esercizio incompatibile anatomicamente)
- Note soggettive negative ripetute

VINCOLO ASSOLUTO: Mantieni SEMPRE i compound fondamentali (squat, bench press, deadlift, overhead press, row) salvo motivazione eccezionale documentata nella rationale.

SCHEDA ATTIVA (con i plan_exercise_id reali):
${JSON.stringify(plan, null, 2)}

STORICO COMPLETO SESSIONI DEL MESOCICLO:
${JSON.stringify(sessions, null, 2)}

Per ogni esercizio della scheda devi emettere UNA entry in exercise_changes.
Per action "keep": usa il plan_exercise_id dell'esercizio corrente.
Per action "replace": specifica old_exercise (con plan_exercise_id) e new_exercise (nome, sets, reps come numero intero, weight_kg iniziale suggerito).

Rispondi ESCLUSIVAMENTE con JSON valido (nessun testo prima o dopo):
{
  "meso_summary": {
    "total_sessions": <intero>,
    "avg_adherence": <0.0-1.0>,
    "overall_progress": "<poor|fair|good|excellent>",
    "narrative": "<riepilogo in italiano, 2-3 frasi>"
  },
  "exercise_changes": [
    {
      "action": "keep",
      "plan_exercise_id": "<uuid>",
      "exercise_name": "<nome>",
      "rationale": "<motivazione in italiano>"
    },
    {
      "action": "replace",
      "old_exercise": { "plan_exercise_id": "<uuid>", "name": "<nome vecchio>" },
      "new_exercise": { "name": "<nome nuovo>", "sets": <intero>, "reps": <intero>, "weight_kg": <number> },
      "rationale": "<motivazione in italiano>"
    }
  ],
  "new_meso_targets": {
    "duration_weeks": <6 o 8>,
    "notes": "<obiettivi prossimo meso in italiano>"
  }
}`
}

// ─── GET: Status banner ───────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: meso } = await supabase
    .from('mesocycles')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!meso) return NextResponse.json({ has_active_meso: false })

  const currentWeek = getCurrentWeek(meso.start_date, meso.duration_weeks)
  const checkInType = detectCheckInType(currentWeek, meso.duration_weeks)

  // Fetch last check-in of ANY type for this mesocycle
  const { data: lastCheckIn } = await supabase
    .from('weekly_check_ins')
    .select('id, check_in_date, week_number, applied, ai_analysis, check_in_type')
    .eq('mesocycle_id', meso.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const daysSinceCheckIn = lastCheckIn
    ? Math.floor((Date.now() - new Date(lastCheckIn.check_in_date).getTime()) / (1000 * 60 * 60 * 24))
    : null

  const pendingCheckIn = lastCheckIn && !lastCheckIn.applied ? lastCheckIn : null

  let showBanner: boolean
  if (checkInType === 'end_of_meso') {
    // Show unless an end_of_meso check-in for this meso is already applied
    const endOfMesoDone =
      lastCheckIn?.check_in_type === 'end_of_meso' && lastCheckIn?.applied
    showBanner = !endOfMesoDone
  } else {
    showBanner = daysSinceCheckIn === null || daysSinceCheckIn >= 7
  }

  return NextResponse.json({
    has_active_meso: true,
    meso_name: meso.name,
    current_week: currentWeek,
    duration_weeks: meso.duration_weeks,
    is_end_of_meso: checkInType === 'end_of_meso',
    days_since_check_in: daysSinceCheckIn,
    show_banner: showBanner,
    pending_check_in: pendingCheckIn,
  })
}

// ─── POST: Analyze | Apply ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action } = body

  // ── ANALYZE ─────────────────────────────────────────────────────────────────
  if (action === 'analyze') {
    const { data: meso, error: mesoError } = await supabase
      .from('mesocycles')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (mesoError || !meso) {
      return NextResponse.json({ error: 'Nessun mesociclo attivo trovato.' }, { status: 400 })
    }

    const currentWeek = getCurrentWeek(meso.start_date, meso.duration_weeks)
    const checkInType = detectCheckInType(currentWeek, meso.duration_weeks)

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // For end_of_meso we need the full meso history; for weekly, last 7 days
    const sessionsFromDate = checkInType === 'end_of_meso'
      ? meso.start_date
      : sevenDaysAgo.toISOString().split('T')[0]

    const [{ data: sessions }, { data: dietLogs }, { data: plan }] = await Promise.all([
      supabase
        .from('workout_sessions')
        .select(`
          *,
          plan_day:workout_plan_days(day_name),
          exercises:session_exercises(*, plan_exercise:plan_exercises(name, sets, reps, weight_kg))
        `)
        .eq('user_id', user.id)
        .gte('date', sessionsFromDate)
        .order('date', { ascending: false }),
      supabase
        .from('diet_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', sevenDaysAgo.toISOString().split('T')[0])
        .order('date', { ascending: false }),
      supabase
        .from('workout_plans')
        .select(`*, days:workout_plan_days(*, exercises:plan_exercises(*))`)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single(),
    ])

    let analysis: WeeklyCheckInOutput | EndOfMesoOutput
    const sessionData = { sessions: sessions || [], diet_logs: dietLogs || [] }

    try {
      const ai = getAIProvider()
      if (checkInType === 'weekly') {
        const prompt = buildWeeklyPrompt(
          currentWeek, meso.duration_weeks, sessions || [], dietLogs || [], plan
        )
        analysis = await ai.generateStructuredOutput(prompt, '', WeeklyCheckInSchema)
      } else {
        const prompt = buildEndOfMesoPrompt(meso.duration_weeks, sessions || [], plan)
        analysis = await ai.generateStructuredOutput(prompt, '', EndOfMesoSchema)
      }
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Analisi fallita' },
        { status: 500 }
      )
    }

    const { data: checkIn, error: saveError } = await supabase
      .from('weekly_check_ins')
      .insert({
        user_id: user.id,
        mesocycle_id: meso.id,
        week_number: currentWeek,
        check_in_type: checkInType,
        session_data: sessionData,
        ai_analysis: analysis,
        applied: false,
      })
      .select()
      .single()

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 })
    }

    return NextResponse.json({
      check_in_id: checkIn.id,
      check_in_type: checkInType,
      analysis,
      current_week: currentWeek,
    })
  }

  // ── APPLY ────────────────────────────────────────────────────────────────────
  if (action === 'apply') {
    const { check_in_id } = body

    const { data: checkIn, error: loadError } = await supabase
      .from('weekly_check_ins')
      .select('*')
      .eq('id', check_in_id)
      .eq('user_id', user.id)
      .single()

    if (loadError || !checkIn) {
      return NextResponse.json({ error: 'Check-in non trovato.' }, { status: 404 })
    }
    if (checkIn.applied) {
      return NextResponse.json({ error: 'Check-in già applicato.' }, { status: 400 })
    }

    // ── Weekly apply (unchanged logic) ────────────────────────────────────────
    if (checkIn.check_in_type === 'weekly') {
      const analysis = checkIn.ai_analysis as WeeklyCheckInOutput
      const nextWeek = checkIn.week_number + 1

      if (nextWeek <= 8) {
        for (const update of analysis.exercise_updates) {
          await supabase
            .from('exercise_progressions')
            .upsert(
              {
                mesocycle_id: checkIn.mesocycle_id,
                plan_exercise_id: update.plan_exercise_id,
                week_number: nextWeek,
                target_weight_kg: update.recommended_weight_kg,
                target_reps: update.recommended_reps,
                notes: update.rationale,
              },
              { onConflict: 'plan_exercise_id,week_number' }
            )
        }
      }

      await supabase
        .from('weekly_check_ins')
        .update({ applied: true })
        .eq('id', check_in_id)

      return NextResponse.json({ success: true, check_in_type: 'weekly', next_week: nextWeek })
    }

    // ── End-of-meso apply ─────────────────────────────────────────────────────
    if (checkIn.check_in_type === 'end_of_meso') {
      // exercise_changes from body = user-approved set (may differ from DB analysis)
      const exerciseChanges: EndOfMesoExerciseChange[] = body.exercise_changes

      // Load the mesocycle to get the current plan id
      const { data: meso, error: mesoError } = await supabase
        .from('mesocycles')
        .select('*')
        .eq('id', checkIn.mesocycle_id)
        .single()

      if (mesoError || !meso) {
        return NextResponse.json({ error: 'Mesociclo non trovato.' }, { status: 500 })
      }

      // Load full current plan structure
      const { data: currentPlan, error: planError } = await supabase
        .from('workout_plans')
        .select(`*, days:workout_plan_days(*, exercises:plan_exercises(*))`)
        .eq('id', meso.workout_plan_id)
        .single()

      if (planError || !currentPlan) {
        return NextResponse.json({ error: 'Piano attuale non trovato.' }, { status: 500 })
      }

      // Build lookup: plan_exercise_id → approved change
      const changeMap = new Map<string, EndOfMesoExerciseChange>()
      for (const change of exerciseChanges) {
        const key = change.action === 'keep'
          ? change.plan_exercise_id
          : change.old_exercise.plan_exercise_id
        changeMap.set(key, change)
      }

      // Read new_meso_targets from stored AI analysis (not client-provided)
      const storedAnalysis = checkIn.ai_analysis as EndOfMesoOutput
      const { duration_weeks: newDurationWeeks, notes: mesoNotes } = storedAnalysis.new_meso_targets

      // ── 1. Deactivate current plan ────────────────────────────────────────
      await supabase
        .from('workout_plans')
        .update({ is_active: false })
        .eq('id', currentPlan.id)

      // ── 2. Create new workout plan ────────────────────────────────────────
      const { data: newPlan, error: newPlanError } = await supabase
        .from('workout_plans')
        .insert({
          user_id: user.id,
          name: currentPlan.name,
          notes: mesoNotes || currentPlan.notes,
          is_active: true,
        })
        .select()
        .single()

      if (newPlanError || !newPlan) {
        return NextResponse.json({ error: 'Errore creazione nuovo piano.' }, { status: 500 })
      }

      // ── 3. Recreate days + exercises applying keep/replace decisions ───────
      const sortedDays = [...(currentPlan.days || [])].sort(
        (a: { day_order: number }, b: { day_order: number }) => a.day_order - b.day_order
      )

      for (const day of sortedDays) {
        const { data: newDay } = await supabase
          .from('workout_plan_days')
          .insert({
            plan_id: newPlan.id,
            day_name: day.day_name,
            day_order: day.day_order,
          })
          .select()
          .single()

        if (!newDay) continue

        const sortedExercises = [...(day.exercises || [])].sort(
          (a: { order: number }, b: { order: number }) => a.order - b.order
        )

        for (const ex of sortedExercises) {
          const change = changeMap.get(ex.id)

          if (change?.action === 'replace') {
            // Use AI-proposed replacement exercise
            await supabase.from('plan_exercises').insert({
              day_id: newDay.id,
              name: change.new_exercise.name,
              sets: change.new_exercise.sets,
              reps: String(change.new_exercise.reps),
              weight_kg: change.new_exercise.weight_kg,
              notes: null,
              order: ex.order,
            })
          } else {
            // Keep original exercise (action: 'keep' or no matching change)
            await supabase.from('plan_exercises').insert({
              day_id: newDay.id,
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              weight_kg: ex.weight_kg,
              notes: ex.notes,
              order: ex.order,
            })
          }
        }
      }

      // ── 4. Close current mesocycle ────────────────────────────────────────
      await supabase
        .from('mesocycles')
        .update({ status: 'completed', end_date: todayISO() })
        .eq('id', meso.id)

      // ── 5. Create new mesocycle ───────────────────────────────────────────
      const { count } = await supabase
        .from('mesocycles')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      const mesoNumber = (count ?? 0) + 1
      const now = new Date()
      const monthName = now.toLocaleDateString('it-IT', { month: 'long' })
      const newMesoName = `Meso ${mesoNumber} - ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${now.getFullYear()}`

      const { data: newMeso } = await supabase
        .from('mesocycles')
        .insert({
          user_id: user.id,
          workout_plan_id: newPlan.id,
          name: newMesoName,
          start_date: todayISO(),
          duration_weeks: newDurationWeeks,
          status: 'active',
        })
        .select()
        .single()

      // ── 6. Mark check-in as applied ───────────────────────────────────────
      await supabase
        .from('weekly_check_ins')
        .update({ applied: true })
        .eq('id', check_in_id)

      return NextResponse.json({
        success: true,
        check_in_type: 'end_of_meso',
        new_plan_id: newPlan.id,
        new_meso_id: newMeso?.id,
        new_meso_name: newMesoName,
      })
    }

    return NextResponse.json({ error: 'Tipo check-in sconosciuto.' }, { status: 400 })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

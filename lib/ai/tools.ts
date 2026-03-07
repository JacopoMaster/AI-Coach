import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: 'get_body_metrics',
    description: 'Retrieve the user\'s body measurements for the last N days. Returns weight, body fat %, muscle mass, BMI, BMR, visceral fat, metabolic age, and more.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to look back (default: 30)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_workout_plan',
    description: 'Retrieve the user\'s active workout plan with all training days and exercises (sets, reps, weight).',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_workout_history',
    description: 'Retrieve the user\'s completed workout sessions for the last N days, including exercises performed, weights used, and notes.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to look back (default: 30)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_diet_plan',
    description: 'Retrieve the user\'s active diet plan with calorie target and macronutrient targets (protein, carbs, fat).',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_diet_logs',
    description: 'Retrieve the user\'s daily nutrition logs for the last N days.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to look back (default: 30)',
        },
      },
      required: [],
    },
  },
  {
    name: 'update_workout_plan',
    description: 'Modify the active workout plan. Can update exercise parameters (sets, reps, weight) or add a completely new plan structure. Use this to adjust training based on progress, fatigue, or user goals.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['update_exercise', 'create_plan'],
          description: 'Whether to update a single exercise or create a completely new plan',
        },
        exercise_id: {
          type: 'string',
          description: 'ID of the exercise to update (required for update_exercise action)',
        },
        updates: {
          type: 'object',
          description: 'Fields to update for the exercise: sets, reps, weight_kg, notes',
          properties: {
            sets: { type: 'number' },
            reps: { type: 'string' },
            weight_kg: { type: 'number' },
            notes: { type: 'string' },
          },
        },
        plan: {
          type: 'object',
          description: 'New plan structure for create_plan action',
          properties: {
            name: { type: 'string' },
            notes: { type: 'string' },
            days: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  day_name: { type: 'string' },
                  day_order: { type: 'number' },
                  exercises: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        sets: { type: 'number' },
                        reps: { type: 'string' },
                        weight_kg: { type: 'number' },
                        notes: { type: 'string' },
                        order: { type: 'number' },
                      },
                      required: ['name', 'sets', 'reps'],
                    },
                  },
                },
                required: ['day_name', 'exercises'],
              },
            },
          },
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'update_diet_plan',
    description: 'Modify the active diet plan calorie and macronutrient targets. Use this to adjust nutrition targets based on body composition progress, training load, or user goals.',
    input_schema: {
      type: 'object',
      properties: {
        calories: { type: 'number', description: 'Daily calorie target' },
        protein_g: { type: 'number', description: 'Daily protein target in grams' },
        carbs_g: { type: 'number', description: 'Daily carbohydrate target in grams' },
        fat_g: { type: 'number', description: 'Daily fat target in grams' },
        notes: { type: 'string', description: 'Notes about the diet plan changes' },
      },
      required: [],
    },
  },
  {
    name: 'run_weekly_checkin',
    description: 'Esegue un check-in settimanale strutturato. Analizza i log della settimana appena conclusa e aggiorna i target di peso/reps per la prossima settimana applicando il sovraccarico progressivo. Usa confirm_apply: false per visualizzare l\'analisi in sospeso, confirm_apply: true per applicarla al DB.',
    input_schema: {
      type: 'object',
      properties: {
        week_number: {
          type: 'number',
          description: 'Numero settimana del mesociclo (1-8)',
        },
        confirm_apply: {
          type: 'boolean',
          description: 'Se true, applica al DB il check-in in sospeso. Se false, mostra l\'analisi senza applicarla.',
        },
      },
      required: ['week_number', 'confirm_apply'],
    },
  },
  {
    name: 'add_session_note',
    description: 'Add or update a note for a specific exercise in the workout plan. Useful for tracking cues, form reminders, or progression notes.',
    input_schema: {
      type: 'object',
      properties: {
        exercise_id: {
          type: 'string',
          description: 'ID of the exercise to add the note to',
        },
        note: {
          type: 'string',
          description: 'The note content to add',
        },
      },
      required: ['exercise_id', 'note'],
    },
  },
]

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const supabase = await createClient()

  switch (toolName) {
    case 'get_body_metrics': {
      const days = (toolInput.days as number) || 30
      const from = new Date()
      from.setDate(from.getDate() - days)
      const { data } = await supabase
        .from('body_measurements')
        .select('*')
        .eq('user_id', userId)
        .gte('date', from.toISOString().split('T')[0])
        .order('date', { ascending: true })
      return data || []
    }

    case 'get_workout_plan': {
      const { data } = await supabase
        .from('workout_plans')
        .select(`*, days:workout_plan_days(*, exercises:plan_exercises(*))`)
        .eq('user_id', userId)
        .eq('is_active', true)
        .single()

      if (data?.days) {
        data.days = data.days
          .sort((a: { day_order: number }, b: { day_order: number }) => a.day_order - b.day_order)
        data.days.forEach((day: { exercises: { order: number }[] }) => {
          day.exercises = day.exercises?.sort((a, b) => a.order - b.order)
        })
      }
      return data || null
    }

    case 'get_workout_history': {
      const days = (toolInput.days as number) || 30
      const from = new Date()
      from.setDate(from.getDate() - days)
      const { data } = await supabase
        .from('workout_sessions')
        .select(`*, plan_day:workout_plan_days(day_name), exercises:session_exercises(*, plan_exercise:plan_exercises(name))`)
        .eq('user_id', userId)
        .gte('date', from.toISOString().split('T')[0])
        .order('date', { ascending: false })
      return data || []
    }

    case 'get_diet_plan': {
      const { data } = await supabase
        .from('diet_plans')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single()
      return data || null
    }

    case 'get_diet_logs': {
      const days = (toolInput.days as number) || 30
      const from = new Date()
      from.setDate(from.getDate() - days)
      const { data } = await supabase
        .from('diet_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('date', from.toISOString().split('T')[0])
        .order('date', { ascending: false })
      return data || []
    }

    case 'update_workout_plan': {
      const action = toolInput.action as string

      if (action === 'update_exercise') {
        const exerciseId = toolInput.exercise_id as string
        const updates = toolInput.updates as Record<string, unknown>
        const { data, error } = await supabase
          .from('plan_exercises')
          .update(updates)
          .eq('id', exerciseId)
          .select()
          .single()
        if (error) return { error: error.message }
        return { success: true, exercise: data }
      }

      if (action === 'create_plan') {
        const plan = toolInput.plan as {
          name: string
          notes?: string
          days: Array<{
            day_name: string
            day_order?: number
            exercises: Array<{
              name: string
              sets: number
              reps: string
              weight_kg?: number
              notes?: string
              order?: number
            }>
          }>
        }

        await supabase.from('workout_plans').update({ is_active: false }).eq('user_id', userId)

        const { data: newPlan, error } = await supabase
          .from('workout_plans')
          .insert({ user_id: userId, name: plan.name, notes: plan.notes, is_active: true })
          .select()
          .single()

        if (error) return { error: error.message }

        for (let i = 0; i < plan.days.length; i++) {
          const day = plan.days[i]
          const { data: planDay } = await supabase
            .from('workout_plan_days')
            .insert({ plan_id: newPlan.id, day_name: day.day_name, day_order: day.day_order ?? i })
            .select()
            .single()

          if (planDay) {
            for (let j = 0; j < day.exercises.length; j++) {
              const ex = day.exercises[j]
              await supabase.from('plan_exercises').insert({
                day_id: planDay.id,
                name: ex.name,
                sets: ex.sets,
                reps: ex.reps,
                weight_kg: ex.weight_kg ?? null,
                notes: ex.notes ?? null,
                order: ex.order ?? j,
              })
            }
          }
        }
        return { success: true, plan: newPlan }
      }

      return { error: 'Unknown action' }
    }

    case 'update_diet_plan': {
      const { data: existing } = await supabase
        .from('diet_plans')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single()

      if (existing) {
        const { data, error } = await supabase
          .from('diet_plans')
          .update(toolInput)
          .eq('id', existing.id)
          .select()
          .single()
        if (error) return { error: error.message }
        return { success: true, plan: data }
      }

      const { data, error } = await supabase
        .from('diet_plans')
        .insert({ user_id: userId, name: 'Piano alimentare', is_active: true, ...toolInput })
        .select()
        .single()
      if (error) return { error: error.message }
      return { success: true, plan: data }
    }

    case 'add_session_note': {
      const exerciseId = toolInput.exercise_id as string
      const note = toolInput.note as string
      const { data, error } = await supabase
        .from('plan_exercises')
        .update({ notes: note })
        .eq('id', exerciseId)
        .select()
        .single()
      if (error) return { error: error.message }
      return { success: true, exercise: data }
    }

    case 'run_weekly_checkin': {
      const confirmApply = toolInput.confirm_apply as boolean

      // Get active mesocycle
      const { data: meso } = await supabase
        .from('mesocycles')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!meso) return { error: 'Nessun mesociclo attivo trovato.' }

      // Get last unapplied check-in for this meso
      const { data: pending } = await supabase
        .from('weekly_check_ins')
        .select('*')
        .eq('mesocycle_id', meso.id)
        .eq('check_in_type', 'weekly')
        .eq('applied', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!confirmApply) {
        if (!pending) {
          return {
            message: 'Nessun check-in in sospeso. Usa il banner nella pagina Coach per avviare l\'analisi settimanale.',
          }
        }
        return {
          message: 'Check-in in sospeso trovato.',
          analysis: pending.ai_analysis,
          week_number: pending.week_number,
          check_in_id: pending.id,
        }
      }

      // confirm_apply: true — apply the pending check-in
      if (!pending) {
        return { error: 'Nessun check-in in sospeso da applicare. Esegui prima l\'analisi dalla pagina Coach.' }
      }

      const analysis = pending.ai_analysis as {
        exercise_updates: Array<{
          plan_exercise_id: string
          recommended_weight_kg: number
          recommended_reps: number
          rationale: string
        }>
      }

      const nextWeek = pending.week_number + 1

      if (nextWeek <= 8) {
        for (const update of (analysis.exercise_updates || [])) {
          await supabase
            .from('exercise_progressions')
            .upsert(
              {
                mesocycle_id: meso.id,
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
        .eq('id', pending.id)

      return {
        success: true,
        message: `Check-in settimana ${pending.week_number} applicato. Target aggiornati per la settimana ${nextWeek}.`,
      }
    }

    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

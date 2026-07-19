// Daily nutrition aggregation — single source of truth for diet totals.
//
// P0.1 (D001, D011): `nutrition_entries` is the ONLY active source for meals.
// The legacy `diet_logs` table is deprecated (empty in production) and must not
// be read anymore. Meals live one-row-per-entry in `nutrition_entries`; every
// consumer that needs a per-day view (Today, Coach, weekly check-in) aggregates
// through THIS helper so the grouping + field normalization exist in one place.
//
// Field normalization happens here and nowhere else:
//   nutrition_entries.proteins → protein_g
//   nutrition_entries.carbs    → carbs_g
//   nutrition_entries.fats     → fat_g
// The `_g` names match what the rest of the app (and the old diet_logs rows)
// already expected, so downstream shapes stay unchanged.
//
// No SQL view, no new table, no migration (D011).

import type { SupabaseClient } from '@supabase/supabase-js'

/** One aggregated day, in the shape the app already consumes for diet logs. */
export interface DailyNutritionTotals {
  date: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  entries_count: number
}

/** Raw row shape selected from nutrition_entries. */
interface NutritionEntryRow {
  date: string
  calories: number | string | null
  proteins: number | string | null
  carbs: number | string | null
  fats: number | string | null
}

/**
 * Coerce a Postgres numeric (which PostgREST may serialize as number OR string)
 * into a finite number. null / undefined / NaN / '' all collapse to 0 so that
 * summation never produces string concatenation or NaN.
 */
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(v as string)
  return Number.isFinite(n) ? n : 0
}

/**
 * Aggregate `nutrition_entries` into per-day totals for a user.
 *
 * @param supabase server Supabase client (passed in, like awardExp)
 * @param userId   owner of the entries
 * @param fromDate optional inclusive lower bound (YYYY-MM-DD)
 * @param toDate   optional inclusive upper bound (YYYY-MM-DD)
 * @returns one entry per day that has ≥1 nutrition entry, sorted date DESC
 *          (same ordering the old diet_logs queries used). Users with no
 *          entries in range get an empty array.
 *
 * Dates use the `date` column as-is; the Europe/Rome timezone pass is P0.2 and
 * is intentionally out of scope here.
 */
export async function getDailyNutritionTotals(
  supabase: SupabaseClient,
  userId: string,
  fromDate?: string,
  toDate?: string
): Promise<DailyNutritionTotals[]> {
  let query = supabase
    .from('nutrition_entries')
    .select('date, calories, proteins, carbs, fats')
    .eq('user_id', userId)

  if (fromDate) query = query.gte('date', fromDate)
  if (toDate) query = query.lte('date', toDate)

  const { data, error } = await query
  // A real Supabase/DB failure must surface to the caller, NOT be masked as an
  // empty diet. A successful query with no rows returns [] via the loop below
  // (data is []); a null data without error is treated as "no rows".
  if (error) {
    throw new Error(`getDailyNutritionTotals: ${error.message}`)
  }
  if (!data) return []

  const byDate = new Map<string, DailyNutritionTotals>()
  for (const row of data as NutritionEntryRow[]) {
    const acc =
      byDate.get(row.date) ??
      { date: row.date, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, entries_count: 0 }

    acc.calories += num(row.calories)
    acc.protein_g += num(row.proteins)
    acc.carbs_g += num(row.carbs)
    acc.fat_g += num(row.fats)
    acc.entries_count += 1

    byDate.set(row.date, acc)
  }

  // date DESC — matches the previous `.order('date', { ascending: false })`.
  return Array.from(byDate.values()).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0
  )
}

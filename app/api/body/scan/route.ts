import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { BodyScanSchema, BodyScanOutput } from '@/lib/ai/body-scan-schema'
import { getAIProvider } from '@/lib/ai/provider'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

const VISION_PROMPT = `Analizza questa immagine di una bilancia smart FitDays ed estrai i valori di composizione corporea.

Cerca i seguenti campi (le etichette possono essere in italiano o inglese):
- Peso / Weight                   → weight_kg        (numero decimale, es. 82.6)
- BMI                             → bmi              (numero decimale, es. 24.9)
- Grasso corporeo / Body Fat %    → body_fat_pct     (percentuale, es. 17.9)
- Massa muscolare / Muscle Mass   → muscle_mass_kg   (kg, es. 64.4)
- Massa ossea / Bone Mass         → bone_mass_kg     (kg, es. 3.4)
- Acqua del corpo / Body Water %  → water_pct        (percentuale, es. 55.2)
- Grasso viscerale / Visceral Fat → visceral_fat     (numero, es. 7.8)
- BMR / Metabolismo basale        → bmr              (kcal interi, es. 1835)
- Età corporea / Body Age         → metabolic_age    (intero anni, es. 27)
- Data visibile nell'immagine     → date             (converti in YYYY-MM-DD, es. "04/03/2026" → "2026-03-04")

Regole:
- Se un valore non è leggibile o assente, usa null.
- Se la data non è presente nell'immagine, usa null.
- Non inventare valori — estrai solo ciò che è visibile.
- Rispondi ESCLUSIVAMENTE con JSON valido, nessun testo aggiuntivo.

Schema JSON atteso:
{
  "date": "YYYY-MM-DD" | null,
  "weight_kg": <number>,
  "bmi": <number> | null,
  "body_fat_pct": <number> | null,
  "muscle_mass_kg": <number> | null,
  "bone_mass_kg": <number> | null,
  "water_pct": <number> | null,
  "visceral_fat": <number> | null,
  "bmr": <number> | null,
  "metabolic_age": <intero> | null
}`


export async function POST(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Parse FormData ──────────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida (atteso multipart/form-data)' }, { status: 400 })
  }

  const file = formData.get('image')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Nessuna immagine fornita (campo "image" mancante)' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Formato non supportato: ${file.type}. Usa JPEG, PNG o WebP.` },
      { status: 400 }
    )
  }

  // ── Convert to base64 ───────────────────────────────────────────────────────
  const arrayBuffer = await file.arrayBuffer()
  const imageBase64 = Buffer.from(arrayBuffer).toString('base64')

  // ── Vision extraction (retry logic handled inside the provider) ──────────────
  let extracted: BodyScanOutput
  try {
    extracted = await getAIProvider().analyzeImage(
      imageBase64,
      file.type,
      VISION_PROMPT,
      BodyScanSchema
    )
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Impossibile estrarre i dati dall\'immagine' },
      { status: 422 }
    )
  }

  // ── Resolve date: use image date or today ───────────────────────────────────
  const measurementDate = extracted.date ?? todayISO()

  // ── UPSERT into body_measurements (idempotent on user_id + date) ────────────
  const record = {
    user_id: user.id,
    date: measurementDate,
    weight_kg: extracted.weight_kg,
    bmi: extracted.bmi ?? null,
    body_fat_pct: extracted.body_fat_pct ?? null,
    muscle_mass_kg: extracted.muscle_mass_kg ?? null,
    bone_mass_kg: extracted.bone_mass_kg ?? null,
    water_pct: extracted.water_pct ?? null,
    visceral_fat: extracted.visceral_fat ?? null,
    bmr: extracted.bmr ?? null,
    metabolic_age: extracted.metabolic_age ?? null,
  }

  const { data: measurement, error: dbError } = await supabase
    .from('body_measurements')
    .upsert(record, { onConflict: 'user_id,date' })
    .select()
    .single()

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json(measurement)
}

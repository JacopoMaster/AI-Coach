'use client'

import { useEffect, useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioCards, MultiChipField } from './controls'
import { ProfileSection } from './profile-section'
import { ProfileStatusCard } from './profile-status-card'
import type { AthleteProfile, PrimaryGoal } from '@/lib/profile/types'
import {
  getMissingRestartFields,
  type ProfileCompleteness,
} from '@/lib/profile/completeness'
import { hasChanges, buildSectionPatch, type FieldValue } from '@/lib/profile/patch-diff'
import {
  PRIMARY_GOAL_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  WEEKDAY_OPTIONS,
  WORK_PATTERN_OPTIONS,
  DAILY_ACTIVITY_LEVEL_OPTIONS,
  PREFERRED_TRAINING_TIME_OPTIONS,
  NUTRITION_GOAL_OPTIONS,
  COOKING_AVAILABILITY_OPTIONS,
  COACHING_STYLE_OPTIONS,
  EXPLANATION_DETAIL_OPTIONS,
  FLEXIBILITY_PREFERENCE_OPTIONS,
  SEX_OPTIONS,
  EQUIPMENT_SUGGESTIONS,
  TRAINING_BARRIER_SUGGESTIONS,
  NUTRITION_BARRIER_SUGGESTIONS,
  DIETARY_PREFERENCE_SUGGESTIONS,
  RESTART_FIELD_LABELS,
} from '@/lib/profile/labels'

type EditableKey = Exclude<keyof AthleteProfile, 'user_id' | 'created_at' | 'updated_at'>
type Draft = Record<EditableKey, FieldValue>

// Section → its own fields. A save PATCHes ONLY the changed fields of ONE
// section, never the whole profile (protects the F1.3 PATCH semantics).
const SECTIONS = {
  goals: ['primary_goal', 'secondary_goals', 'goal_notes'],
  experience: ['experience_level', 'years_training'],
  week: [
    'target_sessions_per_week',
    'minimum_sessions_per_week',
    'preferred_training_days',
    'preferred_session_duration_minutes',
    'minimum_session_duration_minutes',
    'work_pattern',
    'schedule_notes',
    'preferred_training_time',
  ],
  training: [
    'available_equipment',
    'preferred_exercises',
    'avoided_exercises',
    'training_limitations',
    'injuries_or_pain_notes',
  ],
  lifestyle: ['birth_date', 'sex', 'height_cm', 'daily_activity_level', 'main_training_barriers'],
  nutrition: [
    'nutrition_goal',
    'dietary_preferences',
    'dietary_restrictions',
    'allergies',
    'cooking_availability',
    'main_nutrition_barriers',
  ],
  coaching: ['coaching_style', 'explanation_detail', 'flexibility_preference'],
} as const satisfies Record<string, readonly EditableKey[]>

type SectionKey = keyof typeof SECTIONS

const EDITABLE_KEYS = Object.values(SECTIONS).flat() as EditableKey[]
const NUMERIC_KEYS = new Set<EditableKey>([
  'height_cm',
  'years_training',
  'target_sessions_per_week',
  'minimum_sessions_per_week',
  'preferred_session_duration_minutes',
  'minimum_session_duration_minutes',
])

// PostgREST may serialize numeric columns as strings; coerce so number inputs
// and equality checks stay honest.
function toDraft(profile: AthleteProfile | null): Draft {
  const d = {} as Draft
  for (const k of EDITABLE_KEYS) {
    const raw = profile ? (profile[k] as FieldValue) : null
    d[k] = NUMERIC_KEYS.has(k) && raw != null ? Number(raw) : raw
  }
  return d
}

interface SaveState {
  saving: boolean
  savedOk: boolean
  error: string | null
}
const IDLE: SaveState = { saving: false, savedOk: false, error: null }

export function AthleteProfileForm() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [profile, setProfile] = useState<AthleteProfile | null>(null)
  const [completeness, setCompleteness] = useState<ProfileCompleteness>('not_started')
  const [baseline, setBaseline] = useState<Draft>(() => toDraft(null))
  const [draft, setDraft] = useState<Draft>(() => toDraft(null))
  const [open, setOpen] = useState<SectionKey | null>('goals')
  const [saveStates, setSaveStates] = useState<Record<SectionKey, SaveState>>({
    goals: IDLE,
    experience: IDLE,
    week: IDLE,
    training: IDLE,
    lifestyle: IDLE,
    nutrition: IDLE,
    coaching: IDLE,
  })

  async function load() {
    setStatus('loading')
    try {
      const res = await fetch('/api/profile')
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as { profile: AthleteProfile | null; completeness: ProfileCompleteness }
      setProfile(data.profile)
      setCompleteness(data.completeness)
      setBaseline(toDraft(data.profile))
      setDraft(toDraft(data.profile))
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => {
    load()
  }, [])

  function setField(key: EditableKey, value: FieldValue) {
    setDraft((d) => ({ ...d, [key]: value }))
    // Editing clears the "saved" tick for the section that owns this field.
    const sec = (Object.keys(SECTIONS) as SectionKey[]).find((s) =>
      (SECTIONS[s] as readonly EditableKey[]).includes(key)
    )
    if (sec) setSaveStates((s) => ({ ...s, [sec]: { ...s[sec], savedOk: false, error: null } }))
  }

  function sectionDirty(sec: SectionKey): boolean {
    return hasChanges(draft, baseline, SECTIONS[sec] as readonly EditableKey[])
  }

  // Client-side coherence hint per section (server remains the authority).
  function validationMessage(sec: SectionKey): string | null {
    if (sec === 'goals') {
      const primary = draft.primary_goal as PrimaryGoal | null
      const secondary = draft.secondary_goals as string[] | null
      if (primary && Array.isArray(secondary) && secondary.includes(primary)) {
        return 'Il tuo obiettivo principale non può essere anche tra quelli secondari.'
      }
    }
    if (sec === 'week') {
      const minS = draft.minimum_sessions_per_week as number | null
      const tgtS = draft.target_sessions_per_week as number | null
      if (minS != null && tgtS != null && minS > tgtS) {
        return 'Le sessioni minime non possono superare quelle ideali.'
      }
      const minD = draft.minimum_session_duration_minutes as number | null
      const prefD = draft.preferred_session_duration_minutes as number | null
      if (minD != null && prefD != null && minD > prefD) {
        return 'La durata minima non può superare quella ideale.'
      }
    }
    return null
  }

  async function saveSection(sec: SectionKey) {
    const patch = buildSectionPatch(draft, baseline, SECTIONS[sec] as readonly EditableKey[])
    if (Object.keys(patch).length === 0 || validationMessage(sec)) return

    setSaveStates((s) => ({ ...s, [sec]: { saving: true, savedOk: false, error: null } }))
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setSaveStates((s) => ({ ...s, [sec]: { saving: false, savedOk: false, error: friendlyError(data) } }))
        return
      }
      const next = data as { profile: AthleteProfile; completeness: ProfileCompleteness }
      setProfile(next.profile)
      setCompleteness(next.completeness)
      // Re-baseline every field to server truth; unsaved edits in OTHER sections
      // still differ from the new baseline and stay marked dirty.
      setBaseline(toDraft(next.profile))
      setSaveStates((s) => ({ ...s, [sec]: { saving: false, savedOk: true, error: null } }))
    } catch {
      setSaveStates((s) => ({
        ...s,
        [sec]: { saving: false, savedOk: false, error: 'Non siamo riusciti a salvare questa sezione. Riprova.' },
      }))
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="space-y-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">Non siamo riusciti a caricare il tuo profilo.</p>
        <Button type="button" variant="outline" onClick={load}>
          Riprova
        </Button>
      </div>
    )
  }

  const missingLabels = getMissingRestartFields(profile).map((k) => RESTART_FIELD_LABELS[k])

  const sectionProps = (sec: SectionKey, title: string, description: string) => ({
    title,
    description,
    isOpen: open === sec,
    onToggle: () => setOpen((o) => (o === sec ? null : sec)),
    dirty: sectionDirty(sec),
    saving: saveStates[sec].saving,
    savedOk: saveStates[sec].savedOk,
    saveError: saveStates[sec].error,
    validationMessage: sectionDirty(sec) ? validationMessage(sec) : null,
    onSave: () => saveSection(sec),
  })

  return (
    <div className="space-y-4">
      <ProfileStatusCard completeness={completeness} missingLabels={missingLabels} />

      {/* 1. Obiettivi */}
      <ProfileSection {...sectionProps('goals', 'Obiettivi', 'Cosa vuoi ottenere')}>
        <Field label="Obiettivo principale">
          <RadioCards
            value={draft.primary_goal as PrimaryGoal | null}
            onChange={(v) => setField('primary_goal', v)}
            options={PRIMARY_GOAL_OPTIONS}
          />
        </Field>
        <Field label="Obiettivi secondari (opzionale)" hint="Puoi selezionarne più di uno. Non può coincidere con quello principale.">
          <MultiChipField
            value={draft.secondary_goals as string[] | null}
            onChange={(v) => setField('secondary_goals', v)}
            suggestions={PRIMARY_GOAL_OPTIONS.filter((o) => o.value !== draft.primary_goal).map((o) => o.value)}
            noneLabel="Nessun obiettivo secondario"
          />
          {/* Suggestions render raw goal values; show a friendly legend. */}
          <p className="mt-1 text-xs text-muted-foreground">
            {PRIMARY_GOAL_OPTIONS.map((o) => `${o.value} = ${o.label}`).join(' · ')}
          </p>
        </Field>
        <Field label="Note sull'obiettivo (opzionale)">
          <Textarea
            value={(draft.goal_notes as string | null) ?? ''}
            onChange={(e) => setField('goal_notes', e.target.value === '' ? null : e.target.value)}
            placeholder="Es. recuperare costanza e performance senza rendere il percorso troppo rigido."
          />
        </Field>
      </ProfileSection>

      {/* 2. Esperienza */}
      <ProfileSection {...sectionProps('experience', 'Esperienza', 'Da quanto e a che livello ti alleni')}>
        <Field label="Livello di esperienza" hint="Serve a calibrare volume, complessità e velocità delle progressioni.">
          <RadioCards
            value={draft.experience_level as ExperienceLevelValue}
            onChange={(v) => setField('experience_level', v)}
            options={EXPERIENCE_LEVEL_OPTIONS}
          />
        </Field>
        <Field label="Anni di allenamento (opzionale)">
          <NumberInput value={draft.years_training as number | null} onChange={(v) => setField('years_training', v)} min={0} max={80} step={0.5} placeholder="Es. 3" />
        </Field>
      </ProfileSection>

      {/* 3. La tua settimana reale */}
      <ProfileSection {...sectionProps('week', 'La tua settimana reale', 'Disponibilità e ritmi sostenibili')}>
        <Field label="Sessioni ideali a settimana" hint="Quante volte vorresti allenarti in una settimana ideale?">
          <NumberInput value={draft.target_sessions_per_week as number | null} onChange={(v) => setField('target_sessions_per_week', v)} min={1} max={7} step={1} placeholder="Es. 4" />
        </Field>
        <Field label="Sessioni minime a settimana" hint="Quante sessioni renderebbero comunque la settimana un successo? Il minimo non è un fallimento: serve al Coach per proteggere la costanza nelle settimane difficili.">
          <NumberInput value={draft.minimum_sessions_per_week as number | null} onChange={(v) => setField('minimum_sessions_per_week', v)} min={1} max={7} step={1} placeholder="Es. 2" />
        </Field>
        <Field label="Giorni preferiti" hint="null finché non rispondi; puoi anche indicare che dipende dalla settimana.">
          <WeekdayChips value={draft.preferred_training_days as string[] | null} onChange={(v) => setField('preferred_training_days', v)} />
        </Field>
        <Field label="Durata ideale della sessione (min)" hint="Quanto dura normalmente una sessione completa?">
          <NumberInput value={draft.preferred_session_duration_minutes as number | null} onChange={(v) => setField('preferred_session_duration_minutes', v)} min={10} max={240} step={5} placeholder="Es. 60" />
        </Field>
        <Field label="Durata minima utile (min)" hint="Quanto tempo minimo rende comunque utile allenarsi? Servirà per creare allenamenti Express invece di saltare la sessione.">
          <NumberInput value={draft.minimum_session_duration_minutes as number | null} onChange={(v) => setField('minimum_session_duration_minutes', v)} min={10} max={240} step={5} placeholder="Es. 30" />
        </Field>
        <Field label="Tipo di lavoro / studio (opzionale)">
          <RadioCards value={draft.work_pattern as WorkPatternValue} onChange={(v) => setField('work_pattern', v)} options={WORK_PATTERN_OPTIONS} />
        </Field>
        <Field label="Note sulla disponibilità (opzionale)">
          <Textarea
            value={(draft.schedule_notes as string | null) ?? ''}
            onChange={(e) => setField('schedule_notes', e.target.value === '' ? null : e.target.value)}
            placeholder="Es. lavoro lun-ven, torno a casa verso sera."
          />
        </Field>
        <Field label="Momento preferito per allenarti (opzionale)">
          <RadioCards value={draft.preferred_training_time as PrefTimeValue} onChange={(v) => setField('preferred_training_time', v)} options={PREFERRED_TRAINING_TIME_OPTIONS} />
        </Field>
      </ProfileSection>

      {/* 4. Allenamento */}
      <ProfileSection {...sectionProps('training', 'Allenamento', 'Attrezzatura, preferenze e limitazioni')}>
        <Field label="Attrezzatura disponibile" hint="Seleziona ciò che hai, aggiungi voci personalizzate o indica «Nessuna attrezzatura».">
          <MultiChipField
            value={draft.available_equipment as string[] | null}
            onChange={(v) => setField('available_equipment', v)}
            suggestions={EQUIPMENT_SUGGESTIONS}
            allowCustom
            noneLabel="Nessuna attrezzatura"
          />
        </Field>
        <Field label="Esercizi preferiti (opzionale)">
          <MultiChipField
            value={draft.preferred_exercises as string[] | null}
            onChange={(v) => setField('preferred_exercises', v)}
            allowCustom
            noneLabel="Nessuna preferenza"
            customPlaceholder="Es. Panca piana"
          />
        </Field>
        <Field label="Esercizi da evitare (opzionale)">
          <MultiChipField
            value={draft.avoided_exercises as string[] | null}
            onChange={(v) => setField('avoided_exercises', v)}
            allowCustom
            noneLabel="Nessuno da evitare"
            customPlaceholder="Es. Squat classico"
          />
        </Field>
        <Field label="Limitazioni di allenamento" hint="Descrizioni funzionali brevi (es. «Evito squat classico»). Non servono diagnosi.">
          <MultiChipField
            value={draft.training_limitations as string[] | null}
            onChange={(v) => setField('training_limitations', v)}
            allowCustom
            noneLabel="Nessuna limitazione"
            customPlaceholder="Es. Evito overhead press"
          />
        </Field>
        <Field label="Note su infortuni o dolori (opzionale)">
          <Textarea
            value={(draft.injuries_or_pain_notes as string | null) ?? ''}
            onChange={(e) => setField('injuries_or_pain_notes', e.target.value === '' ? null : e.target.value)}
            placeholder="Es. fastidio alla spalla destra in alcuni movimenti."
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Queste informazioni servono soltanto ad adattare l&apos;allenamento e non sostituiscono una valutazione medica.
          </p>
        </Field>
      </ProfileSection>

      {/* 5. Contesto personale e stile di vita */}
      <ProfileSection {...sectionProps('lifestyle', 'Contesto personale e stile di vita', 'Informazioni opzionali per un coaching più preciso')}>
        <Field label="Data di nascita (opzionale)">
          <Input
            type="date"
            value={(draft.birth_date as string | null) ?? ''}
            onChange={(e) => setField('birth_date', e.target.value === '' ? null : e.target.value)}
          />
        </Field>
        <Field label="Sesso biologico (opzionale)" hint="Può essere utilizzato in futuro per alcune stime fisiologiche. Puoi lasciarlo vuoto.">
          <RadioCards value={draft.sex as SexValue} onChange={(v) => setField('sex', v)} options={SEX_OPTIONS} />
        </Field>
        <Field label="Altezza (cm, opzionale)">
          <NumberInput value={draft.height_cm as number | null} onChange={(v) => setField('height_cm', v)} min={100} max={250} step={1} placeholder="Es. 180" />
        </Field>
        <Field label="Livello di attività quotidiana (opzionale)">
          <RadioCards value={draft.daily_activity_level as ActivityValue} onChange={(v) => setField('daily_activity_level', v)} options={DAILY_ACTIVITY_LEVEL_OPTIONS} />
        </Field>
        <Field label="Principali ostacoli all'allenamento (opzionale)" hint="Aiuteranno il Coach a non essere punitivo dopo i periodi difficili.">
          <MultiChipField
            value={draft.main_training_barriers as string[] | null}
            onChange={(v) => setField('main_training_barriers', v)}
            suggestions={TRAINING_BARRIER_SUGGESTIONS}
            allowCustom
            noneLabel="Nessun ostacolo particolare"
          />
        </Field>
      </ProfileSection>

      {/* 6. Alimentazione */}
      <ProfileSection {...sectionProps('nutrition', 'Alimentazione', 'Preferenze e vincoli — non i target numerici')}>
        <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
          I target numerici di calorie e macronutrienti sono gestiti separatamente e non vengono modificati da questo form.
        </p>
        <Field label="Obiettivo alimentare (opzionale)">
          <RadioCards value={draft.nutrition_goal as NutritionGoalValue} onChange={(v) => setField('nutrition_goal', v)} options={NUTRITION_GOAL_OPTIONS} />
        </Field>
        <Field label="Preferenze alimentari (opzionale)">
          <MultiChipField
            value={draft.dietary_preferences as string[] | null}
            onChange={(v) => setField('dietary_preferences', v)}
            suggestions={DIETARY_PREFERENCE_SUGGESTIONS}
            allowCustom
            noneLabel="Nessuna preferenza"
          />
        </Field>
        <Field label="Restrizioni alimentari">
          <MultiChipField
            value={draft.dietary_restrictions as string[] | null}
            onChange={(v) => setField('dietary_restrictions', v)}
            allowCustom
            noneLabel="Nessuna restrizione"
            customPlaceholder="Es. senza lattosio"
          />
        </Field>
        <Field label="Allergie" hint="Usato solo per evitare suggerimenti alimentari incompatibili con quanto hai indicato.">
          <MultiChipField
            value={draft.allergies as string[] | null}
            onChange={(v) => setField('allergies', v)}
            allowCustom
            noneLabel="Nessuna allergia segnalata"
            customPlaceholder="Es. arachidi"
          />
        </Field>
        <Field label="Disponibilità a cucinare (opzionale)">
          <RadioCards value={draft.cooking_availability as CookingValue} onChange={(v) => setField('cooking_availability', v)} options={COOKING_AVAILABILITY_OPTIONS} />
        </Field>
        <Field label="Principali ostacoli sull'alimentazione (opzionale)">
          <MultiChipField
            value={draft.main_nutrition_barriers as string[] | null}
            onChange={(v) => setField('main_nutrition_barriers', v)}
            suggestions={NUTRITION_BARRIER_SUGGESTIONS}
            allowCustom
            noneLabel="Nessun ostacolo particolare"
          />
        </Field>
      </ProfileSection>

      {/* 7. Come vuoi essere seguito */}
      <ProfileSection {...sectionProps('coaching', 'Come vuoi essere seguito', 'Stile e livello di spiegazione del Coach')}>
        <Field label="Stile di coaching (opzionale)">
          <RadioCards value={draft.coaching_style as CoachingValue} onChange={(v) => setField('coaching_style', v)} options={COACHING_STYLE_OPTIONS} />
        </Field>
        <Field label="Livello di spiegazione (opzionale)">
          <RadioCards value={draft.explanation_detail as ExplanationValue} onChange={(v) => setField('explanation_detail', v)} options={EXPLANATION_DETAIL_OPTIONS} />
        </Field>
        <Field label="Preferenza di flessibilità (opzionale)">
          <RadioCards value={draft.flexibility_preference as FlexibilityValue} onChange={(v) => setField('flexibility_preference', v)} options={FLEXIBILITY_PREFERENCE_OPTIONS} />
        </Field>
      </ProfileSection>
    </div>
  )
}

// ─── Small local field helpers ───────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
}: {
  value: number | null
  onChange: (v: number | null) => void
  min?: number
  max?: number
  step?: number
  placeholder?: string
}) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={value == null ? '' : String(value)}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') return onChange(null)
        const n = Number(raw)
        onChange(Number.isFinite(n) ? n : null)
      }}
      placeholder={placeholder}
    />
  )
}

// Weekday chips store canonical tokens (mon…sun) while showing Italian labels.
// null = unanswered; [] = "no preferred day / it varies"; list = chosen days.
function WeekdayChips({ value, onChange }: { value: string[] | null; onChange: (v: string[] | null) => void }) {
  const selected = value ?? []
  const isNone = Array.isArray(value) && value.length === 0
  const toggle = (day: string) =>
    onChange(selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day])
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {WEEKDAY_OPTIONS.map((d) => {
          const active = selected.includes(d.value)
          return (
            <button
              key={d.value}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(d.value)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              {active && <Check className="h-3.5 w-3.5 text-primary" />}
              {d.label}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        aria-pressed={isNone}
        onClick={() => onChange(isNone ? null : [])}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isNone
            ? 'border-primary bg-primary/10 text-foreground'
            : 'border-dashed border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        )}
      >
        {isNone && <Check className="h-3.5 w-3.5 text-primary" />}
        Nessun giorno preferito / dipende dalla settimana
      </button>
    </div>
  )
}

function friendlyError(data: unknown): string {
  const d = data as { error?: string; message?: string } | null
  // The coherence 400 carries a human message; surface a localized version.
  if (d?.error === 'Incoherent profile') {
    return 'Alcuni valori non sono coerenti tra loro. Controlla i campi evidenziati.'
  }
  if (d?.error === 'Invalid profile patch') {
    return 'Alcuni valori non sono validi. Controlla i campi e riprova.'
  }
  return 'Non siamo riusciti a salvare questa sezione. Riprova.'
}

// Local aliases so the RadioCards generic infers the right union per field.
type ExperienceLevelValue = AthleteProfile['experience_level']
type WorkPatternValue = AthleteProfile['work_pattern']
type PrefTimeValue = AthleteProfile['preferred_training_time']
type SexValue = AthleteProfile['sex']
type ActivityValue = AthleteProfile['daily_activity_level']
type NutritionGoalValue = AthleteProfile['nutrition_goal']
type CookingValue = AthleteProfile['cooking_availability']
type CoachingValue = AthleteProfile['coaching_style']
type ExplanationValue = AthleteProfile['explanation_detail']
type FlexibilityValue = AthleteProfile['flexibility_preference']

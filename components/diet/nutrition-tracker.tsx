'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { DietPlan, Food, NutritionEntry } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { today } from '@/lib/utils'
import { Loader2, Plus, Trash2, X } from 'lucide-react'

// ─── MacroBar ─────────────────────────────────────────────────────────────────

function MacroBar({
  label,
  value,
  target,
  color,
  unit = 'g',
}: {
  label: string
  value: number
  target: number
  color: string
  unit?: string
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span>
          <span className="font-semibold">{Math.round(value)} {unit}</span>
          <span className="text-muted-foreground"> / {target} {unit} ({pct}%)</span>
        </span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-background rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto overscroll-contain shadow-xl">
        {children}
      </div>
    </div>
  )
}

// ─── NutritionTracker ─────────────────────────────────────────────────────────

export default function NutritionTracker({ plan }: { plan: DietPlan | null }) {
  const [entries, setEntries] = useState<NutritionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'db' | 'free'>('db')

  const loadEntries = useCallback(async () => {
    const res = await fetch(`/api/nutrition?type=entries&date=${today()}`)
    if (res.ok) setEntries(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { loadEntries() }, [loadEntries])

  const totals = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.calories ?? 0),
      proteins: acc.proteins + (e.proteins ?? 0),
      carbs: acc.carbs + (e.carbs ?? 0),
      fats: acc.fats + (e.fats ?? 0),
    }),
    { calories: 0, proteins: 0, carbs: 0, fats: 0 }
  )

  async function deleteEntry(id: string) {
    await fetch('/api/nutrition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_entry', id }),
    })
    loadEntries()
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Tracker Nutrizionale</CardTitle>
            <Button size="sm" onClick={() => setShowModal(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Aggiungi Cibo
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress bars */}
          <div className="space-y-3">
            <MacroBar
              label="Calorie"
              value={totals.calories}
              target={plan?.calories ?? 2000}
              color="#6366f1"
              unit="kcal"
            />
            <MacroBar
              label="Proteine"
              value={totals.proteins}
              target={plan?.protein_g ?? 150}
              color="#22c55e"
            />
            <MacroBar
              label="Carboidrati"
              value={totals.carbs}
              target={plan?.carbs_g ?? 200}
              color="#f59e0b"
            />
            <MacroBar
              label="Grassi"
              value={totals.fats}
              target={plan?.fat_g ?? 70}
              color="#f97316"
            />
          </div>

          {/* Entries list */}
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun alimento aggiunto oggi.
            </p>
          ) : (
            <div className="divide-y border rounded-lg overflow-hidden">
              {entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {e.name}
                      {e.grams ? <span className="text-muted-foreground font-normal"> – {e.grams}g</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Math.round(e.calories)} kcal · P:{Math.round(e.proteins)}g · C:{Math.round(e.carbs)}g · G:{Math.round(e.fats)}g
                    </p>
                  </div>
                  <button
                    onClick={() => deleteEntry(e.id)}
                    className="ml-3 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                    aria-label="Elimina"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <AddFoodModal
            onClose={() => setShowModal(false)}
            onAdded={() => { setShowModal(false); loadEntries() }}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        </Modal>
      )}
    </>
  )
}

// ─── AddFoodModal ─────────────────────────────────────────────────────────────

function AddFoodModal({
  onClose,
  onAdded,
  activeTab,
  setActiveTab,
}: {
  onClose: () => void
  onAdded: () => void
  activeTab: 'db' | 'free'
  setActiveTab: (t: 'db' | 'free') => void
}) {
  return (
    <div className="px-4 pt-4 pb-12 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Aggiungi Cibo</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg bg-muted p-1 gap-1">
        {(['db', 'free'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-background shadow font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'db' ? 'Database' : 'Stima Libera'}
          </button>
        ))}
      </div>

      {activeTab === 'db' ? (
        <DatabaseTab onAdded={onAdded} />
      ) : (
        <FreeEstimateTab onAdded={onAdded} />
      )}
    </div>
  )
}

// ─── DatabaseTab ──────────────────────────────────────────────────────────────

type DbStep = 'search' | 'create' | 'grams'

function DatabaseTab({ onAdded }: { onAdded: () => void }) {
  const [step, setStep] = useState<DbStep>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  const [grams, setGrams] = useState('')
  const [saving, setSaving] = useState(false)
  const [newFood, setNewFood] = useState({
    name: '',
    calories_per_100g: '',
    proteins_per_100g: '',
    carbs_per_100g: '',
    fats_per_100g: '',
  })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); return }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/nutrition?type=foods&q=${encodeURIComponent(query)}`)
      if (res.ok) setResults(await res.json())
      setSearching(false)
    }, 300)
  }, [query])

  async function saveNewFood() {
    if (!newFood.name) return
    setSaving(true)
    const res = await fetch('/api/nutrition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_food',
        name: newFood.name,
        calories_per_100g: parseFloat(newFood.calories_per_100g) || 0,
        proteins_per_100g: parseFloat(newFood.proteins_per_100g) || 0,
        carbs_per_100g: parseFloat(newFood.carbs_per_100g) || 0,
        fats_per_100g: parseFloat(newFood.fats_per_100g) || 0,
      }),
    })
    if (res.ok) {
      const food: Food = await res.json()
      setSelectedFood(food)
      setStep('grams')
    }
    setSaving(false)
  }

  async function addEntry() {
    if (!selectedFood || !grams) return
    setSaving(true)
    const g = parseFloat(grams)
    const f = g / 100
    await fetch('/api/nutrition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_entry',
        date: today(),
        food_id: selectedFood.id,
        grams: g,
        name: selectedFood.name,
        calories: Math.round(selectedFood.calories_per_100g * f * 10) / 10,
        proteins: Math.round(selectedFood.proteins_per_100g * f * 10) / 10,
        carbs: Math.round(selectedFood.carbs_per_100g * f * 10) / 10,
        fats: Math.round(selectedFood.fats_per_100g * f * 10) / 10,
      }),
    })
    setSaving(false)
    onAdded()
  }

  // ── Unico return, step governa cosa si vede ──────────────────────────────────
  return (
    <div className="space-y-3">

      {/* ── STEP: search ── */}
      {step === 'search' && (
        <>
          {/* Input ricerca */}
          <div className="space-y-1">
            <Label>Cerca alimento</Label>
            <div className="relative">
              <Input
                placeholder="es. Pollo, Riso, Avocado..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              {searching && (
                <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Bottone INCONDIZIONATO – sempre visibile */}
          <button
            type="button"
            onClick={() => {
              setNewFood((f) => ({ ...f, name: query.trim() }))
              setStep('create')
            }}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 py-2.5 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="h-4 w-4" />
            Crea Nuovo Alimento
          </button>

          {/* Risultati ricerca */}
          {results.length > 0 && (
            <div className="divide-y border rounded-lg overflow-hidden">
              {results.map((food) => (
                <button
                  key={food.id}
                  type="button"
                  onClick={() => { setSelectedFood(food); setStep('grams') }}
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <p className="text-sm font-medium">{food.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {food.calories_per_100g} kcal/100g · P:{food.proteins_per_100g}g · C:{food.carbs_per_100g}g · G:{food.fats_per_100g}g
                  </p>
                </button>
              ))}
            </div>
          )}

          {query.trim() && !searching && results.length === 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Nessun risultato per &quot;{query}&quot;
            </p>
          )}
        </>
      )}

      {/* ── STEP: create ── */}
      {step === 'create' && (
        <>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Nuovo alimento – valori per 100g
          </p>

          {(
            [
              { key: 'name' as const,              label: 'Nome alimento',        type: 'text',   placeholder: 'es. Pollo arrosto' },
              { key: 'calories_per_100g' as const, label: 'Calorie (kcal/100g)',  type: 'number', placeholder: '165' },
              { key: 'proteins_per_100g' as const, label: 'Proteine (g/100g)',    type: 'number', placeholder: '31' },
              { key: 'carbs_per_100g' as const,    label: 'Carboidrati (g/100g)', type: 'number', placeholder: '0' },
              { key: 'fats_per_100g' as const,     label: 'Grassi (g/100g)',      type: 'number', placeholder: '3.6' },
            ]
          ).map(({ key, label, type, placeholder }) => (
            <div key={key} className="space-y-1">
              <Label>{label}</Label>
              <Input
                type={type}
                placeholder={placeholder}
                value={newFood[key]}
                onChange={(e) => setNewFood((f) => ({ ...f, [key]: e.target.value }))}
                autoFocus={key === 'name'}
              />
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setStep('search')} className="flex-1">
              Annulla
            </Button>
            <Button type="button" onClick={saveNewFood} disabled={!newFood.name || saving} className="flex-1">
              {saving && <Loader2 className="animate-spin h-4 w-4 mr-1" />}
              Salva nel Database
            </Button>
          </div>
        </>
      )}

      {/* ── STEP: grams ── */}
      {step === 'grams' && selectedFood && (
        <>
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="font-medium">{selectedFood.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Per 100g: {selectedFood.calories_per_100g} kcal · P:{selectedFood.proteins_per_100g}g · C:{selectedFood.carbs_per_100g}g · G:{selectedFood.fats_per_100g}g
            </p>
          </div>

          <div className="space-y-1">
            <Label>Grammi consumati</Label>
            <Input
              type="number"
              placeholder="es. 150"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              autoFocus
            />
            {grams && parseFloat(grams) > 0 && (
              <p className="text-xs text-muted-foreground">
                ≈ {Math.round(selectedFood.calories_per_100g * parseFloat(grams) / 100)} kcal
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => { setSelectedFood(null); setStep('search') }} className="flex-1">
              Indietro
            </Button>
            <Button type="button" onClick={addEntry} disabled={!grams || saving} className="flex-1">
              {saving && <Loader2 className="animate-spin h-4 w-4 mr-1" />}
              Aggiungi
            </Button>
          </div>
        </>
      )}

    </div>
  )
}

// ─── FreeEstimateTab ──────────────────────────────────────────────────────────

function FreeEstimateTab({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState({ name: '', calories: '', proteins: '', carbs: '', fats: '' })
  const [saving, setSaving] = useState(false)

  async function addEntry(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.calories) return
    setSaving(true)
    await fetch('/api/nutrition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_entry',
        date: today(),
        food_id: null,
        grams: null,
        name: form.name,
        calories: parseFloat(form.calories) || 0,
        proteins: parseFloat(form.proteins) || 0,
        carbs: parseFloat(form.carbs) || 0,
        fats: parseFloat(form.fats) || 0,
      }),
    })
    setSaving(false)
    onAdded()
  }

  const fields: Array<{ key: keyof typeof form; label: string; placeholder: string; required?: boolean }> = [
    { key: 'calories', label: 'Calorie (kcal)', placeholder: '600', required: true },
    { key: 'proteins', label: 'Proteine (g)', placeholder: '40' },
    { key: 'carbs', label: 'Carboidrati (g)', placeholder: '50' },
    { key: 'fats', label: 'Grassi (g)', placeholder: '20' },
  ]

  return (
    <form onSubmit={addEntry} className="space-y-3">
      <div className="space-y-1">
        <Label>Nome Pasto <span className="text-destructive">*</span></Label>
        <Input
          placeholder="es. Pranzo al ristorante"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          autoFocus
        />
      </div>
      {fields.map(({ key, label, placeholder, required }) => (
        <div key={key} className="space-y-1">
          <Label>
            {label}
            {required && <span className="text-destructive"> *</span>}
          </Label>
          <Input
            type="number"
            placeholder={placeholder}
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          />
        </div>
      ))}
      <Button type="submit" disabled={!form.name || !form.calories || saving} className="w-full">
        {saving && <Loader2 className="animate-spin h-4 w-4 mr-1" />}
        Aggiungi
      </Button>
    </form>
  )
}

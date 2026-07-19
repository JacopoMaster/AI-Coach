'use client'

import { useState } from 'react'
import { Check, X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Option } from '@/lib/profile/labels'

// Single-select "radio cards". Selection is conveyed by BOTH a ring and a
// check icon (never colour alone). Optional clear resets to null (unanswered).
export function RadioCards<T extends string>({
  value,
  onChange,
  options,
  allowClear = true,
}: {
  value: T | null
  onChange: (v: T | null) => void
  options: Option<T>[]
  allowClear?: boolean
}) {
  return (
    <div className="space-y-2">
      <div role="radiogroup" className="grid gap-2">
        {options.map((opt) => {
          const selected = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected && allowClear ? null : opt.value)}
              className={cn(
                'flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                selected
                  ? 'border-primary ring-1 ring-primary bg-primary/5'
                  : 'border-input hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <span className="mt-0.5 shrink-0">
                {selected ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <span className="block h-4 w-4 rounded-full border border-muted-foreground/40" />
                )}
              </span>
              <span className="min-w-0">
                <span className="font-medium">{opt.label}</span>
                {opt.description && (
                  <span className="block text-xs text-muted-foreground">{opt.description}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
      {allowClear && value !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Cancella selezione
        </button>
      )}
    </div>
  )
}

// Multi-value field over an OPEN text[] column. Preserves the null / [] / list
// distinction explicitly:
//   • null  → nothing chosen yet (initial, never auto-converted);
//   • []    → explicit "none" (via the noneLabel toggle or removing all items);
//   • list  → chosen values (suggestions and/or custom entries).
export function MultiChipField({
  value,
  onChange,
  suggestions = [],
  allowCustom = false,
  noneLabel,
  customPlaceholder = 'Aggiungi…',
}: {
  value: string[] | null
  onChange: (v: string[] | null) => void
  suggestions?: string[]
  allowCustom?: boolean
  noneLabel: string
  customPlaceholder?: string
}) {
  const [custom, setCustom] = useState('')
  const isNone = Array.isArray(value) && value.length === 0
  const selected = value ?? []

  function toggle(item: string) {
    const next = selected.includes(item)
      ? selected.filter((v) => v !== item)
      : [...selected, item]
    onChange(next) // may become [] (explicit none) when the last item is removed
  }

  function addCustom() {
    const v = custom.trim()
    if (!v) return
    if (!selected.includes(v)) onChange([...selected, v])
    setCustom('')
  }

  const extras = selected.filter((v) => !suggestions.includes(v))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => {
          const active = selected.includes(s)
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(s)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              {active && <Check className="h-3.5 w-3.5 text-primary" />}
              {s}
            </button>
          )
        })}
      </div>

      {extras.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {extras.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm"
            >
              {item}
              <button
                type="button"
                aria-label={`Rimuovi ${item}`}
                onClick={() => toggle(item)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {allowCustom && (
        <div className="flex gap-2">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustom()
              }
            }}
            placeholder={customPlaceholder}
            className="h-9"
          />
          <Button type="button" variant="outline" size="sm" onClick={addCustom} disabled={!custom.trim()}>
            <Plus className="h-4 w-4" />
            Aggiungi
          </Button>
        </div>
      )}

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
        {noneLabel}
      </button>
    </div>
  )
}

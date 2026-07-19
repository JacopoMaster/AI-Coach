'use client'

import { ChevronDown, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// Collapsible profile block with an independent Save action. Presentational:
// all state (open/dirty/saving/errors) is owned by the parent form.
export function ProfileSection({
  title,
  description,
  isOpen,
  onToggle,
  dirty,
  saving,
  savedOk,
  saveError,
  validationMessage,
  onSave,
  children,
}: {
  title: string
  description?: string
  isOpen: boolean
  onToggle: () => void
  dirty: boolean
  saving: boolean
  savedOk: boolean
  saveError?: string | null
  validationMessage?: string | null
  onSave: () => void
  children: React.ReactNode
}) {
  const canSave = dirty && !saving && !validationMessage

  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-medium">
            {title}
            {savedOk && !dirty && <Check className="h-4 w-4 text-primary" aria-label="Salvato" />}
            {dirty && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                Da salvare
              </span>
            )}
          </span>
          {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
        </span>
        <ChevronDown
          className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (
        <div className="space-y-5 border-t border-border/60 p-4">
          {children}

          {validationMessage && (
            <p className="text-sm text-destructive" role="alert">
              {validationMessage}
            </p>
          )}
          {saveError && (
            <p className="text-sm text-destructive" role="alert">
              {saveError}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button type="button" onClick={onSave} disabled={!canSave}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salva sezione
            </Button>
            {savedOk && !dirty && !saving && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-primary" />
                Salvato
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

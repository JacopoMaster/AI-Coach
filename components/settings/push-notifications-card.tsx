'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Bell, BellOff, Check, Loader2, Send, Sparkles } from 'lucide-react'
import {
  checkPushSupport,
  disablePushNotifications,
  enablePushNotifications,
  isPushEnabled,
} from '@/lib/push/client'

export function PushNotificationsCard() {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unsupported, setUnsupported] = useState<string | null>(null)

  const [morningEnabled, setMorningEnabled] = useState(true)
  const [morningSaving, setMorningSaving] = useState(false)

  // Test-notification state — separate from the main toggle's `loading` so
  // tapping Test doesn't grey out the enable/disable button.
  const [testing, setTesting] = useState(false)
  const [testFeedback, setTestFeedback] = useState<
    | { tone: 'success'; msg: string }
    | { tone: 'error'; msg: string }
    | null
  >(null)

  useEffect(() => {
    const support = checkPushSupport()
    if (!support.supported) {
      setUnsupported(support.reason)
      setLoading(false)
      return
    }
    Promise.all([
      isPushEnabled(),
      fetch('/api/notifications/preferences')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([isOn, prefs]) => {
        setEnabled(isOn)
        if (prefs?.morning_motivation_enabled !== undefined) {
          setMorningEnabled(Boolean(prefs.morning_motivation_enabled))
        }
      })
      .finally(() => setLoading(false))
  }, [])

  async function toggle() {
    setError(null)
    setLoading(true)
    try {
      if (enabled) {
        await disablePushNotifications()
        setEnabled(false)
      } else {
        await enablePushNotifications()
        setEnabled(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto')
    } finally {
      setLoading(false)
    }
  }

  async function sendTestNotification() {
    setTesting(true)
    setTestFeedback(null)
    setError(null)
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        delivered?: number
        failed?: number
        pruned?: number
      }
      if (!res.ok) {
        throw new Error(body.error || `Invio test fallito (${res.status})`)
      }
      const delivered = body.delivered ?? 0
      setTestFeedback({
        tone: 'success',
        msg:
          delivered === 1
            ? 'Notifica inviata. Controlla il dispositivo.'
            : `Notifica inviata a ${delivered} dispositivi. Controlla il telefono.`,
      })
    } catch (err) {
      setTestFeedback({
        tone: 'error',
        msg: err instanceof Error ? err.message : 'Errore sconosciuto',
      })
    } finally {
      setTesting(false)
      // Auto-dismiss the inline feedback after a few seconds so the card
      // doesn't keep a stale badge around.
      setTimeout(() => setTestFeedback(null), 5000)
    }
  }

  async function toggleMorning() {
    const next = !morningEnabled
    setMorningSaving(true)
    setError(null)
    setMorningEnabled(next) // optimistic
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ morning_motivation_enabled: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Salvataggio preferenze fallito')
      }
      // Confirm against the server's returned value — the PATCH route echoes
      // the row that actually landed in DB, so we stay coherent even if a
      // migration/rename ever tweaks the column defaults.
      const body = (await res.json()) as { morning_motivation_enabled?: boolean }
      if (typeof body.morning_motivation_enabled === 'boolean') {
        setMorningEnabled(body.morning_motivation_enabled)
      }
    } catch (err) {
      setMorningEnabled(!next) // rollback
      setError(err instanceof Error ? err.message : 'Errore sconosciuto')
    } finally {
      setMorningSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Notifiche Coach Proattivo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Ricevi promemoria quando salti un allenamento, sforati le calorie o
          hai un check-in in sospeso.
        </p>

        {unsupported ? (
          <p className="text-sm text-amber-500">
            Notifiche non disponibili su questo browser ({unsupported}).
          </p>
        ) : (
          <>
            <Button
              onClick={toggle}
              disabled={loading}
              variant={enabled ? 'outline' : 'default'}
              className="w-full"
            >
              {loading ? (
                <Loader2 className="animate-spin h-4 w-4" />
              ) : enabled ? (
                <BellOff className="h-4 w-4" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
              {enabled ? 'Disattiva notifiche' : 'Attiva notifiche'}
            </Button>

            {enabled && (
              // The DB column is still `morning_motivation_enabled` for
              // backwards compatibility (existing cron + migrations key off
              // that name). The user-facing label is "Pomeridiani" per the
              // scheduling behaviour we settled on.
              <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                <span className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  Promemoria Motivazionali Pomeridiani
                </span>
                <input
                  type="checkbox"
                  checked={morningEnabled}
                  disabled={morningSaving}
                  onChange={toggleMorning}
                  className="h-4 w-4 accent-primary"
                  aria-label="Promemoria Motivazionali Pomeridiani"
                />
              </label>
            )}

            {/* Manual test trigger — only meaningful when push is enabled. */}
            {enabled && (
              <Button
                onClick={sendTestNotification}
                disabled={testing}
                variant="secondary"
                size="sm"
                className="w-full"
              >
                {testing ? (
                  <Loader2 className="animate-spin h-4 w-4" />
                ) : testFeedback?.tone === 'success' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {testing ? 'Invio in corso…' : 'Invia Notifica di Test'}
              </Button>
            )}

            {testFeedback && (
              <p
                className={
                  'text-xs ' +
                  (testFeedback.tone === 'success'
                    ? 'text-green-500'
                    : 'text-red-500')
                }
              >
                {testFeedback.msg}
              </p>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
      </CardContent>
    </Card>
  )
}

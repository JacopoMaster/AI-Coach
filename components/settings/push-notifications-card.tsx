'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Bell, BellOff, Loader2 } from 'lucide-react'
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

  useEffect(() => {
    const support = checkPushSupport()
    if (!support.supported) {
      setUnsupported(support.reason)
      setLoading(false)
      return
    }
    isPushEnabled()
      .then(setEnabled)
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
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
      </CardContent>
    </Card>
  )
}

'use client'

import { Sparkles, CircleDashed, Rocket, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { ProfileCompleteness } from '@/lib/profile/completeness'

// Header status card. The tier is the SERVER's `completeness` (never recomputed
// here); `missingLabels` is only a presentational hint listing the essential
// Restart fields still to fill, already translated to Italian.
export function ProfileStatusCard({
  completeness,
  missingLabels,
}: {
  completeness: ProfileCompleteness
  missingLabels: string[]
}) {
  if (completeness === 'not_started') {
    return (
      <StatusShell icon={<Sparkles className="h-5 w-5 text-primary" />} title="Costruiamo il tuo profilo atleta">
        Queste informazioni permetteranno al Coach di adattare allenamento, alimentazione e strategia
        alla tua vita reale. Puoi compilarlo un blocco alla volta, quando vuoi.
      </StatusShell>
    )
  }

  if (completeness === 'partial') {
    const n = missingLabels.length
    return (
      <StatusShell icon={<CircleDashed className="h-5 w-5 text-amber-500" />} title="Profilo in costruzione">
        {n > 0 ? (
          <>
            {n === 1
              ? 'Manca 1 informazione essenziale per preparare il Restart:'
              : `Mancano ${n} informazioni essenziali per preparare il Restart:`}{' '}
            <span className="text-foreground">{missingLabels.join(', ')}.</span>
          </>
        ) : (
          'Continua pure a completare il tuo profilo quando vuoi.'
        )}
      </StatusShell>
    )
  }

  if (completeness === 'restart_ready') {
    return (
      <StatusShell icon={<Rocket className="h-5 w-5 text-primary" />} title="Pronto per il Restart">
        Hai fornito le informazioni essenziali per costruire una strategia di ripartenza personalizzata.
        Puoi comunque arricchire il profilo con contesto alimentare, stile di vita e coaching.
      </StatusShell>
    )
  }

  return (
    <StatusShell icon={<CheckCircle2 className="h-5 w-5 text-primary" />} title="Profilo completo">
      Il Coach dispone anche del contesto lifestyle, alimentare e di coaching.
    </StatusShell>
  )
}

function StatusShell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{children}</p>
        </div>
      </CardContent>
    </Card>
  )
}

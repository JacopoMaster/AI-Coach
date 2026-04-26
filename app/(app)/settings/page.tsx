'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DietPlan, WorkoutPlan } from '@/lib/types'
import { LogOut, Loader2, Wrench, Swords, Trophy, Layers } from 'lucide-react'
import { PushNotificationsCard } from '@/components/settings/push-notifications-card'
import { SummerEpisodeCard } from '@/components/settings/summer-episode-card'
import {
  fireCutscene,
  fireGigaDrill,
} from '@/lib/gamification/spiral-events'

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan | null>(null)
  const [dietPlan, setDietPlan] = useState<DietPlan | null>(null)
  const [dietForm, setDietForm] = useState({ name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', notes: '' })
  const [savingDiet, setSavingDiet] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setEmail(user.email || '')

      const [planRes, dietRes] = await Promise.all([
        fetch('/api/workouts?type=plan'),
        fetch('/api/diet?type=plan'),
      ])

      if (planRes.ok) setWorkoutPlan(await planRes.json())
      if (dietRes.ok) {
        const data = await dietRes.json()
        setDietPlan(data)
        if (data) {
          setDietForm({
            name: data.name || '',
            calories: String(data.calories || ''),
            protein_g: String(data.protein_g || ''),
            carbs_g: String(data.carbs_g || ''),
            fat_g: String(data.fat_g || ''),
            notes: data.notes || '',
          })
        }
      }
    }
    load()
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function saveDietPlan(e: React.FormEvent) {
    e.preventDefault()
    setSavingDiet(true)

    const action = dietPlan ? 'update_plan' : 'save_plan'
    await fetch('/api/diet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        id: dietPlan?.id,
        name: dietForm.name || 'Piano alimentare',
        calories: dietForm.calories ? parseInt(dietForm.calories) : null,
        protein_g: dietForm.protein_g ? parseInt(dietForm.protein_g) : null,
        carbs_g: dietForm.carbs_g ? parseInt(dietForm.carbs_g) : null,
        fat_g: dietForm.fat_g ? parseInt(dietForm.fat_g) : null,
        notes: dietForm.notes || null,
      }),
    })

    setSavingDiet(false)
    const res = await fetch('/api/diet?type=plan')
    if (res.ok) setDietPlan(await res.json())
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Impostazioni</h1>

      {/* User info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{email}</p>
          <Button variant="outline" onClick={logout} className="w-full">
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </CardContent>
      </Card>

      {/* Push notifications (Proactive Coach) */}
      <PushNotificationsCard />

      {/* Vacation mode — pauses the proactive cron without disabling pushes. */}
      <SummerEpisodeCard />

      {/* Active workout plan info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Scheda allenamento attiva</CardTitle>
        </CardHeader>
        <CardContent>
          {workoutPlan ? (
            <div>
              <p className="font-medium">{workoutPlan.name}</p>
              <p className="text-sm text-muted-foreground">{workoutPlan.days?.length || 0} giorni</p>
              {workoutPlan.notes && <p className="text-xs text-muted-foreground mt-1">{workoutPlan.notes}</p>}
              <p className="text-xs text-muted-foreground mt-2">
                Chiedi al Coach di modificarla o crearne una nuova.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nessuna scheda attiva. Chiedi al Coach di crearne una!
            </p>
          )}
        </CardContent>
      </Card>

      {/* Diet plan */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Piano alimentare</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveDietPlan} className="space-y-3">
            <div className="space-y-1">
              <Label>Nome piano</Label>
              <Input
                value={dietForm.name}
                onChange={(e) => setDietForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Piano bulk / cut / manutenzione..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Calorie (kcal)</Label>
                <Input
                  type="number"
                  value={dietForm.calories}
                  onChange={(e) => setDietForm((f) => ({ ...f, calories: e.target.value }))}
                  placeholder="2200"
                />
              </div>
              <div className="space-y-1">
                <Label>Proteine (g)</Label>
                <Input
                  type="number"
                  value={dietForm.protein_g}
                  onChange={(e) => setDietForm((f) => ({ ...f, protein_g: e.target.value }))}
                  placeholder="170"
                />
              </div>
              <div className="space-y-1">
                <Label>Carboidrati (g)</Label>
                <Input
                  type="number"
                  value={dietForm.carbs_g}
                  onChange={(e) => setDietForm((f) => ({ ...f, carbs_g: e.target.value }))}
                  placeholder="240"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Grassi (g)</Label>
                <Input
                  type="number"
                  value={dietForm.fat_g}
                  onChange={(e) => setDietForm((f) => ({ ...f, fat_g: e.target.value }))}
                  placeholder="70"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Note</Label>
                <Textarea
                  value={dietForm.notes}
                  onChange={(e) => setDietForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Linee guida alimentari..."
                  className="h-20"
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={savingDiet}>
              {savingDiet && <Loader2 className="animate-spin" />}
              {dietPlan ? 'Aggiorna piano' : 'Crea piano'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Dev Tools ─────────────────────────────────────────────────────
       *  All test triggers fire through the global spiral-events bus —
       *  the layout-mounted CutsceneHost picks them up and queues them
       *  through UniversalCutscene. No local mounted overlay here. */}
      <Card className="border-dashed border-amber-500/40 bg-amber-500/[0.03]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-amber-500">
            <Wrench className="h-4 w-4" />
            Zona di Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Anteprima delle animazioni della spirale. Non produce effetti su DB.
          </p>

          <Button
            variant="outline"
            className="w-full border-agilita/50 text-agilita hover:bg-agilita/10 hover:text-agilita"
            onClick={() =>
              fireCutscene({
                type: 'level_up',
                title: 'LEVEL UP',
                subtitle: '▸ Spirale Lv 15',
                level: 15,
              })
            }
          >
            <Swords className="h-4 w-4" />
            Test Level Up
          </Button>

          <Button
            variant="outline"
            className="w-full border-cyan-400/50 text-cyan-300 hover:bg-cyan-400/10 hover:text-cyan-300"
            onClick={() =>
              fireCutscene({
                type: 'achievement',
                title: 'TROFEO SBLOCCATO',
                subtitle: '▸ Prima Goccia di Sangue',
                level: 50,
                colorOverride: '#00f0ff',
              })
            }
          >
            <Trophy className="h-4 w-4" />
            Test Trofeo
          </Button>

          <Button
            variant="outline"
            className="w-full border-fuchsia-400/50 text-fuchsia-300 hover:bg-fuchsia-400/10 hover:text-fuchsia-300"
            onClick={() => {
              // Three events fired back-to-back on the same tick — the
              // CutsceneHost queue should serialize them: PR → Level Up →
              // Trofeo, with no overlap.
              fireGigaDrill({
                exercise_name: 'Panca Piana',
                from_tonnage: 1500,
                to_tonnage: 1725,
                improvement_pct: 0.15,
                bonus_exp: 300,
              })
              fireCutscene({
                type: 'level_up',
                title: 'LEVEL UP',
                subtitle: '▸ Spirale Lv 16',
                level: 16,
              })
              fireCutscene({
                type: 'achievement',
                title: 'TROFEO SBLOCCATO',
                subtitle: '▸ Combo Spezzata',
                level: 50,
                colorOverride: '#00f0ff',
              })
            }}
          >
            <Layers className="h-4 w-4" />
            Test Combo Coda
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

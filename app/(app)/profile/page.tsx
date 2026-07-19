import { AthleteProfileForm } from '@/components/profile/athlete-profile-form'

export default function ProfilePage() {
  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Profilo atleta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Obiettivi, disponibilità, preferenze e stile di coaching. Compila un blocco alla volta:
          ogni sezione si salva in autonomia e puoi tornarci quando vuoi.
        </p>
      </div>
      <AthleteProfileForm />
    </div>
  )
}

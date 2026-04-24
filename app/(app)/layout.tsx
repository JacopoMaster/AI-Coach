import { BottomNav } from '@/components/bottom-nav'
import { OfflineSyncReplay } from '@/components/offline-sync-replay'
import { GigaDrillCutscene } from '@/components/gamification/GigaDrillCutscene'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="pb-20 max-w-lg mx-auto">
        {children}
      </main>
      <BottomNav />
      {/* iOS / non-SyncManager browsers replay the offline queue here. */}
      <OfflineSyncReplay />
      {/* Gamification cutscenes — mounted once, listens to the event bus. */}
      <GigaDrillCutscene />
    </div>
  )
}

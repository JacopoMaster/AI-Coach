'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Zap,
  ListChecks,
  Activity,
  Dumbbell,
  Salad,
  MessageSquare,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// 7-tab nav. "Spirale" is the hero splash at /, "Oggi" is the quick-action
// hub. Sized to fit comfortably inside max-w-lg: small icons, text-[10px]
// labels, gap-0 between icon and label, tight horizontal padding.
const navItems = [
  { href: '/',         icon: Zap,           label: 'Spirale' },
  { href: '/today',    icon: ListChecks,    label: 'Oggi' },
  { href: '/body',     icon: Activity,      label: 'Corpo' },
  { href: '/workouts', icon: Dumbbell,      label: 'Gym' },
  { href: '/diet',     icon: Salad,         label: 'Dieta' },
  { href: '/coach',    icon: MessageSquare, label: 'Coach' },
  { href: '/settings', icon: Settings,      label: 'Config' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-around h-16 pb-safe max-w-lg mx-auto px-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-lg transition-colors min-w-0 flex-1',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="text-[10px] leading-none truncate max-w-full">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

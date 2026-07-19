import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { getAppDate } from '@/lib/date/app-date'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatDateTime(date: string) {
  return new Date(date).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Today's calendar date (YYYY-MM-DD) in the app timezone (Europe/Rome, D002).
 *  Delegates to the single source of truth in lib/date/app-date. */
export function today() {
  return getAppDate()
}

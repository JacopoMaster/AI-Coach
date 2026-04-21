/**
 * Offline sync queue backed by IndexedDB (via idb-keyval).
 * ──────────────────────────────────────────────────────────
 * A single array is stored under `offline_sync_queue`. The Service Worker
 * and the main thread share the same IndexedDB database because idb-keyval
 * uses its default name (`keyval-store`) in both contexts.
 *
 * Semantics:
 *   • `enqueue()`   — append a request to replay later.
 *   • `flushQueue()`— drain the queue FIFO. 2xx removes the entry, 4xx
 *     removes it too (bad request — retrying won't help). 5xx / network
 *     error stops early so we preserve ordering for later retry.
 */

import { get, update } from 'idb-keyval'

export const QUEUE_KEY = 'offline_sync_queue'
export const SYNC_TAG = 'workout-sync'

export type QueuedRequest = {
  id: string
  enqueuedAt: number
  endpoint: string
  method: 'POST' | 'PUT' | 'PATCH'
  body: string
}

export async function enqueue(
  req: Omit<QueuedRequest, 'id' | 'enqueuedAt'>
): Promise<QueuedRequest> {
  const entry: QueuedRequest = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    enqueuedAt: Date.now(),
    ...req,
  }
  await update<QueuedRequest[]>(QUEUE_KEY, (prev) => [...(prev ?? []), entry])
  return entry
}

export async function getQueue(): Promise<QueuedRequest[]> {
  return (await get<QueuedRequest[]>(QUEUE_KEY)) ?? []
}

async function removeFromQueue(ids: Set<string>): Promise<void> {
  if (ids.size === 0) return
  await update<QueuedRequest[]>(QUEUE_KEY, (prev) =>
    (prev ?? []).filter((r) => !ids.has(r.id))
  )
}

export type FlushResult = {
  sent: number
  dropped: number
  remaining: number
}

/**
 * Try to deliver every queued request. Returns counts per outcome.
 * Stops early on a network error or 5xx so the remaining items keep their
 * order for the next run.
 */
export async function flushQueue(): Promise<FlushResult> {
  const queue = await getQueue()
  if (queue.length === 0) return { sent: 0, dropped: 0, remaining: 0 }

  const delivered = new Set<string>()
  const dropped = new Set<string>()

  for (const item of queue) {
    try {
      const res = await fetch(item.endpoint, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: item.body,
        credentials: 'same-origin',
      })
      if (res.ok) {
        delivered.add(item.id)
      } else if (res.status >= 400 && res.status < 500) {
        // Bad request — the server will never accept this, don't clog the
        // queue forever.
        dropped.add(item.id)
      } else {
        // 5xx: transient — keep and stop so we retry in order.
        break
      }
    } catch {
      // Network error — stop; the caller will retry later.
      break
    }
  }

  const toRemove = new Set<string>([...delivered, ...dropped])
  await removeFromQueue(toRemove)

  const remaining = (await getQueue()).length
  return { sent: delivered.size, dropped: dropped.size, remaining }
}

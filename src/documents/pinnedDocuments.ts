import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useAuth } from '../auth/useAuth.ts'

/**
 * Закреплённые документы. На бэкенде закрепления нет, поэтому список задач
 * хранится в этом браузере, отдельно для каждого аккаунта.
 */
const KEY_PREFIX = 'parallel.pinned-documents.v1.'
const MAX_PINNED = 100
const EMPTY: readonly string[] = []

const listeners = new Set<() => void>()
const cache = new Map<string, { raw: string | null; jobIds: readonly string[] }>()

function storageKey(email: string) {
  return `${KEY_PREFIX}${email.trim().toLowerCase()}`
}

function parse(raw: string | null): readonly string[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : EMPTY
  } catch {
    return EMPTY
  }
}

/** Снимок неизменен, пока не поменялась строка в хранилище: иначе useSyncExternalStore зациклится. */
export function readPinnedJobIds(email: string): readonly string[] {
  const key = storageKey(email)
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
  } catch {
    // Хранилище недоступно: закреплений просто нет.
  }
  const cached = cache.get(key)
  if (cached && cached.raw === raw) return cached.jobIds
  const jobIds = parse(raw)
  cache.set(key, { raw, jobIds })
  return jobIds
}

export function setDocumentPinned(email: string, jobId: string, pinned: boolean) {
  const current = readPinnedJobIds(email).filter((item) => item !== jobId)
  const next = pinned ? [jobId, ...current].slice(0, MAX_PINNED) : current
  try {
    localStorage.setItem(storageKey(email), JSON.stringify(next))
  } catch {
    // Приватный режим: закрепление не сохранится, но и не сломает интерфейс.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Закрепление в другой вкладке приходит событием storage.
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(KEY_PREFIX)) listener()
  }
  window.addEventListener('storage', handleStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', handleStorage)
  }
}

/** Закреплённые задачи текущего аккаунта; новые закрепления идут первыми. */
export function usePinnedDocuments() {
  const { session } = useAuth()
  const email = session?.email ?? null
  const jobIds = useSyncExternalStore(subscribe, () => (email ? readPinnedJobIds(email) : EMPTY))
  const pinnedSet = useMemo(() => new Set(jobIds), [jobIds])
  const setPinned = useCallback((jobId: string, pinned: boolean) => {
    if (email) setDocumentPinned(email, jobId, pinned)
  }, [email])
  return { pinnedJobIds: jobIds, isPinned: (jobId: string | undefined) => Boolean(jobId && pinnedSet.has(jobId)), setPinned }
}

import { useCallback, useSyncExternalStore } from 'react'
import { useAuth } from '../auth/useAuth.ts'

/**
 * Прогресс чтения книг. На backend нет ни отметки «прочитано», ни места чтения,
 * поэтому прогресс живёт в этом браузере, отдельно для каждого аккаунта.
 * Доли, а не номера абзацев: так прогресс не зависит от того, какую колонку
 * читали, и одинаково считается для абзацев DOCX и страниц PDF.
 */
export interface ReadingRecord {
  /** Где читатель сейчас, 0…1: начало экрана в последний раз, когда он задержался. */
  position: number
  /** До куда он вообще дочитывал, 0…1: только растёт, кроме «Отметить непрочитанной». */
  furthest: number
  /** Ручная отметка «прочитано» главнее подсчёта. */
  markedRead: boolean
  /** Когда книгу последний раз читали (мс), для «Продолжить чтение» и вытеснения. */
  openedAt: number
}

export type ReadingState =
  | { status: 'new' }
  | { status: 'reading'; percent: number }
  | { status: 'read' }

/** Дальше этой доли книга считается прочитанной: в конце бывают примечания и пустые страницы. */
export const READ_THRESHOLD = 0.95
/** Меньше этой доли — ещё не начата: человек открыл книгу и посмотрел первую страницу. */
export const STARTED_THRESHOLD = 0.03
const MAX_RECORDS = 300
const KEY_PREFIX = 'parallel.reading-progress.v1.'

type RecordsByJobId = Readonly<Record<string, ReadingRecord>>
const EMPTY: RecordsByJobId = {}

export function readingState(record: ReadingRecord | undefined): ReadingState {
  if (!record) return { status: 'new' }
  if (record.markedRead || record.furthest >= READ_THRESHOLD) return { status: 'read' }
  if (record.furthest < STARTED_THRESHOLD) return { status: 'new' }
  // Вниз: «95%» у непрочитанной книги выглядело бы как ошибка.
  return { status: 'reading', percent: Math.max(1, Math.floor(record.furthest * 100)) }
}

const fraction = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null

/** Разбор записи из хранилища: битое поле — запись отбрасывается целиком. */
export function parseReadingRecord(value: unknown): ReadingRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const position = fraction(record.position)
  const furthest = fraction(record.furthest)
  if (position === null || furthest === null) return null
  return {
    position,
    furthest,
    markedRead: record.markedRead === true,
    openedAt: typeof record.openedAt === 'number' && Number.isFinite(record.openedAt) ? record.openedAt : 0,
  }
}

function storageKey(email: string) {
  return `${KEY_PREFIX}${email.trim().toLowerCase()}`
}

const listeners = new Set<() => void>()
const cache = new Map<string, { raw: string | null; records: RecordsByJobId }>()

function parseAll(raw: string | null): RecordsByJobId {
  try {
    const value: unknown = JSON.parse(raw ?? '{}')
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return EMPTY
    const records: Record<string, ReadingRecord> = {}
    for (const [jobId, item] of Object.entries(value)) {
      const record = parseReadingRecord(item)
      if (record) records[jobId] = record
    }
    return records
  } catch {
    return EMPTY
  }
}

/** Снимок неизменен, пока не поменялась строка в хранилище: иначе useSyncExternalStore зациклится. */
export function readReadingRecords(email: string): RecordsByJobId {
  const key = storageKey(email)
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
  } catch {
    // Хранилище недоступно: прогресса просто нет.
  }
  const cached = cache.get(key)
  if (cached && cached.raw === raw) return cached.records
  const records = parseAll(raw)
  cache.set(key, { raw, records })
  return records
}

/** Меняет запись одной книги; null удаляет её. Свежая запись уходит в конец, давние вытесняются. */
export function updateReadingRecord(
  email: string,
  jobId: string,
  update: (current: ReadingRecord | undefined) => ReadingRecord | null,
) {
  const all = { ...readReadingRecords(email) }
  const next = update(all[jobId])
  delete all[jobId]
  if (next) all[jobId] = next
  const entries = Object.entries(all).slice(-MAX_RECORDS)
  try {
    localStorage.setItem(storageKey(email), JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Приватный режим или переполнение: прогресс не сохранится, но интерфейс не сломается.
  }
  listeners.forEach((listener) => listener())
}

/** Читатель задержался на месте: запоминаем его и дальнюю точку. */
export function recordReading(email: string, jobId: string, position: number, seen: number, now = Date.now()) {
  updateReadingRecord(email, jobId, (current) => ({
    position,
    furthest: Math.max(current?.furthest ?? 0, seen),
    markedRead: current?.markedRead ?? false,
    openedAt: now,
  }))
}

export function setMarkedRead(email: string, jobId: string, read: boolean) {
  updateReadingRecord(email, jobId, (current) => read
    ? { position: current?.position ?? 0, furthest: current?.furthest ?? 0, markedRead: true, openedAt: current?.openedAt ?? 0 }
    // «Непрочитанной» сбрасывает и подсчёт: иначе дочитанная книга осталась бы прочитанной.
    : { position: current?.position ?? 0, furthest: 0, markedRead: false, openedAt: current?.openedAt ?? 0 })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Чтение в другой вкладке приходит событием storage.
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(KEY_PREFIX)) listener()
  }
  window.addEventListener('storage', handleStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', handleStorage)
  }
}

/** Прогресс чтения текущего аккаунта. */
export function useReadingProgress() {
  const { session } = useAuth()
  const email = session?.email ?? null
  const records = useSyncExternalStore(subscribe, () => (email ? readReadingRecords(email) : EMPTY))
  const stateOf = useCallback((jobId: string | undefined) => readingState(jobId ? records[jobId] : undefined), [records])
  const markRead = useCallback((jobId: string, read: boolean) => {
    if (email) setMarkedRead(email, jobId, read)
  }, [email])
  return { email, records, stateOf, markRead }
}

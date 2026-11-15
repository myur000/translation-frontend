import { toCatalogLanguageCode } from '../languages/languageCatalog.ts'
import type { DocumentItem } from '../types/document.ts'

export const HISTORY_PATH = '/history'

export type HistoryStatus = 'all' | 'active' | 'ready' | 'failed' | 'canceled'
export const HISTORY_STATUSES: readonly HistoryStatus[] = ['all', 'active', 'ready', 'failed', 'canceled']

/** Фильтры истории в адресе: панель пишет, страница читает. */
export interface HistoryQuery {
  status: HistoryStatus
  /** `eng_Latn>rus_Cyrl`. */
  pair: string | null
}

const isStatus = (value: string | null): value is HistoryStatus => (HISTORY_STATUSES as readonly (string | null)[]).includes(value)

export function readHistoryQuery(search: string): HistoryQuery {
  const params = new URLSearchParams(search)
  const status = params.get('status')
  return { status: isStatus(status) ? status : 'all', pair: params.get('pair') || null }
}

export function historySearch(query: HistoryQuery) {
  const params = new URLSearchParams()
  if (query.status !== 'all') params.set('status', query.status)
  if (query.pair) params.set('pair', query.pair)
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** Черновики в истории не показываются: это ещё не переводы. */
export function historyDocuments(documents: readonly DocumentItem[]) {
  return documents.filter((document) => document.jobId && document.status !== 'draft')
}

export function statusGroup(document: DocumentItem): Exclude<HistoryStatus, 'all'> {
  if (document.status === 'ready') return 'ready'
  if (document.status === 'failed') return 'failed'
  if (document.status === 'canceled') return 'canceled'
  return 'active'
}

export const languagePair = (document: Pick<DocumentItem, 'sourceLanguage' | 'targetLanguage'>) =>
  `${toCatalogLanguageCode(document.sourceLanguage)}>${toCatalogLanguageCode(document.targetLanguage)}`

export function filterHistory(documents: readonly DocumentItem[], query: HistoryQuery) {
  return documents.filter((document) =>
    (query.status === 'all' || statusGroup(document) === query.status)
    && (!query.pair || languagePair(document) === query.pair))
}

export function countBy<T extends string>(documents: readonly DocumentItem[], key: (document: DocumentItem) => T) {
  const counts = new Map<T, number>()
  for (const document of documents) counts.set(key(document), (counts.get(key(document)) ?? 0) + 1)
  return counts
}

export interface HistoryDay {
  /** `2026-11-15` по местному времени. */
  key: string
  date: Date
  documents: DocumentItem[]
}

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** По дням отправки, новые сверху; без даты — в конце. */
export function groupByDay(documents: readonly DocumentItem[]): HistoryDay[] {
  const days = new Map<string, HistoryDay>()
  const undated: DocumentItem[] = []
  const sorted = [...documents].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  for (const document of sorted) {
    const date = document.createdAt ? new Date(document.createdAt) : null
    if (!date || Number.isNaN(date.getTime())) {
      undated.push(document)
      continue
    }
    const key = dayKey(date)
    const day = days.get(key) ?? { key, date, documents: [] }
    day.documents.push(document)
    days.set(key, day)
  }
  const result = [...days.values()]
  if (undated.length) result.push({ key: 'undated', date: new Date(Number.NaN), documents: undated })
  return result
}

/** «Сегодня», «Вчера» или дата; год — только не текущий. */
export function dayLabel(day: HistoryDay, now: Date, language: string, words: { today: string; yesterday: string; undated: string }) {
  if (day.key === 'undated') return words.undated
  if (day.key === dayKey(now)) return words.today
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (day.key === dayKey(yesterday)) return words.yesterday
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'long',
    ...(day.date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(day.date)
}

import type { TermListItem } from '../api/contracts/terms.ts'
import { toCatalogLanguageCode } from '../languages/languageCatalog.ts'
import type { DocumentItem } from '../types/document.ts'

export const GLOSSARY_PATH = '/glossary'

export type GlossarySort = 'term' | 'translation' | 'recent' | 'books'
export const GLOSSARY_SORTS: readonly GlossarySort[] = ['term', 'translation', 'recent', 'books']

/** Состояние раздела в адресе: панель пишет, страница читает. */
export interface GlossaryQuery {
  /** `eng_Latn>rus_Cyrl`; пусто — самая наполненная пара. */
  pair: string | null
  /** Только термины этой книги (`job_id`). */
  book: string | null
  q: string
  sort: GlossarySort
  /** Открытая карточка термина. */
  term: string | null
}

const isSort = (value: string | null): value is GlossarySort => (GLOSSARY_SORTS as readonly (string | null)[]).includes(value)

export function readGlossaryQuery(search: string): GlossaryQuery {
  const params = new URLSearchParams(search)
  const sort = params.get('sort')
  return {
    pair: params.get('pair') || null,
    book: params.get('book') || null,
    q: params.get('q') ?? '',
    sort: isSort(sort) ? sort : 'term',
    term: params.get('term') || null,
  }
}

export function glossarySearch(query: GlossaryQuery) {
  const params = new URLSearchParams()
  if (query.pair) params.set('pair', query.pair)
  if (query.book) params.set('book', query.book)
  if (query.q.trim()) params.set('q', query.q.trim())
  if (query.sort !== 'term') params.set('sort', query.sort)
  if (query.term) params.set('term', query.term)
  const text = params.toString()
  return text ? `?${text}` : ''
}

export const pairKey = (item: Pick<TermListItem, 'source_lang' | 'target_lang'>) => `${item.source_lang}>${item.target_lang}`

export function splitPair(pair: string) {
  const [source, target] = pair.split('>')
  return { source, target }
}

export interface GlossaryPair {
  key: string
  source: string
  target: string
  count: number
}

/** Пары языков, где есть термины: больше терминов — раньше. */
export function glossaryPairs(terms: readonly TermListItem[]): GlossaryPair[] {
  const counts = new Map<string, number>()
  for (const term of terms) counts.set(pairKey(term), (counts.get(pairKey(term)) ?? 0) + 1)
  return [...counts]
    .map(([key, count]) => ({ key, ...splitPair(key), count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

const normalize = (value: string) => value.toLocaleLowerCase().replace(/ё/g, 'е')

/** Поиск и по термину, и по переводу, без учёта регистра и «ё». */
export function matchesGlossaryQuery(term: Pick<TermListItem, 'term' | 'translation'>, query: string) {
  const needle = normalize(query.trim())
  return !needle || normalize(term.term).includes(needle) || normalize(term.translation).includes(needle)
}

export function sortTerms(terms: readonly TermListItem[], sort: GlossarySort, language = 'ru'): TermListItem[] {
  const collator = new Intl.Collator(language, { sensitivity: 'base', numeric: true })
  const byTerm = (a: TermListItem, b: TermListItem) => collator.compare(a.term, b.term)
  return [...terms].sort((a, b) => {
    if (sort === 'translation') return collator.compare(a.translation, b.translation) || byTerm(a, b)
    if (sort === 'recent') return b.updated_at.localeCompare(a.updated_at) || byTerm(a, b)
    if (sort === 'books') return b.document_count - a.document_count || byTerm(a, b)
    return byTerm(a, b)
  })
}

/** Пара раздела: из адреса, иначе самая наполненная, иначе пара последней книги. */
export function currentPair(pair: string | null, pairs: readonly GlossaryPair[], fallback: string | null) {
  return pair ?? pairs[0]?.key ?? fallback
}

export const documentPair = (document: Pick<DocumentItem, 'sourceLanguage' | 'targetLanguage'>) =>
  `${toCatalogLanguageCode(document.sourceLanguage)}>${toCatalogLanguageCode(document.targetLanguage)}`

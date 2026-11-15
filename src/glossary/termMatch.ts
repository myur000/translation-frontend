import type { NoteQuoteSide } from '../api/contracts/notes.ts'

/** Термин глоссария, как его ищут в тексте книги. */
export interface GlossaryTerm {
  id: string
  term: string
  translation: string
}

export interface TermMatch {
  start: number
  end: number
  term: GlossaryTerm
}

export interface TermMatcher {
  regex: RegExp
  /** Термин каждой группы выражения: группа i + 1 — `terms[i]`. */
  terms: GlossaryTerm[]
}

const NOT_WORD_BEFORE = '(?<![\\p{L}\\p{N}])'
const NOT_WORD_AFTER = '(?![\\p{L}\\p{N}])'

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const words = (value: string) => value.trim().split(/\s+/).filter(Boolean)

/** Термин в оригинале: слова целиком, между ними любые пробелы. */
export function sourcePattern(term: string) {
  return words(term).map(escape).join('\\s+')
}

/**
 * Перевод ищется по основам слов: у длинных слов отбрасываются два последних
 * символа, дальше любые буквы — так находятся падежи («стеклянного поплавка»
 * для «стеклянный поплавок»). Это приближение, не морфология.
 */
export function translationPattern(translation: string) {
  return words(translation)
    .map((word) => escape(word.length <= 4 ? word : word.slice(0, Math.max(3, word.length - 2))) + '\\p{L}*')
    .join('\\s+')
}

/**
 * Одно выражение на колонку. Длинные термины раньше коротких: в «glass float»
 * находится весь термин, а не только «float». В оригинале допускаются
 * множественное число и притяжательная форма (`reefs`, `keeper's`).
 */
export function termMatcher(terms: readonly GlossaryTerm[], side: NoteQuoteSide): TermMatcher | null {
  const patterns = terms
    .map((term) => ({ term, pattern: side === 'SOURCE' ? sourcePattern(term.term) : translationPattern(term.translation) }))
    .filter((item) => item.pattern)
    .sort((a, b) => b.pattern.length - a.pattern.length)
  if (!patterns.length) return null
  const body = patterns.map((item) => `(${item.pattern})`).join('|')
  const tail = side === 'SOURCE' ? `(?:['’]s|es|s)?${NOT_WORD_AFTER}` : ''
  return { regex: new RegExp(`${NOT_WORD_BEFORE}(?:${body})${tail}`, 'giu'), terms: patterns.map((item) => item.term) }
}

/** Все вхождения терминов в тексте, слева направо, без пересечений. */
export function findTerms(text: string, matcher: TermMatcher): TermMatch[] {
  const { regex, terms } = matcher
  const found: TermMatch[] = []
  regex.lastIndex = 0
  for (let match = regex.exec(text); match; match = regex.exec(text)) {
    if (!match[0]) {
      regex.lastIndex += 1
      continue
    }
    const group = match.findIndex((value, index) => index > 0 && value !== undefined)
    if (group > 0) found.push({ start: match.index, end: match.index + match[0].length, term: terms[group - 1] })
  }
  return found
}

/** Выделенный текст как термин: одна строка, без кавычек и знаков препинания по краям. */
export function cleanTermText(text: string) {
  return text.replace(/\s+/g, ' ').trim().replace(/^[\s«"“„'‘([]+|[\s»"”'’)\].,;:!?…]+$/gu, '').trim()
}

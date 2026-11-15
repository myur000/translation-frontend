import type { DocumentTextParagraph } from '../api/contracts/documents.ts'
import { findTerms, termMatcher, type GlossaryTerm } from './termMatch.ts'

/** Сколько абзацев показывать в карточке термина. */
export const MAX_OCCURRENCES = 30

export interface TermOccurrence {
  paragraphIndex: number
  source: string
  translation: string | null
  /** Где термин в абзаце оригинала. */
  inSource: [number, number][]
  /** Где его перевод в абзаце перевода; пусто — перевода термина там нет. */
  inTranslation: [number, number][]
}

/** Абзацы книги, где встречается термин, и есть ли там его перевод. */
export function termOccurrences(term: GlossaryTerm, paragraphs: readonly DocumentTextParagraph[], limit = MAX_OCCURRENCES): TermOccurrence[] {
  const source = termMatcher([term], 'SOURCE')
  const target = termMatcher([term], 'TRANSLATION')
  if (!source) return []
  const found: TermOccurrence[] = []
  for (const paragraph of paragraphs) {
    if (!paragraph.source) continue
    const inSource = findTerms(paragraph.source, source).map((match): [number, number] => [match.start, match.end])
    if (!inSource.length) continue
    const inTranslation = paragraph.translation && target
      ? findTerms(paragraph.translation, target).map((match): [number, number] => [match.start, match.end])
      : []
    found.push({ paragraphIndex: paragraph.index, source: paragraph.source, translation: paragraph.translation, inSource, inTranslation })
    if (found.length >= limit) break
  }
  return found
}

export interface SnippetPart {
  text: string
  isMatch: boolean
}

/** Отрывок вокруг первого вхождения: `radius` символов с каждой стороны, многоточия по краям. */
export function snippet(text: string, ranges: readonly [number, number][], radius = 80): SnippetPart[] {
  if (!ranges.length) {
    const short = text.length > radius * 2 ? `${text.slice(0, radius * 2).trimEnd()}…` : text
    return [{ text: short, isMatch: false }]
  }
  const [start, end] = ranges[0]
  const from = Math.max(0, start - radius)
  const to = Math.min(text.length, end + radius)
  const parts: SnippetPart[] = []
  let position = from
  for (const [a, b] of ranges) {
    if (a < from || b > to) continue
    if (a > position) parts.push({ text: text.slice(position, a), isMatch: false })
    parts.push({ text: text.slice(a, b), isMatch: true })
    position = b
  }
  if (position < to) parts.push({ text: text.slice(position, to), isMatch: false })
  if (from > 0) parts[0] = { ...parts[0], text: `…${parts[0].text.trimStart()}` }
  if (to < text.length) parts[parts.length - 1] = { ...parts[parts.length - 1], text: `${parts[parts.length - 1].text.trimEnd()}…` }
  return parts
}

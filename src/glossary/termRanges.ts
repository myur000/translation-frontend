import type { NoteQuoteSide } from '../api/contracts/notes.ts'
import { indexText, setLayerRanges, supportsQuoteHighlight } from '../notes/quoteRanges.ts'
import { findTerms, termMatcher, type GlossaryTerm } from './termMatch.ts'

/** Термины в тексте книги: `::highlight(glossary-term)` в global.css. */
export const GLOSSARY_TERM_HIGHLIGHT = 'glossary-term'
/** Термин под курсором — ярче остальных. */
export const GLOSSARY_TERM_ACTIVE_HIGHLIGHT = 'glossary-term-active'
/** Слово, из которого сейчас делают термин: выделение браузера пропадает, когда курсор в поле. */
export const GLOSSARY_DRAFT_HIGHLIGHT = 'glossary-draft'

const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote'
/** PDF: текстовый слой — строки-span внутри страницы. */
const PDF_LINES = '[data-document-page] span'

export interface TermHit {
  range: Range
  term: GlossaryTerm
}

/** Блоки текста колонки: самые внутренние (абзац в пункте списка — сам абзац), без служебных слоёв. */
export function termBlocks(host: HTMLElement): HTMLElement[] {
  const blocks = [...host.querySelectorAll<HTMLElement>(BLOCKS)]
    .filter((element) => !element.closest('[data-quote-ignore]') && !element.querySelector(BLOCKS))
  const lines = [...host.querySelectorAll<HTMLElement>(PDF_LINES)].filter((element) => !element.closest(BLOCKS))
  return [...blocks, ...lines]
}

/**
 * Вхождения терминов в колонке, по блокам: по блоку под курсором находится
 * подсказка без обхода всей книги. Блок, где выражение ничего не находит в
 * сыром тексте, не индексируется посимвольно — это основная экономия на длинной книге.
 */
export function termHits(host: HTMLElement, column: NoteQuoteSide, terms: readonly GlossaryTerm[]): Map<HTMLElement, TermHit[]> {
  const result = new Map<HTMLElement, TermHit[]>()
  const matcher = termMatcher(terms, column)
  if (!matcher) return result
  for (const block of termBlocks(host)) {
    matcher.regex.lastIndex = 0
    if (!matcher.regex.test(block.textContent ?? '')) continue
    const { text, points } = indexText(block)
    const hits: TermHit[] = []
    for (const match of findTerms(text, matcher)) {
      const first = points[match.start]
      const last = points[match.end - 1]
      if (!first || !last) continue
      const range = block.ownerDocument.createRange()
      range.setStart(first.node, first.offset)
      range.setEnd(last.node, last.offset + 1)
      hits.push({ range, term: match.term })
    }
    if (hits.length) result.set(block, hits)
  }
  return result
}

/** Термин под точкой экрана — по прямоугольникам строк самого вхождения. */
export function termAtPoint(hits: readonly TermHit[], x: number, y: number): TermHit | null {
  for (const hit of hits) {
    if (typeof hit.range.getClientRects !== 'function') continue
    for (const rect of hit.range.getClientRects()) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return hit
    }
  }
  return null
}

export function setTermHighlightRanges(owner: object, ranges: Range[]) {
  setLayerRanges(GLOSSARY_TERM_HIGHLIGHT, owner, ranges)
}

export function setActiveTermHighlight(range: Range | null) {
  if (!supportsQuoteHighlight()) return
  if (!range) {
    CSS.highlights.delete(GLOSSARY_TERM_ACTIVE_HIGHLIGHT)
    return
  }
  const highlight = new Highlight(range)
  highlight.priority = 1
  CSS.highlights.set(GLOSSARY_TERM_ACTIVE_HIGHLIGHT, highlight)
}

/** Подсветка слова, из которого делают термин; `null` убирает её. */
export function setDraftTermHighlight(range: Range | null) {
  if (!supportsQuoteHighlight()) return
  if (!range) {
    CSS.highlights.delete(GLOSSARY_DRAFT_HIGHLIGHT)
    return
  }
  const highlight = new Highlight(range)
  highlight.priority = 2
  CSS.highlights.set(GLOSSARY_DRAFT_HIGHLIGHT, highlight)
}

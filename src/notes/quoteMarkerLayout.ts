import type { NoteQuoteSide } from '../api/contracts/notes.ts'
import type { BookQuote } from './bookQuotes.ts'
import { indexQuoteBlocks, locateQuote } from './quoteHighlight.ts'
import { findQuoteRange } from './quoteRanges.ts'

export const MARKER_SIZE = 22
const MARKER_GAP = 6
/** Меньше этого зазора поле страницы считается слишком узким для метки. */
const MIN_INNER_GAP = MARKER_SIZE + 4

/** Метка у абзаца: все заметки, цитирующие этот абзац, — одной меткой. */
export interface QuoteMarker {
  key: string
  top: number
  left: number
  noteIds: string[]
  titles: string[]
}

/** Координаты меток в системе прокручиваемого содержимого колонки. */
export function placeMarkers(host: HTMLElement, column: NoteQuoteSide, quotes: BookQuote[]): QuoteMarker[] {
  const index = indexQuoteBlocks(host)
  const hostRect = host.getBoundingClientRect()
  const groups = new Map<HTMLElement, { noteIds: string[]; titles: string[] }>()
  for (const quote of quotes) {
    const text = quote.side === column ? quote.quote : quote.pairedText
    if (!text) continue
    const element = locateQuote(index, quote.paragraphIndex, text)
    if (!element) continue
    const group = groups.get(element) ?? { noteIds: [], titles: [] }
    if (!group.noteIds.includes(quote.noteId)) {
      group.noteIds.push(quote.noteId)
      group.titles.push(quote.noteTitle)
    }
    groups.set(element, group)
  }
  const blockOrder = new Map(index.blocks.map((block, order) => [block.element, order]))
  const markers: QuoteMarker[] = []
  for (const [element, group] of groups) {
    const rect = element.getBoundingClientRect()
    const line = firstLineRect(element) ?? rect
    const paperElement = element.closest<HTMLElement>('article, [data-document-page]')
    const paper = paperElement?.getBoundingClientRect() ?? rect
    const paperLeft = paper.left - hostRect.left + host.scrollLeft
    // Метка — по центру первой строки абзаца.
    const top = line.top - hostRect.top + host.scrollTop + (line.height - MARKER_SIZE) / 2
    // Ключ — заметки и абзац (у строки PDF — её положение по вертикали): одна заметка может цитировать несколько абзацев.
    markers.push({ key: `${group.noteIds.join(',')}@${blockOrder.get(element) ?? Math.round(top)}`, top: Math.round(top), left: Math.round(markerLeft(paperElement, paperLeft, rect.left - paper.left)), ...group })
  }
  return markers.sort((first, second) => first.top - second.top)
}

/**
 * Страница DOCX и текста (article) — метка посередине её левого поля, как пометка
 * карандашом на полях книги. Поле меряется по экрану, поэтому учитывает масштаб.
 * У PDF и слишком узкого поля — снаружи страницы, а если и там нет места — у края колонки.
 */
function markerLeft(paperElement: HTMLElement | null, paperLeft: number, innerGap: number) {
  if (paperElement?.tagName === 'ARTICLE' && innerGap >= MIN_INNER_GAP) return paperLeft + (innerGap - MARKER_SIZE) / 2
  const outside = paperLeft - MARKER_SIZE - MARKER_GAP
  return outside >= 2 ? outside : paperLeft + 2
}

/** Прямоугольник первой строки абзаца; null, если браузер (или jsdom) его не даёт. */
function firstLineRect(element: HTMLElement): DOMRect | null {
  const range = element.ownerDocument.createRange()
  range.selectNodeContents(element)
  if (typeof range.getClientRects !== 'function') return null
  return [...range.getClientRects()].find((rect) => rect.width > 0 && rect.height > 0) ?? null
}

/**
 * Диапазоны цитат этой колонки для постоянной подсветки. Цитаты другой колонки
 * не подсвечиваются: у их парного абзаца известен только абзац целиком.
 */
export function quoteRanges(host: HTMLElement, column: NoteQuoteSide, quotes: BookQuote[]): Range[] {
  const own = quotes.filter((quote) => quote.side === column)
  if (!own.length) return []
  const index = indexQuoteBlocks(host)
  const ranges: Range[] = []
  for (const quote of own) {
    const element = locateQuote(index, quote.paragraphIndex, quote.quote)
    const range = element ? findQuoteRange(element, quote.quote) : null
    if (range) ranges.push(range)
  }
  return ranges
}

export function sameMarkers(current: QuoteMarker[], next: QuoteMarker[]) {
  return current.length === next.length && current.every((marker, index) =>
    marker.key === next[index].key && marker.top === next[index].top && marker.left === next[index].left)
}

import type { NoteQuoteSide } from '../api/contracts/notes.ts'
import type { BookQuote } from './bookQuotes.ts'
import { indexQuoteBlocks, locateQuote } from './quoteHighlight.ts'
import { findQuoteRange } from './quoteRanges.ts'

export const MARKER_SIZE = 22
const MARKER_GAP = 6
/** Меньше этого зазора поле страницы считается слишком узким для метки. */
const MIN_INNER_GAP = MARKER_SIZE + 4

/**
 * Место метки на самой странице, в её единицах до масштаба: страница масштабируется
 * через CSS `zoom`, и метка внутри неё едет вместе с текстом в том же кадре.
 * `x`, `y` — точка на странице (центр первой строки абзаца по вертикали), `dx` —
 * сдвиг кружка от неё в экранных пикселях: размер метки от масштаба не зависит.
 */
export interface PageAnchor {
  page: HTMLElement
  x: number
  y: number
  dx: number
  /** Сдвиг вниз в экранных пикселях: тетрадь конспекта под кружком заметок того же абзаца. */
  dy?: number
}

/** Метка у абзаца: все заметки, цитирующие этот абзац, — одной меткой. */
export interface QuoteMarker {
  key: string
  top: number
  left: number
  /** Где метка на странице; `null` — страницы нет, метка в слое колонки. */
  anchor: PageAnchor | null
  noteIds: string[]
  titles: string[]
  /** Номер абзаца (как в `/text`), у которого стоит метка; `null` — у строки PDF без номера. */
  paragraphIndex: number | null
}

/** Координаты меток в системе прокручиваемого содержимого колонки. */
export function placeMarkers(host: HTMLElement, column: NoteQuoteSide, quotes: BookQuote[]): QuoteMarker[] {
  const index = indexQuoteBlocks(host)
  const hostRect = host.getBoundingClientRect()
  const groups = new Map<HTMLElement, { noteIds: string[]; titles: string[]; paragraphIndex: number | null }>()
  for (const quote of quotes) {
    const isOwn = quote.side === column
    const text = isOwn ? quote.quote : quote.pairedText
    if (!text) continue
    // В «чужой» колонке весь абзац — это и есть парный текст.
    const element = locateQuote(index, quote.paragraphIndex, text, isOwn ? quote.paragraphText : quote.pairedText)
    if (!element) continue
    const group = groups.get(element) ?? { noteIds: [], titles: [], paragraphIndex: quote.paragraphIndex }
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
    const left = markerLeft(paperElement, paperLeft, rect.left - paper.left)
    const zoom = paperElement ? cssZoom(paperElement) : 1
    const anchor = paperElement ? {
      page: paperElement,
      // Середина левого поля, если метка в нём; иначе от левого края страницы.
      x: left > paperLeft + 2 ? (left - paperLeft + MARKER_SIZE / 2) / zoom : 0,
      y: (line.top + line.height / 2 - paper.top) / zoom,
      dx: left > paperLeft + 2 ? -MARKER_SIZE / 2 : left - paperLeft,
    } : null
    // Ключ — заметки и абзац (у строки PDF — её положение по вертикали): одна заметка может цитировать несколько абзацев.
    markers.push({ key: `${group.noteIds.join(',')}@${blockOrder.get(element) ?? Math.round(top)}`, top: Math.round(top), left: Math.round(left), anchor, ...group })
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

/** Масштаб страницы (CSS `zoom`); без поддержки в браузере или в jsdom — 1. */
function cssZoom(element: HTMLElement) {
  const zoom = (element as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom
    ?? parseFloat(getComputedStyle(element).zoom)
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1
}

/** Прямоугольник первой строки абзаца; null, если браузер (или jsdom) его не даёт. */
function firstLineRect(element: HTMLElement): DOMRect | null {
  const range = element.ownerDocument.createRange()
  range.selectNodeContents(element)
  if (typeof range.getClientRects !== 'function') return null
  return [...range.getClientRects()].find((rect) => rect.width > 0 && rect.height > 0) ?? null
}

/** Цитата этой колонки и её место в тексте. */
export interface QuoteHit {
  noteId: string
  range: Range
}

/** Цитаты колонки с их диапазонами в тексте (`noteIds` — только этих заметок). */
export function quoteHits(host: HTMLElement, column: NoteQuoteSide, quotes: BookQuote[], noteIds?: ReadonlySet<string>): QuoteHit[] {
  const own = quotes.filter((quote) => quote.side === column && (!noteIds || noteIds.has(quote.noteId)))
  if (!own.length) return []
  const index = indexQuoteBlocks(host)
  const hits: QuoteHit[] = []
  for (const quote of own) {
    const element = locateQuote(index, quote.paragraphIndex, quote.quote, quote.paragraphText)
    const range = element ? findQuoteRange(element, quote.quote) : null
    if (range) hits.push({ noteId: quote.noteId, range })
  }
  return hits
}

/**
 * Диапазоны цитат этой колонки для подсветки. Цитаты другой колонки не
 * подсвечиваются: у их парного абзаца известен только абзац целиком.
 */
export function quoteRanges(host: HTMLElement, column: NoteQuoteSide, quotes: BookQuote[], noteIds?: ReadonlySet<string>): Range[] {
  return quoteHits(host, column, quotes, noteIds).map((hit) => hit.range)
}

/**
 * Заметки, чьи цитаты лежат под точкой экрана. Проверяются прямоугольники строк
 * самой цитаты, а не «ближайший символ»: клик по пустому месту справа от короткой
 * строки не должен открывать заметку.
 */
export function notesAtPoint(hits: readonly QuoteHit[], x: number, y: number): string[] {
  const found = new Set<string>()
  for (const hit of hits) {
    if (typeof hit.range.getClientRects !== 'function') continue
    for (const rect of hit.range.getClientRects()) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        found.add(hit.noteId)
        break
      }
    }
  }
  return [...found]
}

export function sameMarkers(current: QuoteMarker[], next: QuoteMarker[]) {
  return current.length === next.length && current.every((marker, index) =>
    marker.key === next[index].key && marker.top === next[index].top && marker.left === next[index].left
    && sameAnchor(marker.anchor, next[index].anchor))
}

function sameAnchor(current: PageAnchor | null, next: PageAnchor | null) {
  if (!current || !next) return current === next
  return current.page === next.page && Math.abs(current.x - next.x) < 0.5 && Math.abs(current.y - next.y) < 0.5 && current.dx === next.dx && (current.dy ?? 0) === (next.dy ?? 0)
}

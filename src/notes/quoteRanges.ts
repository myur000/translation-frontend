import { normalizeQuoteText } from './quoteLocator.ts'

/** Имя подсветки для `::highlight(note-quote)` в global.css. */
export const NOTE_QUOTE_HIGHLIGHT = 'note-quote'
/** Цитаты открытой или наведённой заметки на полях — ярче остальных (`::highlight(note-quote-active)`). */
export const NOTE_QUOTE_ACTIVE_HIGHLIGHT = 'note-quote-active'
/**
 * По стольким первым символам ищется начало цитаты, если целиком она в абзаце не
 * нашлась. Короткие пробы — для цитаты, которая начинается в самом конце абзаца.
 */
const START_PROBES = [40, 20, 12]

const SPACES = /[\s\u00a0\u2007\u202f]/

/**
 * Текст элемента, нормализованный как `normalizeQuoteText`, и для каждого его
 * символа — текстовый узел и смещение в нём. По этой карте найденная в чистом
 * тексте цитата превращается в Range прямо по DOM книги.
 */
function indexText(element: HTMLElement) {
  let text = ''
  const points: { node: Text; offset: number }[] = []
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    // Служебные слои (метки, подписи) в цитату не входят.
    acceptNode: (node) => node.parentElement?.closest('[data-quote-ignore]')
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT,
  })
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const value = node.data
    for (let offset = 0; offset < value.length; offset += 1) {
      const char = value[offset]
      if (char === '\u00ad') continue
      if (SPACES.test(char)) {
        // Пробелы схлопываются в один, ведущие отбрасываются — как в normalizeQuoteText.
        if (!text || text.endsWith(' ')) continue
        text += ' '
      } else {
        text += char
      }
      points.push({ node, offset })
    }
  }
  return { text, points }
}

/**
 * Диапазон цитаты внутри абзаца. Цитата могла быть обрезана («…») или начаться в
 * этом абзаце и уйти в следующий — тогда подсвечивается совпавшее начало.
 */
export function findQuoteRange(element: HTMLElement, quote: string): Range | null {
  const needle = normalizeQuoteText(quote).replace(/…$/, '').trimEnd()
  if (!needle) return null
  const { text, points } = indexText(element)
  let start = text.indexOf(needle)
  let length = needle.length
  if (start < 0) {
    start = -1
    for (const probe of START_PROBES) {
      start = text.indexOf(needle.slice(0, probe))
      if (start >= 0) break
    }
    if (start < 0) return null
    length = 0
    while (start + length < text.length && length < needle.length && text[start + length] === needle[length]) length += 1
  }
  // Пробел на стыке абзацев в подсветку не берём.
  while (length > 0 && text[start + length - 1] === ' ') length -= 1
  if (!length) return null
  const first = points[start]
  const last = points[start + length - 1]
  const range = element.ownerDocument.createRange()
  range.setStart(first.node, first.offset)
  range.setEnd(last.node, last.offset + 1)
  return range
}

export function supportsQuoteHighlight() {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'
}

/** Диапазоны каждой колонки: обе колонки пишут в одну подсветку и не стирают чужие. */
const rangesByOwner = new Map<object, Range[]>()

/** Заменяет диапазоны одной колонки; пустой список убирает их. */
export function setQuoteHighlightRanges(owner: object, ranges: Range[]) {
  if (!supportsQuoteHighlight()) return
  if (ranges.length) rangesByOwner.set(owner, ranges)
  else rangesByOwner.delete(owner)
  const all = [...rangesByOwner.values()].flat()
  if (all.length) CSS.highlights.set(NOTE_QUOTE_HIGHLIGHT, new Highlight(...all))
  else CSS.highlights.delete(NOTE_QUOTE_HIGHLIGHT)
}

/** Цитаты открытой заметки: отдельный слой поверх обычного; пустой список убирает его. */
export function setActiveQuoteHighlight(ranges: Range[]) {
  if (!supportsQuoteHighlight()) return
  if (!ranges.length) {
    CSS.highlights.delete(NOTE_QUOTE_ACTIVE_HIGHLIGHT)
    return
  }
  const highlight = new Highlight(...ranges)
  // Выше обычной подсветки: там, где слои пересекаются, видна яркая.
  highlight.priority = 1
  CSS.highlights.set(NOTE_QUOTE_ACTIVE_HIGHLIGHT, highlight)
}

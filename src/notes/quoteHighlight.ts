import { normalizeQuoteText } from './quoteLocator.ts'

const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote'
/** Сколько держится подсветка найденного фрагмента. */
export const QUOTE_HIGHLIGHT_MS = 2400

/** Текст колонки, разобранный один раз: метки ищут в нём много цитат подряд. */
export interface QuoteBlockIndex {
  viewport: HTMLElement
  blocks: { element: HTMLElement; text: string }[]
  lines: { element: HTMLElement; text: string }[]
}

export function indexQuoteBlocks(viewport: HTMLElement): QuoteBlockIndex {
  const blocks = [...viewport.querySelectorAll<HTMLElement>(BLOCKS)]
    .filter((element) => !element.closest('[data-quote-ignore]'))
    .map((element) => ({ element, text: normalizeQuoteText(element.textContent ?? '') }))
  // PDF: текстовый слой разбит на строки.
  const lines = [...viewport.querySelectorAll<HTMLElement>('[data-document-page] span')]
    .map((element) => ({ element, text: normalizeQuoteText(element.textContent ?? '') }))
  return { viewport, blocks, lines }
}

/** Из нескольких подходящих блоков — ближайший по порядку к номеру абзаца цитаты. */
function nearest<T>(items: readonly T[], order: (item: T) => number, paragraphIndex: number): T | null {
  let best: T | null = null
  let bestDistance = Infinity
  for (const item of items) {
    const distance = Math.abs(order(item) - paragraphIndex)
    if (distance < bestDistance) {
      best = item
      bestDistance = distance
    }
  }
  return best
}

/**
 * Элемент колонки, где стоит фрагмент: в текстовом виде — по номеру абзаца, в DOCX —
 * блок с этим текстом, в PDF — строка текстового слоя с его началом.
 *
 * Короткая цитата («он», «было») встречается во многих абзацах, поэтому первый
 * попавшийся блок с этим текстом — не ответ. Абзац цитаты определяется так:
 * 1. `paragraphText` — текст абзаца с сервера (`/text`), по нему цитата и получила
 *    свой номер: подходит блок ровно с этим текстом;
 * 2. иначе (или если такого блока нет) — из блоков, где цитата встречается, ближайший
 *    по порядку к номеру абзаца: блоки DOCX идут в том же порядке, что абзацы `/text`.
 */
export function locateQuote(index: QuoteBlockIndex, paragraphIndex: number, text: string, paragraphText?: string | null): HTMLElement | null {
  const indexed = index.viewport.querySelector<HTMLElement>(`[data-paragraph-index="${paragraphIndex}"]`)
  if (indexed) return indexed
  const needle = normalizeQuoteText(text).replace(/…$/, '').slice(0, 120)
  if (!needle) return null
  const ordered = index.blocks.map((block, order) => ({ ...block, order }))
  const containing = ordered.filter((candidate) => candidate.text.includes(needle))
  const paragraph = paragraphText ? normalizeQuoteText(paragraphText) : ''
  if (paragraph && containing.length) {
    const exact = containing.filter((candidate) => candidate.text === paragraph)
    // Блок шире абзаца (ячейка с несколькими абзацами) или уже (абзац разбит на строки) — тоже он.
    const loose = exact.length ? exact
      : containing.filter((candidate) => candidate.text.includes(paragraph) || paragraph.includes(candidate.text))
    const match = nearest(loose, (candidate) => candidate.order, paragraphIndex)
    if (match) return match.element
  }
  const block = nearest(containing, (candidate) => candidate.order, paragraphIndex)
  if (block) return block.element
  // PDF: строки текстового слоя. Сначала строка, где начинается абзац цитаты, затем
  // первая строка с началом цитаты не выше неё.
  const start = needle.slice(0, 40)
  const lineHas = (line: string, probe: string) => line.length >= 8 && (line.includes(probe) || probe.startsWith(line))
  const paragraphLine = paragraph ? index.lines.findIndex(({ text: line }) => lineHas(line, paragraph.slice(0, 40))) : -1
  const from = Math.max(0, paragraphLine)
  const after = index.lines.slice(from).find(({ text: line }) => lineHas(line, start))
  return after?.element ?? index.lines.find(({ text: line }) => lineHas(line, start))?.element ?? null
}

export function findQuoteElement(viewport: HTMLElement, paragraphIndex: number, quote: string, paragraphText?: string | null): HTMLElement | null {
  return locateQuote(indexQuoteBlocks(viewport), paragraphIndex, quote, paragraphText)
}

/** Прокручивает колонку к фрагменту и ненадолго подсвечивает его. */
export function revealQuoteElement(element: HTMLElement) {
  element.scrollIntoView({ block: 'center', behavior: 'smooth' })
  element.removeAttribute('data-quote-highlight')
  // Повторный показ того же фрагмента перезапускает анимацию.
  void element.offsetWidth
  element.setAttribute('data-quote-highlight', '')
  window.setTimeout(() => element.removeAttribute('data-quote-highlight'), QUOTE_HIGHLIGHT_MS)
}

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

/**
 * Элемент колонки, где стоит фрагмент: в текстовом виде — по номеру абзаца,
 * в DOCX — блок с этим текстом, в PDF — строка текстового слоя с его началом.
 */
export function locateQuote(index: QuoteBlockIndex, paragraphIndex: number, text: string): HTMLElement | null {
  const indexed = index.viewport.querySelector<HTMLElement>(`[data-paragraph-index="${paragraphIndex}"]`)
  if (indexed) return indexed
  const needle = normalizeQuoteText(text).replace(/…$/, '').slice(0, 120)
  if (!needle) return null
  const block = index.blocks.find((candidate) => candidate.text.includes(needle))
  if (block) return block.element
  const start = needle.slice(0, 40)
  return index.lines.find(({ text: line }) => line.length >= 8 && (line.includes(start) || start.startsWith(line)))?.element ?? null
}

export function findQuoteElement(viewport: HTMLElement, paragraphIndex: number, quote: string): HTMLElement | null {
  return locateQuote(indexQuoteBlocks(viewport), paragraphIndex, quote)
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

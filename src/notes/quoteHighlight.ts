import { normalizeQuoteText } from './quoteLocator.ts'

const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote'
/** Сколько держится подсветка найденного фрагмента. */
export const QUOTE_HIGHLIGHT_MS = 2400

/**
 * Элемент колонки, где стоит цитата: в текстовом виде — по номеру абзаца,
 * в DOCX — блок с этим текстом, в PDF — строка текстового слоя с началом цитаты.
 */
export function findQuoteElement(viewport: HTMLElement, paragraphIndex: number, quote: string): HTMLElement | null {
  const indexed = viewport.querySelector<HTMLElement>(`[data-paragraph-index="${paragraphIndex}"]`)
  if (indexed) return indexed
  const needle = normalizeQuoteText(quote).replace(/…$/, '').slice(0, 120)
  if (!needle) return null
  for (const block of viewport.querySelectorAll<HTMLElement>(BLOCKS)) {
    if (block.closest('[data-quote-ignore]')) continue
    if (normalizeQuoteText(block.textContent ?? '').includes(needle)) return block
  }
  // PDF: текстовый слой разбит на строки — ищем строку, с которой цитата начинается.
  const start = needle.slice(0, 40)
  for (const line of viewport.querySelectorAll<HTMLElement>('[data-document-page] span')) {
    const text = normalizeQuoteText(line.textContent ?? '')
    if (text.length >= 8 && (text.includes(start) || start.startsWith(text))) return line
  }
  return null
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

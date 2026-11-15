import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { QuoteSelection } from '../notes/quoteLocator.ts'

export interface ActiveQuoteSelection extends QuoteSelection {
  /** Где выделение на экране: над ним показывается кнопка «В заметку». */
  rect: { top: number; left: number; width: number; height: number }
  /** Сам диапазон: по нему карточка у выделения едет за текстом при прокрутке. */
  range?: Range
}

/** Блоки, текст которых уточняет абзац (DOCX после mammoth и текстовый вид оригинала). */
const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote'

function readSelection(original: HTMLElement | null, translation: HTMLElement | null): ActiveQuoteSelection | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null
  const range = selection.getRangeAt(0)
  const container = range.commonAncestorContainer
  const side = original?.contains(container) ? 'SOURCE' : translation?.contains(container) ? 'TRANSLATION' : null
  if (!side) return null
  const text = selection.toString()
  if (!text.trim()) return null
  const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
  // Служебные подписи над документом («Текст оригинала с сервера…») цитатой не бывают.
  if (!start || start.closest('[data-quote-ignore]')) return null
  const indexed = start.closest<HTMLElement>('[data-paragraph-index]')
  const rect = range.getBoundingClientRect()
  return {
    side,
    text,
    blockText: start.closest(BLOCK_SELECTOR)?.textContent ?? null,
    paragraphIndex: indexed ? Number(indexed.dataset.paragraphIndex) : null,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    range: range.cloneRange(),
  }
}

/**
 * Текущее выделение в колонке оригинала или перевода. Прокрутка колонки двигает
 * выделение, а `selectionchange` при этом не приходит — положение пересчитывается и на scroll.
 */
export function useQuoteSelection(
  originalRef: RefObject<HTMLElement | null>,
  translationRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const [selection, setSelection] = useState<ActiveQuoteSelection | null>(null)

  useEffect(() => {
    if (!enabled) return
    let frame = 0
    const update = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => setSelection(readSelection(originalRef.current, translationRef.current)))
    }
    document.addEventListener('selectionchange', update)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('selectionchange', update)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [enabled, originalRef, translationRef])

  const clear = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }, [])

  return { selection: enabled ? selection : null, clear }
}

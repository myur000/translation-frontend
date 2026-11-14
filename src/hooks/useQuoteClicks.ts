import { useEffect, useRef, type RefObject } from 'react'
import type { NoteQuoteSide } from '../api/contracts/notes.ts'
import type { BookQuote } from '../notes/bookQuotes.ts'
import { notesAtPoint, quoteHits } from '../notes/quoteMarkerLayout.ts'

interface QuoteClicksOptions {
  viewportRef: RefObject<HTMLElement | null>
  column: NoteQuoteSide
  quotes: BookQuote[]
  /** Меняется, когда колонка могла смонтироваться заново (раскладка, полный экран). */
  layoutKey: string
  /** Клик по цитате: открыть её заметки. */
  onOpen: (noteIds: string[]) => void
  /** Курсор над цитатами этих заметок (пустой список — ни над одной). */
  onHover: (noteIds: string[]) => void
}

/** Кликом по тексту не считается то, что относится к слоям поверх книги и к элементам управления. */
const NOT_TEXT = '[data-quote-ignore], a, button, input, textarea, select, label'

/**
 * Клик по подсвеченной цитате в тексте книги открывает её заметку; над цитатой
 * курсор — «рука», а её карточка на полях выделяется. Выделение текста не
 * ломается: если после клика что-то выделено, это выделение, а не клик.
 * Диапазоны цитат ищутся в момент события (не чаще кадра для наведения), поэтому
 * они всегда соответствуют текущей раскладке и масштабу.
 */
export function useQuoteClicks({ viewportRef, column, quotes, layoutKey, onOpen, onHover }: QuoteClicksOptions) {
  // Обработчики берутся свежими в момент события, подписка от них не зависит.
  const handlers = useRef({ onOpen, onHover })
  useEffect(() => { handlers.current = { onOpen, onHover } })

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !quotes.some((quote) => quote.side === column)) return
    let hovered: string[] = []
    let frame = 0
    const hitsAt = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element) || target.closest(NOT_TEXT)) return []
      return notesAtPoint(quoteHits(viewport, column, quotes), event.clientX, event.clientY)
    }
    const setHovered = (noteIds: string[]) => {
      if (noteIds.join() === hovered.join()) return
      hovered = noteIds
      if (noteIds.length) viewport.dataset.overQuote = ''
      else delete viewport.dataset.overQuote
      handlers.current.onHover(noteIds)
    }
    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (!window.getSelection()?.isCollapsed) return
      const noteIds = hitsAt(event)
      if (noteIds.length) handlers.current.onOpen(noteIds)
    }
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => setHovered(hitsAt(event)))
    }
    const handlePointerLeave = () => {
      window.cancelAnimationFrame(frame)
      setHovered([])
    }
    viewport.addEventListener('click', handleClick)
    viewport.addEventListener('pointermove', handlePointerMove)
    viewport.addEventListener('pointerleave', handlePointerLeave)
    return () => {
      window.cancelAnimationFrame(frame)
      viewport.removeEventListener('click', handleClick)
      viewport.removeEventListener('pointermove', handlePointerMove)
      viewport.removeEventListener('pointerleave', handlePointerLeave)
      delete viewport.dataset.overQuote
      if (hovered.length) handlers.current.onHover([])
    }
  }, [column, layoutKey, quotes, viewportRef])
}

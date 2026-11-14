import { useCallback, useEffect, useState, type RefObject } from 'react'
import { flowPage, flowPageTop } from './flowPages.ts'

/**
 * Текущая страница в колонке без разметки страниц и переход на другую
 * (`flowPages.ts`). `total === null` — счётчик не нужен (PDF со своими
 * страницами или число страниц неизвестно). `layoutKey` меняется вместе с
 * раскладкой: колонка чтения могла смениться, слушатели переставляются.
 */
export function useFlowPages(viewportRef: RefObject<HTMLElement | null>, total: number | null, layoutKey: string) {
  const [page, setPage] = useState(1)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || total === null) return
    let frame = 0
    const update = () => {
      frame = 0
      setPage(flowPage(viewport.scrollTop, viewport.scrollHeight, viewport.clientHeight, total))
    }
    // Прокрутка идёт десятками событий за кадр — считаем раз в кадр.
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    update()
    viewport.addEventListener('scroll', schedule, { passive: true })
    // Книга догружается и меняет высоту (DOCX, шрифты, масштаб) — номер пересчитывается.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(viewport)
    if (viewport.firstElementChild) observer?.observe(viewport.firstElementChild)
    return () => {
      viewport.removeEventListener('scroll', schedule)
      observer?.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [layoutKey, total, viewportRef])

  const goTo = useCallback((target: number) => {
    const viewport = viewportRef.current
    if (!viewport || total === null) return
    viewport.scrollTop = flowPageTop(target, viewport.scrollHeight, viewport.clientHeight, total)
    // Номер обновится по событию прокрутки; ставим сразу, чтобы двойной клик не терял шаг.
    setPage(Math.min(total, Math.max(1, target)))
  }, [total, viewportRef])

  return { page: total === null ? 1 : Math.min(page, total), goTo }
}

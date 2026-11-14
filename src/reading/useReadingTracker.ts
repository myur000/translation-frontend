import { useEffect, type RefObject } from 'react'
import { indexQuoteBlocks } from '../notes/quoteHighlight.ts'
import { recordReading } from './readingProgress.ts'

/**
 * Сколько читатель должен задержаться на месте, чтобы оно засчиталось. Быстрая
 * прокрутка в конец книги не делает её прочитанной: засчитывается только то,
 * перед чем человек остановился.
 */
export const READING_DWELL_MS = 2000

export interface ReadingMeasure {
  /** Доля книги до первой видимой единицы — место, где читатель сейчас. */
  position: number
  /** Доля книги до последней видимой единицы включительно — сколько он увидел. */
  seen: number
}

/**
 * Где читатель в колонке. Единицы — страницы PDF или абзацы текста и DOCX
 * (служебные подписи не считаются). Не зависят от масштаба и ширины колонки.
 */
export function measureReading(viewport: HTMLElement): ReadingMeasure | null {
  const view = viewport.getBoundingClientRect()
  if (view.height <= 0) return null
  const pages = [...viewport.querySelectorAll<HTMLElement>('[data-document-page]')]
  const units = pages.length
    ? pages
    : indexQuoteBlocks(viewport).blocks.filter((block) => block.text).map((block) => block.element)
  if (!units.length) return null
  let first = -1
  let last = -1
  units.forEach((unit, index) => {
    const rect = unit.getBoundingClientRect()
    if (rect.bottom <= view.top || rect.top >= view.bottom) return
    if (first < 0) first = index
    last = index
  })
  if (first < 0) return null
  return { position: first / units.length, seen: (last + 1) / units.length }
}

/**
 * Следит за чтением готовой книги в колонке `viewportRef`: после каждой
 * остановки на {@link READING_DWELL_MS} запоминает место и дальнюю точку.
 * `layoutKey` меняется, когда колонка могла смонтироваться заново.
 */
export function useReadingTracker(
  email: string | null,
  jobId: string | null,
  viewportRef: RefObject<HTMLElement | null>,
  layoutKey: string,
) {
  useEffect(() => {
    const viewport = viewportRef.current
    if (!email || !jobId || !viewport) return
    let timer = 0
    const commit = () => {
      const measure = measureReading(viewport)
      if (measure) recordReading(email, jobId, measure.position, measure.seen)
    }
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(commit, READING_DWELL_MS)
    }
    schedule()
    viewport.addEventListener('scroll', schedule, { passive: true })
    // Текст DOCX и страницы PDF появляются позже колонки: короткая книга без
    // прокрутки тоже засчитывается, когда её содержимое показано целиком.
    const mutations = new MutationObserver(schedule)
    mutations.observe(viewport, { childList: true, subtree: true })
    return () => {
      window.clearTimeout(timer)
      viewport.removeEventListener('scroll', schedule)
      mutations.disconnect()
    }
    // layoutKey в зависимостях: после смены раскладки в ref уже другая колонка.
  }, [email, jobId, viewportRef, layoutKey])
}

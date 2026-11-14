import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { NoteQuoteSide } from '../../api/contracts/notes.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { BookQuote } from '../../notes/bookQuotes.ts'
import { placeMarkers, quoteRanges, sameMarkers, type QuoteMarker } from '../../notes/quoteMarkerLayout.ts'
import { setQuoteHighlightRanges } from '../../notes/quoteRanges.ts'
import styles from './QuoteMarkers.module.css'

interface QuoteMarkersProps {
  viewportRef: RefObject<HTMLDivElement | null>
  /** Какая колонка: метки её цитат стоят по тексту цитаты, чужих — по парному абзацу. */
  column: NoteQuoteSide
  quotes: BookQuote[]
  /** Меняется, когда колонка могла смонтироваться заново (раскладка, полный экран). */
  layoutKey: string
  onOpen: (noteIds: string[]) => void
}

/**
 * Метки на полях у абзацев, на которые есть цитаты в заметках: кружок с числом
 * заметок в поле страницы. Сами цитаты этой колонки подсвечены в тексте через
 * CSS Custom Highlight API — DOM книги не меняется, выделение и поиск цитат не
 * ломаются. Слой меток лежит внутри прокручиваемой колонки, поэтому метки едут
 * вместе с текстом; пересчёт — только когда меняется содержимое или размеры.
 */
export function QuoteMarkers({ viewportRef, column, quotes, layoutKey, onOpen }: QuoteMarkersProps) {
  const { t } = useTranslation()
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  // Метки привязаны к элементу колонки: после смены раскладки старые не показываются.
  const [placed, setPlaced] = useState<{ host: HTMLElement; markers: QuoteMarker[] } | null>(null)

  // Колонка монтируется вместе с раскладкой: берём её элемент после отрисовки.
  useLayoutEffect(() => {
    setHost(viewportRef.current)
  }, [viewportRef, layoutKey])

  useEffect(() => {
    if (!host || !quotes.length) return
    let frame = 0
    // Ключ подсветки этой колонки: вторая колонка пишет свои диапазоны рядом.
    const owner = {}
    const recompute = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        setQuoteHighlightRanges(owner, quoteRanges(host, column, quotes))
        const next = placeMarkers(host, column, quotes)
        setPlaced((current) => (current?.host === host && sameMarkers(current.markers, next) ? current : { host, markers: next }))
      })
    }
    recompute()
    // Страницы PDF и текст DOCX появляются позже самой колонки; свои метки не считаем.
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => !(record.target instanceof Element && record.target.closest('[data-quote-markers]')))) recompute()
    })
    mutations.observe(host, { childList: true, subtree: true })
    const resizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(recompute)
    resizes?.observe(host)
    if (host.firstElementChild) resizes?.observe(host.firstElementChild)
    return () => {
      window.cancelAnimationFrame(frame)
      mutations.disconnect()
      resizes?.disconnect()
      setQuoteHighlightRanges(owner, [])
    }
  }, [column, host, quotes])

  const markers = placed?.host === host && quotes.length ? placed.markers : []
  if (!host || !markers.length) return null
  return createPortal(
    <div className={styles.layer} data-quote-markers="" data-quote-ignore="">
      {markers.map((marker) => {
        const label = t('quoteMarkers.label', { count: marker.noteIds.length, titles: marker.titles.join(', ') })
        return (
          <button
            key={marker.key}
            type="button"
            className={styles.marker}
            style={{ top: marker.top, left: marker.left }}
            aria-label={label}
            title={label}
            // Клик не должен снимать выделение в книге и уводить прокрутку.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onOpen(marker.noteIds)}
          >
            {marker.noteIds.length}
          </button>
        )
      })}
    </div>,
    host,
  )
}

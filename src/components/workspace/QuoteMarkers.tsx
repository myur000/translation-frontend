import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { NoteQuoteSide } from '../../api/contracts/notes.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { BookQuote } from '../../notes/bookQuotes.ts'
import { MARKER_SIZE, placeMarkers, quoteRanges, sameMarkers, type QuoteMarker } from '../../notes/quoteMarkerLayout.ts'
import { setQuoteHighlightRanges, setSummaryHighlightRanges } from '../../notes/quoteRanges.ts'
import { useLayoutSettling } from '../../hooks/useLayoutSettling.ts'
import { usePreferences } from '../../preferences/usePreferences.ts'
import styles from './QuoteMarkers.module.css'

interface QuoteMarkersProps {
  viewportRef: RefObject<HTMLDivElement | null>
  /** Какая колонка: метки её цитат стоят по тексту цитаты, чужих — по парному абзацу. */
  column: NoteQuoteSide
  quotes: BookQuote[]
  /** Выписки в конспекты книги: своя метка-тетрадь и подчёркивание цветом обложки. */
  summaryQuotes?: BookQuote[]
  /** Тон обложки книги (`--cover-N`): цвет тетради и подчёркивания. */
  summaryTone?: number
  /** Меняется, когда колонка могла смонтироваться заново (раскладка, полный экран). */
  layoutKey: string
  /** `marker` — нажатая метка: у неё встаёт карточка заметки, если заметки не колонкой. */
  onOpen: (noteIds: string[], marker: HTMLElement) => void
  /** Метка-тетрадь: открыть конспект на этой выписке. */
  onOpenSummary?: (noteId: string, marker: HTMLElement) => void
}

const NO_QUOTES: BookQuote[] = []
/** Зазор между кружком заметок и тетрадью конспекта у одного абзаца. */
const STACK_GAP = 4

interface Placed {
  host: HTMLElement
  markers: QuoteMarker[]
  summaries: QuoteMarker[]
}

/**
 * Метки на полях у абзацев, на которые есть цитаты в заметках: кружок с числом
 * заметок в поле страницы. Сами цитаты этой колонки подсвечены в тексте через
 * CSS Custom Highlight API — DOM книги не меняется, выделение и поиск цитат не
 * ломаются. Слой меток лежит внутри прокручиваемой колонки, поэтому метки едут
 * вместе с текстом; пересчёт — только когда меняется содержимое или размеры.
 */
export function QuoteMarkers({ viewportRef, column, quotes, summaryQuotes = NO_QUOTES, summaryTone = 2, layoutKey, onOpen, onOpenSummary }: QuoteMarkersProps) {
  const { t } = useTranslation()
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  // Метки привязаны к элементу колонки: после смены раскладки старые не показываются.
  // Во время масштабирования метки отстают от страницы на кадр — слой прячется до конца.
  const isSettling = useLayoutSettling(host)
  // Тихую подсветку цитат можно выключить в меню «Вид»; метки при этом остаются.
  const { isQuoteHighlightEnabled } = usePreferences()
  const [placed, setPlaced] = useState<Placed | null>(null)

  // Колонка монтируется вместе с раскладкой: берём её элемент после отрисовки.
  useLayoutEffect(() => {
    setHost(viewportRef.current)
  }, [viewportRef, layoutKey])

  // Цвет подчёркивания выписок — тон обложки этой книги. Подсветка рисуется вне DOM
  // книги, поэтому цвет — на корне документа, где его видит ::highlight(summary-quote).
  useEffect(() => {
    if (!summaryQuotes.length) return
    const owner = {}
    claimSummaryColor(owner, summaryTone)
    return () => claimSummaryColor(owner, null)
  }, [summaryQuotes.length, summaryTone])

  useEffect(() => {
    if (!host || (!quotes.length && !summaryQuotes.length)) return
    let frame = 0
    // Ключ подсветки этой колонки: вторая колонка пишет свои диапазоны рядом.
    const owner = {}
    const recompute = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        setQuoteHighlightRanges(owner, isQuoteHighlightEnabled ? quoteRanges(host, column, quotes) : [])
        setSummaryHighlightRanges(owner, isQuoteHighlightEnabled ? quoteRanges(host, column, summaryQuotes) : [])
        const markers = placeMarkers(host, column, quotes)
        const summaries = stackUnder(placeMarkers(host, column, summaryQuotes), markers)
        setPlaced((current) => (current?.host === host && sameMarkers(current.markers, markers) && sameMarkers(current.summaries, summaries)
          ? current
          : { host, markers, summaries }))
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
      setSummaryHighlightRanges(owner, [])
    }
  }, [column, host, isQuoteHighlightEnabled, quotes, summaryQuotes])

  const markers = placed?.host === host && quotes.length ? placed.markers : []
  const summaries = placed?.host === host && summaryQuotes.length ? placed.summaries : []
  if (!host || (!markers.length && !summaries.length)) return null
  return createPortal(
    <div className={`${styles.layer} ${isSettling ? styles.settling : ''}`} data-quote-markers="" data-quote-ignore="">
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
            onClick={(event) => onOpen(marker.noteIds, event.currentTarget)}
          >
            {marker.noteIds.length}
          </button>
        )
      })}
      {summaries.map((marker) => {
        const label = t('quoteMarkers.summaryLabel', { titles: marker.titles.join(', ') })
        return (
          <button
            key={`summary:${marker.key}`}
            type="button"
            className={styles.summaryMarker}
            style={{ top: marker.top, left: marker.left, '--summary-tone': `var(--cover-${summaryTone})` } as CSSProperties}
            aria-label={label}
            title={label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => onOpenSummary?.(marker.noteIds[0], event.currentTarget)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3h7v10h-7zM4.5 3v10M6.5 6h3" /></svg>
          </button>
        )
      })}
    </div>,
    host,
  )
}

/**
 * Тетрадь у абзаца, где есть и заметка: под её кружком, а не поверх. Метки одного
 * абзаца стоят на одной высоте (центр первой строки), по ней их и сопоставляем.
 */
function stackUnder(summaries: QuoteMarker[], markers: QuoteMarker[]): QuoteMarker[] {
  const taken = new Set(markers.map((marker) => `${marker.top}:${marker.left}`))
  return summaries.map((marker) => (taken.has(`${marker.top}:${marker.left}`)
    ? { ...marker, top: marker.top + MARKER_SIZE + STACK_GAP }
    : marker))
}

/**
 * Цвет подчёркивания выписок на корне документа. Слоёв меток два (по колонке), и при
 * смене раскладки уходящий слой не должен стирать цвет, которым пользуется оставшийся:
 * цвет снимается, только когда он не нужен ни одному слою.
 */
const summaryColorUsers = new Map<object, number>()

function claimSummaryColor(owner: object, tone: number | null) {
  if (tone === null) summaryColorUsers.delete(owner)
  else summaryColorUsers.set(owner, tone)
  const root = document.documentElement
  const current = [...summaryColorUsers.values()].at(-1)
  const color = current === undefined ? '' : getComputedStyle(root).getPropertyValue(`--cover-${current}`).trim()
  if (color) root.style.setProperty('--summary-quote-color', color)
  else root.style.removeProperty('--summary-quote-color')
}

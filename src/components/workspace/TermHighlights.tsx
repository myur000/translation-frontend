import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { NoteQuoteSide } from '../../api/contracts/notes.ts'
import type { GlossaryTerm } from '../../glossary/termMatch.ts'
import { setActiveTermHighlight, setTermHighlightRanges, termAtPoint, termHits, type TermHit } from '../../glossary/termRanges.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { usePreferences } from '../../preferences/usePreferences.ts'
import styles from './TermHighlights.module.css'

/** Чтобы подсказка не мелькала, пока курсор идёт по строке. */
const HOVER_DELAY_MS = 250
const TIP_GAP = 6

interface TermHighlightsProps {
  viewportRef: RefObject<HTMLElement | null>
  column: NoteQuoteSide
  terms: readonly GlossaryTerm[]
  layoutKey: string
}

interface Hover {
  term: GlossaryTerm
  rect: { top: number; left: number; bottom: number; width: number }
}

/** Подсветка через CSS Highlight API — DOM книги не трогаем. */
export function TermHighlights({ viewportRef, column, terms, layoutKey }: TermHighlightsProps) {
  const { t } = useTranslation()
  const { isTermHighlightEnabled } = usePreferences()
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const hitsRef = useRef<Map<HTMLElement, TermHit[]>>(new Map())
  const isActive = Boolean(host) && isTermHighlightEnabled && terms.length > 0

  useLayoutEffect(() => {
    setHost(viewportRef.current)
  }, [viewportRef, layoutKey])

  useEffect(() => {
    if (!host || !isActive) return
    const owner = {}
    let frame = 0
    const recompute = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const hits = termHits(host, column, terms)
        hitsRef.current = hits
        setTermHighlightRanges(owner, [...hits.values()].flat().map((hit) => hit.range))
      })
    }
    recompute()
    // Текст DOCX и страницы PDF появляются позже колонки.
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => !(record.target instanceof Element && record.target.closest('[data-quote-ignore]')))) recompute()
    })
    mutations.observe(host, { childList: true, subtree: true })
    return () => {
      window.cancelAnimationFrame(frame)
      mutations.disconnect()
      hitsRef.current = new Map()
      setTermHighlightRanges(owner, [])
    }
  }, [column, host, isActive, terms])

  useEffect(() => {
    if (!host || !isActive) return
    let timer = 0
    let current: TermHit | null = null
    const hide = () => {
      window.clearTimeout(timer)
      if (current) setActiveTermHighlight(null)
      current = null
      setHover(null)
    }
    const handleMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.buttons) {
        hide()
        return
      }
      let hits: TermHit[] | undefined
      for (let element = event.target instanceof Element ? event.target : null; element && element !== host; element = element.parentElement) {
        hits = hitsRef.current.get(element as HTMLElement)
        if (hits) break
      }
      const hit = hits ? termAtPoint(hits, event.clientX, event.clientY) : null
      if (hit?.range === current?.range) return
      hide()
      if (!hit) return
      current = hit
      setActiveTermHighlight(hit.range)
      timer = window.setTimeout(() => {
        const rect = hit.range.getBoundingClientRect()
        setHover({ term: hit.term, rect: { top: rect.top, left: rect.left, bottom: rect.bottom, width: rect.width } })
      }, HOVER_DELAY_MS)
    }
    host.addEventListener('pointermove', handleMove)
    host.addEventListener('pointerleave', hide)
    host.addEventListener('scroll', hide, { passive: true })
    return () => {
      host.removeEventListener('pointermove', handleMove)
      host.removeEventListener('pointerleave', hide)
      host.removeEventListener('scroll', hide)
      hide()
    }
  }, [host, isActive])

  if (!hover || !isActive) return null
  const below = hover.rect.top < 48
  return createPortal(
    <div
      className={styles.tip}
      role="tooltip"
      style={{
        left: Math.max(8, Math.min(hover.rect.left, window.innerWidth - 320)),
        top: below ? hover.rect.bottom + TIP_GAP : hover.rect.top - TIP_GAP,
        transform: below ? undefined : 'translateY(-100%)',
      }}
    >
      <span className={styles.term}>{hover.term.term}</span>
      <span aria-hidden="true">→</span>
      <span>{hover.term.translation}</span>
      <span className={styles.label}>{t('glossary.label')}</span>
    </div>,
    document.body,
  )
}

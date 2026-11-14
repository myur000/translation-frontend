import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import type { NoteQuoteSide, NoteResponse, NoteSummary } from '../../api/contracts/notes.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { BookQuote } from '../../notes/bookQuotes.ts'
import {
  CARD_EDGE_GAP,
  fitMarginNotes,
  placeCards,
  VIEWPORT_SIDE_PADDING,
  type MarginFit,
} from '../../notes/marginNotesLayout.ts'
import { plainExcerpt } from '../../notes/noteSyntax.ts'
import type { QuoteSelection } from '../../notes/quoteLocator.ts'
import { placeMarkers, quoteRanges } from '../../notes/quoteMarkerLayout.ts'
import { setActiveQuoteHighlight } from '../../notes/quoteRanges.ts'
import { useLayoutSettling } from '../../hooks/useLayoutSettling.ts'
import { useNotes } from '../../notes/useNotes.ts'
import { NoteContent } from './NoteContent.tsx'
import { NoteEditSession } from './NoteEditSession.tsx'
import { QuoteComposer } from './QuoteComposer.tsx'
import { PanelNewNote, type NewNoteSummary, type NotesPanelRequest } from './WorkspaceNotesPanel.tsx'
import styles from './MarginNotes.module.css'

/**
 * Черновик на полях: цитата из выделения или новая заметка без цитаты. `anchor` —
 * место в координатах текста книги, вычисленное один раз при создании: черновик
 * привязан к тексту, как карточки, и не переезжает, если заметки выключили,
 * прокрутили книгу и включили снова.
 */
export type MarginDraft =
  | { nonce: number; kind: 'quote'; selection: QuoteSelection; anchor: number }
  | { nonce: number; kind: 'new'; anchor: number; summary?: NewNoteSummary }


interface MarginNotesProps {
  /** Колонка книги, рядом с которой заметки (в раскладке одной колонки она одна). */
  viewportRef: RefObject<HTMLDivElement | null>
  column: NoteQuoteSide
  jobId: string
  quotes: BookQuote[]
  /** Конспекты книги — заметки о ней целиком: карточка «Конспект книги» вверху полей. */
  aboutBook?: readonly NoteResponse[]
  /** Меняется, когда колонка могла смонтироваться заново (раскладка, полный экран). */
  layoutKey: string
  /** Нажатие на метку у абзаца или на цитату в тексте: открыть заметки. */
  request: NotesPanelRequest | null
  /** Курсор над цитатой этих заметок в тексте: их карточки и цитаты выделены. */
  linkedNoteIds?: readonly string[]
  draft: MarginDraft | null
  onDraftDone: () => void
}

interface CardGroup {
  /** Ключ абзаца: заметки и номер блока (как у меток). */
  key: string
  anchor: number
  noteIds: string[]
}

interface Measured {
  host: HTMLElement
  fit: MarginFit
  groups: CardGroup[]
  /** Правый край страницы в координатах содержимого колонки: карточки встают сразу за ним. */
  pageRight: number
  /** Верх страницы в тех же координатах: там стоит карточка конспекта. */
  pageTop: number
}

const DRAFT_KEY = 'draft'
/** Пока колонка не измерена: один и тот же пустой список, чтобы мемоизация не сбрасывалась. */
const NO_GROUPS: CardGroup[] = []
const NO_IDS: readonly string[] = []
const NO_NOTES: readonly NoteResponse[] = []
/** Карточка конспекта — у начала страницы, над заметками к абзацам. */
const ABOUT_KEY = 'about'
/** Отступ карточки конспекта от верха страницы. */
const ABOUT_OFFSET = 12
/** Ширина всплывающей карточки, когда на полях места нет. */
const POPOVER_MAX_WIDTH = 360
/** Метка по центру первой строки: карточка встаёт чуть выше, вровень со строкой. */
const ANCHOR_OFFSET = 4

/**
 * Заметки на полях книги, как комментарии в Google Docs: карточка напротив своего
 * абзаца. Свёрнутая — название и три строки; по клику раскрывается, её можно
 * дописать и открыть в разделе заметок. Если справа от страницы места мало,
 * страница сдвигается влево и карточки сужаются; если места нет совсем,
 * остаются метки, а карточка всплывает у абзаца поверх края текста.
 * Слой лежит внутри прокручиваемой колонки, поэтому карточки едут вместе с текстом.
 */
export function MarginNotes({ viewportRef, column, jobId, quotes, aboutBook = NO_NOTES, layoutKey, request, linkedNoteIds = NO_IDS, draft, onDraftDone }: MarginNotesProps) {
  const { t } = useTranslation()
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [measured, setMeasured] = useState<Measured | null>(null)
  const stageRef = useRef<MarginFit['stage'] | null>(null)
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map())
  // Черновик, который уже открыт, при повторном включении заметок снова раскрыт.
  const [active, setActive] = useState<{ key: string; noteId: string | null } | null>(() => (draft ? { key: DRAFT_KEY, noteId: null } : null))
  const [handledRequest, setHandledRequest] = useState<number | null>(null)
  const [handledDraft, setHandledDraft] = useState<number | null>(draft?.nonce ?? null)
  const [scrollTop, setScrollTop] = useState(0)
  const cardRefs = useRef(new Map<string, HTMLElement>())

  useLayoutEffect(() => {
    setHost(viewportRef.current)
  }, [viewportRef, layoutKey])
  const isSettling = useLayoutSettling(host)
  const { notesChanged } = useNotes()

  // Свободное место справа от страницы, отступ под карточки и места абзацев.
  useEffect(() => {
    if (!host) return
    let frame = 0
    const recompute = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const page = host.querySelector<HTMLElement>('article, [data-document-page]')
        if (!page) return
        const fit = fitMarginNotes(host.clientWidth, page.getBoundingClientRect().width, stageRef.current)
        stageRef.current = fit.stage
        // Правый отступ колонки растёт на ширину карточек: страница центрируется в
        // оставшемся месте, то есть сдвигается влево. Стиль задаётся до замера меток.
        host.style.setProperty('--margin-notes-space', `${fit.reservedSpace}px`)
        const groups = placeMarkers(host, column, quotes).map((marker) => ({
          key: marker.key,
          anchor: Math.max(0, marker.top - ANCHOR_OFFSET),
          noteIds: marker.noteIds,
        }))
        const hostRect = host.getBoundingClientRect()
        const pageRect = page.getBoundingClientRect()
        const pageRight = pageRect.right - hostRect.left + host.scrollLeft
        const pageTop = pageRect.top - hostRect.top + host.scrollTop
        setMeasured({ host, fit, groups, pageRight, pageTop })
      })
    }
    recompute()
    // Свои карточки — не повод пересчитывать: иначе каждое раскрытие запускало бы цикл.
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => !(record.target instanceof Element && record.target.closest('[data-margin-notes], [data-quote-markers]')))) recompute()
    })
    mutations.observe(host, { childList: true, subtree: true })
    const resizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(recompute)
    resizes?.observe(host)
    const pages = host.firstElementChild
    if (pages) resizes?.observe(pages)
    return () => {
      window.cancelAnimationFrame(frame)
      mutations.disconnect()
      resizes?.disconnect()
      host.style.removeProperty('--margin-notes-space')
    }
  }, [column, host, quotes])

  // Высоты карточек: раскладка без наложений зависит от них.
  const resizeObserver = useMemo(() => typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
    setHeights((current) => {
      let next: Map<string, number> | null = null
      for (const entry of entries) {
        const key = (entry.target as HTMLElement).dataset.cardKey
        const height = Math.round((entry.target as HTMLElement).offsetHeight)
        if (key && current.get(key) !== height) {
          next ??= new Map(current)
          next.set(key, height)
        }
      }
      return next ?? current
    })
  }), [])
  useEffect(() => () => resizeObserver?.disconnect(), [resizeObserver])
  const cardRef = useCallback((key: string) => (element: HTMLElement | null) => {
    const previous = cardRefs.current.get(key)
    if (previous && previous !== element) resizeObserver?.unobserve(previous)
    if (element) {
      cardRefs.current.set(key, element)
      resizeObserver?.observe(element)
    } else {
      cardRefs.current.delete(key)
    }
  }, [resizeObserver])

  const groups = measured?.host === host ? measured.groups : NO_GROUPS
  const fit = measured?.host === host ? measured.fit : null
  const pageRight = measured?.host === host ? measured.pageRight : 0
  const aboutAnchor = (measured?.host === host ? measured.pageTop : 0) + ABOUT_OFFSET

  // «Конспект книги» из меню «+»: раскрыть карточку конспекта.
  if (request?.about && request.nonce !== handledRequest) {
    setHandledRequest(request.nonce)
    setActive({ key: ABOUT_KEY, noteId: null })
  }
  // Метка на полях: раскрыть заметки её абзаца.
  if (request && !request.about && request.nonce !== handledRequest) {
    const group = groups.find((item) => request.noteIds.every((id) => item.noteIds.includes(id)))
    if (group || !quotes.length) {
      setHandledRequest(request.nonce)
      if (group) setActive({ key: group.key, noteId: request.noteIds.length === 1 ? request.noteIds[0] : null })
    }
  }
  // Новый черновик раскрывается сразу.
  if (draft && draft.nonce !== handledDraft) {
    setHandledDraft(draft.nonce)
    setActive({ key: DRAFT_KEY, noteId: null })
  }

  // Всплывающей карточке нужна прокрутка: у нижнего края экрана она встаёт над абзацем.
  const isPopover = fit?.stage === 'popover'
  useEffect(() => {
    if (!host || !isPopover || !active) return
    const handleScroll = () => setScrollTop(host.scrollTop)
    handleScroll()
    host.addEventListener('scroll', handleScroll, { passive: true })
    return () => host.removeEventListener('scroll', handleScroll)
  }, [active, host, isPopover])

  // Клик мимо раскрытой карточки её сворачивает, как в Google Docs (кроме меток: они
  // откроют свою). Черновик так не закрывается: его закрывают явно.
  useEffect(() => {
    if (!active || active.key === DRAFT_KEY) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest('[data-margin-card], [data-quote-markers]')) return
      setActive(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [active])

  // Раскрытая карточка получает фокус: клавиатура (Esc, Tab) работает сразу после клика по метке.
  const activeKey = active?.key ?? null
  useEffect(() => {
    if (!activeKey) return
    const element = cardRefs.current.get(activeKey)
    if (element && !element.contains(document.activeElement)) element.focus({ preventScroll: true })
  }, [activeKey, isPopover])

  // Esc, нажатый вне карточек (фокус ушёл на страницу), тоже закрывает открытую карточку —
  // раньше обработчика полноэкранного режима, чтобы тот же Esc не выводил из него.
  useEffect(() => {
    if (!activeKey) return
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || (event.target instanceof Element && event.target.closest('[data-margin-card]'))) return
      event.stopPropagation()
      if (activeKey === DRAFT_KEY) onDraftDone()
      setActive(null)
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [activeKey, onDraftDone])

  // Карточка под курсором: её цитаты в тексте ярче, как у открытой.
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const highlightedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const key of [activeKey, hoveredKey]) {
      const group = groups.find((item) => item.key === key)
      if (!group) continue
      // В раскрытой ветке открыта одна заметка (по умолчанию первая) — ярко только её
      // цитаты; у карточки под курсором — цитаты всех её заметок.
      const noteIds = key === activeKey ? [active?.noteId ?? group.noteIds[0]] : group.noteIds
      noteIds.forEach((id) => ids.add(id))
    }
    linkedNoteIds.forEach((id) => ids.add(id))
    return ids
  }, [active, activeKey, groups, hoveredKey, linkedNoteIds])
  useEffect(() => {
    if (!host || !highlightedIds.size) return
    setActiveQuoteHighlight(quoteRanges(host, column, quotes, highlightedIds))
    return () => setActiveQuoteHighlight([])
  }, [column, highlightedIds, host, quotes])

  const notesById = useMemo(() => new Map(quotes.map((quote) => [quote.noteId, quote.note])), [quotes])
  const paragraphOf = useMemo(() => {
    const first = new Map<string, number>()
    for (const quote of quotes) {
      const known = first.get(quote.noteId)
      if (known === undefined || quote.paragraphIndex < known) first.set(quote.noteId, quote.paragraphIndex)
    }
    return first
  }, [quotes])
  const bookNotes = useMemo<NoteSummary[]>(() => [...notesById.values()].map((note) => ({
    id: note.id, title: note.title, excerpt: plainExcerpt(note.body), tags: note.tags,
    quote_count: note.quotes.length, version: note.version, updated_at: note.updated_at,
  })), [notesById])

  if (!host || !fit) return null

  /** Черновик сохранён: заметки перечитываются (новая метка, карточка, конспект). */
  const finishDraft = () => {
    // Созданный конспект сразу виден раскрытым: карточка появится, когда заметки перечитаются.
    setActive(draft?.kind === 'new' && draft.summary ? { key: ABOUT_KEY, noteId: null } : null)
    notesChanged()
    onDraftDone()
  }
  const closeDraft = () => {
    setActive(null)
    onDraftDone()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return
    // Полноэкранный режим слушает Esc на window: из карточки он не выходит.
    event.stopPropagation()
    if (event.defaultPrevented) return
    event.preventDefault()
    if (active?.key === DRAFT_KEY) closeDraft()
    else setActive(null)
    host.focus({ preventScroll: true })
  }

  const cardWidth = isPopover ? Math.min(POPOVER_MAX_WIDTH, host.clientWidth - 2 * VIEWPORT_SIDE_PADDING) : fit.cardWidth
  // На полях — сразу за правым краем страницы, как комментарии в Google Docs. Место там
  // есть по построению: правый отступ колонки вырос на ширину карточек с зазорами.
  const marginLeft = pageRight + CARD_EDGE_GAP
  const slots = [
    ...groups.map((group) => ({ key: group.key, anchor: group.anchor, height: heights.get(group.key) ?? 64 })),
    ...(aboutBook.length ? [{ key: ABOUT_KEY, anchor: aboutAnchor, height: heights.get(ABOUT_KEY) ?? 64 }] : []),
    ...(draft ? [{ key: DRAFT_KEY, anchor: draft.anchor, height: heights.get(DRAFT_KEY) ?? 240 }] : []),
  ]
  const tops = placeCards(slots, active?.key ?? null)

  const popoverStyle = (anchor: number, key: string): CSSProperties => {
    const height = heights.get(key) ?? 240
    const below = anchor + 28
    const visibleBottom = scrollTop + host.clientHeight - 80
    const top = below + height > visibleBottom && anchor - height - 8 > scrollTop ? anchor - height - 8 : below
    return { top, left: host.scrollLeft + VIEWPORT_SIDE_PADDING, width: cardWidth }
  }
  const cardStyle = (key: string, anchor: number): CSSProperties => isPopover
    ? popoverStyle(anchor, key)
    : { top: tops.get(key) ?? anchor, left: marginLeft, width: cardWidth }

  return createPortal(
    <div className={`${styles.layer} ${isPopover ? styles.popoverLayer : ''} ${isSettling ? styles.settling : ''}`} data-margin-notes="" data-quote-ignore="">
      {aboutBook.length && (!isPopover || active?.key === ABOUT_KEY) ? (
        <MarginCard
          cardRef={cardRef(ABOUT_KEY)}
          cardKey={ABOUT_KEY}
          style={cardStyle(ABOUT_KEY, aboutAnchor)}
          isPopover={isPopover}
          isAbout
          notes={[...aboutBook]}
          paragraph={null}
          isActive={active?.key === ABOUT_KEY}
          isLinked={false}
          activeNoteId={active?.key === ABOUT_KEY ? active.noteId : null}
          onActivate={(noteId) => setActive({ key: ABOUT_KEY, noteId })}
          onHover={(isHovered) => setHoveredKey((current) => (isHovered ? ABOUT_KEY : current === ABOUT_KEY ? null : current))}
          onKeyDown={handleKeyDown}
        />
      ) : null}
      {groups.map((group) => {
        const isActive = active?.key === group.key
        // Когда места нет, на экране только открытая карточка — остальное говорят метки.
        if (isPopover && !isActive) return null
        return (
          <MarginCard
            key={group.key}
            cardRef={cardRef(group.key)}
            cardKey={group.key}
            style={cardStyle(group.key, group.anchor)}
            isPopover={isPopover}
            notes={group.noteIds.flatMap((id) => notesById.get(id) ?? [])}
            paragraph={paragraphOf.get(group.noteIds[0]) ?? null}
            isActive={isActive}
            isLinked={group.noteIds.some((id) => linkedNoteIds.includes(id))}
            activeNoteId={isActive ? active?.noteId ?? null : null}
            onActivate={(noteId) => setActive({ key: group.key, noteId })}
            onHover={(isHovered) => setHoveredKey((current) => (isHovered ? group.key : current === group.key ? null : current))}
            onKeyDown={handleKeyDown}
          />
        )
      })}
      {draft ? (
        <section
          ref={cardRef(DRAFT_KEY)}
          data-card-key={DRAFT_KEY}
          data-margin-card=""
          className={`${styles.card} ${styles.activeCard} ${isPopover ? styles.popover : ''}`}
          style={cardStyle(DRAFT_KEY, draft.anchor)}
          aria-label={t(draft.kind === 'quote' ? 'marginNotes.quoteDraft' : draft.summary ? 'marginNotes.summaryDraft' : 'notesPanel.newNote')}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          {draft.kind === 'quote' ? (
            <QuoteComposer
              key={draft.nonce}
              jobId={jobId}
              selection={draft.selection}
              bookNotes={bookNotes}
              onSaved={finishDraft}
              onCancel={closeDraft}
            />
          ) : (
            <PanelNewNote key={draft.nonce} summary={draft.summary} onCreated={finishDraft} onCancel={closeDraft} />
          )}
        </section>
      ) : null}
    </div>,
    host,
  )
}

interface MarginCardProps {
  cardRef: (element: HTMLElement | null) => void
  cardKey: string
  style: CSSProperties
  isPopover: boolean
  notes: NoteResponse[]
  paragraph: number | null
  isActive: boolean
  /** Карточка конспекта: заметки о книге целиком, без абзаца. */
  isAbout?: boolean
  /** Курсор над цитатой этой карточки в тексте. */
  isLinked: boolean
  /** Какая заметка абзаца раскрыта; `null` — первая. */
  activeNoteId: string | null
  onActivate: (noteId: string | null) => void
  onHover: (isHovered: boolean) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

/**
 * Карточка абзаца. Свёрнутая — тихая: название в две строки и две строки текста.
 * Раскрытая — сверху «¶6» (или «2 заметки · ¶6») и две иконки: правка и переход
 * в раздел заметок. Несколько заметок абзаца — ветка, как комментарии: открытая
 * заметка целиком, остальные строками; клик по строке раскрывает её.
 * Сворачивается кликом мимо или Esc.
 */
function MarginCard({ cardRef, cardKey, style, isPopover, notes, paragraph, isActive, isAbout = false, isLinked, activeNoteId, onActivate, onHover, onKeyDown }: MarginCardProps) {
  const { t } = useTranslation()
  const { drafts } = useNotes()
  const open = notes.find((note) => note.id === activeNoteId) ?? notes[0] ?? null
  // Правка открытой заметки; незаконченная (здесь или на странице заметки) открывается сразу.
  const [editingId, setEditingId] = useState<string | null>(() => (open && drafts.get(open.id) ? open.id : null))
  if (!notes.length || !open) return null
  const isGroup = notes.length > 1
  const label = isAbout ? t('marginNotes.aboutBook') : isGroup ? t('marginNotes.groupLabel', { count: notes.length }) : open.title
  const where = paragraph === null ? null : `¶${paragraph + 1}`
  const meta = isAbout
    ? (isGroup ? `${t('marginNotes.aboutBook')} · ${notes.length}` : t('marginNotes.aboutBook'))
    : isGroup ? [t('marginNotes.groupCount', { count: notes.length }), where].filter(Boolean).join(' · ') : where
  const className = `${styles.card} ${isActive ? styles.activeCard : ''} ${isLinked && !isActive ? styles.linkedCard : ''} ${isPopover ? styles.popover : ''}`

  return (
    <section
      ref={cardRef}
      data-card-key={cardKey}
      data-margin-card=""
      className={className}
      style={style}
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      {!isActive ? (
        // Свёрнутая карточка целиком — кнопка: клик раскрывает.
        <button type="button" className={styles.summary} onClick={() => onActivate(null)}>
          {isGroup || isAbout ? (
            <span className={styles.meta}>
              {/* Тетрадь — значок конспекта: заметка о книге целиком, а не об абзаце. */}
              {isAbout ? <svg className={styles.metaIcon} viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h8.5v11H4zM4 2.5v11M2.5 5h3M2.5 8h3M2.5 11h3M7 6h3.5" /></svg> : null}
              {meta}
            </span>
          ) : null}
          <strong className={styles.cardTitle}>{isGroup ? notes.map((note) => note.title).join(' · ') : open.title}</strong>
          {!isGroup && open.body.trim() ? <span className={styles.excerpt}>{plainExcerpt(open.body)}</span> : null}
        </button>
      ) : (
        <>
          <div className={styles.cardHeader}>
            {meta ? <span className={styles.meta}>{meta}</span> : null}
            <span className={styles.cardActions}>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t('marginNotes.editNote', { title: open.title })}
                title={t('marginNotes.edit')}
                aria-pressed={editingId === open.id}
                onClick={() => setEditingId(editingId === open.id ? null : open.id)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.8l2.7 2.7-7.4 7.4H3.1v-2.7zM9 4.3l2.7 2.7" /></svg>
              </button>
              <Link
                className={styles.iconButton}
                to={`/notes/${open.id}`}
                aria-label={t('marginNotes.openNote', { title: open.title })}
                title={t('marginNotes.open')}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5h6.5V10M12.5 3.5 3.5 12.5" /></svg>
              </Link>
            </span>
          </div>
          {isGroup ? (
            <ul className={styles.thread}>
              {notes.map((note) => (
                <li key={note.id}>
                  {note.id === open.id ? (
                    <OpenNote note={note} isEditing={editingId === note.id} onEdit={() => setEditingId(note.id)} onDone={() => setEditingId(null)} />
                  ) : (
                    <button type="button" className={styles.threadItem} onClick={() => { setEditingId(null); onActivate(note.id) }}>
                      <strong className={styles.cardTitle}>{note.title}</strong>
                      {note.body.trim() ? <span className={styles.excerptLine}>{plainExcerpt(note.body)}</span> : null}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <OpenNote note={open} isEditing={editingId === open.id} onEdit={() => setEditingId(open.id)} onDone={() => setEditingId(null)} />
          )}
        </>
      )}
    </section>
  )
}

interface OpenNoteProps {
  note: NoteResponse
  isEditing: boolean
  onEdit: () => void
  onDone: () => void
}

/**
 * Раскрытая заметка: текст целиком (до половины экрана) и правка на месте. Клик по
 * тексту, «Дописать…» или карандаш открывают редактор с курсором в конце; черновик
 * и конфликт версий — те же, что на странице заметки (`NoteEditSession`).
 */
function OpenNote({ note, isEditing, onEdit, onDone }: OpenNoteProps) {
  const { t } = useTranslation()
  // После конфликта пользователь может взять актуальную версию — до перечитывания цитат она здесь.
  const [latest, setLatest] = useState<NoteResponse | null>(null)
  const current = latest && latest.version > note.version ? latest : note

  if (isEditing) {
    return (
      <div className={styles.open}>
        <NoteEditSession
          note={current}
          knownLinks={current.links}
          compact
          onSaved={setLatest}
          onLatest={setLatest}
          onClose={onDone}
        />
      </div>
    )
  }

  return (
    <div className={styles.open}>
      <h3 className={styles.title}>{current.title}</h3>
      {current.body.trim() ? (
        <div
          className={`${styles.body} ${styles.editable}`}
          title={t('marginNotes.editHint')}
          onClick={(event) => {
            // Ссылки в тексте ведут по ссылке, а не в правку.
            if ((event.target as Element).closest('a')) return
            onEdit()
          }}
        >
          <NoteContent body={current.body} links={current.links} />
        </div>
      ) : null}
      <button type="button" className={styles.appendField} onClick={onEdit}>{t('marginNotes.appendPlaceholder')}</button>
    </div>
  )
}

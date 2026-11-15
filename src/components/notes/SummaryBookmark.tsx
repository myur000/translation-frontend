import { useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { NoteQuoteResponse, NoteResponse } from '../../api/contracts/notes.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { summaryLabels } from '../../notes/bookSummaries.ts'
import { plainExcerpt } from '../../notes/noteSyntax.ts'
import { OpenNote } from './MarginOpenNote.tsx'
import { PanelNewNote, type NewNoteSummary } from './WorkspaceNotesPanel.tsx'
import cardStyles from './MarginNotes.module.css'
import styles from './SummaryBookmark.module.css'

interface SummaryBookmarkProps {
  cardRef: (element: HTMLElement | null) => void
  cardKey: string
  /** Где стоит закладка по горизонтали и её ширина; верх задаёт слой полей (она не уезжает). */
  style: CSSProperties
  isPopover: boolean
  isOpen: boolean
  /** Курсор над выпиской этого конспекта в тексте книги: закладка откликается. */
  isLinked?: boolean
  summaries: readonly NoteResponse[]
  /** Текущий конспект (вкладка); `null` — конспектов нет. */
  current: NoteResponse | null
  /** Открыта форма нового конспекта. */
  isCreating: boolean
  bookTitle: string
  /** Тон обложки книги (`--cover-N`): корешок закладки — цвета своей книги. */
  tone: number
  newSummary: NewNoteSummary
  /** Выписка из выделения («В конспект»): форма вместо текста конспекта; вкладки выбирают, куда писать. */
  composer?: ReactNode
  onOpen: () => void
  onClose: () => void
  onSelect: (noteId: string) => void
  onCreate: () => void
  onCreated: (noteId: string) => void
  onCancelCreate: () => void
  onNoteSaved?: (note: NoteResponse) => void
  /** «Показать в книге» у цитаты в тексте конспекта. */
  quoteAction?: (quote: NoteQuoteResponse) => ReactNode
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

/**
 * Закладка конспекта на полях книги. Конспект — тетрадь, которая лежит рядом всё
 * время чтения, поэтому закладка не уезжает с текстом, а держится вверху полей.
 * Свёрнутая — полоска «Конспект · 2» с корешком цвета обложки книги; раскрытая —
 * вкладки конспектов, текущий целиком с правкой на месте и «+ Новый конспект».
 * У книги без конспекта — тихое «Начать конспект».
 */
export function SummaryBookmark(props: SummaryBookmarkProps) {
  const { t } = useTranslation()
  const ids = useId()
  const [editingId, setEditingId] = useState<string | null>(null)
  const { cardRef, summaries, current, isOpen, isCreating } = props
  const count = summaries.length
  const className = [
    cardStyles.card,
    styles.bookmark,
    isOpen ? styles.open : '',
    props.isLinked && !isOpen ? styles.linked : '',
    props.isPopover && isOpen ? cardStyles.popover : '',
  ].join(' ')
  const style = { ...props.style, '--summary-tone': `var(--cover-${props.tone})` } as CSSProperties
  const labels = summaryLabels(summaries, props.bookTitle)
  // Под подписью — название текущего; если оно и есть «Конспект», то начало его текста.
  const currentLabel = current ? labels.get(current.id) ?? current.title : ''
  const peek = currentLabel.toLocaleLowerCase() === t('summaries.caption').toLocaleLowerCase()
    ? plainExcerpt(current?.body ?? '')
    : currentLabel

  const select = (noteId: string) => {
    setEditingId(null)
    props.onSelect(noteId)
  }
  // Стрелки переключают вкладки, как в любом списке вкладок.
  const handleTabsKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    const index = summaries.findIndex((note) => note.id === current?.id)
    const next = summaries[(index + (event.key === 'ArrowRight' ? 1 : -1) + count) % count]
    if (!next) return
    event.preventDefault()
    select(next.id)
    document.getElementById(`${ids}-tab-${next.id}`)?.focus()
  }

  return (
    <section
      ref={cardRef}
      data-card-key={props.cardKey}
      data-margin-card=""
      className={className}
      style={style}
      aria-label={t('summaries.label')}
      tabIndex={-1}
      onKeyDown={props.onKeyDown}
    >
      {!isOpen ? (
        <button type="button" className={styles.strip} aria-expanded={false} onClick={props.onOpen}>
          <span className={styles.caption}>
            <NotebookIcon />
            {count ? (count > 1 ? t('summaries.captionCount', { count }) : t('summaries.caption')) : t('summaries.start')}
          </span>
          {peek ? <span className={styles.peek}>{peek}</span> : null}
        </button>
      ) : (
        <>
          <div className={styles.header}>
            <span className={styles.caption}>
              <NotebookIcon />
              <span className={styles.captionText}>{t('summaries.captionBook', { book: props.bookTitle })}</span>
            </span>
            <span className={cardStyles.cardActions}>
              {current && !isCreating ? (
                <Link
                  className={cardStyles.iconButton}
                  to={`/notes/${current.id}`}
                  aria-label={t('marginNotes.openNote', { title: current.title })}
                  title={t('marginNotes.open')}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5h6.5V10M12.5 3.5 3.5 12.5" /></svg>
                </Link>
              ) : null}
              <button type="button" className={cardStyles.iconButton} aria-expanded aria-label={t('summaries.collapse')} title={t('summaries.collapse')} onClick={props.onClose}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4" /></svg>
              </button>
            </span>
          </div>
          <div className={styles.tabs}>
            {count ? (
              <div role="tablist" aria-label={t('summaries.tabs')} className={styles.tabList} onKeyDown={handleTabsKeyDown}>
                {summaries.map((note) => {
                  const isSelected = !isCreating && note.id === current?.id
                  return (
                    <button
                      key={note.id}
                      id={`${ids}-tab-${note.id}`}
                      type="button"
                      role="tab"
                      className={styles.tab}
                      aria-selected={props.composer ? note.id === current?.id : isSelected}
                      aria-controls={`${ids}-panel`}
                      tabIndex={isSelected ? 0 : -1}
                      title={note.title}
                      onClick={() => select(note.id)}
                    >
                      {labels.get(note.id) ?? note.title}
                    </button>
                  )
                })}
              </div>
            ) : null}
            {props.composer ? null : (
              <button type="button" className={styles.newTab} aria-pressed={isCreating} onClick={props.onCreate}>
                {count ? t('summaries.new') : t('summaries.start')}
              </button>
            )}
          </div>
          <div id={`${ids}-panel`} className={`${styles.panel} ${cardStyles.bookmarkPanel}`} role={count && !isCreating ? 'tabpanel' : undefined} aria-labelledby={current && !isCreating ? `${ids}-tab-${current.id}` : undefined}>
            {props.composer ? props.composer : isCreating || !current ? (
              <PanelNewNote key="summary" summary={props.newSummary} onCreated={props.onCreated} onCancel={props.onCancelCreate} />
            ) : (
              <OpenNote
                key={current.id}
                note={current}
                isEditing={editingId === current.id}
                onEdit={() => setEditingId(current.id)}
                onDone={() => setEditingId(null)}
                onSaved={props.onNoteSaved}
                quoteAction={props.quoteAction}
              />
            )}
          </div>
        </>
      )}
    </section>
  )
}

/** Тетрадь с корешком — значок конспекта везде, где он показан. */
function NotebookIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2.5h8.5v11H4zM4 2.5v11M2.5 5h3M2.5 8h3M2.5 11h3M7 6h3.5" />
    </svg>
  )
}

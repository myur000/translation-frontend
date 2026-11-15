import { useId, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import type { NoteSummary } from '../../api/contracts/notes.ts'
import { coverInitial, coverTone } from '../../documents/bookTitle.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { notesSearch } from '../../notes/notesQuery.ts'
import { summaryLabels } from '../../notes/bookSummaries.ts'
import { bookOfNote, noteDay, RECENT_NOTES_LIMIT } from '../../notes/notesOverview.ts'
import type { NotesTreeBook } from '../../notes/notesTree.ts'
import { plainExcerpt } from '../../notes/noteSyntax.ts'
import { useNoteDateFormat } from '../../notes/useNoteDateFormat.ts'
import { useNotes } from '../../notes/useNotes.ts'
import { useNotesGraph } from '../../notes/useNotesGraph.ts'
import styles from './NotesHome.module.css'
import { GlyphIcon } from '../ui/GlyphIcon.tsx'

const NO_BOOKS: ReadonlyMap<string, NotesTreeBook> = new Map()
const NO_TITLES: ReadonlyMap<string, string> = new Map()

/**
 * `/notes`: обзор раздела. «Продолжить» — последние заметки, «Книги с
 * заметками» — к чему они относятся и как попасть в книгу, «Теги» — темы.
 * Поиск живёт в боковой панели; фильтр из адреса (`?tag=`, `?q=` — ссылки
 * на тег из заметок) показывает найденные заметки списком со сбросом.
 */
export function NotesHome() {
  const { t } = useTranslation()
  const { query, items, total, status, hasMore, isLoadingMore, loadMore, retry, tags } = useNotes()
  const { graph, retry: retryBooks } = useNotesGraph()
  const [showAll, setShowAll] = useState(false)
  // «Сегодня» и «вчера» считаем от момента открытия страницы.
  const [now] = useState(() => new Date())
  const filtersHeadingId = useId()
  const recentHeadingId = useId()
  const booksHeadingId = useId()
  const tagsHeadingId = useId()
  const isFiltered = Boolean(query.q || query.tag)
  const search = notesSearch(query)
  const tree = graph.status === 'ready' ? graph.tree : null
  const bookIndex = useMemo(() => (tree ? bookOfNote(tree) : NO_BOOKS), [tree])

  const listState = status === 'loading' ? (
    <p className={styles.state} role="status">{t('notes.loading')}</p>
  ) : status === 'error' ? (
    <div className={styles.state} role="alert">
      <span>{t('notes.loadError')}</span>
      <button type="button" onClick={retry}>{t('notes.retry')}</button>
    </div>
  ) : null

  const rows = (notes: readonly NoteSummary[], labelledBy: string) => (
    <ul className={styles.rows} aria-labelledby={labelledBy}>
      {notes.map((note) => (
        <li key={note.id}>
          <NoteRow note={note} book={bookIndex.get(note.id)} search={search} now={now} />
        </li>
      ))}
    </ul>
  )
  const more = hasMore ? (
    <button type="button" className={styles.quietButton} onClick={loadMore} disabled={isLoadingMore}>
      {t('notes.loadMore')}
    </button>
  ) : null

  const header = (
    <header className={styles.header}>
      <div>
        <h1>{t('notes.homeTitle')}</h1>
        <p>{t('notes.homeDescription')}</p>
      </div>
      <Link className={styles.newNote} to={`/notes/new${search}`}><GlyphIcon name="plus" /> {t('notes.home.new')}</Link>
    </header>
  )

  if (isFiltered) {
    // Фильтры сочетаются, поэтому заголовок называет каждый активный.
    const heading = [
      query.q ? t('notes.homeSearch', { query: query.q }) : '',
      query.tag ? t('notes.homeTag', { tag: query.tag }) : '',
    ].filter(Boolean).join(' · ')
    return (
      <section className={styles.page}>
        {header}
        <section className={styles.section} aria-labelledby={filtersHeadingId}>
          <div className={styles.sectionHead}>
            <h2 id={filtersHeadingId} className={styles.filterHeading}>
              {heading}{status === 'ready' ? <span className={styles.count}>{total}</span> : null}
            </h2>
            <Link className={styles.quietLink} to="/notes">{t('notes.home.resetFilter')}</Link>
          </div>
          {listState}
          {status === 'ready' && !items.length ? <p className={styles.state}>{t('notes.emptySearch')}</p> : null}
          {items.length ? rows(items, filtersHeadingId) : null}
          {more}
        </section>
      </section>
    )
  }

  if (status === 'ready' && !items.length) {
    return (
      <section className={styles.page}>
        {header}
        <div className={styles.invite}>
          <h2>{t('notes.empty')}</h2>
          <p>{t('notes.home.emptyHint')}</p>
        </div>
      </section>
    )
  }

  const recent = showAll ? items : items.slice(0, RECENT_NOTES_LIMIT)
  // Книги без заметок в графе не появляются; удалённые — в конце (так строит дерево).
  const books = tree?.books ?? []

  return (
    <section className={styles.page}>
      {header}
      {listState}

      {/* Бэкенд отдаёт список без поиска по `updated_at DESC` — первые и есть последние правки. */}
      {items.length ? (
        <section className={styles.section} aria-labelledby={recentHeadingId}>
          <div className={styles.sectionHead}>
            <h2 id={recentHeadingId} className={styles.eyebrow}>{t(showAll ? 'notes.homeAll' : 'notes.home.recent')}</h2>
            {total > RECENT_NOTES_LIMIT ? (
              <button type="button" className={styles.quietButton} aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>
                {showAll ? t('notes.home.showLess') : t('notes.home.showAll', { count: total })}
              </button>
            ) : null}
          </div>
          {rows(recent, recentHeadingId)}
          {showAll ? more : null}
        </section>
      ) : null}

      {graph.status === 'error' ? (
        <div className={styles.state} role="alert">
          <span>{t('notes.home.booksError')}</span>
          <button type="button" onClick={retryBooks}>{t('notes.retry')}</button>
        </div>
      ) : null}
      {books.length ? (
        <section className={styles.section} aria-labelledby={booksHeadingId}>
          <h2 id={booksHeadingId} className={styles.eyebrow}>{t('notes.home.books')}</h2>
          <ul className={styles.books}>
            {books.map((book) => <li key={book.key}><BookCard book={book} titles={tree?.titles ?? NO_TITLES} /></li>)}
          </ul>
        </section>
      ) : null}

      {tags.length ? (
        <section className={styles.section} aria-labelledby={tagsHeadingId}>
          <h2 id={tagsHeadingId} className={styles.eyebrow}>{t('notes.tags')}</h2>
          <nav className={styles.tags} aria-labelledby={tagsHeadingId}>
            {tags.map(({ tag, count }) => (
              <Link key={tag} className={styles.tag} to={{ pathname: '/notes', search: notesSearch({ q: '', tag }) }}>
                #{tag}<span className={styles.tagCount}>{count}</span>
              </Link>
            ))}
          </nav>
        </section>
      ) : null}

      <p className={styles.storage}>{t('notes.storage')}</p>
    </section>
  )
}

/**
 * Строка заметки: корешок книги, название, откуда она и когда её меняли. У конспекта
 * вместо корешка — тетрадь цвета обложки и подпись «Конспект · Книга»: с заметкой его
 * не спутать и в общем списке.
 */
function NoteRow({ note, book, search, now }: { note: NoteSummary; book: NotesTreeBook | undefined; search: string; now: Date }) {
  const { t, language } = useTranslation()
  const formatDate = useNoteDateFormat()
  const day = noteDay(note.updated_at, now, language === 'ru' ? 'ru-RU' : 'en-US')
  const dayText = day.kind === 'date' ? day.text : t(day.kind === 'today' ? 'notes.home.today' : 'notes.home.yesterday')
  const excerpt = note.excerpt ? plainExcerpt(note.excerpt) : ''
  const isSummary = book?.summaryIds.includes(note.id) ?? false
  return (
    <Link className={styles.row} to={`/notes/${encodeURIComponent(note.id)}${search}`}>
      <span
        className={`${styles.spine} ${isSummary ? styles.summarySpine : ''} ${book ? '' : styles.spineNone}`}
        style={book ? { background: `var(--cover-${coverTone(book.fileName)})` } : undefined}
        aria-hidden="true"
      >
        {isSummary ? <NotebookGlyph /> : null}
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{note.title}</span>
        {book || excerpt ? (
          <span className={styles.rowMeta}>
            {book ? <span className={styles.rowBook}>{isSummary ? t('notes.home.summaryOf', { book: book.title }) : book.title}</span> : null}
            {excerpt ? <span className={styles.rowExcerpt}>{excerpt}</span> : null}
          </span>
        ) : null}
      </span>
      <time className={styles.rowDate} dateTime={note.updated_at} title={t('notes.updatedAt', { date: formatDate(note.updated_at) })}>
        {dayText}
      </time>
    </Link>
  )
}

/** Карточка книги: обложка, сколько заметок, её конспекты и вход в книгу. */
function BookCard({ book, titles }: { book: NotesTreeBook; titles: ReadonlyMap<string, string> }) {
  const { t, tc } = useTranslation()
  const countText = tc('notes.home.noteCount', book.noteIds.length)
  const summaries = book.summaryIds.map((id) => ({ id, title: titles.get(id) ?? '' }))
  const labels = summaryLabels(summaries, book.title)
  const tone = coverTone(book.fileName)
  return (
    <article className={`${styles.book} ${book.deleted ? styles.bookDeleted : ''}`} aria-label={book.title}>
      <span className={styles.cover} style={{ background: `var(--cover-${coverTone(book.fileName)})` }} aria-hidden="true">
        {coverInitial(book.title)}
      </span>
      <span className={styles.bookText}>
        <strong className={styles.bookTitle} title={book.fileName}>{book.title}</strong>
        <span className={styles.bookMeta}>
          {countText}{summaries.length ? ` · ${tc('notes.home.summaryCount', summaries.length)}` : ''}
        </span>
        {/* Конспекты книги — каждый своей строкой: их может быть несколько. */}
        {summaries.length ? (
          <ul className={styles.summaries} aria-label={t('notes.home.summariesOf', { book: book.title })}
            style={{ '--summary-tone': `var(--cover-${tone})` } as CSSProperties}>
            {summaries.map((summary) => (
              <li key={summary.id}>
                <Link className={styles.summaryLink} to={`/notes/${encodeURIComponent(summary.id)}`} title={summary.title}>
                  <NotebookGlyph />
                  <span>{labels.get(summary.id) ?? summary.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <span className={styles.bookActions}>
          {book.jobId ? (
            <Link className={styles.openBook} to={`/documents/${encodeURIComponent(book.jobId)}`}
              aria-label={t('notes.home.openBookNamed', { title: book.title })}>
              {t('notes.home.openBook')}
            </Link>
          ) : (
            <span className={styles.bookGone}>{t('notes.home.bookDeleted')}</span>
          )}
        </span>
      </span>
    </article>
  )
}

/** Тетрадь с корешком — значок конспекта, тот же, что в книге и в боковой панели. */
function NotebookGlyph() {
  return (
    <svg className={styles.notebook} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2.5h8.5v11H4zM4 2.5v11M2.5 5h3M2.5 8h3M2.5 11h3M7 6h3.5" />
    </svg>
  )
}

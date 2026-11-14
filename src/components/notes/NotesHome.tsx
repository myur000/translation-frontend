import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { NOTES_SEARCH_DELAY_MS, notesSearch } from '../../notes/notesQuery.ts'
import { useNoteDateFormat } from '../../notes/useNoteDateFormat.ts'
import { plainExcerpt } from '../../notes/noteSyntax.ts'
import { useNotes } from '../../notes/useNotes.ts'
import styles from './NotesPage.module.css'
import { GlyphIcon } from '../ui/GlyphIcon.tsx'

/**
 * `/notes`: центр раздела — поиск, теги и карточки заметок. Фильтры живут в адресе,
 * поэтому «Назад» и ссылка на тег из заметки возвращают тот же список.
 */
export function NotesHome() {
  const { t } = useTranslation()
  const formatDate = useNoteDateFormat()
  const location = useLocation()
  const navigate = useNavigate()
  const { query, items, total, status, hasMore, isLoadingMore, loadMore, retry, tags } = useNotes()
  const [searchText, setSearchText] = useState(query.q)
  const [syncedQuery, setSyncedQuery] = useState(query.q)
  // Адрес изменился извне (ссылка на тег, «Назад») — поле поиска следует за ним.
  if (syncedQuery !== query.q) {
    setSyncedQuery(query.q)
    setSearchText(query.q)
  }
  useEffect(() => {
    const next = searchText.trim()
    if (next === query.q) return
    const timer = window.setTimeout(() => {
      void navigate({ pathname: location.pathname, search: notesSearch({ q: next, tag: query.tag }) }, { replace: true })
    }, NOTES_SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [location.pathname, navigate, query.q, query.tag, searchText])
  const search = notesSearch(query)
  // Фильтры сочетаются, поэтому заголовок называет каждый активный.
  const filters = [
    query.q ? t('notes.homeSearch', { query: query.q }) : '',
    query.tag ? t('notes.homeTag', { tag: query.tag }) : '',
  ].filter(Boolean)
  const heading = filters.length ? filters.join(' · ') : t('notes.homeAll')

  return (
    <section className={styles.page}>
      <header className={styles.intro}>
        <h1>{t('notes.homeTitle')}</h1>
        <p>{t('notes.homeDescription')}</p>
        <Link className={styles.primaryLink} to={`/notes/new${search}`}><GlyphIcon name="plus" /> {t('notes.create')}</Link>
      </header>

      <div className={styles.filters}>
        <input
          type="search"
          className={styles.search}
          value={searchText}
          onChange={(event) => setSearchText(event.currentTarget.value)}
          placeholder={t('notes.search')}
          aria-label={t('notes.search')}
          maxLength={200}
        />
        {tags.length ? (
          <nav className={styles.tagList} aria-label={t('notes.tags')}>
            {tags.map(({ tag, count }) => {
              const isActive = tag === query.tag
              return (
                <Link
                  key={tag}
                  className={`${styles.tag} ${isActive ? styles.tagActive : ''}`}
                  to={{ pathname: '/notes', search: notesSearch({ q: query.q, tag: isActive ? '' : tag }) }}
                  replace
                  aria-current={isActive ? 'true' : undefined}
                  title={isActive ? t('notes.tagFilterActive', { tag }) : undefined}
                >
                  #{tag}<span className={styles.tagCount}>{count}</span>
                </Link>
              )
            })}
          </nav>
        ) : null}
      </div>

      <h2 className={styles.listHeading}>
        {heading}{status === 'ready' ? <span className={styles.count}>{total}</span> : null}
      </h2>
      {status === 'loading' ? <p className={styles.state} role="status">{t('notes.loading')}</p> : null}
      {status === 'error' ? (
        <div className={styles.state} role="alert">
          <span>{t('notes.loadError')}</span>
          <button type="button" onClick={retry}>{t('notes.retry')}</button>
        </div>
      ) : null}
      {status === 'ready' && !items.length ? (
        <p className={styles.state}>{t(query.q || query.tag ? 'notes.emptySearch' : 'notes.empty')}</p>
      ) : null}
      {items.length ? (
        <ul className={styles.cards} aria-label={t('notes.listHeader')}>
          {items.map((note) => (
            <li key={note.id}>
              <Link className={styles.card} to={`/notes/${encodeURIComponent(note.id)}${search}`}>
                <strong>{note.title}</strong>
                {note.excerpt ? <span className={styles.excerpt}>{plainExcerpt(note.excerpt)}</span> : null}
                {note.tags.length ? (
                  <span className={styles.cardTags}>{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</span>
                ) : null}
                <span className={styles.cardMeta}>
                  {t('notes.updatedAt', { date: formatDate(note.updated_at) })}
                  {note.quote_count ? ` · ${t('notes.quoteCount', { count: note.quote_count })}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {hasMore ? (
        <button type="button" className={styles.loadMore} onClick={loadMore} disabled={isLoadingMore}>
          {t('notes.loadMore')}
        </button>
      ) : null}
      <p className={styles.storage}>{t('notes.storage')}</p>
    </section>
  )
}

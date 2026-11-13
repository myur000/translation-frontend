import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { NOTES_SEARCH_DELAY_MS, notesSearch } from '../../notes/notesQuery.ts'
import { plainExcerpt } from '../../notes/noteSyntax.ts'
import { useNotes } from '../../notes/useNotes.ts'
import styles from './NotesSidebar.module.css'

interface NotesSidebarProps {
  isCollapsed: boolean
}

/** Содержимое боковой панели в разделе «Заметки»: создание, поиск, список и теги. */
export function NotesSidebar({ isCollapsed }: NotesSidebarProps) {
  const { t } = useTranslation()
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
      // Фильтр меняет только список: открытая заметка остаётся на экране.
      void navigate({ pathname: location.pathname, search: notesSearch({ q: next, tag: query.tag }) }, { replace: true })
    }, NOTES_SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [location.pathname, navigate, query.q, query.tag, searchText])

  const search = notesSearch(query)
  const isFiltered = Boolean(query.q || query.tag)

  return (
    <>
      <div className={`${styles.primaryAction} ${isCollapsed ? styles.collapsed : ''}`}>
        <Link to={`/notes/new${search}`} className={styles.newButton} title={t('notes.newTitle')}>
          <span aria-hidden="true">＋</span>
          <span className={styles.newLabel}>{t('notes.new')}</span>
        </Link>
        {!isCollapsed ? (
          <div className={styles.search}>
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.currentTarget.value)}
              placeholder={t('notes.search')}
              aria-label={t('notes.search')}
              maxLength={200}
            />
          </div>
        ) : null}
      </div>

      <div className={`${styles.list} ${isCollapsed ? styles.collapsed : ''}`}>
        {!isCollapsed ? (
          <div className={styles.sectionHeader}>
            <span>{t(isFiltered ? 'notes.foundHeader' : 'notes.listHeader')}</span>
            <span className={styles.count}>{total}</span>
          </div>
        ) : null}
        {query.tag && !isCollapsed ? (
          <Link
            className={styles.activeTag}
            to={{ pathname: location.pathname, search: notesSearch({ q: query.q }) }}
            replace
            title={t('notes.tagFilterActive', { tag: query.tag })}
          >
            #{query.tag} <span aria-hidden="true">×</span>
          </Link>
        ) : null}

        {status === 'loading' && !isCollapsed ? <p className={styles.state} role="status">{t('notes.loading')}</p> : null}
        {status === 'error' && !isCollapsed ? (
          <div className={styles.state} role="alert">
            <span>{t('notes.loadError')}</span>
            <button type="button" onClick={retry}>{t('notes.retry')}</button>
          </div>
        ) : null}
        {status === 'ready' && !items.length && !isCollapsed ? (
          <p className={styles.state}>{t(isFiltered ? 'notes.emptySearch' : 'notes.empty')}</p>
        ) : null}

        <nav className={styles.items} aria-label={t('notes.listHeader')}>
          {items.map((note) => (
            <NavLink
              key={note.id}
              to={`/notes/${encodeURIComponent(note.id)}${search}`}
              className={({ isActive }) => `${styles.item} ${isActive ? styles.itemActive : ''}`}
              title={note.title}
            >
              <span className={styles.initial} aria-hidden="true">{Array.from(note.title)[0]?.toUpperCase()}</span>
              <span className={styles.itemText}>
                <span className={styles.itemTitle}>{note.title}</span>
                {note.excerpt ? <span className={styles.itemExcerpt}>{plainExcerpt(note.excerpt)}</span> : null}
              </span>
            </NavLink>
          ))}
        </nav>
        {hasMore && !isCollapsed ? (
          <button type="button" className={styles.loadMore} onClick={loadMore} disabled={isLoadingMore}>
            {t('notes.loadMore')}
          </button>
        ) : null}

        {tags.length && !isCollapsed ? (
          <section className={styles.tags} aria-label={t('notes.tags')}>
            <div className={styles.sectionHeader}><span>{t('notes.tags')}</span></div>
            <div className={styles.tagList}>
              {tags.map(({ tag, count }) => {
                const isActive = tag === query.tag
                return (
                  <Link
                    key={tag}
                    className={`${styles.tag} ${isActive ? styles.tagActive : ''}`}
                    to={{ pathname: '/notes', search: notesSearch({ q: query.q, tag: isActive ? '' : tag }) }}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    #{tag}<span className={styles.tagCount}>{count}</span>
                  </Link>
                )
              })}
            </div>
          </section>
        ) : null}
      </div>
    </>
  )
}

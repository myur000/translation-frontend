import { Link } from 'react-router'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { notesSearch } from '../../notes/notesQuery.ts'
import { useNoteDateFormat } from '../../notes/useNoteDateFormat.ts'
import { plainExcerpt } from '../../notes/noteSyntax.ts'
import { useNotes } from '../../notes/useNotes.ts'
import styles from './NotesPage.module.css'

/** `/notes`: обзор раздела и карточки текущего списка (поиск и тег — из адреса). */
export function NotesHome() {
  const { t } = useTranslation()
  const formatDate = useNoteDateFormat()
  const { query, items, total, status, retry } = useNotes()
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
        <p className={styles.eyebrow}>{t('sidebar.modeNotes')}</p>
        <h1>{t('notes.homeTitle')}</h1>
        <p>{t('notes.homeDescription')}</p>
        <Link className={styles.primaryLink} to={`/notes/new${search}`}>＋ {t('notes.create')}</Link>
      </header>

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
        <ul className={styles.cards}>
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
      <p className={styles.storage}>{t('notes.storage')}</p>
    </section>
  )
}

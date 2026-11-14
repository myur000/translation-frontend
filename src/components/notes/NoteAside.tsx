import { Link } from 'react-router'
import type { NoteReference, NoteResponse } from '../../api/contracts/notes.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { notesSearch } from '../../notes/notesQuery.ts'
import { useNoteDateFormat } from '../../notes/useNoteDateFormat.ts'
import styles from './NoteAside.module.css'
import { GlyphIcon } from '../ui/GlyphIcon.tsx'

interface NoteAsideProps {
  note: NoteResponse
  /** `null` — ещё загружаются. */
  backlinks: NoteReference[] | null
  /** Строка фильтров списка: переходы не сбрасывают поиск в боковой панели. */
  search: string
}

/** Связи заметки: теги, обратные ссылки и цитаты из книг. */
export function NoteAside({ note, backlinks, search }: NoteAsideProps) {
  const { t } = useTranslation()
  const formatDate = useNoteDateFormat()
  return (
    <aside className={styles.aside} aria-label={t('notes.connections')}>
      <section>
        <h2>{t('notes.tags')}</h2>
        {note.tags.length ? (
          <div className={styles.tags}>
            {note.tags.map((tag) => (
              <Link key={tag} className={styles.tag} to={`/notes${notesSearch({ tag })}`}>#{tag}</Link>
            ))}
          </div>
        ) : <p className={styles.empty}>{t('notes.noTags')}</p>}
      </section>

      <section>
        <h2>{t('notes.backlinks')}{backlinks?.length ? <span className={styles.count}>{backlinks.length}</span> : null}</h2>
        {backlinks === null ? <p className={styles.empty} role="status">{t('notes.loading')}</p>
          : backlinks.length ? (
            <ul className={styles.links}>
              {backlinks.map((reference) => (
                <li key={reference.id}>
                  <Link to={`/notes/${encodeURIComponent(reference.id)}${search}`}><GlyphIcon name="arrowLeft" /> {reference.title}</Link>
                </li>
              ))}
            </ul>
          ) : <p className={styles.empty}>{t('notes.backlinksEmpty')}</p>}
      </section>

      <section>
        <h2>{t('notes.quotes')}{note.quotes.length ? <span className={styles.count}>{note.quotes.length}</span> : null}</h2>
        {note.quotes.length ? (
          <ul className={styles.quotes}>
            {note.quotes.map((quote) => (
              <li key={quote.id} className={styles.quote}>
                <blockquote>{quote.quote}</blockquote>
                {quote.paired_text ? <p className={styles.paired}>{quote.paired_text}</p> : null}
                <div className={styles.quoteMeta}>
                  <span>{t(quote.side === 'SOURCE' ? 'panel.original' : 'panel.translation')}</span>
                  {quote.document_available && quote.job_id ? (
                    <Link to={`/documents/${encodeURIComponent(quote.job_id)}`} title={t('notes.openDocument')}>
                      {quote.document_name ?? t('notes.openDocument')}
                    </Link>
                  ) : <span className={styles.deleted}>{t('notes.documentDeleted')}</span>}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className={styles.empty}>{t('notes.quotesEmpty')}</p>}
      </section>

      <section className={styles.meta}>
        <p>{t('notes.createdAt', { date: formatDate(note.created_at) })}</p>
        <p>{t('notes.updatedAt', { date: formatDate(note.updated_at) })}</p>
        <p className={styles.storage}>{t('notes.storage')}</p>
      </section>
    </aside>
  )
}

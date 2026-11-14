import { useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import type { NoteReference, NoteResponse } from '../../api/contracts/notes.ts'
import { linkNoteDocument, unlinkNoteDocument } from '../../api/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { bookTitle } from '../../documents/bookTitle.ts'
import type { AppLayoutContextValue } from '../../layouts/AppLayout.tsx'
import { noteErrorMessage, type NoteErrorMessage } from '../../notes/noteErrors.ts'
import { useNotes } from '../../notes/useNotes.ts'
import { bookNoteHref, noteBooks } from '../../notes/noteBooks.ts'
import { NoteErrorText } from './NoteErrorText.tsx'
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
  /** Привязки к книгам изменились: показать заметку из ответа сервера. */
  onChanged?: (note: NoteResponse) => void
}

/** Связи заметки, коротко: книги (с переходом к заметке в книге), обратные ссылки и теги. Сами цитаты — в основной колонке. */
export function NoteAside({ note, backlinks, search, onChanged }: NoteAsideProps) {
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

      <NoteBooks note={note} onChanged={onChanged} />

      <section className={styles.meta}>
        <p>{t('notes.createdAt', { date: formatDate(note.created_at) })}</p>
        <p>{t('notes.updatedAt', { date: formatDate(note.updated_at) })}</p>
        <p className={styles.storage}>{t('notes.storage')}</p>
      </section>
    </aside>
  )
}

/**
 * Книги, о которых заметка (конспект, T-67): привязка без цитаты. Отвязать можно и
 * удалённую книгу. Привязать — к любой своей отправленной книге, статус не важен.
 */
function NoteBooks({ note, onChanged }: { note: NoteResponse; onChanged?: (note: NoteResponse) => void }) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const { notesChanged } = useNotes()
  // Вне раздела приложения (тесты, отдельные экраны) списка книг нет — привязывать не к чему.
  const layout = useOutletContext<AppLayoutContextValue | undefined>()
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<NoteErrorMessage | null>(null)
  const linked = note.documents ?? []
  const books = noteBooks(note)
  // Привязать можно к любой своей отправленной книге, кроме уже привязанных целиком.
  const seen = new Set(linked.map((document) => document.job_id))
  const candidates = (layout?.documents ?? []).flatMap((document) => {
    if (!document.jobId || seen.has(document.jobId)) return []
    seen.add(document.jobId)
    return [{ jobId: document.jobId, title: bookTitle(document.name) }]
  })

  const run = async (action: (token: string) => Promise<NoteResponse>) => {
    const token = session?.accessToken
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      onChanged?.(await action(token))
      setSelected('')
      notesChanged()
    } catch (caught) {
      setError(noteErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const unlink = (jobId: string) => run(async (token) => {
    await unlinkNoteDocument(note.id, jobId, { accessToken: token })
    return { ...note, documents: linked.filter((document) => document.job_id !== jobId) }
  })

  return (
    <section aria-label={t('notes.books')}>
      <h2>{t('notes.books')}{books.length ? <span className={styles.count}>{books.length}</span> : null}</h2>
      {books.length ? (
        <ul className={styles.books}>
          {books.map((book) => {
            const title = book.title || t('notes.documentDeleted')
            return (
              <li key={book.jobId}>
                {book.isAvailable
                  ? <Link to={bookNoteHref(book.jobId, note.id, book.quote?.id)} title={t('notes.openInBook')}>{title}</Link>
                  : <span className={styles.deleted}>{title}</span>}
                <span className={styles.bookKind}>{book.quote ? `¶${book.quote.paragraphIndex + 1}` : t('marginNotes.aboutBook')}</span>
                {book.isLinked ? (
                  <button
                    type="button"
                    className={styles.unlink}
                    disabled={busy}
                    aria-label={t('notes.unlinkBook', { title })}
                    title={t('notes.unlinkBook', { title })}
                    onClick={() => void unlink(book.jobId)}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : <p className={styles.empty}>{t('notes.aboutBooksEmpty')}</p>}
      {candidates.length ? (
        <form
          className={styles.linkForm}
          onSubmit={(event) => {
            event.preventDefault()
            if (selected) void run((token) => linkNoteDocument(note.id, selected, { accessToken: token }))
          }}
        >
          <select value={selected} aria-label={t('notes.linkBook')} onChange={(event) => setSelected(event.currentTarget.value)}>
            <option value="">{t('notes.linkBookPlaceholder')}</option>
            {candidates.map((candidate) => <option key={candidate.jobId} value={candidate.jobId}>{candidate.title}</option>)}
          </select>
          <button type="submit" disabled={busy || !selected}>{t('notes.linkBookSubmit')}</button>
        </form>
      ) : null}
      {error ? <p className={styles.error} role="alert"><NoteErrorText message={error} /></p> : null}
    </section>
  )
}

import { useState } from 'react'
import { Link } from 'react-router'
import type { NoteQuoteResponse, NoteResponse } from '../../api/contracts/notes.ts'
import { deleteNoteQuote, updateNote } from '../../api/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { bookTitle, coverTone } from '../../documents/bookTitle.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { bookNoteHref, noteBooks } from '../../notes/noteBooks.ts'
import { noteErrorMessage, type NoteErrorMessage } from '../../notes/noteErrors.ts'
import { useNotes } from '../../notes/useNotes.ts'
import { appendToBody } from '../../notes/noteSyntax.ts'
import { embeddedQuoteIds, quoteEmbed, quoteWhere } from '../../notes/quoteEmbeds.ts'
import { NoteErrorText } from './NoteErrorText.tsx'
import styles from './NoteBookContext.module.css'

/** Корешок книги того же тона, что обложка на полке. */
function Spine({ name }: { name: string }) {
  return <span className={styles.spine} style={{ background: `var(--cover-${coverTone(name)})` }} aria-hidden="true" />
}

/**
 * Плашка книги над заметкой: о какой книге заметка и кнопка «Открыть в книге»,
 * которая открывает книгу на месте цитаты и раскрывает там эту заметку. Связь с
 * книгой — первое, что видно, а не мелкое имя файла внизу. Без книги плашки нет.
 */
export function NoteBookBar({ note }: { note: NoteResponse }) {
  const { t } = useTranslation()
  const book = noteBooks(note).find((item) => item.isAvailable)
  if (!book) return null
  const quote = book.quote
  const where = quote
    ? `¶${quote.paragraphIndex + 1} · ${t(quote.side === 'SOURCE' ? 'panel.original' : 'panel.translation').toLowerCase()}`
    : t('marginNotes.aboutBook')
  return (
    <div className={styles.bar}>
      <Spine name={book.title} />
      <span className={styles.barText}>
        <span className={styles.barTitle}>{book.title}</span>
        <span className={styles.barWhere}>{where}</span>
      </span>
      <Link className={styles.openButton} to={bookNoteHref(book.jobId, note.id, quote?.id)}>
        {t('notes.openInBook')}
      </Link>
    </div>
  )
}

/**
 * Цитаты заметки, которых нет в её тексте, — карточками в основной колонке: текст
 * в три строки с линией слева, по кнопкам — целиком и второй язык, «В книге →» к
 * своему месту. Цитаты, вставленные в текст, стоят там же, где о них написано.
 * Цитату можно убрать из заметки (текст в книге не меняется) или вставить в текст
 * (`canInsert`; во время правки вставляет кнопка редактора).
 */
export function NoteQuoteCards({ note, onChanged, canInsert = false }: {
  note: NoteResponse
  onChanged: (note: NoteResponse) => void
  canInsert?: boolean
}) {
  const { t } = useTranslation()
  const inText = embeddedQuoteIds(note.body)
  const quotes = note.quotes.filter((quote) => !inText.has(quote.id))
  if (!quotes.length) return null
  return (
    <section className={styles.quotes} aria-label={t('notes.quotes')}>
      {quotes.map((quote) => <QuoteCard key={quote.id} note={note} quote={quote} canInsert={canInsert} onChanged={onChanged} />)}
    </section>
  )
}

function QuoteCard({ note, quote, canInsert, onChanged }: {
  note: NoteResponse
  quote: NoteQuoteResponse
  canInsert: boolean
  onChanged: (note: NoteResponse) => void
}) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const { notesChanged } = useNotes()
  const [isExpanded, setExpanded] = useState(false)
  const [isPairedShown, setPairedShown] = useState(false)
  const [isRemoving, setRemoving] = useState(false)
  const [error, setError] = useState<NoteErrorMessage | null>(null)
  const name = quote.document_name ? bookTitle(quote.document_name) : t('notes.documentDeleted')
  const side = t(quote.side === 'SOURCE' ? 'panel.original' : 'panel.translation')

  const insert = async () => {
    const token = session?.accessToken
    if (!token) return
    setRemoving(true)
    setError(null)
    try {
      const body = appendToBody(note.body, quoteEmbed(quote, quoteWhere(quote.paragraph_index, side)))
      onChanged(await updateNote(note.id, { title: note.title, body, version: note.version }, { accessToken: token }))
      notesChanged()
    } catch (caught) {
      setError(noteErrorMessage(caught))
    } finally {
      setRemoving(false)
    }
  }

  const remove = async () => {
    const token = session?.accessToken
    if (!token) return
    setRemoving(true)
    setError(null)
    try {
      await deleteNoteQuote(note.id, quote.id, { accessToken: token })
      onChanged({ ...note, quotes: note.quotes.filter((item) => item.id !== quote.id) })
      notesChanged()
    } catch (caught) {
      setError(noteErrorMessage(caught))
      setRemoving(false)
    }
  }

  return (
    <article className={styles.quote} aria-label={t('notes.quoteFrom', { book: name })}>
      <blockquote className={`${styles.quoteText} ${isExpanded ? '' : styles.clamped}`}>{quote.quote}</blockquote>
      {isPairedShown && quote.paired_text ? <p className={styles.paired}>{quote.paired_text}</p> : null}
      <div className={styles.quoteMeta}>
        <span className={styles.quoteSource}>
          {quote.document_name ? <Spine name={name} /> : null}
          {name} · ¶{quote.paragraph_index + 1} · {side.toLowerCase()}
        </span>
        <button type="button" className={styles.textButton} aria-expanded={isExpanded} onClick={() => setExpanded(!isExpanded)}>
          {t(isExpanded ? 'notes.quoteCollapse' : 'notes.quoteExpand')}
        </button>
        {quote.paired_text ? (
          <button type="button" className={styles.textButton} aria-pressed={isPairedShown} onClick={() => setPairedShown(!isPairedShown)}>
            {t(quote.side === 'SOURCE' ? 'notes.showTranslation' : 'notes.showOriginal')}
          </button>
        ) : null}
        {canInsert ? (
          <button type="button" className={styles.textButton} disabled={isRemoving} onClick={() => void insert()}>
            {t('notes.insertQuote')}
          </button>
        ) : null}
        <button type="button" className={styles.textButton} disabled={isRemoving} onClick={() => void remove()}>
          {t('notes.removeQuote')}
        </button>
        {quote.document_available && quote.job_id ? (
          <Link className={styles.inBook} to={bookNoteHref(quote.job_id, note.id, quote.id)}>{t('notes.quoteInBook')}</Link>
        ) : null}
      </div>
      {error ? <p className={styles.error} role="alert"><NoteErrorText message={error} /></p> : null}
    </article>
  )
}

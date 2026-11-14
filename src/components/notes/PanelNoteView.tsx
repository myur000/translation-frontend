import { useState } from 'react'
import { Link } from 'react-router'
import type { NoteQuoteResponse } from '../../api/contracts/notes.ts'
import { deleteNoteQuote } from '../../api/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { TranslationKey } from '../../i18n/translations.ts'
import { noteErrorMessage, type NoteErrorMessage } from '../../notes/noteErrors.ts'
import { useNote } from '../../notes/useNote.ts'
import { useNotes } from '../../notes/useNotes.ts'
import { NoteContent } from './NoteContent.tsx'
import { NoteEditSession } from './NoteEditSession.tsx'
import { NoteErrorText } from './NoteErrorText.tsx'
import styles from './WorkspaceNotesPanel.module.css'
import { GlyphIcon } from '../ui/GlyphIcon.tsx'

/** Длиннее этого (цитата + пара) карточка свёрнута до нескольких строк: панель узкая. */
const LONG_QUOTE = 280

export type ShowQuoteResult = 'shown' | 'notFound' | 'hidden'

const SHOW_QUOTE_MESSAGES: Record<Exclude<ShowQuoteResult, 'shown'>, TranslationKey> = {
  notFound: 'notesPanel.notFoundInBook',
  hidden: 'notesPanel.hiddenSide',
}

interface PanelNoteViewProps {
  noteId: string
  /** Книга, рядом с которой открыта панель: её цитаты можно показать на странице. */
  jobId: string | null
  onBack: () => void
  onShowQuote: (quote: NoteQuoteResponse) => ShowQuoteResult
  onChanged: () => void
}

export function PanelNoteView({ noteId, jobId, onBack, onShowQuote, onChanged }: PanelNoteViewProps) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const { drafts } = useNotes()
  const { state, reload, applySaved } = useNote(noteId)
  const [isEditing, setEditing] = useState(() => Boolean(drafts.get(noteId)))
  const [message, setMessage] = useState<{ quoteId: string; key: TranslationKey } | null>(null)
  const [quoteError, setQuoteError] = useState<NoteErrorMessage | null>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  const back = (
    <button type="button" className={styles.back} onClick={onBack} aria-label={t('notesPanel.back')}>
      <GlyphIcon name="arrowLeft" /> {t('notes.title')}
    </button>
  )
  if (state.status === 'loading') return <div className={styles.body}>{back}<p className={styles.muted} role="status">{t('notes.loading')}</p></div>
  if (state.status === 'error') {
    return (
      <div className={styles.body}>
        {back}
        <p className={styles.problem} role="alert"><NoteErrorText message={state.message} /></p>
        <button type="button" className={styles.secondary} onClick={reload}>{t('notes.retry')}</button>
      </div>
    )
  }

  const note = state.note
  // Цитаты этой книги — первыми: ради них панель и открыта.
  const quotes = [...note.quotes].sort((left, right) => Number(right.job_id === jobId) - Number(left.job_id === jobId))

  const removeQuote = async (quote: NoteQuoteResponse) => {
    const token = session?.accessToken
    if (!token) return
    setQuoteError(null)
    try {
      await deleteNoteQuote(note.id, quote.id, { accessToken: token })
      reload()
      onChanged()
    } catch (caught) {
      setQuoteError(noteErrorMessage(caught))
    }
  }

  return (
    <div className={styles.body}>
      {back}
      {isEditing ? (
        <NoteEditSession
          note={note}
          knownLinks={note.links}
          compact
          onSaved={applySaved}
          onLatest={applySaved}
          onClose={(hasSaved) => { setEditing(false); if (hasSaved) onChanged() }}
        />
      ) : (
        <>
          <header className={styles.noteHeader}>
            <h3>{note.title}</h3>
            <div className={styles.noteActions}>
              <button type="button" className={styles.secondary} onClick={() => setEditing(true)}>{t('notes.edit')}</button>
              <Link className={styles.secondary} to={`/notes/${encodeURIComponent(note.id)}`}>{t('notesPanel.openInSection')}</Link>
            </div>
          </header>
          {note.body.trim() ? <NoteContent body={note.body} links={note.links} /> : null}
        </>
      )}

      {quotes.length ? (
        <section className={styles.quotes} aria-label={t('notes.quotes')}>
          <h4>{t('notes.quotes')} <span className={styles.count}>{quotes.length}</span></h4>
          {quoteError ? <p className={styles.problem} role="alert"><NoteErrorText message={quoteError} /></p> : null}
          <ul>
            {quotes.map((quote) => {
              const isThisBook = quote.job_id !== null && quote.job_id === jobId
              return (
                <li key={quote.id} className={`${styles.quoteCard} ${expanded.has(quote.id) ? '' : styles.quoteCollapsed}`}>
                  <blockquote>{quote.quote}</blockquote>
                  {quote.paired_text ? <p className={styles.paired}>{quote.paired_text}</p> : null}
                  {quote.quote.length + (quote.paired_text?.length ?? 0) > LONG_QUOTE ? (
                    <button type="button" className={styles.expand} aria-expanded={expanded.has(quote.id)} onClick={() => setExpanded((current) => {
                      const next = new Set(current)
                      if (!next.delete(quote.id)) next.add(quote.id)
                      return next
                    })}>{t(expanded.has(quote.id) ? 'notesPanel.collapseQuote' : 'notesPanel.expandQuote')}</button>
                  ) : null}
                  <div className={styles.quoteMeta}>
                    <span>{t(quote.side === 'SOURCE' ? 'panel.original' : 'panel.translation')}</span>
                    {isThisBook ? (
                      <button type="button" onClick={() => {
                        const result = onShowQuote(quote)
                        setMessage(result === 'shown' ? null : { quoteId: quote.id, key: SHOW_QUOTE_MESSAGES[result] })
                      }}>{t('notesPanel.showInBook')}</button>
                    ) : quote.document_available && quote.job_id ? (
                      <Link to={`/documents/${encodeURIComponent(quote.job_id)}`}>
                        {t('notesPanel.fromOtherBook', { name: quote.document_name ?? '' })}
                      </Link>
                    ) : <span className={styles.deleted}>{t('notes.documentDeleted')}</span>}
                    <button
                      type="button"
                      className={styles.removeQuote}
                      aria-label={t('notesPanel.removeQuote')}
                      title={t('notesPanel.removeQuote')}
                      onClick={() => void removeQuote(quote)}
                    >×</button>
                  </div>
                  {message?.quoteId === quote.id ? <p className={styles.muted} role="status">{t(message.key)}</p> : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

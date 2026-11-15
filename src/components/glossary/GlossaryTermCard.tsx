import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import type { TermListItem, TermResponse } from '../../api/contracts/terms.ts'
import { loadDocumentText } from '../../api/documentText.ts'
import { deleteTerm, getTerm, unlinkTermDocument } from '../../api/terms.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { bookTitle, coverTone } from '../../documents/bookTitle.ts'
import { termInBookHref } from '../../glossary/glossaryLinks.ts'
import { removeGlossaryTerm, upsertGlossaryTerm } from '../../glossary/glossaryStore.ts'
import { snippet, termOccurrences, type SnippetPart, type TermOccurrence } from '../../glossary/termOccurrences.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { noteErrorMessage, type NoteErrorMessage } from '../../notes/noteErrors.ts'
import { NoteErrorText } from '../notes/NoteErrorText.tsx'
import styles from './GlossaryTermCard.module.css'

/** Тексты стольких книг читаем для «Где встречается». */
const MAX_BOOKS = 5

interface GlossaryTermCardProps {
  term: TermListItem
  /** «EN → RU». */
  pair: string
  onEdit: () => void
  onClose: () => void
}

interface BookOccurrences {
  jobId: string
  name: string
  occurrences: TermOccurrence[]
}

type Details = { id: string; term: TermResponse; books: BookOccurrences[] | null }

function Snippet({ parts }: { parts: SnippetPart[] }) {
  return <>{parts.map((part, index) => (part.isMatch ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>))}</>
}

export function GlossaryTermCard({ term, pair, onEdit, onClose }: GlossaryTermCardProps) {
  const { t, tc } = useTranslation()
  const { session } = useAuth()
  const token = session?.accessToken ?? null
  const [details, setDetails] = useState<Details | null>(null)
  const [isConfirming, setConfirming] = useState(false)
  const [isBusy, setBusy] = useState(false)
  const [error, setError] = useState<NoteErrorMessage | null>(null)

  // Книги термина и абзацы, где он встречается. Тексты книг кэшируются на сеанс.
  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    const options = { accessToken: token, signal: controller.signal }
    getTerm(term.id, options).then(async (full) => {
      if (controller.signal.aborted) return
      setDetails({ id: term.id, term: full, books: null })
      const available = full.documents.filter((document) => document.document_available).slice(0, MAX_BOOKS)
      const books = await Promise.all(available.map(async (document) => {
        const text = await loadDocumentText(document.job_id, options).catch(() => null)
        return { jobId: document.job_id, name: document.document_name, occurrences: text ? termOccurrences(full, text.paragraphs) : [] }
      }))
      if (!controller.signal.aborted) setDetails({ id: term.id, term: full, books })
    }, () => {})
    return () => controller.abort()
  }, [term.id, term.term, term.translation, token])

  const current = details?.id === term.id ? details : null
  const total = current?.books?.reduce((sum, book) => sum + book.occurrences.length, 0) ?? 0

  const unlink = async (jobId: string) => {
    if (!token || !current) return
    setBusy(true)
    setError(null)
    try {
      await unlinkTermDocument(term.id, jobId, { accessToken: token })
      const full = await getTerm(term.id, { accessToken: token })
      upsertGlossaryTerm(full)
      setDetails({ id: term.id, term: full, books: current.books?.filter((book) => book.jobId !== jobId) ?? null })
    } catch (caught) {
      setError(noteErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      await deleteTerm(term.id, { accessToken: token })
      removeGlossaryTerm(term.id)
      onClose()
    } catch (caught) {
      setError(noteErrorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <aside className={styles.card} aria-label={t('glossary.cardLabel', { term: term.term })}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>{t('glossary.cardEyebrow', { pair })}</span>
        <button type="button" className={styles.close} aria-label={t('glossary.closeCard')} title={t('glossary.closeCard')} onClick={onClose}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>
      <div className={styles.pair}>
        <h2>{term.term}</h2>
        <p>→ {term.translation}</p>
      </div>

      <section className={styles.section} aria-label={t('glossary.books')}>
        <h3>{t('glossary.books')}</h3>
        {current ? (
          current.term.documents.length ? (
            <ul className={styles.chips}>
              {current.term.documents.map((document) => (
                <li key={document.job_id} className={styles.chip}
                  style={{ '--node-tone': `var(--cover-${coverTone(document.document_name)})` } as CSSProperties}>
                  <span className={styles.tone} aria-hidden="true" />
                  <span className={document.document_available ? undefined : styles.deleted}>{bookTitle(document.document_name)}</span>
                  <button type="button" disabled={isBusy} aria-label={t('glossary.unlink', { book: bookTitle(document.document_name) })}
                    title={t('glossary.unlink', { book: bookTitle(document.document_name) })} onClick={() => void unlink(document.job_id)}>
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className={styles.muted}>{t('glossary.noBooks')}</p>
        ) : <p className={styles.muted} role="status">{t('glossary.loadingDetails')}</p>}
      </section>

      {current?.term.documents.length ? (
        <section className={styles.section} aria-label={t('glossary.occurrences')}>
          <h3>{current.books ? t('glossary.occurrencesCount', { count: tc('glossary.paragraphs', total) }) : t('glossary.occurrences')}</h3>
          {!current.books ? <p className={styles.muted} role="status">{t('glossary.searchingText')}</p>
            : !total ? <p className={styles.muted}>{t('glossary.notFoundInText')}</p>
              : (
                <ul className={styles.occurrences}>
                  {current.books.flatMap((book) => book.occurrences.map((occurrence) => (
                    <li key={`${book.jobId}:${occurrence.paragraphIndex}`}>
                      <p className={styles.source}><Snippet parts={snippet(occurrence.source, occurrence.inSource)} /></p>
                      {occurrence.inTranslation.length && occurrence.translation ? (
                        <p className={styles.translation}><Snippet parts={snippet(occurrence.translation, occurrence.inTranslation)} /></p>
                      ) : <p className={styles.missing}>{t('glossary.missingInTranslation', { translation: term.translation })}</p>}
                      <div className={styles.foot}>
                        <span>{current.books!.length > 1 ? `${bookTitle(book.name)} · ` : ''}{t('glossary.paragraph', { number: occurrence.paragraphIndex + 1 })}</span>
                        <Link to={termInBookHref(book.jobId, term.id, occurrence.paragraphIndex)}>{t('glossary.openInBook')}</Link>
                      </div>
                    </li>
                  )))}
                </ul>
              )}
        </section>
      ) : null}

      {error ? <p className={styles.error} role="alert"><NoteErrorText message={error} /></p> : null}
      <div className={styles.actions}>
        {isConfirming ? (
          <>
            <span>{t('glossary.confirmDelete', { term: term.term })}</span>
            <button type="button" className={styles.danger} disabled={isBusy} onClick={() => void remove()}>{t('glossary.delete')}</button>
            <button type="button" className={styles.quiet} disabled={isBusy} onClick={() => setConfirming(false)}>{t('common.cancel')}</button>
          </>
        ) : (
          <>
            <button type="button" className={styles.secondary} onClick={onEdit}>{t('glossary.edit')}</button>
            <button type="button" className={styles.quiet} onClick={() => setConfirming(true)}>{t('glossary.delete')}</button>
          </>
        )}
      </div>
    </aside>
  )
}

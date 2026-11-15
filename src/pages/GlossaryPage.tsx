import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router'
import type { TermListItem } from '../api/contracts/terms.ts'
import { createTerm, updateTerm } from '../api/terms.ts'
import { useAuth } from '../auth/useAuth.ts'
import { GlossaryTermCard } from '../components/glossary/GlossaryTermCard.tsx'
import { NoteErrorText } from '../components/notes/NoteErrorText.tsx'
import { bookTitle } from '../documents/bookTitle.ts'
import {
  currentPair,
  documentPair,
  GLOSSARY_PATH,
  glossaryPairs,
  glossarySearch,
  matchesGlossaryQuery,
  pairKey,
  readGlossaryQuery,
  sortTerms,
  splitPair,
  type GlossaryQuery,
  type GlossarySort,
} from '../glossary/glossaryQuery.ts'
import { upsertGlossaryTerm, useGlossary } from '../glossary/glossaryStore.ts'
import { countWords, MAX_TERM_WORDS } from '../glossary/termWords.ts'
import { useBookTermIds } from '../glossary/useBookTermIds.ts'
import { useTranslation } from '../i18n/useTranslation.ts'
import type { AppLayoutContextValue } from '../layouts/AppLayout.tsx'
import { shortLanguageCode } from '../languages/languageCatalog.ts'
import { useLanguageCatalog } from '../languages/useLanguageCatalog.ts'
import { noteErrorMessage, type NoteErrorMessage } from '../notes/noteErrors.ts'
import styles from './GlossaryPage.module.css'

const TERM_MAX = 200
const TRANSLATION_MAX = 500
const COLUMNS: { sort: GlossarySort; key: 'glossary.column.term' | 'glossary.column.translation' | 'glossary.column.books' | 'glossary.column.updated' }[] = [
  { sort: 'term', key: 'glossary.column.term' },
  { sort: 'translation', key: 'glossary.column.translation' },
  { sort: 'books', key: 'glossary.column.books' },
  { sort: 'recent', key: 'glossary.column.updated' },
]

type FormProblem = { kind: 'message'; text: string } | { kind: 'error'; error: NoteErrorMessage }

export function GlossaryPage() {
  const { t, tc, language } = useTranslation()
  const { getLabel } = useLanguageCatalog()
  const { session } = useAuth()
  const { documents } = useOutletContext<AppLayoutContextValue>()
  const location = useLocation()
  const navigate = useNavigate()
  const query = readGlossaryQuery(location.search)
  const glossary = useGlossary(true)
  const pairs = glossaryPairs(glossary.terms)
  const books = documents.filter((document) => document.jobId)
  const pair = currentPair(query.pair, pairs, books[0] ? documentPair(books[0]) : null)
  const bookIds = useBookTermIds(query.book, glossary.revision)
  const inPair = glossary.terms.filter((item) => pairKey(item) === pair)
  const visible = sortTerms(
    inPair.filter((item) => matchesGlossaryQuery(item, query.q) && (!bookIds || bookIds.has(item.id))),
    query.sort,
    language,
  )
  const selected = query.term ? glossary.terms.find((item) => item.id === query.term) ?? null : null
  const book = query.book ? books.find((document) => document.jobId === query.book) : undefined
  const languages = pair ? splitPair(pair) : null
  const shortPair = languages ? `${shortLanguageCode(languages.source)} → ${shortLanguageCode(languages.target)}` : ''

  const [today] = useState(() => new Date().toDateString())
  const [editing, setEditing] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)

  const go = (next: Partial<GlossaryQuery>) => {
    void navigate({ pathname: GLOSSARY_PATH, search: glossarySearch({ ...query, ...next }) }, { replace: true })
  }
  const select = (id: string | null) => go({ term: id })

  const dateFormat = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' })
  const updated = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toDateString() === today ? t('notes.home.today') : dateFormat.format(date)
  }

  let content
  if (glossary.status === 'error' && !glossary.terms.length) {
    content = (
      <div className={styles.state} role="alert">
        <span>{t('glossary.loadError')}</span>
        <button type="button" onClick={glossary.retry}>{t('notes.retry')}</button>
      </div>
    )
  } else if (glossary.status !== 'ready' && !glossary.terms.length) {
    content = <p className={styles.state} role="status">{t('glossary.loading')}</p>
  } else if (!pair || !languages) {
    content = (
      <div className={styles.empty}>
        <h2>{t('glossary.emptyTitle')}</h2>
        <p>{t('glossary.emptyHint')}</p>
      </div>
    )
  } else {
    content = (
      <>
        <div className={styles.meta}>
          <span>{tc('glossary.termCount', inPair.length)} · {getLabel(languages.source)} → {getLabel(languages.target)}</span>
          {book ? (
            <span className={styles.filter}>
              {bookTitle(book.name)}
              <button type="button" aria-label={t('glossary.resetBook')} title={t('glossary.resetBook')} onClick={() => go({ book: null })}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </span>
          ) : null}
        </div>

        <div className={styles.table}>
          <div className={styles.head} role="group" aria-label={t('glossary.sortColumns')}>
            {COLUMNS.map((column, index) => (
              <button key={column.sort} type="button" className={`${styles.sortButton} ${styles[`col${index}`]}`}
                aria-pressed={query.sort === column.sort} onClick={() => go({ sort: column.sort })}>
                {t(column.key)}
                <span className={styles.arrow} aria-hidden="true">{query.sort === column.sort ? '↓' : ''}</span>
              </button>
            ))}
          </div>

          <AddTermRow
            pair={languages}
            jobId={query.book}
            terms={inPair}
            onAdded={(id) => { setFresh(id); select(id) }}
            onExisting={select}
          />

          {visible.length ? (
            <ul className={styles.rows} aria-label={t('glossary.listLabel')}>
              {visible.map((item) => (
                <li key={item.id}>
                  {editing === item.id ? (
                    <EditTermRow term={item} onDone={() => setEditing(null)} />
                  ) : (
                    <div
                      className={`${styles.row} ${item.id === selected?.id ? styles.rowSelected : ''} ${item.id === fresh ? styles.rowFresh : ''}`}
                      onClick={(event) => { if (!(event.target as Element).closest('button')) select(item.id) }}
                      onDoubleClick={() => setEditing(item.id)}
                    >
                      <button type="button" className={styles.termButton} aria-pressed={item.id === selected?.id} onClick={() => select(item.id)}>
                        {item.term}
                      </button>
                      <span className={styles.arrowCell} aria-hidden="true">→</span>
                      <span className={styles.translation}>{item.translation}</span>
                      <span className={`${styles.number} ${item.document_count ? '' : styles.zero}`}>
                        {item.document_count ? tc('glossary.bookCount', item.document_count) : t('glossary.noBooksShort')}
                      </span>
                      <span className={styles.number}>{updated(item.updated_at)}</span>
                      <button type="button" className={styles.edit} aria-label={t('glossary.editTerm', { term: item.term })}
                        title={t('glossary.edit')} onClick={() => setEditing(item.id)}>
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.8 2.7l2.5 2.5-7.6 7.6-3.1.6.6-3.1z" /></svg>
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.none}>
              {inPair.length ? (
                <>
                  <span>{t('glossary.nothingFound')}</span>
                  <button type="button" onClick={() => go({ q: '', book: null })}>{t('notes.home.resetFilter')}</button>
                </>
              ) : <span>{t('glossary.pairEmpty')}</span>}
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <div className={`${styles.page} ${selected ? styles.withCard : ''}`}>
      <div className={styles.main}>
        <header className={styles.header}>
          <h1>{t('glossary.title')}</h1>
          <p>{t('glossary.description')}</p>
        </header>
        {content}
      </div>
      {selected && session ? (
        <div className={styles.aside}>
          <GlossaryTermCard
            key={selected.id}
            term={selected}
            pair={shortPair}
            onEdit={() => setEditing(selected.id)}
            onClose={() => select(null)}
          />
        </div>
      ) : null}
    </div>
  )
}

function problemText(problem: FormProblem) {
  return problem.kind === 'message' ? problem.text : <NoteErrorText message={problem.error} />
}

interface AddTermRowProps {
  pair: { source: string; target: string }
  /** Фильтр по книге: новый термин сразу привязан к ней. */
  jobId: string | null
  terms: readonly TermListItem[]
  onAdded: (id: string) => void
  onExisting: (id: string) => void
}

function AddTermRow({ pair, jobId, terms, onAdded, onExisting }: AddTermRowProps) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const [term, setTerm] = useState('')
  const [translation, setTranslation] = useState('')
  const [problem, setProblem] = useState<FormProblem | null>(null)
  const [isSaving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = session?.accessToken
    const cleanTerm = term.trim()
    const cleanTranslation = translation.trim()
    if (!token || isSaving) return
    if (!cleanTerm || !cleanTranslation) {
      const form = event.currentTarget
      ;(form.elements.namedItem(cleanTerm ? 'translation' : 'term') as HTMLInputElement).focus()
      return
    }
    if (countWords(cleanTerm) > MAX_TERM_WORDS) {
      setProblem({ kind: 'message', text: t('glossary.tooLong', { max: MAX_TERM_WORDS }) })
      return
    }
    const existing = terms.find((item) => item.term.toLocaleLowerCase() === cleanTerm.toLocaleLowerCase())
    if (existing) {
      setProblem({ kind: 'message', text: t('glossary.alreadyExists', { term: existing.term, translation: existing.translation }) })
      onExisting(existing.id)
      return
    }
    setSaving(true)
    setProblem(null)
    try {
      const saved = await createTerm({
        term: cleanTerm,
        translation: cleanTranslation,
        source_lang: pair.source,
        target_lang: pair.target,
        ...(jobId ? { job_id: jobId } : {}),
      }, { accessToken: token })
      upsertGlossaryTerm(saved)
      setTerm('')
      setTranslation('')
      onAdded(saved.id)
    } catch (caught) {
      setProblem({ kind: 'error', error: noteErrorMessage(caught) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className={`${styles.row} ${styles.formRow}`} aria-label={t('glossary.addLabel')} onSubmit={(event) => void submit(event)} autoComplete="off">
      <input name="term" className={`${styles.field} ${styles.fieldTerm}`} value={term} maxLength={TERM_MAX}
        placeholder={t('glossary.newTerm')} aria-label={t('glossary.newTerm')}
        onChange={(event) => { setTerm(event.currentTarget.value); setProblem(null) }}
        onKeyDown={(event) => {
          // Enter в термине — к переводу, пока перевод пустой.
          if (event.key === 'Enter' && term.trim() && !translation.trim()) {
            event.preventDefault()
            ;(event.currentTarget.form?.elements.namedItem('translation') as HTMLInputElement | null)?.focus()
          }
        }} />
      <span className={styles.arrowCell} aria-hidden="true">→</span>
      <input name="translation" className={styles.field} value={translation} maxLength={TRANSLATION_MAX}
        placeholder={t('glossary.translation')} aria-label={t('glossary.newTranslation')}
        onChange={(event) => { setTranslation(event.currentTarget.value); setProblem(null) }} />
      <button type="submit" className={styles.add} disabled={isSaving}>{t('glossary.add')}</button>
      {problem ? <p className={styles.problem} role="alert">{problemText(problem)}</p> : null}
    </form>
  )
}

function EditTermRow({ term, onDone }: { term: TermListItem; onDone: () => void }) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const [value, setValue] = useState(term.term)
  const [translation, setTranslation] = useState(term.translation)
  const [problem, setProblem] = useState<FormProblem | null>(null)
  const [isSaving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = session?.accessToken
    const cleanTerm = value.trim()
    const cleanTranslation = translation.trim()
    if (!token || isSaving || !cleanTerm || !cleanTranslation) return
    if (countWords(cleanTerm) > MAX_TERM_WORDS) {
      setProblem({ kind: 'message', text: t('glossary.tooLong', { max: MAX_TERM_WORDS }) })
      return
    }
    if (cleanTerm === term.term && cleanTranslation === term.translation) {
      onDone()
      return
    }
    setSaving(true)
    setProblem(null)
    try {
      upsertGlossaryTerm(await updateTerm(term.id, { term: cleanTerm, translation: cleanTranslation }, { accessToken: token }))
      onDone()
    } catch (caught) {
      setProblem({ kind: 'error', error: noteErrorMessage(caught) })
      setSaving(false)
    }
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onDone()
    }
  }

  return (
    <form className={`${styles.row} ${styles.formRow} ${styles.editRow}`} aria-label={t('glossary.editTerm', { term: term.term })}
      onSubmit={(event) => void submit(event)} onKeyDown={handleKeyDown} autoComplete="off">
      <input className={`${styles.field} ${styles.fieldTerm}`} value={value} maxLength={TERM_MAX} autoFocus
        aria-label={t('glossary.term')} onChange={(event) => { setValue(event.currentTarget.value); setProblem(null) }} />
      <span className={styles.arrowCell} aria-hidden="true">→</span>
      <input className={styles.field} value={translation} maxLength={TRANSLATION_MAX}
        aria-label={t('glossary.translation')} onChange={(event) => { setTranslation(event.currentTarget.value); setProblem(null) }} />
      <span className={styles.editActions}>
        <button type="submit" className={styles.add} disabled={isSaving}>{t('glossary.save')}</button>
        <button type="button" className={styles.cancel} onClick={onDone}>{t('common.cancel')}</button>
      </span>
      {problem ? <p className={styles.problem} role="alert">{problemText(problem)}</p> : null}
    </form>
  )
}

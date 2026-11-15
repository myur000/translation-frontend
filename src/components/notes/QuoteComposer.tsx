import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { NoteQuoteRequest, NoteQuoteResponse, NoteResponse, NoteSummary } from '../../api/contracts/notes.ts'
import { loadDocumentText } from '../../api/documentText.ts'
import { addNoteQuote, createNote, getNote, updateNote } from '../../api/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { BookQuote } from '../../notes/bookQuotes.ts'
import { isNoteConflict, noteErrorMessage, type NoteErrorMessage } from '../../notes/noteErrors.ts'
import { appendToBody, NOTE_TITLE_MAX_LENGTH, noteTitleProblem, titleFromQuote } from '../../notes/noteSyntax.ts'
import { NOTES_SEARCH_DELAY_MS } from '../../notes/notesQuery.ts'
import { quoteEmbed, quoteWhere } from '../../notes/quoteEmbeds.ts'
import { locateQuote, normalizeQuoteText, type QuoteLocation, type QuoteSelection } from '../../notes/quoteLocator.ts'
import { useNotesList } from '../../notes/useNotesList.ts'
import { NoteErrorText } from './NoteErrorText.tsx'
import styles from './QuoteComposer.module.css'

/** Сколько заметок абзаца предлагать кнопками «Добавить к …»; остальные — в поиске. */
const PARAGRAPH_NOTES_SHOWN = 2

interface QuoteComposerProps {
  jobId: string
  selection: QuoteSelection
  /** Заметки этой книги — первые кандидаты, куда добавить цитату. */
  bookNotes: NoteSummary[]
  /** Цитаты книги: по ним видно, какие заметки уже есть у этого абзаца. */
  bookQuotes: readonly Pick<BookQuote, 'noteId' | 'paragraphIndex'>[]
  /**
   * «В конспект»: выписка дописывается в конспект книги, а не становится отдельной
   * заметкой. `target` — текущий конспект; `null` — у книги его нет, и создаётся
   * новый (`newTitle`, привязан к книге) сразу с этой выпиской.
   */
  summary?: { target: Pick<NoteResponse, 'id' | 'title'> | null; newTitle: string }
  /**
   * Цитаты «с другой стороны» (для заметки — выписки в конспект, для конспекта —
   * цитаты заметок). Если выделено то же место, это подсказка «Уже в …», а не запрет:
   * заметка и конспект решают разные задачи.
   */
  otherQuotes?: readonly Pick<BookQuote, 'noteId' | 'noteTitle' | 'paragraphIndex' | 'quote'>[]
  onOpenOther?: (noteId: string) => void
  onSaved: (noteId: string) => void
  onCancel: () => void
}

const NO_QUOTES: NonNullable<QuoteComposerProps['otherQuotes']> = []

/** Одно и то же место: тот же абзац и одна цитата содержит другую. */
function sameExcerpt(first: string, second: string) {
  const a = normalizeQuoteText(first).toLocaleLowerCase()
  const b = normalizeQuoteText(second).toLocaleLowerCase()
  return Boolean(a && b) && (a.includes(b) || b.includes(a))
}

/**
 * Быстрая запись из выделения: цитата в две строки, курсор сразу в тексте
 * мысли, «Сохранить» (Ctrl/⌘ + Enter) создаёт заметку с цитатой. Название
 * берётся из цитаты; поле названия раскрывается по «изменить» или само, если
 * такое название уже занято. Заметки этого абзаца предложены первыми —
 * цитата и текст добавятся к ним в один клик; остальные — в поиске «ещё…».
 */
export function QuoteComposer({ jobId, selection, bookNotes, bookQuotes, summary, otherQuotes = NO_QUOTES, onOpenOther, onSaved, onCancel }: QuoteComposerProps) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const ids = useId()
  const [location, setLocation] = useState<QuoteLocation | { status: 'locating' | 'failed' }>({ status: 'locating' })
  const [text, setText] = useState('')
  const [title, setTitle] = useState(() => (summary ? summary.newTitle : titleFromQuote(selection.text)))
  const [isTitleOpen, setTitleOpen] = useState(false)
  const [isPairedShown, setPairedShown] = useState(false)
  const [isPickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [isSaving, setSaving] = useState(false)
  const [error, setError] = useState<NoteErrorMessage | null>(null)
  // Цитата уже ушла в эту заметку, а текст дописать не удалось: повтор не добавит её второй раз
  // (и не создаст второй конспект — допишет в созданный).
  const quotedInto = useRef<{ noteId: string; quote: NoteQuoteResponse } | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const thoughtRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const token = session?.accessToken
    if (!token) return
    let active = true
    loadDocumentText(jobId, { accessToken: token }).then(
      (documentText) => { if (active) setLocation(locateQuote(selection, documentText)) },
      () => { if (active) setLocation({ status: 'failed' }) },
    )
    return () => { active = false }
    // Абзац ищется один раз для этого выделения: компонент монтируется заново на каждое.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), NOTES_SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [search])
  // Карточка открылась ради записи мысли — курсор сразу в тексте. Без прокрутки:
  // книга не должна сдвигаться, пока человек читает.
  useEffect(() => { thoughtRef.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    if (isTitleOpen) titleRef.current?.focus({ preventScroll: true })
  }, [isTitleOpen])

  const quote: NoteQuoteRequest | null = location.status === 'found' ? { ...location.quote, job_id: jobId } : null
  const paragraphIndex = quote?.paragraph_index ?? selection.paragraphIndex
  const notesById = new Map(bookNotes.map((note) => [note.id, note]))
  const paragraphNotes = paragraphIndex === null ? [] : [...new Set(bookQuotes
    .filter((item) => item.paragraphIndex === paragraphIndex)
    .map((item) => item.noteId))]
    .map((id) => notesById.get(id))
    .filter((note): note is NoteSummary => Boolean(note))
    .slice(0, PARAGRAPH_NOTES_SHOWN)
  // Поиск грузится, только когда его раскрыли.
  const found = useNotesList(isPickerOpen ? (query ? { q: query, size: 8 } : { size: 8 }) : null, 0)
  // Без поиска сначала заметки этой книги, затем недавние остальные.
  const candidates = query ? found.items
    : [...bookNotes, ...found.items.filter((item) => !bookNotes.some((known) => known.id === item.id))].slice(0, 8)
  const titleProblem = noteTitleProblem(title)
  const canSave = Boolean(quote) && !isSaving
  // То же место уже есть «с другой стороны»: показываем, где, — записать всё равно можно.
  const selectedText = quote?.quote ?? selection.text
  const alreadyIn = paragraphIndex === null ? [] : [...new Map(otherQuotes
    .filter((item) => item.paragraphIndex === paragraphIndex && sameExcerpt(item.quote, selectedText))
    .map((item) => [item.noteId, item])).values()]
  const summaryTarget = summary?.target ?? null

  const run = async (operation: (token: string, payload: NoteQuoteRequest) => Promise<string>) => {
    const token = session?.accessToken
    if (!token || !quote || isSaving) return
    setSaving(true)
    setError(null)
    try {
      onSaved(await operation(token, quote))
    } catch (caught) {
      setError(noteErrorMessage(caught))
      setSaving(false)
      return caught
    }
  }

  const create = async () => {
    if (titleProblem) {
      setTitleOpen(true)
      return
    }
    if (summary && quotedInto.current) {
      await addTo({ id: quotedInto.current.noteId })
      return
    }
    // Новый конспект сразу привязан к книге целиком и несёт первую выписку.
    const caught = await run(async (token, payload) => {
      const created = await createNote({
        title: title.trim(),
        body: summary ? '' : text.trim(),
        quote: payload,
        ...(summary ? { job_ids: [jobId] } : {}),
      }, { accessToken: token })
      const added = created.quotes[0]
      if (!summary || !added) return created.id
      // В конспекте цитата встаёт в текст, мысль — сразу под ней.
      quotedInto.current = { noteId: created.id, quote: added }
      await updateNote(created.id, { title: created.title, body: excerpt(added), version: created.version }, { accessToken: token })
      return created.id
    })
    // Название занято (у заметок оно уникально) — показываем поле, чтобы поменять.
    if (caught && isNoteConflict(caught)) setTitleOpen(true)
  }

  /** Выписка в конспект: цитата блоком в тексте, под ней мысль. */
  const excerpt = (added: NoteQuoteResponse) => appendToBody(
    quoteEmbed(added, quoteWhere(added.paragraph_index, t(added.side === 'SOURCE' ? 'panel.original' : 'panel.translation'))),
    text,
  )

  const addTo = (note: Pick<NoteSummary, 'id'>) => run(async (token, payload) => {
    let added = quotedInto.current?.noteId === note.id ? quotedInto.current.quote : null
    if (!added) {
      added = await addNoteQuote(note.id, payload, { accessToken: token })
      quotedInto.current = { noteId: note.id, quote: added }
    }
    const addition = summary ? excerpt(added) : text
    if (addition.trim()) {
      const current = await getNote(note.id, { accessToken: token })
      await updateNote(note.id, { title: current.title, body: appendToBody(current.body, addition), version: current.version },
        { accessToken: token })
    }
    return note.id
  })

  // Главное действие: в конспекте — дописать в текущий (или начать новый), иначе — новая заметка.
  const submit = () => (summaryTarget ? addTo(summaryTarget) : create())

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      if (canSave) void submit()
    }
  }

  const pairedLabel = t(selection.side === 'SOURCE' ? 'notes.showTranslation' : 'notes.showOriginal')

  return (
    <div className={styles.composer} aria-label={t(summary ? 'quote.summaryTitle' : 'quote.title')} role="group" onKeyDown={handleKeyDown}>
      <figure className={styles.quote}>
        <blockquote className={styles.quoteText}>{quote?.quote ?? selection.text.trim()}</blockquote>
        {quote?.paired_text ? (
          <>
            {isPairedShown ? <p id={`${ids}-paired`} className={styles.paired}>{quote.paired_text}</p> : null}
            <button
              type="button"
              className={styles.link}
              aria-expanded={isPairedShown}
              aria-controls={isPairedShown ? `${ids}-paired` : undefined}
              onClick={() => setPairedShown((value) => !value)}
            >
              {isPairedShown ? t('notes.quoteCollapse') : pairedLabel}
            </button>
          </>
        ) : null}
      </figure>
      {location.status === 'locating' ? <p className={styles.muted} role="status">{t('quote.locating')}</p> : null}
      {location.status === 'found' && location.truncated ? <p className={styles.muted}>{t('quote.truncated')}</p> : null}
      {location.status === 'notFound' || location.status === 'sourceRemoved' || location.status === 'failed' ? (
        <p className={styles.problem} role="alert">
          {t(location.status === 'notFound' ? 'quote.notFound' : location.status === 'sourceRemoved' ? 'quote.sourceRemoved' : 'quote.loadFailed')}
        </p>
      ) : null}

      {alreadyIn.length ? (
        <p className={styles.already}>
          {alreadyIn.map((item) => (
            <button key={item.noteId} type="button" className={styles.link} onClick={() => onOpenOther?.(item.noteId)}>
              {t(summary ? 'quote.alreadyInNote' : 'quote.alreadyInSummary', { title: item.noteTitle })}
            </button>
          ))}
        </p>
      ) : null}

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <textarea
          ref={thoughtRef}
          className={styles.thought}
          value={text}
          rows={3}
          placeholder={t('quote.thoughtPlaceholder')}
          aria-label={t('notes.bodyLabel')}
          onChange={(event) => setText(event.currentTarget.value)}
        />
        {summaryTarget ? (
          // Выписка идёт в существующий конспект: название не нужно, видно только куда.
          <p className={styles.titleLine}>
            <span className={styles.titleValue}>{t('quote.intoSummary', { title: summaryTarget.title })}</span>
          </p>
        ) : isTitleOpen ? (
          <label className={styles.titleField}>
            <span>{t('notes.titleLabel')}</span>
            <input
              ref={titleRef}
              value={title}
              maxLength={NOTE_TITLE_MAX_LENGTH + 20}
              aria-invalid={titleProblem ? true : undefined}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>
        ) : (
          <p className={styles.titleLine}>
            <span className={styles.titleValue}>{t('quote.autoTitle', { title: title.trim() })}</span>
            <button type="button" className={styles.link} aria-label={t('quote.renameTitle')} onClick={() => setTitleOpen(true)}>
              {t('quote.rename')}
            </button>
          </p>
        )}
        {isTitleOpen && titleProblem
          ? <span className={styles.problem}>{t(`notes.titleProblem.${titleProblem}`, { max: NOTE_TITLE_MAX_LENGTH })}</span> : null}
        {error ? <p className={styles.problem} role="alert"><NoteErrorText message={error} /></p> : null}
        <div className={styles.actions}>
          <button type="submit" className={styles.save} disabled={!canSave}>
            {isSaving ? t('quote.saving') : t(summaryTarget ? 'quote.addToSummary' : summary ? 'quote.startSummary' : 'quote.save')}
          </button>
          <kbd className={styles.hint}>{t('quote.saveHint')}</kbd>
          <button type="button" className={styles.cancel} onClick={onCancel} disabled={isSaving}>{t('common.cancel')}</button>
        </div>
      </form>

      {/* Выписка в конспект не ищет другую заметку: для этого есть «В заметку». */}
      {summary ? null : (
      <div className={styles.existing}>
        {paragraphNotes.map((note) => (
          <button key={note.id} type="button" className={styles.addTo} disabled={!canSave} onClick={() => void addTo(note)}>
            {t('quote.addTo', { title: note.title })}
          </button>
        ))}
        <button
          type="button"
          className={styles.link}
          aria-expanded={isPickerOpen}
          aria-controls={isPickerOpen ? `${ids}-picker` : undefined}
          onClick={() => setPickerOpen((value) => !value)}
        >
          {paragraphNotes.length ? t('quote.more') : t('quote.otherNote')}
        </button>
      </div>
      )}
      {isPickerOpen && !summary ? (
        <section id={`${ids}-picker`} className={styles.picker} aria-label={t('quote.otherNote')}>
          <input
            type="search"
            className={styles.search}
            value={search}
            placeholder={t('quote.searchNotes')}
            aria-label={t('quote.searchNotes')}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          {candidates.length ? (
            <ul className={styles.candidates}>
              {candidates.map((note) => (
                <li key={note.id}>
                  <button type="button" disabled={!canSave} onClick={() => void addTo(note)}>
                    <span>{note.title}</span>
                    {note.quote_count ? <small>{t('notes.quoteCount', { count: note.quote_count })}</small> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : found.status === 'ready' ? <p className={styles.muted}>{t('quote.noNotes')}</p> : null}
        </section>
      ) : null}
    </div>
  )
}

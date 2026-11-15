import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { NoteLinkResponse, NoteQuoteResponse, NoteSummary } from '../../api/contracts/notes.ts'
import { listNotes } from '../../api/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { caretCoordinates, openWikiLinkAt } from '../../notes/caretCoordinates.ts'
import type { NoteErrorMessage } from '../../notes/noteErrors.ts'
import { NOTE_BODY_MAX_LENGTH, NOTE_TITLE_MAX_LENGTH, noteTitleProblem } from '../../notes/noteSyntax.ts'
import { embeddedQuoteIds, quoteEmbed, quoteWhere } from '../../notes/quoteEmbeds.ts'
import { NoteContent } from './NoteContent.tsx'
import { NoteErrorText } from './NoteErrorText.tsx'
import styles from './NoteEditor.module.css'

/** Пауза перед запросом подсказок `[[`: не дёргать backend на каждую букву. */
export const NOTE_LINK_SUGGESTIONS_DELAY_MS = 150
const SUGGESTIONS_LIMIT = 8
/** Ширина списка подсказок; совпадает с `.suggestions` в CSS. */
const SUGGESTIONS_WIDTH = 300

interface NoteEditorProps {
  initialTitle: string
  initialBody: string
  /** Связи для превью: ссылки сохранённой версии; остальные `[[…]]` показываются заготовками. */
  knownLinks: readonly NoteLinkResponse[]
  submitLabel: string
  isSaving: boolean
  error: NoteErrorMessage | null
  /** Сообщение над формой: восстановленный черновик, конфликт версий. */
  notice?: ReactNode
  /** Между названием и текстом — цитаты заметки: при правке видно, к чему пишешь. */
  afterTitle?: ReactNode
  /** Цитаты заметки: кнопка «Цитата» вставляет любую из них в текст у курсора. */
  quotes?: readonly NoteQuoteResponse[]
  autoFocus?: 'title' | 'body'
  /** Узкая панель рядом с книгой: меньше заголовок и поле, без подсказки о клавишах. */
  compact?: boolean
  /**
   * Правка существующей заметки с автосохранением: вместо «Отмена / Сохранить» —
   * статус сохранения и «Готово». Esc и «Готово» возвращают к чтению.
   */
  autosave?: { status: ReactNode; onDone: () => void }
  onChange: (title: string, body: string) => void
  onSubmit: (title: string, body: string) => void
  onCancel: () => void
}

interface OpenLink { start: number; fragment: string; top: number; left: number }

export function NoteEditor(props: NoteEditorProps) {
  const { initialTitle, initialBody, isSaving, onChange, onSubmit, onCancel } = props
  const { t } = useTranslation()
  const { session } = useAuth()
  const id = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  // Выделение, которое поставить в поле после обновления текста (вставка ссылки, разметки).
  const pendingSelection = useRef<{ start: number; end: number; trackLink?: boolean } | null>(null)
  const [title, setTitle] = useState(initialTitle)
  const [body, setBody] = useState(initialBody)
  // Предпросмотр по кнопке-глазу: вкладки занимали строку ради редкого действия.
  const [isPreview, setPreview] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [link, setLink] = useState<OpenLink | null>(null)
  const [suggestions, setSuggestions] = useState<{ fragment: string; items: NoteSummary[] } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isQuoteMenuOpen, setQuoteMenuOpen] = useState(false)
  const quotePickerRef = useRef<HTMLSpanElement>(null)

  const titleProblem = noteTitleProblem(title)
  // «Пусто» показываем только после попытки сохранить: пустое поле при открытии — не ошибка.
  const visibleTitleProblem = titleProblem && (submitted || titleProblem !== 'empty') ? titleProblem : null
  const bodyTooLong = body.length > NOTE_BODY_MAX_LENGTH
  const isDirty = title !== initialTitle || body !== initialBody
  const shownSuggestions = link && suggestions?.fragment === link.fragment ? suggestions.items : null

  useEffect(() => {
    if (props.autoFocus === 'body') {
      // Правку начинают, чтобы продолжить мысль: курсор — в конец текста.
      const area = textareaRef.current
      area?.focus()
      area?.setSelectionRange(area.value.length, area.value.length)
    }
    else titleRef.current?.focus()
    // Фокус ставится один раз при открытии редактора.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Закрытие или перезагрузка вкладки с несохранённым текстом — браузер переспросит.
  const hasAutosave = Boolean(props.autosave)
  useEffect(() => {
    // С автосохранением предупреждает сеанс правки: он знает, сохранено ли.
    if (!isDirty || hasAutosave) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasAutosave, isDirty])

  useLayoutEffect(() => {
    const selection = pendingSelection.current
    const textarea = textareaRef.current
    if (selection === null || !textarea) return
    pendingSelection.current = null
    textarea.focus()
    textarea.setSelectionRange(selection.start, selection.end)
    if (selection.trackLink) trackLink(textarea)
    // trackLink читает текущее поле, отдельной зависимостью он не нужен.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body])

  // Поле растёт вместе с текстом, как страница: без рамки и без своей прокрутки.
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || isPreview) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [body, isPreview])

  // Список цитат закрывается щелчком мимо; открытый с клавиатуры — фокус на первой.
  useEffect(() => {
    if (!isQuoteMenuOpen) return
    const close = (event: PointerEvent) => {
      if (!quotePickerRef.current?.contains(event.target as Node)) setQuoteMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [isQuoteMenuOpen])

  const fragment = link?.fragment ?? null
  useEffect(() => {
    const token = session?.accessToken
    if (fragment === null || !token) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      listNotes({ prefix: fragment.trim() || undefined, size: SUGGESTIONS_LIMIT }, { accessToken: token, signal: controller.signal })
        .then((page) => { if (!controller.signal.aborted) setSuggestions({ fragment, items: page.items }) }, () => undefined)
    }, NOTE_LINK_SUGGESTIONS_DELAY_MS)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [fragment, session?.accessToken])

  const update = (nextTitle: string, nextBody: string) => {
    setTitle(nextTitle)
    setBody(nextBody)
    onChange(nextTitle, nextBody)
  }

  const submit = () => {
    setSubmitted(true)
    if (titleProblem || bodyTooLong || isSaving) return
    onSubmit(title.trim(), body)
  }

  const trackLink = (textarea: HTMLTextAreaElement) => {
    const context = textarea.selectionStart === textarea.selectionEnd
      ? openWikiLinkAt(textarea.value, textarea.selectionStart) : null
    if (!context) { setLink(null); return }
    const caret = caretCoordinates(textarea, context.start)
    // Новая ссылка — подсветка с первого варианта; уточнение той же ссылки выбор не сбрасывает.
    if (link?.start !== context.start) setActiveIndex(0)
    // У правого края поля список прижимается влево, а не уходит за границу.
    const left = Math.max(0, Math.min(caret.left, textarea.clientWidth - SUGGESTIONS_WIDTH))
    setLink({ ...context, top: textarea.offsetTop + caret.top + caret.height + 4, left: textarea.offsetLeft + left })
  }

  const insertLink = (noteTitle: string) => {
    const textarea = textareaRef.current
    if (!link || !textarea) return
    const caret = textarea.selectionStart
    const after = body.slice(caret)
    // `]]` уже стоит после курсора (поле дописали раньше) — не дублируем.
    const next = `${body.slice(0, link.start + 2)}${noteTitle}${after.startsWith(']]') ? '' : ']]'}${after}`
    const afterLink = link.start + 2 + noteTitle.length + 2
    pendingSelection.current = { start: afterLink, end: afterLink }
    setLink(null)
    update(title, next)
  }

  /**
   * Разметка вокруг выделения: **жирный**, *курсив*, [[ссылка]]. Без выделения —
   * пара знаков с курсором между ними; для ссылки сразу открываются подсказки.
   */
  const wrapSelection = (before: string, after: string, options: { trackLink?: boolean } = {}) => {
    const textarea = textareaRef.current
    if (!textarea) return
    setPreview(false)
    const { selectionStart: start, selectionEnd: end } = textarea
    const selected = body.slice(start, end)
    const next = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`
    pendingSelection.current = { start: start + before.length, end: start + before.length + selected.length, trackLink: options.trackLink }
    update(title, next)
  }
  /** Тег: «#» у курсора, с пробелом перед ним, если курсор прямо после слова. */
  const insertTag = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    setPreview(false)
    const start = textarea.selectionStart
    const prefix = start > 0 && !/\s/.test(body[start - 1]) ? ' #' : '#'
    const next = `${body.slice(0, start)}${prefix}${body.slice(textarea.selectionEnd)}`
    pendingSelection.current = { start: start + prefix.length, end: start + prefix.length }
    update(title, next)
  }
  /** Цитата отдельным блоком у курсора; курсор — после неё, чтобы сразу писать мысль. */
  const insertQuote = (quote: NoteQuoteResponse) => {
    const textarea = textareaRef.current
    if (!textarea) return
    setPreview(false)
    setQuoteMenuOpen(false)
    const before = body.slice(0, textarea.selectionStart).replace(/[ \t]+$/, '')
    const after = body.slice(textarea.selectionEnd).replace(/^[ \t]+/, '')
    const lead = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    const tail = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
    const side = t(quote.side === 'SOURCE' ? 'panel.original' : 'panel.translation')
    const head = `${before}${lead}${quoteEmbed(quote, quoteWhere(quote.paragraph_index, side))}${tail}`
    pendingSelection.current = { start: head.length, end: head.length }
    update(title, `${head}${after}`)
  }
  const moveInQuoteMenu = (event: KeyboardEvent<HTMLElement>) => {
    const items = [...(quotePickerRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setQuoteMenuOpen(false)
      textareaRef.current?.focus()
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length) {
      event.preventDefault()
      const isDown = event.key === 'ArrowDown'
      const next = index < 0 ? (isDown ? 0 : items.length - 1) : (index + (isDown ? 1 : items.length - 1)) % items.length
      items[next].focus()
    }
  }
  const inText = props.quotes?.length ? embeddedQuoteIds(body) : null

  const formatButtons = [
    { id: 'bold', label: t('notes.format.bold'), face: <b>Ж</b>, run: () => wrapSelection('**', '**') },
    { id: 'italic', label: t('notes.format.italic'), face: <i>К</i>, run: () => wrapSelection('*', '*') },
    { id: 'link', label: t('notes.format.link'), face: <span>[[ ]]</span>, run: () => wrapSelection('[[', ']]', { trackLink: true }) },
    { id: 'tag', label: t('notes.format.tag'), face: <span>#</span>, run: insertTag },
  ]

  const listboxId = `${id}-suggestions`
  const optionId = (index: number) => `${id}-suggestion-${index}`
  const isListOpen = Boolean(link && shownSuggestions)

  return (
    <form
      className={`${styles.editor} ${props.compact ? styles.compact : ''}`}
      aria-busy={isSaving}
      onSubmit={(event) => { event.preventDefault(); submit() }}
      onKeyDown={(event) => {
        const key = event.key.toLowerCase()
        if ((event.metaKey || event.ctrlKey) && key === 's') {
          event.preventDefault()
          submit()
        } else if ((event.metaKey || event.ctrlKey) && (key === 'b' || key === 'i') && event.target === textareaRef.current) {
          event.preventDefault()
          wrapSelection(key === 'b' ? '**' : '*', key === 'b' ? '**' : '*')
        } else if (event.key === 'Escape' && props.autosave) {
          // С автосохранением Esc — то же «Готово»: правка не теряется.
          event.preventDefault()
          props.autosave.onDone()
        } else if (event.key === 'Escape' && !isDirty && !isSaving) {
          // Без изменений Esc просто закрывает редактор; правку так не потерять.
          event.preventDefault()
          onCancel()
        }
      }}
    >
      {props.notice}
      <div className={styles.field}>
        {/* Название — тем же шрифтом, что при чтении; подпись — для экранного диктора. */}
        <input
          ref={titleRef}
          className={styles.titleInput}
          aria-label={t('notes.titleLabel')}
          value={title}
          maxLength={NOTE_TITLE_MAX_LENGTH + 20}
          placeholder={t('notes.titlePlaceholder')}
          aria-invalid={visibleTitleProblem ? true : undefined}
          aria-describedby={visibleTitleProblem ? `${id}-title-problem` : undefined}
          onChange={(event) => update(event.currentTarget.value, body)}
        />
        {visibleTitleProblem ? (
          <span id={`${id}-title-problem`} className={styles.problem}>
            {t(`notes.titleProblem.${visibleTitleProblem}`, { max: NOTE_TITLE_MAX_LENGTH })}
          </span>
        ) : null}
      </div>

      {props.afterTitle}

      <div className={styles.bodyArea}>
        <div className={styles.writePanel} hidden={isPreview}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={body}
            placeholder={t('notes.bodyPlaceholder')}
            aria-label={t('notes.bodyLabel')}
            aria-invalid={bodyTooLong ? true : undefined}
            aria-autocomplete="list"
            aria-expanded={isListOpen}
            aria-controls={isListOpen ? listboxId : undefined}
            aria-activedescendant={isListOpen && shownSuggestions?.length ? optionId(activeIndex) : undefined}
            onChange={(event) => { update(title, event.currentTarget.value); trackLink(event.currentTarget) }}
            onSelect={(event) => trackLink(event.currentTarget)}
            onBlur={() => setLink(null)}
            onKeyDown={(event) => {
              if (!link || event.nativeEvent.isComposing) return
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setLink(null)
                return
              }
              const count = shownSuggestions?.length ?? 0
              if (!count) return
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveIndex((index) => (index + (event.key === 'ArrowDown' ? 1 : count - 1)) % count)
              } else if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault()
                insertLink(shownSuggestions![Math.min(activeIndex, count - 1)].title)
              }
            }}
          />
          {link && shownSuggestions ? (
            <div className={styles.suggestions} style={{ top: link.top, left: link.left }}>
              <span className={styles.suggestionsTitle}>{t('notes.suggestions')}</span>
              {shownSuggestions.length ? (
                <ul id={listboxId} role="listbox" aria-label={t('notes.suggestions')}>
                  {shownSuggestions.map((note, index) => (
                    <li
                      key={note.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === activeIndex}
                      className={index === activeIndex ? styles.suggestionActive : undefined}
                      // mousedown, а не click: иначе поле потеряет фокус и позицию курсора раньше вставки.
                      onMouseDown={(event) => { event.preventDefault(); insertLink(note.title) }}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      {note.title}
                    </li>
                  ))}
                </ul>
              ) : <p className={styles.suggestionsEmpty}>{t('notes.suggestionsEmpty')}</p>}
            </div>
          ) : null}
        </div>
        <div id={`${id}-preview`} className={styles.previewPanel} hidden={!isPreview} aria-live="polite">
          {isPreview ? (body.trim()
            ? <NoteContent body={body} links={props.knownLinks} quotes={props.quotes} />
            : <p className={styles.previewEmpty}>{t('notes.previewEmpty')}</p>) : null}
        </div>
      </div>

      {bodyTooLong ? (
        <p className={styles.problem} role="alert">{t('notes.bodyTooLong', { max: NOTE_BODY_MAX_LENGTH.toLocaleString() })}</p>
      ) : body.length > NOTE_BODY_MAX_LENGTH * 0.8 ? (
        <p className={styles.counter}>{t('notes.bodyCounter', { count: body.length.toLocaleString(), max: NOTE_BODY_MAX_LENGTH.toLocaleString() })}</p>
      ) : null}
      {props.error ? <p className={styles.error} role="alert"><NoteErrorText message={props.error} /></p> : null}

      {/* Нижняя панель: разметка и предпросмотр слева, статус и главное действие справа. */}
      <div className={styles.actions}>
        <div className={styles.format} role="group" aria-label={t('notes.format.label')}>
          {formatButtons.map((button) => (
            <button
              key={button.id}
              type="button"
              className={styles.formatButton}
              aria-label={button.label}
              title={button.label}
              // mousedown, а не click: поле не теряет выделение до вставки разметки.
              onMouseDown={(event) => event.preventDefault()}
              onClick={button.run}
            >
              {button.face}
            </button>
          ))}
          {props.quotes?.length ? (
            <span ref={quotePickerRef} className={styles.quotePicker} onKeyDown={moveInQuoteMenu}>
              <button
                type="button"
                className={styles.formatButton}
                aria-label={t('notes.format.quote')}
                title={t('notes.format.quote')}
                aria-haspopup="menu"
                aria-expanded={isQuoteMenuOpen}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  setQuoteMenuOpen(!isQuoteMenuOpen)
                  // С клавиатуры (detail 0) фокус переходит в список, мышью — остаётся в тексте.
                  if (!isQuoteMenuOpen && event.detail === 0) {
                    window.requestAnimationFrame(() => quotePickerRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
                  }
                }}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 9.5c0-2.6 1.3-4.3 3.4-5M3 9.5h2.6v3H3zM9 9.5c0-2.6 1.3-4.3 3.4-5M9 9.5h2.6v3H9z" /></svg>
              </button>
              {isQuoteMenuOpen ? (
                <div className={styles.quoteMenu} role="menu" aria-label={t('notes.format.quotesTitle')}>
                  <span className={styles.suggestionsTitle}>{t('notes.format.quotesTitle')}</span>
                  {props.quotes.map((quote) => (
                    <button
                      key={quote.id}
                      type="button"
                      role="menuitem"
                      className={styles.quoteItem}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertQuote(quote)}
                    >
                      <span className={styles.quoteItemText}>{quote.quote}</span>
                      <span className={styles.quoteItemWhere}>
                        {quoteWhere(quote.paragraph_index, t(quote.side === 'SOURCE' ? 'panel.original' : 'panel.translation'))}
                        {inText?.has(quote.id) ? ` · ${t('notes.format.quoteInText')}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </span>
          ) : null}
          <button
            type="button"
            className={styles.formatButton}
            aria-label={t('notes.tabPreview')}
            title={t('notes.tabPreview')}
            aria-pressed={isPreview}
            aria-controls={`${id}-preview`}
            onClick={() => { setPreview(!isPreview); setLink(null) }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></svg>
          </button>
        </div>
        {props.autosave ? (
          <>
            <span className={styles.status} role="status">{props.autosave.status}</span>
            <button type="button" className={styles.secondary} onClick={props.autosave.onDone}>{t('notes.done')}</button>
          </>
        ) : (
          <>
            {!props.compact ? <span className={styles.hint}>{t('notes.shortcuts')}</span> : <span className={styles.status} />}
            <button type="button" className={styles.secondary} onClick={onCancel} disabled={isSaving}>{t('common.cancel')}</button>
            <button type="submit" className={styles.primary} disabled={isSaving}>
              {isSaving ? t('notes.saving') : props.submitLabel}
            </button>
          </>
        )}
      </div>
    </form>
  )
}

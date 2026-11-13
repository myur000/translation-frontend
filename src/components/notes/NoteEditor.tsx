import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { NoteLinkResponse, NoteSummary } from '../../api/contracts/notes.ts'
import { listNotes } from '../../api/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { caretCoordinates, openWikiLinkAt } from '../../notes/caretCoordinates.ts'
import type { NoteErrorMessage } from '../../notes/noteErrors.ts'
import { NOTE_BODY_MAX_LENGTH, NOTE_TITLE_MAX_LENGTH, noteTitleProblem } from '../../notes/noteSyntax.ts'
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
  autoFocus?: 'title' | 'body'
  /** Узкая панель рядом с книгой: меньше заголовок и поле, без подсказки о клавишах. */
  compact?: boolean
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
  const pendingCaret = useRef<number | null>(null)
  const [title, setTitle] = useState(initialTitle)
  const [body, setBody] = useState(initialBody)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [submitted, setSubmitted] = useState(false)
  const [link, setLink] = useState<OpenLink | null>(null)
  const [suggestions, setSuggestions] = useState<{ fragment: string; items: NoteSummary[] } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const titleProblem = noteTitleProblem(title)
  // «Пусто» показываем только после попытки сохранить: пустое поле при открытии — не ошибка.
  const visibleTitleProblem = titleProblem && (submitted || titleProblem !== 'empty') ? titleProblem : null
  const bodyTooLong = body.length > NOTE_BODY_MAX_LENGTH
  const isDirty = title !== initialTitle || body !== initialBody
  const shownSuggestions = link && suggestions?.fragment === link.fragment ? suggestions.items : null

  useEffect(() => {
    if (props.autoFocus === 'body') textareaRef.current?.focus()
    else titleRef.current?.focus()
    // Фокус ставится один раз при открытии редактора.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Закрытие или перезагрузка вкладки с несохранённым текстом — браузер переспросит.
  useEffect(() => {
    if (!isDirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  useLayoutEffect(() => {
    const caret = pendingCaret.current
    const textarea = textareaRef.current
    if (caret === null || !textarea) return
    pendingCaret.current = null
    textarea.focus()
    textarea.setSelectionRange(caret, caret)
  }, [body])

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
    pendingCaret.current = link.start + 2 + noteTitle.length + 2
    setLink(null)
    update(title, next)
  }

  const listboxId = `${id}-suggestions`
  const optionId = (index: number) => `${id}-suggestion-${index}`
  const isListOpen = Boolean(link && shownSuggestions)

  return (
    <form
      className={`${styles.editor} ${props.compact ? styles.compact : ''}`}
      aria-busy={isSaving}
      onSubmit={(event) => { event.preventDefault(); submit() }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
          event.preventDefault()
          submit()
        } else if (event.key === 'Escape' && !isDirty && !isSaving) {
          // Без изменений Esc просто закрывает редактор; правку так не потерять.
          event.preventDefault()
          onCancel()
        }
      }}
    >
      {props.notice}
      <label className={styles.field}>
        <span className={styles.label}>{t('notes.titleLabel')}</span>
        <input
          ref={titleRef}
          className={styles.titleInput}
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
      </label>

      <div className={styles.tabs} role="tablist" aria-label={t('notes.editorMode')}>
        {(['write', 'preview'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${id}-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`${id}-panel-${value}`}
            className={tab === value ? styles.tabActive : undefined}
            onClick={() => { setTab(value); setLink(null) }}
          >
            {t(value === 'write' ? 'notes.tabWrite' : 'notes.tabPreview')}
          </button>
        ))}
      </div>

      <div className={styles.bodyArea}>
        <div id={`${id}-panel-write`} role="tabpanel" aria-labelledby={`${id}-tab-write`} hidden={tab !== 'write'} className={styles.writePanel}>
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
        <div id={`${id}-panel-preview`} role="tabpanel" aria-labelledby={`${id}-tab-preview`} hidden={tab !== 'preview'} className={styles.previewPanel}>
          {tab === 'preview' ? (body.trim()
            ? <NoteContent body={body} links={props.knownLinks} />
            : <p className={styles.previewEmpty}>{t('notes.previewEmpty')}</p>) : null}
        </div>
      </div>

      {bodyTooLong ? (
        <p className={styles.problem} role="alert">{t('notes.bodyTooLong', { max: NOTE_BODY_MAX_LENGTH.toLocaleString() })}</p>
      ) : body.length > NOTE_BODY_MAX_LENGTH * 0.8 ? (
        <p className={styles.counter}>{t('notes.bodyCounter', { count: body.length.toLocaleString(), max: NOTE_BODY_MAX_LENGTH.toLocaleString() })}</p>
      ) : null}
      {props.error ? <p className={styles.error} role="alert"><NoteErrorText message={props.error} /></p> : null}

      <div className={styles.actions}>
        {!props.compact ? <span className={styles.hint}>{t('notes.shortcuts')}</span> : null}
        <button type="button" className={styles.secondary} onClick={onCancel} disabled={isSaving}>{t('common.cancel')}</button>
        <button type="submit" className={styles.primary} disabled={isSaving}>
          {isSaving ? t('notes.saving') : props.submitLabel}
        </button>
      </div>
    </form>
  )
}

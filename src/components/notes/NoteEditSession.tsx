import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import type { NoteLinkResponse, NoteResponse } from '../../api/contracts/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { NoteErrorMessage } from '../../notes/noteErrors.ts'
import { noteTitleProblem } from '../../notes/noteSyntax.ts'
import { saveNoteChecked } from '../../notes/saveNote.ts'
import { useNotes } from '../../notes/useNotes.ts'
import { NoteEditor } from './NoteEditor.tsx'
import styles from './NotesPage.module.css'
import { GlyphIcon } from '../ui/GlyphIcon.tsx'

/** Пауза в наборе, после которой правка сохраняется сама. */
export const NOTE_AUTOSAVE_DELAY_MS = 1000

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'waitTitle'

interface NoteEditSessionProps {
  note: NoteResponse
  knownLinks: readonly NoteLinkResponse[]
  compact?: boolean
  /** Между названием и текстом (цитаты заметки). */
  afterTitle?: ReactNode
  /** Каждое удачное сохранение: родитель показывает новую версию, правка продолжается. */
  onSaved: (note: NoteResponse) => void
  /** Пользователь выбрал актуальную версию после конфликта. */
  onLatest: (note: NoteResponse) => void
  /** Правка закончена («Готово», Esc); `hasSaved` — сохранялось ли что-нибудь. */
  onClose: (hasSaved: boolean) => void
}

/**
 * Правка существующей заметки с автосохранением: через секунду после паузы в
 * наборе правка уходит на сервер. Сохранения идут по одному: следующее ждёт
 * предыдущее и берёт его новую версию. Без корректного названия сохранение
 * ждёт. Черновик живёт в памяти вкладки, пока не сохранён, — его не теряют ни
 * закрытие редактора, ни переход на другую заметку. Конфликт с другим окном
 * останавливает автосохранение и предлагает выбор. Общая для страницы заметки,
 * колонки и карточек на полях книги.
 */
export function NoteEditSession({ note, knownLinks, compact = false, afterTitle, onSaved, onLatest, onClose }: NoteEditSessionProps) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const { drafts, notesChanged } = useNotes()
  const [restored] = useState(() => drafts.get(note.id))
  const [showRestoredNotice, setShowRestoredNotice] = useState(Boolean(restored))
  const [editorRevision, setEditorRevision] = useState(0)
  const [status, setStatus] = useState<SaveStatus>(restored ? 'pending' : 'idle')
  const [error, setError] = useState<NoteErrorMessage | null>(null)
  const [conflict, setConflict] = useState<NoteResponse | null>(null)
  // С чего начинается редактор; меняется, когда он перезапускается (взята актуальная версия, сброшен черновик).
  const [initial, setInitial] = useState(() => drafts.get(note.id) ?? { title: note.title, body: note.body })
  // Восстановленный черновик мог начаться со старой версии: тогда сохранение уйдёт в конфликт.
  const baseVersion = useRef(restored?.baseVersion ?? note.version)
  const current = useRef({ title: initial.title, body: initial.body })
  const saved = useRef({ title: note.title, body: note.body })
  const hasSaved = useRef(false)
  const timer = useRef(0)
  const inFlight = useRef<Promise<boolean> | null>(null)
  const isConflict = useRef(false)
  // Правили ли текст в этой сессии и закрыта ли она через «Готово» (тогда всё уже сохранено).
  const hasEdited = useRef(false)
  const isFinished = useRef(false)

  // Несохранённая правка — браузер переспросит при закрытии вкладки.
  useEffect(() => {
    if (status !== 'pending' && status !== 'saving' && status !== 'waitTitle') return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status])

  const isSaved = () => current.current.title.trim() === saved.current.title && current.current.body === saved.current.body

  /** Сохранить то, что сейчас в редакторе. `true` — на сервере то же, что в редакторе. */
  const save = async (version?: number): Promise<boolean> => {
    // Сохранения по одному: следующее берёт версию, которую вернуло предыдущее.
    if (inFlight.current) await inFlight.current
    const token = session?.accessToken
    if (!token || isConflict.current) return false
    const { title, body } = current.current
    if (noteTitleProblem(title)) {
      setStatus('waitTitle')
      return false
    }
    if (version === undefined && isSaved()) return true
    setStatus('saving')
    setError(null)
    const request = (async () => {
      const result = await saveNoteChecked(note.id, { title: title.trim(), body, version: version ?? baseVersion.current }, token)
      if (result.kind === 'saved') {
        baseVersion.current = result.note.version
        saved.current = { title: result.note.title, body: result.note.body }
        hasSaved.current = true
        onSaved(result.note)
        if (isSaved()) drafts.clear(note.id)
        else drafts.set(note.id, { ...current.current, baseVersion: result.note.version })
        setStatus(isSaved() ? 'saved' : 'pending')
        return isSaved()
      }
      if (result.kind === 'conflict') {
        isConflict.current = true
        setConflict(result.latest)
      } else {
        setError(result.message)
      }
      setStatus('pending')
      return false
    })()
    inFlight.current = request
    try {
      return await request
    } finally {
      inFlight.current = null
    }
  }

  const finish = async () => {
    window.clearTimeout(timer.current)
    if (!(await save())) return
    drafts.clear(note.id)
    isFinished.current = true
    // Списки, метки и карточки перечитываются один раз — когда правка закончена.
    if (hasSaved.current) notesChanged()
    onClose(hasSaved.current)
  }

  // Редактор закрыли, не дождавшись автосохранения (клик мимо карточки, переход по
  // ссылке): последняя правка уходит на сервер сразу, а не остаётся только черновиком,
  // и списки с карточками перечитываются — иначе заметка выглядит несохранённой.
  const flushOnClose = useEffectEvent(() => {
    window.clearTimeout(timer.current)
    if (isFinished.current) return
    // Восстановленный черновик, который не трогали, молча не отправляется: он остаётся черновиком.
    const hasPending = hasEdited.current && !isConflict.current && !isSaved()
    if (!hasPending) {
      if (hasSaved.current) notesChanged()
      return
    }
    void save().then(() => { if (hasSaved.current) notesChanged() })
  })
  useEffect(() => () => flushOnClose(), [])

  const statusText = {
    idle: t('notes.autosave.idle'),
    pending: t('notes.autosave.pending'),
    saving: t('notes.autosave.saving'),
    saved: t('notes.autosave.saved'),
    waitTitle: t('notes.autosave.waitTitle'),
  }[status]

  const notice = conflict ? (
    <div className={`${styles.notice} ${styles.noticeWarning}`} role="alert">
      <span><GlyphIcon name="warning" /> <strong>{t('notes.conflictTitle')}</strong> {t('notes.conflictDescription')}</span>
      <span className={styles.noticeActions}>
        <button type="button" onClick={() => {
          onLatest(conflict)
          drafts.clear(note.id)
          baseVersion.current = conflict.version
          current.current = { title: conflict.title, body: conflict.body }
          saved.current = { title: conflict.title, body: conflict.body }
          setInitial({ title: conflict.title, body: conflict.body })
          isConflict.current = false
          setConflict(null)
          setStatus('saved')
          setEditorRevision((value) => value + 1)
        }}>{t('notes.conflictUseLatest')}</button>
        <button type="button" disabled={status === 'saving'} onClick={() => {
          isConflict.current = false
          setConflict(null)
          void save(conflict.version)
        }}>{t('notes.conflictOverwrite')}</button>
      </span>
    </div>
  ) : showRestoredNotice ? (
    <div className={styles.notice} role="status">
      <span>{t('notes.draftRestored')}</span>
      <button type="button" onClick={() => {
        drafts.clear(note.id)
        window.clearTimeout(timer.current)
        current.current = { title: note.title, body: note.body }
        baseVersion.current = note.version
        setInitial({ title: note.title, body: note.body })
        setShowRestoredNotice(false)
        setStatus('idle')
        setEditorRevision((value) => value + 1)
      }}>{t('notes.draftDiscard')}</button>
    </div>
  ) : null

  return (
    <NoteEditor
      key={editorRevision}
      initialTitle={initial.title}
      initialBody={initial.body}
      knownLinks={knownLinks}
      submitLabel={t('notes.save')}
      isSaving={status === 'saving'}
      error={error}
      notice={notice}
      afterTitle={afterTitle}
      compact={compact}
      autoFocus="body"
      autosave={{ status: statusText, onDone: () => void finish() }}
      onChange={(title, body) => {
        hasEdited.current = true
        current.current = { title, body }
        if (title === saved.current.title && body === saved.current.body) drafts.clear(note.id)
        else drafts.set(note.id, { title, body, baseVersion: baseVersion.current })
        setStatus('pending')
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => void save(), NOTE_AUTOSAVE_DELAY_MS)
      }}
      // Ctrl/⌘ + S — сохранить сейчас, не дожидаясь паузы.
      onSubmit={() => {
        window.clearTimeout(timer.current)
        void save()
      }}
      onCancel={() => void finish()}
    />
  )
}

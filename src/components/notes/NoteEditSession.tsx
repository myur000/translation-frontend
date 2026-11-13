import { useRef, useState } from 'react'
import type { NoteLinkResponse, NoteResponse } from '../../api/contracts/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { NoteErrorMessage } from '../../notes/noteErrors.ts'
import { saveNoteChecked } from '../../notes/saveNote.ts'
import { useNotes } from '../../notes/useNotes.ts'
import { NoteEditor } from './NoteEditor.tsx'
import styles from './NotesPage.module.css'

interface NoteEditSessionProps {
  note: NoteResponse
  knownLinks: readonly NoteLinkResponse[]
  compact?: boolean
  /** Сохранено: родитель показывает новую версию и закрывает правку. */
  onSaved: (note: NoteResponse) => void
  /** Пользователь выбрал актуальную версию после конфликта. */
  onLatest: (note: NoteResponse) => void
  onClose: () => void
}

/**
 * Правка существующей заметки: черновик, версия, от которой начата правка,
 * конфликт с другим окном. Общая для страницы заметки и панели рядом с книгой —
 * черновик одной заметки виден в обоих местах.
 */
export function NoteEditSession({ note, knownLinks, compact = false, onSaved, onLatest, onClose }: NoteEditSessionProps) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const { drafts, notesChanged } = useNotes()
  const [restored] = useState(() => drafts.get(note.id))
  const [showRestoredNotice, setShowRestoredNotice] = useState(Boolean(restored))
  // Восстановленный черновик мог начаться со старой версии: тогда сохранение уйдёт в конфликт.
  const [baseVersion, setBaseVersion] = useState(restored?.baseVersion ?? note.version)
  const [editorRevision, setEditorRevision] = useState(0)
  const [isSaving, setSaving] = useState(false)
  const [error, setError] = useState<NoteErrorMessage | null>(null)
  const [conflict, setConflict] = useState<NoteResponse | null>(null)
  const edited = useRef<{ title: string; body: string } | null>(null)
  const initial = drafts.get(note.id) ?? { title: note.title, body: note.body }

  const save = async (title: string, body: string, version: number) => {
    const token = session?.accessToken
    if (!token) return
    setSaving(true)
    setError(null)
    const result = await saveNoteChecked(note.id, { title, body, version }, token)
    setSaving(false)
    if (result.kind === 'saved') {
      drafts.clear(note.id)
      notesChanged()
      onSaved(result.note)
    } else if (result.kind === 'conflict') {
      setConflict(result.latest)
    } else {
      setError(result.message)
    }
  }

  const notice = conflict ? (
    <div className={`${styles.notice} ${styles.noticeWarning}`} role="alert">
      <span><strong>{t('notes.conflictTitle')}</strong> {t('notes.conflictDescription')}</span>
      <span className={styles.noticeActions}>
        <button type="button" onClick={() => {
          onLatest(conflict)
          drafts.clear(note.id)
          edited.current = null
          setBaseVersion(conflict.version)
          setConflict(null)
          setEditorRevision((value) => value + 1)
        }}>{t('notes.conflictUseLatest')}</button>
        <button type="button" disabled={isSaving} onClick={() => {
          const mine = edited.current ?? initial
          void save(mine.title.trim(), mine.body, conflict.version)
        }}>{t('notes.conflictOverwrite')}</button>
      </span>
    </div>
  ) : showRestoredNotice ? (
    <div className={styles.notice} role="status">
      <span>{t('notes.draftRestored')}</span>
      <button type="button" onClick={() => {
        drafts.clear(note.id)
        edited.current = null
        setShowRestoredNotice(false)
        setBaseVersion(note.version)
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
      isSaving={isSaving}
      error={error}
      notice={notice}
      compact={compact}
      autoFocus="body"
      onChange={(title, body) => {
        edited.current = { title, body }
        if (title === note.title && body === note.body) drafts.clear(note.id)
        else drafts.set(note.id, { title, body, baseVersion })
      }}
      onSubmit={(title, body) => void save(title, body, baseVersion)}
      onCancel={() => {
        drafts.clear(note.id)
        onClose()
      }}
    />
  )
}

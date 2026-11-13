import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { createNote } from '../../api/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { noteErrorMessage, type NoteErrorMessage } from '../../notes/noteErrors.ts'
import { notesSearch, readNotesQuery } from '../../notes/notesQuery.ts'
import { useNotes } from '../../notes/useNotes.ts'
import { NoteEditor } from './NoteEditor.tsx'
import styles from './NotesPage.module.css'

/** `/notes/new`: новая заметка. `?title=` приходит из ссылки-заготовки `[[Название]]`. */
export function NoteCreateView() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { items, drafts, notesChanged } = useNotes()
  const presetTitle = new URLSearchParams(location.search).get('title')?.trim() ?? ''
  const search = notesSearch(readNotesQuery(location.search))
  const draftKey = `new:${presetTitle}`
  const [draft] = useState(() => drafts.get(draftKey))
  const [isSaving, setSaving] = useState(false)
  const [error, setError] = useState<NoteErrorMessage | null>(null)
  const [restoredDraft, setRestoredDraft] = useState(Boolean(draft))
  const [editorRevision, setEditorRevision] = useState(0)
  const knownLinks = items.map((item) => ({ title: item.title, note_id: item.id }))
  const initial = (editorRevision === 0 ? draft : undefined) ?? { title: presetTitle, body: '' }

  const create = async (title: string, body: string) => {
    const token = session?.accessToken
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const note = await createNote({ title, body }, { accessToken: token })
      drafts.clear(draftKey)
      notesChanged()
      void navigate(`/notes/${encodeURIComponent(note.id)}${search}`, { replace: true })
    } catch (caught) {
      setError(noteErrorMessage(caught))
      setSaving(false)
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.editorColumn}>
        <p className={styles.eyebrow}>{t('notes.newTitle')}</p>
        <NoteEditor
          key={editorRevision}
          initialTitle={initial.title}
          initialBody={initial.body}
          knownLinks={knownLinks}
          submitLabel={t('notes.create')}
          isSaving={isSaving}
          error={error}
          autoFocus={presetTitle ? 'body' : 'title'}
          notice={restoredDraft ? (
            <div className={styles.notice} role="status">
              <span>{t('notes.draftRestored')}</span>
              <button type="button" onClick={() => {
                drafts.clear(draftKey)
                setRestoredDraft(false)
                setEditorRevision((value) => value + 1)
              }}>{t('notes.draftDiscard')}</button>
            </div>
          ) : null}
          onChange={(title, body) => {
            if (title.trim() === presetTitle && !body) drafts.clear(draftKey)
            else drafts.set(draftKey, { title, body, baseVersion: null })
          }}
          onSubmit={(title, body) => void create(title, body)}
          onCancel={() => {
            drafts.clear(draftKey)
            void navigate(`/notes${search}`)
          }}
        />
      </div>
    </section>
  )
}

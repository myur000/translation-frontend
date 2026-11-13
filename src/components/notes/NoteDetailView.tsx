import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { deleteNote } from '../../api/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { noteErrorMessage } from '../../notes/noteErrors.ts'
import { notesSearch, readNotesQuery } from '../../notes/notesQuery.ts'
import { useNote } from '../../notes/useNote.ts'
import { useNotes } from '../../notes/useNotes.ts'
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx'
import { NoteAside } from './NoteAside.tsx'
import { NoteContent } from './NoteContent.tsx'
import { NoteEditSession } from './NoteEditSession.tsx'
import { NoteErrorText } from './NoteErrorText.tsx'
import styles from './NotesPage.module.css'

/** `/notes/:noteId`: просмотр и правка заметки. Монтируется заново для каждой заметки (key). */
export function NoteDetailView({ noteId }: { noteId: string }) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const search = notesSearch(readNotesQuery(location.search))
  const { items, drafts, notesChanged } = useNotes()
  const { state, backlinks, reload, applySaved } = useNote(noteId)
  // Есть несохранённый черновик — заметка открывается сразу в режиме правки.
  const [isEditing, setEditing] = useState(() => Boolean(drafts.get(noteId)))
  const [deleteState, setDeleteState] = useState<{ busy: boolean; error: string | null } | null>(null)

  if (state.status === 'loading') {
    return <section className={styles.page}><p className={styles.state} role="status">{t('notes.loading')}</p></section>
  }
  if (state.status === 'error') {
    return (
      <section className={styles.page}>
        <div className={styles.state} role="alert">
          <span><NoteErrorText message={state.message} /></span>
          <div className={styles.stateActions}>
            <button type="button" onClick={reload}>{t('notes.retry')}</button>
            <Link to={`/notes${search}`}>{t('notes.backToList')}</Link>
          </div>
        </div>
      </section>
    )
  }

  const note = state.note
  const knownLinks = [...note.links, ...items.map((item) => ({ title: item.title, note_id: item.id }))]

  const remove = async () => {
    const token = session?.accessToken
    if (!token) return
    setDeleteState({ busy: true, error: null })
    try {
      await deleteNote(noteId, { accessToken: token })
      drafts.clear(noteId)
      notesChanged()
      void navigate(`/notes${search}`, { replace: true })
    } catch (caught) {
      const message = noteErrorMessage(caught)
      setDeleteState({ busy: false, error: message.kind === 'key' ? t(message.key) : message.text })
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.detail}>
        <article className={styles.main}>
          {isEditing ? (
            <NoteEditSession
              note={note}
              knownLinks={knownLinks}
              onSaved={(saved) => { applySaved(saved); setEditing(false) }}
              onLatest={applySaved}
              onClose={() => setEditing(false)}
            />
          ) : (
            <>
              <header className={styles.noteHeader}>
                <h1>{note.title}</h1>
                <div className={styles.noteActions}>
                  <button type="button" className={styles.primaryButton} onClick={() => setEditing(true)}>{t('notes.edit')}</button>
                  <button type="button" className={styles.dangerButton} onClick={() => setDeleteState({ busy: false, error: null })}>
                    {t('notes.delete')}
                  </button>
                </div>
              </header>
              {note.body.trim()
                ? <NoteContent body={note.body} links={note.links} />
                : <p className={styles.state}>{t('notes.emptyBody')}</p>}
            </>
          )}
        </article>
        <NoteAside note={note} backlinks={backlinks} search={search} />
      </div>
      {deleteState ? (
        <ConfirmDialog
          title={t('notes.deleteTitle')}
          description={t('notes.deleteDescription', { title: note.title })}
          confirmLabel={t('notes.delete')}
          busy={deleteState.busy}
          error={deleteState.error}
          onConfirm={() => void remove()}
          onClose={() => setDeleteState(null)}
        />
      ) : null}
    </section>
  )
}

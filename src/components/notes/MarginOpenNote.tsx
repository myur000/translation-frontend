import { useState } from 'react'
import type { NoteResponse } from '../../api/contracts/notes.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { NoteContent } from './NoteContent.tsx'
import { NoteEditSession } from './NoteEditSession.tsx'
import styles from './MarginNotes.module.css'

export interface OpenNoteProps {
  note: NoteResponse
  isEditing: boolean
  onEdit: () => void
  onDone: () => void
  /** Каждое автосохранение: карточка и метки сразу показывают новую версию. */
  onSaved?: (note: NoteResponse) => void
}

/**
 * Раскрытая заметка: текст целиком (до половины экрана) и правка на месте. Клик по
 * тексту, «Дописать…» или карандаш открывают редактор с курсором в конце; черновик
 * и конфликт версий — те же, что на странице заметки (`NoteEditSession`).
 */
export function OpenNote({ note, isEditing, onEdit, onDone, onSaved }: OpenNoteProps) {
  const { t } = useTranslation()
  // После конфликта пользователь может взять актуальную версию — до перечитывания цитат она здесь.
  const [latest, setLatest] = useState<NoteResponse | null>(null)
  const current = latest && latest.version > note.version ? latest : note

  if (isEditing) {
    return (
      <div className={styles.open}>
        <NoteEditSession
          note={current}
          knownLinks={current.links}
          compact
          onSaved={(saved) => {
            setLatest(saved)
            onSaved?.(saved)
          }}
          onLatest={(latestNote) => {
            setLatest(latestNote)
            onSaved?.(latestNote)
          }}
          onClose={onDone}
        />
      </div>
    )
  }

  return (
    <div className={styles.open}>
      <h3 className={styles.title}>{current.title}</h3>
      {current.body.trim() ? (
        <div
          className={`${styles.body} ${styles.editable}`}
          title={t('marginNotes.editHint')}
          onClick={(event) => {
            // Ссылки в тексте ведут по ссылке, а не в правку.
            if ((event.target as Element).closest('a')) return
            onEdit()
          }}
        >
          <NoteContent body={current.body} links={current.links} />
        </div>
      ) : null}
      <button type="button" className={styles.appendField} onClick={onEdit}>{t('marginNotes.appendPlaceholder')}</button>
    </div>
  )
}

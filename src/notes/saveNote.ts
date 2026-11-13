import type { NoteResponse, NoteUpdateRequest } from '../api/contracts/notes.ts'
import { getNote, updateNote } from '../api/notes.ts'
import { isNoteConflict, noteErrorMessage, type NoteErrorMessage } from './noteErrors.ts'

export type NoteSaveResult =
  | { kind: 'saved'; note: NoteResponse }
  /** Заметку изменили в другом окне: `latest` — актуальная версия с сервера. */
  | { kind: 'conflict'; latest: NoteResponse }
  | { kind: 'error'; message: NoteErrorMessage }

/**
 * Сохраняет правку и различает причины `409`. У backend нет машинного кода:
 * «изменили в другом окне», «название занято» и «лимит» отличаются только
 * текстом. Версию сверяем сами — это надёжнее разбора сообщения.
 */
export async function saveNoteChecked(noteId: string, request: NoteUpdateRequest, accessToken: string): Promise<NoteSaveResult> {
  try {
    return { kind: 'saved', note: await updateNote(noteId, request, { accessToken }) }
  } catch (error) {
    if (isNoteConflict(error)) {
      const latest = await getNote(noteId, { accessToken }).catch(() => null)
      if (latest && latest.version !== request.version) return { kind: 'conflict', latest }
    }
    return { kind: 'error', message: noteErrorMessage(error) }
  }
}

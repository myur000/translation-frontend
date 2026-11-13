import { ApiClientError } from '../api/client.ts'
import type { TranslationKey } from '../i18n/translations.ts'

export type NoteErrorMessage =
  | { kind: 'key'; key: TranslationKey }
  /** Текст сервера: точнее любого общего сообщения (лимит, занятое название, правило названия). */
  | { kind: 'server'; text: string }

/** Сообщение об ошибке операции с заметкой. */
export function noteErrorMessage(error: unknown): NoteErrorMessage {
  if (!(error instanceof ApiClientError)) return { kind: 'key', key: 'notes.error.network' }
  if (error.status === 403) return { kind: 'key', key: 'notes.error.verifyEmail' }
  if (error.status === 404) return { kind: 'key', key: 'notes.error.notFound' }
  const serverText = error.details?.message?.trim()
  if ((error.status === 400 || error.status === 409) && serverText) return { kind: 'server', text: serverText }
  if (error.status === 429) return { kind: 'key', key: 'notes.error.rateLimited' }
  return { kind: 'key', key: 'notes.error.generic' }
}

export function isNoteConflict(error: unknown) {
  return error instanceof ApiClientError && error.status === 409
}

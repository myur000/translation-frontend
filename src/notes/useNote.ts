import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { NoteResponse } from '../api/contracts/notes.ts'
import { getNote, getNoteBacklinks } from '../api/notes.ts'
import { noteErrorMessage, type NoteErrorMessage } from './noteErrors.ts'
import { noteKeys, useNotesAccess, useRememberNote } from './noteQueries.ts'

export type NoteState =
  | { status: 'loading' }
  | { status: 'ready'; note: NoteResponse }
  | { status: 'error'; message: NoteErrorMessage }

/**
 * Одна заметка и её обратные ссылки. Заметка из кэша показывается сразу и при
 * каждом открытии перечитывается в фоне. Обратные ссылки зависят от названия
 * (связь хранится по названию), поэтому перечитываются и после переименования.
 */
export function useNote(noteId: string | null) {
  const { owner, token } = useNotesAccess()
  const remember = useRememberNote()
  const note = useQuery({
    queryKey: noteKeys.note(owner, noteId ?? ''),
    queryFn: ({ signal }) => getNote(noteId!, { accessToken: token!, signal }),
    enabled: Boolean(noteId && token),
    staleTime: 0,
  })
  const title = note.data?.title ?? null
  const backlinks = useQuery({
    queryKey: noteKeys.backlinks(owner, noteId ?? '', title ?? ''),
    // Обратные ссылки — дополнение: заметка остаётся доступной и без них.
    queryFn: ({ signal }) => getNoteBacklinks(noteId!, { accessToken: token!, signal }).catch(() => []),
    enabled: Boolean(noteId && token && title !== null),
    staleTime: 0,
  })

  const state: NoteState = note.data ? { status: 'ready', note: note.data }
    : note.isError && !note.isFetching ? { status: 'error', message: noteErrorMessage(note.error) }
      : { status: 'loading' }
  const { refetch } = note

  return {
    state,
    backlinks: backlinks.data ?? null,
    reload: useCallback(() => void refetch(), [refetch]),
    /** Принимает ответ сохранения как текущую версию, не перечитывая заметку. */
    applySaved: remember,
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { NoteReference, NoteResponse } from '../api/contracts/notes.ts'
import { getNote, getNoteBacklinks } from '../api/notes.ts'
import { useAuth } from '../auth/useAuth.ts'
import { noteErrorMessage, type NoteErrorMessage } from './noteErrors.ts'

export type NoteState =
  | { status: 'loading' }
  | { status: 'ready'; note: NoteResponse }
  | { status: 'error'; message: NoteErrorMessage }

/**
 * Одна заметка и её обратные ссылки. Обратные ссылки зависят от названия
 * (связь хранится по названию), поэтому перечитываются и после переименования.
 */
export function useNote(noteId: string | null) {
  const { session } = useAuth()
  const tokenRef = useRef(session?.accessToken)
  const [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState<{ key: string; state: NoteState } | null>(null)
  const [backlinks, setBacklinks] = useState<{ key: string; items: NoteReference[] } | null>(null)
  useEffect(() => { tokenRef.current = session?.accessToken }, [session?.accessToken])

  const key = `${session?.email ?? ''}\n${noteId ?? ''}\n${revision}`
  useEffect(() => {
    const token = tokenRef.current
    if (!noteId || !token) return
    const controller = new AbortController()
    getNote(noteId, { accessToken: token, signal: controller.signal }).then((note) => {
      if (!controller.signal.aborted) setLoaded({ key, state: { status: 'ready', note } })
    }, (error: unknown) => {
      if (!controller.signal.aborted) setLoaded({ key, state: { status: 'error', message: noteErrorMessage(error) } })
    })
    return () => controller.abort()
  }, [key, noteId])

  const state: NoteState = loaded?.key === key ? loaded.state : { status: 'loading' }
  const title = state.status === 'ready' ? state.note.title : null
  const backlinksKey = `${key}\n${title ?? ''}`
  useEffect(() => {
    const token = tokenRef.current
    if (!noteId || !token || title === null) return
    const controller = new AbortController()
    getNoteBacklinks(noteId, { accessToken: token, signal: controller.signal }).then((items) => {
      if (!controller.signal.aborted) setBacklinks({ key: backlinksKey, items })
    }, () => {
      // Обратные ссылки — дополнение: заметка остаётся доступной и без них.
      if (!controller.signal.aborted) setBacklinks({ key: backlinksKey, items: [] })
    })
    return () => controller.abort()
  }, [backlinksKey, noteId, title])

  /** Принимает ответ сохранения как текущую версию, не перечитывая заметку. */
  const applySaved = useCallback((note: NoteResponse) => {
    setLoaded({ key, state: { status: 'ready', note } })
  }, [key])

  return {
    state,
    backlinks: backlinks?.key === backlinksKey ? backlinks.items : null,
    reload: useCallback(() => setRevision((value) => value + 1), []),
    applySaved,
  }
}

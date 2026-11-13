import { useEffect, useRef, useState } from 'react'
import type { NoteListQuery, NoteSummary } from '../api/contracts/notes.ts'
import { listNotes } from '../api/notes.ts'
import { useAuth } from '../auth/useAuth.ts'

export interface NotesListState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  items: NoteSummary[]
  total: number
}

/**
 * Список заметок по запросу (`null` — не загружать). Пока идёт новый запрос,
 * на экране остаётся прежний результат: поиск не мигает пустым списком.
 */
export function useNotesList(query: NoteListQuery | null, revision: number): NotesListState {
  const { session } = useAuth()
  const tokenRef = useRef(session?.accessToken)
  const [loaded, setLoaded] = useState<{ key: string; state: NotesListState } | null>(null)
  useEffect(() => { tokenRef.current = session?.accessToken }, [session?.accessToken])
  const key = query ? `${session?.email ?? ''}\n${JSON.stringify(query)}\n${revision}` : null

  useEffect(() => {
    const token = tokenRef.current
    if (!key || !query || !token) return
    const controller = new AbortController()
    listNotes(query, { accessToken: token, signal: controller.signal }).then((page) => {
      if (!controller.signal.aborted) setLoaded({ key, state: { status: 'ready', items: page.items, total: page.total_elements } })
    }, () => {
      if (!controller.signal.aborted) setLoaded({ key, state: { status: 'error', items: [], total: 0 } })
    })
    return () => controller.abort()
    // query описан ключом: объект запроса создаётся заново на каждом рендере.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!key) return { status: 'idle', items: [], total: 0 }
  if (loaded?.key === key) return loaded.state
  return loaded?.state.status === 'ready' ? loaded.state : { status: 'loading', items: [], total: 0 }
}

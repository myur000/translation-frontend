import { useEffect, useRef, useState } from 'react'
import type { NoteSummary } from '../api/contracts/notes.ts'
import { listNotes } from '../api/notes.ts'
import { useAuth } from '../auth/useAuth.ts'
import type { NotesTree } from './notesTree.ts'
import { useNotesGraph } from './useNotesGraph.ts'

/** Сколько заметок читаем ради отрывков и «Недавних»; дерево строится по графу целиком. */
export const SIDEBAR_NOTES_LIMIT = 100
/** Пауза после ввода в поиске, чтобы не слать запрос на каждую букву. */
export const SIDEBAR_SEARCH_DELAY_MS = 250

export type NotesSidebarData =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; tree: NotesTree; recent: NoteSummary[] }

export type NotesSidebarResults =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: NoteSummary[] }

interface Loaded<T> { key: string; value: T }

/**
 * Данные панели заметок в боковой панели: дерево из общего графа заметок
 * (`useNotesGraph`) и последние заметки (для отрывков и вида «Недавние»), а при
 * поиске или выбранном теге — найденные
 * заметки. Ничего не грузится, пока панель ни разу не открыли (`enabled`).
 * Перечитывается после любой правки заметок (`revision`).
 */
export function useNotesSidebar(enabled: boolean, revision: number, query: string, tag: string) {
  const { session } = useAuth()
  const tokenRef = useRef(session?.accessToken)
  useEffect(() => { tokenRef.current = session?.accessToken }, [session?.accessToken])
  const owner = session?.email ?? ''
  const [attempt, setAttempt] = useState(0)
  const { graph, retry: retryGraph } = useNotesGraph(enabled)
  const [recent, setRecent] = useState<Loaded<NoteSummary[] | null> | null>(null)
  const [results, setResults] = useState<Loaded<NotesSidebarResults> | null>(null)

  const dataKey = enabled ? `${owner}\n${revision}\n${attempt}` : null
  useEffect(() => {
    const token = tokenRef.current
    if (!dataKey || !token) return
    const controller = new AbortController()
    listNotes({ page: 0, size: SIDEBAR_NOTES_LIMIT }, { accessToken: token, signal: controller.signal }).then(
      (page) => { if (!controller.signal.aborted) setRecent({ key: dataKey, value: page.items }) },
      // null — ошибка загрузки.
      () => { if (!controller.signal.aborted) setRecent({ key: dataKey, value: null }) },
    )
    return () => controller.abort()
  }, [dataKey])

  const needle = query.trim()
  const resultsKey = enabled && (needle || tag) ? `${owner}\n${revision}\n${attempt}\n${needle}\n${tag}` : null
  useEffect(() => {
    const token = tokenRef.current
    if (!resultsKey || !token) return
    const controller = new AbortController()
    // Тег выбирают кликом — без паузы; поиск ждёт, пока человек допечатает.
    const timer = window.setTimeout(() => {
      listNotes({ q: needle || undefined, tag: tag || undefined, page: 0, size: SIDEBAR_NOTES_LIMIT },
        { accessToken: token, signal: controller.signal }).then(
        (page) => { if (!controller.signal.aborted) setResults({ key: resultsKey, value: { status: 'ready', items: page.items } }) },
        () => { if (!controller.signal.aborted) setResults({ key: resultsKey, value: { status: 'error' } }) },
      )
    }, needle ? SIDEBAR_SEARCH_DELAY_MS : 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [needle, resultsKey, tag])

  // При перечитывании после правки прежний список остаётся на месте и не мигает.
  // При повторе после ошибки показываем загрузку, а не прежнюю ошибку.
  const recentShown = recent && (recent.key === dataKey || recent.value) ? recent.value : undefined
  const data: NotesSidebarData = graph.status === 'error' || recentShown === null ? { status: 'error' }
    : graph.status === 'ready' && recentShown ? { status: 'ready', tree: graph.tree, recent: recentShown }
      : { status: 'loading' }

  return {
    data,
    results: !resultsKey
      ? { status: 'idle' } as NotesSidebarResults
      : results?.key === resultsKey ? results.value : { status: 'loading' } as NotesSidebarResults,
    retry: () => {
      setAttempt((value) => value + 1)
      if (graph.status === 'error') retryGraph()
    },
  }
}

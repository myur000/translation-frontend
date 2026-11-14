import { useEffect, useRef, useState } from 'react'
import type { NoteSummary } from '../api/contracts/notes.ts'
import { getNoteGraph, listNotes } from '../api/notes.ts'
import { useAuth } from '../auth/useAuth.ts'
import { buildNotesTree, type NotesTree } from './notesTree.ts'

/** Сколько заметок читаем ради подписей и «Недавних»; дерево строится по графу целиком. */
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
 * Данные панели заметок в боковой панели: дерево из графа и последние заметки
 * (для подписей и вида «Недавние»), а при поиске или выбранном теге — найденные
 * заметки. Ничего не грузится, пока панель ни разу не открыли (`enabled`).
 * Перечитывается после любой правки заметок (`revision`).
 */
export function useNotesSidebar(enabled: boolean, revision: number, query: string, tag: string) {
  const { session } = useAuth()
  const tokenRef = useRef(session?.accessToken)
  useEffect(() => { tokenRef.current = session?.accessToken }, [session?.accessToken])
  const owner = session?.email ?? ''
  const [attempt, setAttempt] = useState(0)
  const [data, setData] = useState<Loaded<NotesSidebarData> | null>(null)
  const [results, setResults] = useState<Loaded<NotesSidebarResults> | null>(null)

  const dataKey = enabled ? `${owner}\n${revision}\n${attempt}` : null
  useEffect(() => {
    const token = tokenRef.current
    if (!dataKey || !token) return
    const controller = new AbortController()
    const options = { accessToken: token, signal: controller.signal }
    Promise.all([
      getNoteGraph(['document', 'tag', 'missing'], options),
      listNotes({ page: 0, size: SIDEBAR_NOTES_LIMIT }, options),
    ]).then(
      ([graph, page]) => {
        if (!controller.signal.aborted) setData({ key: dataKey, value: { status: 'ready', tree: buildNotesTree(graph), recent: page.items } })
      },
      () => { if (!controller.signal.aborted) setData({ key: dataKey, value: { status: 'error' } }) },
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

  return {
    // При перечитывании после правки прежнее дерево остаётся на месте и не мигает.
    // При повторе после ошибки показываем загрузку, а не прежнюю ошибку.
    data: data && (data.key === dataKey || data.value.status === 'ready') ? data.value : { status: 'loading' } as NotesSidebarData,
    results: !resultsKey
      ? { status: 'idle' } as NotesSidebarResults
      : results?.key === resultsKey ? results.value : { status: 'loading' } as NotesSidebarResults,
    retry: () => setAttempt((value) => value + 1),
  }
}

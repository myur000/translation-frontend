import { useQuery } from '@tanstack/react-query'
import type { NoteSummary } from '../api/contracts/notes.ts'
import { listNotes } from '../api/notes.ts'
import type { NotesTree } from './notesTree.ts'
import { noteKeys, useNotesAccess } from './noteQueries.ts'
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

const RECENT_QUERY = { page: 0, size: SIDEBAR_NOTES_LIMIT }

/** Пауза, которую прерывает отмена запроса: новая буква в поиске отменяет прежний. */
function pause(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

/**
 * Данные панели заметок в боковой панели: дерево из общего графа заметок
 * (`useNotesGraph`) и последние заметки (для отрывков и вида «Недавние»), а при
 * поиске или выбранном теге — найденные заметки. Ничего не грузится, пока панель
 * ни разу не открыли (`enabled`). После правки заметок всё перечитывается само.
 */
export function useNotesSidebar(enabled: boolean, query: string, tag: string) {
  const { owner, token } = useNotesAccess()
  const { graph, retry: retryGraph } = useNotesGraph(enabled)
  const recent = useQuery({
    queryKey: noteKeys.list(owner, RECENT_QUERY),
    queryFn: ({ signal }) => listNotes(RECENT_QUERY, { accessToken: token!, signal }),
    enabled: enabled && Boolean(token),
  })

  const needle = query.trim()
  const isSearching = enabled && Boolean(needle || tag)
  const results = useQuery({
    queryKey: noteKeys.search(owner, needle, tag),
    queryFn: async ({ signal }) => {
      // Тег выбирают кликом — без паузы; поиск ждёт, пока человек допечатает.
      if (needle) await pause(SIDEBAR_SEARCH_DELAY_MS, signal)
      return listNotes({ q: needle || undefined, tag: tag || undefined, page: 0, size: SIDEBAR_NOTES_LIMIT },
        { accessToken: token!, signal })
    },
    enabled: isSearching && Boolean(token),
  })

  // При перечитывании после правки прежний список остаётся на месте и не мигает.
  // При повторе после ошибки — загрузка, а не прежняя ошибка.
  const data: NotesSidebarData = graph.status === 'error' || (recent.isError && !recent.data && !recent.isFetching) ? { status: 'error' }
    : graph.status === 'ready' && recent.data ? { status: 'ready', tree: graph.tree, recent: recent.data.items }
      : { status: 'loading' }

  return {
    data,
    results: (!isSearching ? { status: 'idle' }
      : results.data ? { status: 'ready', items: results.data.items }
        : results.isError && !results.isFetching ? { status: 'error' } : { status: 'loading' }) as NotesSidebarResults,
    retry: () => {
      void recent.refetch()
      if (isSearching) void results.refetch()
      if (graph.status === 'error') retryGraph()
    },
  }
}

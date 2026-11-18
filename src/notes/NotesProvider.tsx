import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import type { NoteGraphResponse, NoteSummary } from '../api/contracts/notes.ts'
import { getNoteGraph, listNotes } from '../api/notes.ts'
import { NotesContext, type NoteDraft, type NoteDrafts, type NotesContextValue, type NotesGraphState, type NoteTagCount } from './NotesContext.ts'
import { noteKeys, useNotesAccess, useNotesChanged } from './noteQueries.ts'
import { NOTES_GRAPH_TYPES, NOTES_PAGE_SIZE, tagCounts } from './noteTags.ts'
import { isNotesPath, readNotesQuery } from './notesQuery.ts'
import { buildNotesTree } from './notesTree.ts'

const NO_NOTES: NoteSummary[] = []
const NO_TAGS: NoteTagCount[] = []

/** Дерево и теги строятся один раз на ответ графа, а не на каждый рендер. */
function readGraph(response: NoteGraphResponse) {
  return { tree: buildNotesTree(response), tags: tagCounts(response), response }
}

/**
 * Список заметок для раздела `/notes`. Фильтры берутся из адреса; запросы идут
 * только на маршрутах заметок. При смене фильтра или обновлении прежний список
 * остаётся на экране до ответа — без мигания пустого состояния.
 *
 * Здесь же граф заметок (`NOTES_GRAPH_TYPES`) — один запрос на всё приложение:
 * из него теги раздела, дерево панели заметок и книги на главной.
 */
export function NotesProvider({ children }: { children: ReactNode }) {
  const { owner, token } = useNotesAccess()
  const location = useLocation()
  const enabled = Boolean(token) && isNotesPath(location.pathname)
  const query = useMemo(() => readNotesQuery(location.search), [location.search])
  const [isGraphWanted, setGraphWanted] = useState(false)
  const notesChanged = useNotesChanged()

  const list = useInfiniteQuery({
    queryKey: noteKeys.section(owner, query.q, query.tag),
    queryFn: ({ pageParam, signal }) => listNotes(
      { q: query.q || undefined, tag: query.tag || undefined, page: pageParam, size: NOTES_PAGE_SIZE },
      { accessToken: token!, signal },
    ),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (pages.reduce((sum, page) => sum + page.items.length, 0) < last.total_elements
      ? pages.length : undefined),
    enabled,
    placeholderData: keepPreviousData,
  })

  // Граф один на всё приложение: раньше его отдельно запрашивали теги раздела,
  // панель заметок и главная — на странице `/notes` выходило три одинаковых запроса.
  const graph = useQuery({
    queryKey: noteKeys.graph(owner),
    queryFn: ({ signal }) => getNoteGraph([...NOTES_GRAPH_TYPES], { accessToken: token!, signal }),
    select: readGraph,
    enabled: Boolean(token) && (enabled || isGraphWanted),
  })

  const requestNotesGraph = useCallback(() => setGraphWanted(true), [])
  const { refetch: refetchGraph } = graph
  const retryNotesGraph = useCallback(() => void refetchGraph(), [refetchGraph])
  const { refetch: refetchList, fetchNextPage, hasNextPage, isFetchingNextPage } = list
  const retry = useCallback(() => void refetchList(), [refetchList])
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])
  // Не в sessionStorage: личные тексты не стоит оставлять в хранилище браузера.
  // Провайдер живёт, пока открыт сеанс, — этого хватает для переходов внутри приложения.
  const draftStore = useRef(new Map<string, NoteDraft>())
  const drafts = useMemo<NoteDrafts>(() => ({
    get: (draftKey) => draftStore.current.get(`${owner}\n${draftKey}`),
    set: (draftKey, draft) => { draftStore.current.set(`${owner}\n${draftKey}`, draft) },
    clear: (draftKey) => { draftStore.current.delete(`${owner}\n${draftKey}`) },
  }), [owner])

  const pages = list.data?.pages
  const items = useMemo(() => {
    if (!pages) return NO_NOTES
    // Пока листали, заметка могла сдвинуться между страницами: дубликаты отбрасываем.
    const seen = new Set<string>()
    return pages.flatMap((page) => page.items).filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)))
  }, [pages])
  const total = pages?.at(-1)?.total_elements ?? 0
  const status = !enabled ? 'idle'
    : pages ? 'ready'
      : list.isError && !list.isFetching ? 'error' : 'loading'
  // После правки прежний граф остаётся на экране до ответа — без мигания. После ошибки
  // повтор показывает загрузку, а не прежнюю ошибку.
  const isGraphOn = Boolean(token) && (enabled || isGraphWanted)
  const graphData = graph.data
  const isGraphFailed = graph.isError && !graph.isFetching
  const notesGraph = useMemo<NotesGraphState>(() => (!isGraphOn ? { status: 'idle' }
    : graphData ? { status: 'ready', tree: graphData.tree, response: graphData.response }
      : isGraphFailed ? { status: 'error' } : { status: 'loading' }), [graphData, isGraphFailed, isGraphOn])

  const value = useMemo<NotesContextValue>(() => ({
    query,
    items,
    total,
    status,
    hasMore: Boolean(hasNextPage) && !list.isPlaceholderData,
    isLoadingMore: isFetchingNextPage,
    loadMore,
    retry,
    tags: graphData?.tags ?? NO_TAGS,
    notesChanged,
    notesGraph,
    requestNotesGraph,
    retryNotesGraph,
    drafts,
  }), [drafts, graphData?.tags, hasNextPage, isFetchingNextPage, items, list.isPlaceholderData, loadMore, notesChanged, notesGraph, query, requestNotesGraph, retry, retryNotesGraph, status, total])

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
}

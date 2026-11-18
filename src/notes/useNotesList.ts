import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { NoteListQuery, NoteSummary } from '../api/contracts/notes.ts'
import { listNotes } from '../api/notes.ts'
import { noteKeys, useNotesAccess } from './noteQueries.ts'

export interface NotesListState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  items: NoteSummary[]
  total: number
  retry: () => void
}

const NO_ITEMS: NoteSummary[] = []

/**
 * Список заметок по запросу (`null` — не загружать). Пока идёт новый запрос,
 * на экране остаётся прежний результат: поиск не мигает пустым списком. После
 * правки заметок список перечитывается сам (`useNotesChanged`).
 */
export function useNotesList(query: NoteListQuery | null): NotesListState {
  const { owner, token } = useNotesAccess()
  const result = useQuery({
    queryKey: noteKeys.list(owner, query ?? {}),
    queryFn: ({ signal }) => listNotes(query!, { accessToken: token!, signal }),
    enabled: Boolean(query && token),
    placeholderData: keepPreviousData,
  })
  const retry = () => void result.refetch()
  if (!query) return { status: 'idle', items: NO_ITEMS, total: 0, retry }
  if (result.data) return { status: 'ready', items: result.data.items, total: result.data.total_elements, retry }
  // Повтор после ошибки показывает загрузку, а не прежнюю ошибку.
  return { status: result.isError && !result.isFetching ? 'error' : 'loading', items: NO_ITEMS, total: 0, retry }
}

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import type { NoteSummary } from '../api/contracts/notes.ts'
import { getNoteGraph, listNotes } from '../api/notes.ts'
import { useAuth } from '../auth/useAuth.ts'
import { NotesContext, type NoteDraft, type NoteDrafts, type NotesContextValue, type NoteTagCount } from './NotesContext.ts'
import { NOTES_PAGE_SIZE, tagCounts } from './noteTags.ts'
import { isNotesPath, readNotesQuery } from './notesQuery.ts'


interface LoadedList {
  key: string
  status: 'ready' | 'error'
  items: NoteSummary[]
  total: number
  pages: number
}

/**
 * Список заметок для раздела `/notes`. Фильтры берутся из адреса; запросы идут
 * только на маршрутах заметок. При смене фильтра или обновлении прежний список
 * остаётся на экране до ответа — без мигания пустого состояния.
 */
export function NotesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const location = useLocation()
  const enabled = Boolean(session) && isNotesPath(location.pathname)
  const query = useMemo(() => readNotesQuery(location.search), [location.search])
  const tokenRef = useRef(session?.accessToken)
  const [revision, setRevision] = useState(0)
  const [list, setList] = useState<LoadedList | null>(null)
  const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null)
  const [tags, setTags] = useState<{ key: string; tags: NoteTagCount[] } | null>(null)
  useEffect(() => { tokenRef.current = session?.accessToken }, [session?.accessToken])

  const owner = session?.email ?? ''
  const listKey = `${owner}\n${query.q}\n${query.tag}\n${revision}`
  const tagsKey = `${owner}\n${revision}`

  useEffect(() => {
    const token = tokenRef.current
    if (!enabled || !token) return
    const controller = new AbortController()
    listNotes(
      { q: query.q || undefined, tag: query.tag || undefined, page: 0, size: NOTES_PAGE_SIZE },
      { accessToken: token, signal: controller.signal },
    ).then((page) => {
      if (!controller.signal.aborted) {
        setList({ key: listKey, status: 'ready', items: page.items, total: page.total_elements, pages: 1 })
      }
    }, () => {
      if (!controller.signal.aborted) setList({ key: listKey, status: 'error', items: [], total: 0, pages: 0 })
    })
    return () => controller.abort()
  }, [enabled, listKey, query.q, query.tag])

  useEffect(() => {
    const token = tokenRef.current
    if (!enabled || !token) return
    const controller = new AbortController()
    getNoteGraph(['tag'], { accessToken: token, signal: controller.signal }).then((graph) => {
      if (!controller.signal.aborted) setTags({ key: tagsKey, tags: tagCounts(graph) })
    }, () => {
      // Теги — вспомогательный фильтр: без них список заметок полностью работает.
      if (!controller.signal.aborted) setTags({ key: tagsKey, tags: [] })
    })
    return () => controller.abort()
  }, [enabled, tagsKey])

  const loadMore = useCallback(() => {
    const token = tokenRef.current
    if (!token || !list || list.key !== listKey || list.status !== 'ready' || loadingMoreKey === listKey) return
    setLoadingMoreKey(listKey)
    listNotes(
      { q: query.q || undefined, tag: query.tag || undefined, page: list.pages, size: NOTES_PAGE_SIZE },
      { accessToken: token },
    ).then((page) => {
      setList((current) => current?.key !== listKey ? current : {
        ...current,
        // Пока листали, заметка могла сдвинуться между страницами: дубликаты отбрасываем.
        items: [...current.items, ...page.items.filter((item) => !current.items.some((known) => known.id === item.id))],
        total: page.total_elements,
        pages: current.pages + 1,
      })
    }, () => undefined).finally(() => setLoadingMoreKey((current) => current === listKey ? null : current))
  }, [list, listKey, loadingMoreKey, query.q, query.tag])

  const notesChanged = useCallback(() => setRevision((value) => value + 1), [])
  // Не в sessionStorage: личные тексты не стоит оставлять в хранилище браузера.
  // Провайдер живёт, пока открыт сеанс, — этого хватает для переходов внутри приложения.
  const draftStore = useRef(new Map<string, NoteDraft>())
  const drafts = useMemo<NoteDrafts>(() => ({
    get: (draftKey) => draftStore.current.get(`${owner}\n${draftKey}`),
    set: (draftKey, draft) => { draftStore.current.set(`${owner}\n${draftKey}`, draft) },
    clear: (draftKey) => { draftStore.current.delete(`${owner}\n${draftKey}`) },
  }), [owner])

  const value = useMemo<NotesContextValue>(() => {
    const current = list?.key === listKey ? list : null
    const status = !enabled ? 'idle'
      : current ? current.status
        : list?.status === 'ready' ? 'ready' : 'loading'
    const shown = current ?? (list?.status === 'ready' ? list : null)
    return {
      query,
      items: shown?.items ?? [],
      total: shown?.total ?? 0,
      status,
      hasMore: Boolean(current && current.items.length < current.total),
      isLoadingMore: loadingMoreKey === listKey,
      loadMore,
      retry: notesChanged,
      tags: tags?.tags ?? [],
      notesChanged,
      drafts,
    }
  }, [drafts, enabled, list, listKey, loadMore, loadingMoreKey, notesChanged, query, tags])

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
}

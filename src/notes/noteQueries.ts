import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { NoteListQuery, NoteResponse } from '../api/contracts/notes.ts'
import { useAuth } from '../auth/useAuth.ts'

/**
 * Ключи кэша заметок. Все начинаются с `['notes', email]`: правка заметок помечает
 * устаревшим всё сразу, а выход из аккаунта очищает кэш целиком (`QueryProvider`).
 */
export const noteKeys = {
  all: (owner: string) => ['notes', owner] as const,
  /** Список по запросу `GET /notes` (боковая панель, заметки книги в колонке, поиск). */
  list: (owner: string, query: NoteListQuery) => ['notes', owner, 'list', query] as const,
  /** Список раздела с подгрузкой страниц. */
  section: (owner: string, q: string, tag: string) => ['notes', owner, 'section', { q, tag }] as const,
  /** Поиск в боковой панели: ждёт, пока человек допечатает. */
  search: (owner: string, q: string, tag: string) => ['notes', owner, 'search', { q, tag }] as const,
  graph: (owner: string) => ['notes', owner, 'graph'] as const,
  note: (owner: string, noteId: string) => ['notes', owner, 'note', noteId] as const,
  backlinks: (owner: string, noteId: string, title: string) => ['notes', owner, 'backlinks', noteId, title] as const,
  /** Цитаты и конспекты открытой книги. */
  book: (owner: string, jobId: string) => ['notes', owner, 'book', jobId] as const,
}

/** Кому принадлежат данные и чем их запрашивать. */
export function useNotesAccess() {
  const { session } = useAuth()
  return { owner: session?.email ?? '', token: session?.accessToken ?? null }
}

/**
 * После создания, правки или удаления заметки. Списки, граф и заметки книги на
 * экране перечитываются; одинаковый ответ не меняет ссылок на данные, поэтому
 * ничего не перерисовывается. Открытые заметки только помечаются устаревшими: их
 * может править открытый редактор, а свежую версию он получает из ответа сохранения.
 */
export function useNotesChanged() {
  const queryClient = useQueryClient()
  const { owner } = useNotesAccess()
  return useCallback(() => {
    const isNote = (key: readonly unknown[]) => key[2] === 'note' || key[2] === 'backlinks'
    void queryClient.invalidateQueries({ queryKey: noteKeys.all(owner), predicate: (query) => !isNote(query.queryKey) })
    void queryClient.invalidateQueries({ queryKey: noteKeys.all(owner), predicate: (query) => isNote(query.queryKey), refetchType: 'none' })
  }, [owner, queryClient])
}

/** Сохранённая версия заметки — сразу всем, кто её показывает (страница, панель, поля). */
export function useRememberNote() {
  const queryClient = useQueryClient()
  const { owner } = useNotesAccess()
  return useCallback((note: NoteResponse) => {
    queryClient.setQueryData(noteKeys.note(owner, note.id), note)
  }, [owner, queryClient])
}

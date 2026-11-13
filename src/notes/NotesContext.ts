import { createContext } from 'react'
import type { NoteSummary } from '../api/contracts/notes.ts'
import type { NotesQuery } from './notesQuery.ts'

export type NotesListStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface NoteTagCount {
  tag: string
  /** Сколько заметок с этим тегом. */
  count: number
}

/** Несохранённая правка: живёт в памяти вкладки, пока открыт раздел приложения. */
export interface NoteDraft {
  title: string
  body: string
  /** Версия, от которой начата правка; `null` — новая заметка. */
  baseVersion: number | null
}

export interface NoteDrafts {
  get: (key: string) => NoteDraft | undefined
  set: (key: string, draft: NoteDraft) => void
  clear: (key: string) => void
}

export interface NotesContextValue {
  query: NotesQuery
  items: NoteSummary[]
  total: number
  /** `loading` — только первая загрузка; при обновлении остаётся прежний список. */
  status: NotesListStatus
  hasMore: boolean
  isLoadingMore: boolean
  loadMore: () => void
  retry: () => void
  tags: NoteTagCount[]
  /** Вызывается после создания, изменения или удаления: список и теги перечитываются. */
  notesChanged: () => void
  /** Черновики по ключу заметки (`new` или id): правка не теряется при переходе к другой заметке. */
  drafts: NoteDrafts
}

export const NotesContext = createContext<NotesContextValue | null>(null)

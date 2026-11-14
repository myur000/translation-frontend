import { createContext } from 'react'
import type { NoteSummary } from '../api/contracts/notes.ts'
import type { NotesQuery } from './notesQuery.ts'
import type { NotesTree } from './notesTree.ts'

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

/**
 * Граф заметок — книги, теги и несозданные `[[ссылки]]`. Один на приложение:
 * его берут главная раздела, панель в боковой панели и теги раздела.
 */
export type NotesGraphState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; tree: NotesTree }

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
  /** Растёт при каждом `notesChanged`: по нему перечитывают заметки и вне раздела (метки на полях). */
  revision: number
  /** Граф заметок; на страницах раздела грузится сам, вне раздела — после `requestNotesGraph`. */
  notesGraph: NotesGraphState
  /** Граф нужен и вне раздела (панель заметок открыта): дальше он перечитывается после правок. */
  requestNotesGraph: () => void
  retryNotesGraph: () => void
  /** Черновики по ключу заметки (`new` или id): правка не теряется при переходе к другой заметке. */
  drafts: NoteDrafts
}

export const NotesContext = createContext<NotesContextValue | null>(null)

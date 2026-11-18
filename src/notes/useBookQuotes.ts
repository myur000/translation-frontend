import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { NoteResponse } from '../api/contracts/notes.ts'
import { loadDocumentText, type DocumentText } from '../api/documentText.ts'
import { loadBookNotes, noteBookQuotes, withParagraphTexts, type BookNotes } from './bookQuotes.ts'
import { noteKeys, useNotesAccess } from './noteQueries.ts'

const NO_NOTES: BookNotes = { quotes: [], aboutBook: [] }

/** Заметки книги и признак, что они уже загружены (пустой список ≠ «ещё грузится»). */
export interface LoadedBookNotes extends BookNotes {
  /** Заметки прочитаны при этом открытии книги (по ним можно переходить по ссылке). */
  isLoaded: boolean
  /**
   * Сохранённая заметка сразу заменяет свою прежнюю версию в цитатах и конспектах:
   * карточки и метки не ждут, пока заметки книги перечитаются целиком.
   */
  upsertNote: (note: NoteResponse) => void
}

interface BookNotesData {
  notes: BookNotes
  /** Текст книги с сервера: по нему цитата находит свой абзац (`paragraphText`). */
  text: DocumentText | null
}

/**
 * Цитаты и конспекты открытой книги для меток и заметок на полях (`null` — не
 * загружать). Перечитываются после правки заметок (`useNotesChanged`); пока идёт
 * перечитывание, прежние метки остаются на месте. Ошибка не мешает читать: меток
 * и карточек просто нет. Текст книги грузится рядом (он кэшируется на сеанс);
 * если он недоступен, цитаты ищутся по номеру абзаца.
 */
export function useBookNotes(jobId: string | null): LoadedBookNotes {
  const { owner, token } = useNotesAccess()
  const queryClient = useQueryClient()
  const key = noteKeys.book(owner, jobId ?? '')
  const result = useQuery({
    queryKey: key,
    queryFn: async ({ signal }): Promise<BookNotesData> => {
      const options = { accessToken: token!, signal }
      // Без текста книги метки всё равно встают — по номеру абзаца, только менее точно.
      const [notes, text] = await Promise.all([loadBookNotes(jobId!, options), loadDocumentText(jobId!, options).catch(() => null)])
      return { text, notes: { ...notes, quotes: withParagraphTexts(notes.quotes, text) } }
    },
    enabled: Boolean(jobId && token),
  })

  const upsertNote = useCallback((note: NoteResponse) => {
    if (!jobId) return
    queryClient.setQueryData(noteKeys.note(owner, note.id), note)
    queryClient.setQueryData<BookNotesData>(noteKeys.book(owner, jobId), (current) => {
      if (!current) return current
      const quotes = [
        ...current.notes.quotes.filter((quote) => quote.noteId !== note.id),
        ...withParagraphTexts(noteBookQuotes(note, jobId), current.text),
      ]
      const isAboutBook = note.documents?.some((document) => document.job_id === jobId) ?? false
      const others = current.notes.aboutBook.filter((item) => item.id !== note.id)
      const aboutBook = isAboutBook
        ? [...others, note].sort((first, second) => first.title.localeCompare(second.title))
        : others
      return { ...current, notes: { quotes, aboutBook } }
    })
  }, [jobId, owner, queryClient])

  if (!jobId) return { ...NO_NOTES, isLoaded: false, upsertNote }
  return {
    ...(result.data?.notes ?? NO_NOTES),
    isLoaded: result.isFetchedAfterMount && !result.isFetching,
    upsertNote,
  }
}

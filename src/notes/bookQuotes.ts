import type { NoteQuoteSide, NoteResponse } from '../api/contracts/notes.ts'
import { getNote, listNotes } from '../api/notes.ts'
import type { AuthenticatedApiCallOptions } from '../api/client.ts'

/** Цитата из открытой книги вместе с заметкой, в которой она лежит. */
export interface BookQuote {
  id: string
  noteId: string
  noteTitle: string
  side: NoteQuoteSide
  paragraphIndex: number
  quote: string
  /** Абзац другой колонки: по нему цитата находится, когда её колонка скрыта. */
  pairedText: string | null
  /** Заметка целиком (её и так читаем ради цитат): текст и версия для карточек на полях. */
  note: NoteResponse
}

/** Сколько заметок книги читаем ради меток; больше — редкость, а запросы дорогие. */
export const BOOK_NOTES_LIMIT = 100
/** Одновременных запросов заметок: не забиваем соединение, пока грузится книга. */
const PARALLEL_REQUESTS = 4

/** Заметки книги, которые нужны рабочей области: цитаты (для меток и карточек) и заметки о книге целиком. */
export interface BookNotes {
  quotes: BookQuote[]
  /** Конспекты: заметки, привязанные к книге без цитаты (T-67). */
  aboutBook: NoteResponse[]
}

/**
 * Цитаты из книги и её конспекты. Отдельного запроса «цитаты документа» у backend
 * нет, поэтому берём заметки книги (`?job_id=` — с цитатами или привязанные) и
 * читаем те, у которых есть цитаты или привязка к этой книге.
 */
export async function loadBookNotes(jobId: string, options: AuthenticatedApiCallOptions): Promise<BookNotes> {
  const page = await listNotes({ job_id: jobId, size: BOOK_NOTES_LIMIT }, options)
  const queue = page.items
    .filter((note) => note.quote_count > 0 || note.linked_job_ids?.includes(jobId))
    .map((note) => note.id)
  const quotes: BookQuote[] = []
  const aboutBook: NoteResponse[] = []
  const worker = async () => {
    for (let noteId = queue.shift(); noteId; noteId = queue.shift()) {
      const note = await getNote(noteId, options)
      if (note.documents?.some((document) => document.job_id === jobId)) aboutBook.push(note)
      for (const quote of note.quotes) {
        if (quote.job_id !== jobId) continue
        quotes.push({
          id: quote.id,
          noteId: note.id,
          noteTitle: note.title,
          side: quote.side,
          paragraphIndex: quote.paragraph_index,
          quote: quote.quote,
          pairedText: quote.paired_text,
          note,
        })
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL_REQUESTS }, worker))
  // Запросы идут параллельно: порядок конспектов — по названию, а не по скорости ответа.
  aboutBook.sort((first, second) => first.title.localeCompare(second.title))
  return { quotes, aboutBook }
}

/** Только цитаты книги. */
export async function loadBookQuotes(jobId: string, options: AuthenticatedApiCallOptions): Promise<BookQuote[]> {
  return (await loadBookNotes(jobId, options)).quotes
}

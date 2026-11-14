import type { NoteQuoteSide } from '../api/contracts/notes.ts'
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
}

/** Сколько заметок книги читаем ради меток; больше — редкость, а запросы дорогие. */
export const BOOK_NOTES_LIMIT = 100
/** Одновременных запросов заметок: не забиваем соединение, пока грузится книга. */
const PARALLEL_REQUESTS = 4

/**
 * Все цитаты из книги. Отдельного запроса «цитаты документа» у backend нет, поэтому
 * берём заметки книги (`?job_id=`) и читаем те, у которых есть цитаты.
 */
export async function loadBookQuotes(jobId: string, options: AuthenticatedApiCallOptions): Promise<BookQuote[]> {
  const page = await listNotes({ job_id: jobId, size: BOOK_NOTES_LIMIT }, options)
  const queue = page.items.filter((note) => note.quote_count > 0).map((note) => note.id)
  const quotes: BookQuote[] = []
  const worker = async () => {
    for (let noteId = queue.shift(); noteId; noteId = queue.shift()) {
      const note = await getNote(noteId, options)
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
        })
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL_REQUESTS }, worker))
  return quotes
}

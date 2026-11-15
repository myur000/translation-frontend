import type { NoteQuoteSide, NoteResponse } from '../api/contracts/notes.ts'
import { bookTitle } from '../documents/bookTitle.ts'

/** Параметры адреса книги: открыть в ней эту заметку и прокрутить к цитате. */
export const NOTE_PARAM = 'note'
export const QUOTE_PARAM = 'quote'
/** Открыть книгу сразу с её конспектом (закладка на полях раскрыта). */
export const SUMMARY_PARAM = 'summary'

/** Адрес книги с раскрытым конспектом: меню книги на полке, карточка книги. */
export function bookSummaryHref(jobId: string) {
  return `/documents/${encodeURIComponent(jobId)}?${SUMMARY_PARAM}=open`
}

/**
 * Адрес книги, который сразу показывает заметку: рабочая область читает
 * `?note=` (и `&quote=`), открывает заметку и прокручивает к цитате.
 */
export function bookNoteHref(jobId: string, noteId: string, quoteId?: string) {
  const params = new URLSearchParams({ [NOTE_PARAM]: noteId })
  if (quoteId) params.set(QUOTE_PARAM, quoteId)
  return `/documents/${encodeURIComponent(jobId)}?${params}`
}

/** Книга, с которой связана заметка: цитатой или привязкой целиком (конспект). */
export interface NoteBook {
  jobId: string
  title: string
  /** Книгу удалили: связь видна, но открыть нельзя. */
  isAvailable: boolean
  /** Заметка привязана к книге целиком (её можно отвязать). */
  isLinked: boolean
  /** Первая цитата из этой книги — к ней ведёт «Открыть в книге». */
  quote: { id: string; paragraphIndex: number; side: NoteQuoteSide } | null
}

/**
 * Книги заметки по одной: сначала из цитат (в их порядке), потом привязанные без
 * цитат. У удалённой книги цитаты остаются, но `job_id` у них `null` — такие
 * цитаты в список книг не попадают: открыть их негде.
 */
export function noteBooks(note: NoteResponse): NoteBook[] {
  const books = new Map<string, NoteBook>()
  for (const quote of note.quotes) {
    if (!quote.job_id || books.has(quote.job_id)) continue
    books.set(quote.job_id, {
      jobId: quote.job_id,
      title: quote.document_name ? bookTitle(quote.document_name) : '',
      isAvailable: quote.document_available,
      isLinked: false,
      quote: { id: quote.id, paragraphIndex: quote.paragraph_index, side: quote.side },
    })
  }
  for (const document of note.documents ?? []) {
    const known = books.get(document.job_id)
    if (known) {
      known.isLinked = true
      continue
    }
    books.set(document.job_id, {
      jobId: document.job_id,
      title: document.document_name ? bookTitle(document.document_name) : '',
      isAvailable: document.document_available,
      isLinked: true,
      quote: null,
    })
  }
  return [...books.values()]
}

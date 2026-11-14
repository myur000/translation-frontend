import type { NotesTree, NotesTreeBook } from './notesTree.ts'

/** Сколько последних заметок показывает «Продолжить» на главной раздела. */
export const RECENT_NOTES_LIMIT = 5

export type NoteDay =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'date'; text: string }

/**
 * Когда заметку меняли, по-человечески: «сегодня», «вчера» или короткая дата.
 * Год пишем, только если он не текущий. Сравниваем календарные дни в часовом
 * поясе читателя, а не разницу в часах: правка в 23:50 вчера — это «вчера».
 */
export function noteDay(value: string, now: Date, locale: string): NoteDay {
  const date = new Date(value)
  const startOfDay = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (days === 0) return { kind: 'today' }
  if (days === 1) return { kind: 'yesterday' }
  const format = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
  return { kind: 'date', text: format.format(date) }
}

/**
 * Книга каждой заметки — для корешка в списке. Заметка может цитировать
 * несколько книг: берём первую, где она есть (конспект книги важнее цитаты).
 */
export function bookOfNote(tree: NotesTree): ReadonlyMap<string, NotesTreeBook> {
  const index = new Map<string, NotesTreeBook>()
  for (const book of tree.books) {
    for (const id of book.summaryIds) if (!index.has(id)) index.set(id, book)
  }
  for (const book of tree.books) {
    for (const id of book.noteIds) if (!index.has(id)) index.set(id, book)
  }
  return index
}

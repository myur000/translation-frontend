import type { NoteResponse } from '../api/contracts/notes.ts'

/**
 * Конспекты книги — заметки, привязанные к ней целиком (связь `about`, T-67). Их
 * может быть несколько («Конспект», «Персонажи»…). Тот, что открывали последним,
 * — текущий: с него раскрывается закладка на полях. Он запоминается для каждой
 * книги в этом браузере, отдельно для каждого аккаунта.
 */

/** Как назвать новый конспект: «Конспект — Книга», дальше «Конспект 2 — Книга»… */
export interface SummaryTitles {
  first: (book: string) => string
  numbered: (book: string, number: number) => string
}

/**
 * Первое свободное название. У заметок название уникально без учёта регистра
 * (`uq_notes_user_title`), поэтому второй конспект не может называться как первый.
 * Сверяем с конспектами книги: про остальные заметки знает только сервер, и на
 * занятое название он ответит 409 — тогда название поменяют в форме.
 */
export function nextSummaryTitle(titles: SummaryTitles, book: string, existing: readonly Pick<NoteResponse, 'title'>[]) {
  const taken = new Set(existing.map((note) => note.title.trim().toLocaleLowerCase()))
  const first = titles.first(book)
  if (!taken.has(first.toLocaleLowerCase())) return first
  for (let number = 2; ; number += 1) {
    const title = titles.numbered(book, number)
    if (!taken.has(title.toLocaleLowerCase())) return title
  }
}

const STORAGE_PREFIX = 'parallel.current-summary.v1.'

function read(owner: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_PREFIX + owner) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  } catch {
    return {}
  }
}

/** Какой конспект книги текущий; `null` — ещё не выбирали. */
export function readCurrentSummary(owner: string, jobId: string): string | null {
  return read(owner)[jobId] ?? null
}

export function writeCurrentSummary(owner: string, jobId: string, noteId: string) {
  try {
    localStorage.setItem(STORAGE_PREFIX + owner, JSON.stringify({ ...read(owner), [jobId]: noteId }))
  } catch {
    // Хранилище недоступно (приватный режим): текущим будет первый конспект — это не ошибка.
  }
}

/** Текущий конспект из списка: запомненный, если он ещё есть, иначе первый. */
export function pickCurrentSummary(summaries: readonly NoteResponse[], rememberedId: string | null) {
  return summaries.find((note) => note.id === rememberedId) ?? summaries[0] ?? null
}

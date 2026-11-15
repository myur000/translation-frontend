import { useCallback, useEffect, useRef, useState } from 'react'
import type { NoteResponse } from '../api/contracts/notes.ts'
import { loadDocumentText, type DocumentText } from '../api/documentText.ts'
import { useAuth } from '../auth/useAuth.ts'
import { loadBookNotes, noteBookQuotes, withParagraphTexts, type BookNotes } from './bookQuotes.ts'

const NO_NOTES: BookNotes = { quotes: [], aboutBook: [] }

/** Заметки книги и признак, что они уже загружены (пустой список ≠ «ещё грузится»). */
export interface LoadedBookNotes extends BookNotes {
  isLoaded: boolean
  /**
   * Сохранённая заметка сразу заменяет свою прежнюю версию в цитатах и конспектах:
   * карточки и метки не ждут, пока заметки книги перечитаются целиком.
   */
  upsertNote: (note: NoteResponse) => void
}

interface Loaded {
  key: string
  notes: BookNotes
  /** Текст книги с сервера: по нему цитата находит свой абзац (`paragraphText`). */
  text: DocumentText | null
}

/**
 * Цитаты и конспекты открытой книги для меток и заметок на полях (`null` — не
 * загружать). Перечитываются, когда заметки меняются (`revision`). Ошибка не
 * мешает читать: меток и карточек просто нет. Текст книги грузится рядом (он
 * кэшируется на сеанс); если он недоступен, цитаты ищутся по номеру абзаца.
 */
export function useBookNotes(jobId: string | null, revision: number): LoadedBookNotes {
  const { session } = useAuth()
  const tokenRef = useRef(session?.accessToken)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  useEffect(() => { tokenRef.current = session?.accessToken }, [session?.accessToken])
  const key = jobId ? `${session?.email ?? ''}\n${jobId}\n${revision}` : null

  useEffect(() => {
    const token = tokenRef.current
    if (!key || !jobId || !token) return
    const controller = new AbortController()
    const options = { accessToken: token, signal: controller.signal }
    // Без текста книги метки всё равно встают — по номеру абзаца, только менее точно.
    const text = loadDocumentText(jobId, options).catch(() => null)
    Promise.all([loadBookNotes(jobId, options), text]).then(
      ([notes, documentText]) => {
        if (controller.signal.aborted) return
        setLoaded({ key, text: documentText, notes: { ...notes, quotes: withParagraphTexts(notes.quotes, documentText) } })
      },
      () => { if (!controller.signal.aborted) setLoaded({ key, text: null, notes: NO_NOTES }) },
    )
    return () => controller.abort()
  }, [jobId, key])

  const upsertNote = useCallback((note: NoteResponse) => {
    if (!jobId) return
    setLoaded((current) => {
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
  }, [jobId])

  if (!jobId) return { ...NO_NOTES, isLoaded: false, upsertNote }
  // Пока перечитываем после правки, прежние метки остаются на месте и не мигают.
  return { ...(loaded?.notes ?? NO_NOTES), isLoaded: loaded?.key === key, upsertNote }
}

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth.ts'
import { loadBookNotes, type BookNotes } from './bookQuotes.ts'

const NO_NOTES: BookNotes = { quotes: [], aboutBook: [] }

/** Заметки книги и признак, что они уже загружены (пустой список ≠ «ещё грузится»). */
export interface LoadedBookNotes extends BookNotes {
  isLoaded: boolean
}

/**
 * Цитаты и конспекты открытой книги для меток и заметок на полях (`null` — не
 * загружать). Перечитываются, когда заметки меняются (`revision`). Ошибка не
 * мешает читать: меток и карточек просто нет.
 */
export function useBookNotes(jobId: string | null, revision: number): LoadedBookNotes {
  const { session } = useAuth()
  const tokenRef = useRef(session?.accessToken)
  const [loaded, setLoaded] = useState<{ key: string; notes: BookNotes } | null>(null)
  useEffect(() => { tokenRef.current = session?.accessToken }, [session?.accessToken])
  const key = jobId ? `${session?.email ?? ''}\n${jobId}\n${revision}` : null

  useEffect(() => {
    const token = tokenRef.current
    if (!key || !jobId || !token) return
    const controller = new AbortController()
    loadBookNotes(jobId, { accessToken: token, signal: controller.signal }).then(
      (notes) => { if (!controller.signal.aborted) setLoaded({ key, notes }) },
      () => { if (!controller.signal.aborted) setLoaded({ key, notes: NO_NOTES }) },
    )
    return () => controller.abort()
  }, [jobId, key])

  if (!jobId) return { ...NO_NOTES, isLoaded: false }
  // Пока перечитываем после правки, прежние метки остаются на месте и не мигают.
  return { ...(loaded?.notes ?? NO_NOTES), isLoaded: loaded?.key === key }
}

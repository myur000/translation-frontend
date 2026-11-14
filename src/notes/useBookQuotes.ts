import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth.ts'
import { loadBookQuotes, type BookQuote } from './bookQuotes.ts'

const NO_QUOTES: BookQuote[] = []

/**
 * Цитаты открытой книги для меток на полях (`null` — не загружать). Перечитываются,
 * когда заметки меняются (`revision`). Ошибка не мешает читать: меток просто нет.
 */
export function useBookQuotes(jobId: string | null, revision: number): BookQuote[] {
  const { session } = useAuth()
  const tokenRef = useRef(session?.accessToken)
  const [loaded, setLoaded] = useState<{ key: string; quotes: BookQuote[] } | null>(null)
  useEffect(() => { tokenRef.current = session?.accessToken }, [session?.accessToken])
  const key = jobId ? `${session?.email ?? ''}\n${jobId}\n${revision}` : null

  useEffect(() => {
    const token = tokenRef.current
    if (!key || !jobId || !token) return
    const controller = new AbortController()
    loadBookQuotes(jobId, { accessToken: token, signal: controller.signal }).then(
      (quotes) => { if (!controller.signal.aborted) setLoaded({ key, quotes }) },
      () => { if (!controller.signal.aborted) setLoaded({ key, quotes: NO_QUOTES }) },
    )
    return () => controller.abort()
  }, [jobId, key])

  if (!jobId) return NO_QUOTES
  // Пока перечитываем после правки, прежние метки остаются на месте и не мигают.
  return loaded?.quotes ?? NO_QUOTES
}

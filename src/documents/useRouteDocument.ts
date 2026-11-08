import { useEffect, useRef, useState } from 'react'
import { ApiClientError } from '../api/client.ts'
import { getDocumentHistory } from '../api/documents.ts'
import { getTranslationStatus } from '../api/translations.ts'
import type { DocumentItem } from '../types/document.ts'
import { historyItemsToDocuments } from './documentHistory.ts'
import { readDocumentMetadata } from './documentMetadataStorage.ts'

/**
 * Как маршрут документа сопоставляется с загруженным списком документов.
 * `draft-missing` — адрес `/drafts/:id`, локального черновика которого уже нет
 * (черновики не переживают перезагрузку).
 */
export type RouteDocumentState = 'none' | 'found' | 'loading' | 'missing' | 'error' | 'draft-missing'

type HistoryState = 'loading' | 'ready' | 'error'

interface Options {
  jobId: string | null
  documents: readonly DocumentItem[]
  historyState: HistoryState
  session: { accessToken: string; email: string } | null
  /** Вызывается один раз с документом, найденным за пределами первой страницы истории. */
  onFound: (document: DocumentItem) => void
}

const HISTORY_PAGE_SIZE = 100
/** Верхняя граница глубокого поиска: 20 страниц × 100 задач. */
const MAX_HISTORY_PAGES = 20

interface Lookup {
  jobId: string
  state: 'loading' | 'missing' | 'error'
}

/**
 * Разрешает ссылку на документ (например, из письма «перевод готов»).
 * Первая страница истории уже есть в `documents`; более старая задача подтверждается
 * по статусу и затем ищется на следующих страницах истории, потому что ответ
 * статуса не содержит языков и формата.
 */
export function useRouteDocument({
  jobId,
  documents,
  historyState,
  session,
  onFound,
}: Options): RouteDocumentState {
  const [lookup, setLookup] = useState<Lookup | null>(null)
  // Новая ссылка на колбэк не должна перезапускать уже идущий поиск.
  const onFoundRef = useRef(onFound)
  useEffect(() => {
    onFoundRef.current = onFound
  })
  const documentIdsRef = useRef<ReadonlySet<string>>(new Set())
  useEffect(() => {
    documentIdsRef.current = new Set(documents.map((item) => item.id))
  })
  const isLoaded = jobId !== null && documents.some((item) => item.jobId === jobId)
  const shouldSearch = jobId !== null && !isLoaded && historyState === 'ready' && session !== null

  useEffect(() => {
    if (!shouldSearch || !jobId || !session) return
    const controller = new AbortController()
    const options = { accessToken: session.accessToken, signal: controller.signal }
    const finish = (state: Lookup['state']) => {
      if (!controller.signal.aborted) setLookup({ jobId, state })
    }

    void (async () => {
      try {
        await getTranslationStatus(jobId, options)
        const metadata = readDocumentMetadata(session.email)
        for (let page = 1; page < MAX_HISTORY_PAGES; page += 1) {
          const response = await getDocumentHistory(options, { page, size: HISTORY_PAGE_SIZE })
          const item = response.items.find((candidate) => candidate.job_id === jobId)
          if (item) {
            if (controller.signal.aborted) return
            const [document] = historyItemsToDocuments([item], metadata, documentIdsRef.current)
            onFoundRef.current(document)
            return
          }
          if (response.last) break
        }
        finish('missing')
      } catch (error) {
        if (controller.signal.aborted) return
        // 404: неизвестна, чужая или удалена владельцем.
        finish(error instanceof ApiClientError && error.status === 404 ? 'missing' : 'error')
      }
    })()

    return () => controller.abort()
  }, [jobId, shouldSearch, session])

  if (jobId === null) return 'none'
  if (isLoaded) return 'found'
  if (historyState === 'error') return 'error'
  if (lookup?.jobId === jobId && lookup.state !== 'loading') return lookup.state
  return 'loading'
}

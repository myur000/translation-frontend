import { useEffect, useRef, useState } from 'react'
import { ApiClientError } from '../api/client.ts'
import { getDocumentHistory } from '../api/documents.ts'
import { getTranslationStatus } from '../api/translations.ts'
import type { DocumentItem } from '../types/document.ts'
import { historyItemsToDocuments } from './documentHistory.ts'
import { readDocumentMetadata } from './documentMetadataStorage.ts'

/** How `/documents/:jobId` resolves against the loaded document list. */
export type RouteDocumentState = 'none' | 'found' | 'loading' | 'missing' | 'error'

type HistoryState = 'loading' | 'ready' | 'error'

interface Options {
  jobId: string | null
  documents: readonly DocumentItem[]
  historyState: HistoryState
  session: { accessToken: string; email: string } | null
  /** Called once with a document found beyond the first history page. */
  onFound: (document: DocumentItem) => void
}

const HISTORY_PAGE_SIZE = 100
/** Upper bound for the deep search: 20 pages × 100 jobs. */
const MAX_HISTORY_PAGES = 20

interface Lookup {
  jobId: string
  state: 'loading' | 'missing' | 'error'
}

/**
 * Resolves a document link (e.g. from the "translation ready" email). The
 * first history page is already in `documents`; an older job is confirmed via
 * its status and then located in later history pages, because the status
 * response does not carry languages or format.
 */
export function useRouteDocument({
  jobId,
  documents,
  historyState,
  session,
  onFound,
}: Options): RouteDocumentState {
  const [lookup, setLookup] = useState<Lookup | null>(null)
  // A new callback identity must not restart an in-flight search.
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
        // 404: unknown, someone else's or deleted by the owner.
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

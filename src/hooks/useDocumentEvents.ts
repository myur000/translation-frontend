import { useEffect, useRef, useState } from 'react'
import { ApiClientError, apiClient } from '../api/client.ts'
import type { DocumentJobEvent } from '../api/contracts/documents.ts'
import { API_ENDPOINTS } from '../api/endpoints.ts'
import { readServerSentEvents } from '../api/sse.ts'

/**
 * - `connecting` — opening or reopening the stream;
 * - `live` — `ready` received, events arrive;
 * - `unavailable` — the server has no stream (404) or refuses another
 *   one (429); status polling stays the only source until reload.
 */
export type DocumentEventsState = 'idle' | 'connecting' | 'live' | 'unavailable'

interface Options {
  accessToken: string | null
  /** Keep a stream only while there is something to watch: the account has a limit of 5. */
  enabled: boolean
  onJob: (event: DocumentJobEvent) => void
  /** After `ready` and `resync`: events may have been missed, re-read the statuses. */
  onResync: () => void
}

const RECONNECT_DELAY_MS = 500
const MAX_BACKOFF_MS = 30_000
const STATUSES = new Set(['PENDING', 'PROCESSING', 'DONE', 'FAILED'])

function parseJobEvent(data: string): DocumentJobEvent | null {
  try {
    const value = JSON.parse(data) as Partial<DocumentJobEvent>
    return typeof value.job_id === 'string' && STATUSES.has(String(value.status)) &&
      typeof value.progress === 'number' && Number.isFinite(value.progress)
      ? { job_id: value.job_id, status: value.status!, progress: value.progress }
      : null
  } catch {
    return null
  }
}

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const timer = window.setTimeout(resolve, ms)
  signal.addEventListener('abort', () => {
    window.clearTimeout(timer)
    resolve()
  }, { once: true })
})

/**
 * Document status updates over Server-Sent Events (GET /documents/events).
 * EventSource cannot send the Authorization header, so the stream is read
 * through fetch. The server closes it when the access token expires (and
 * about once a minute in production); that is normal and the stream is
 * reopened with the current token.
 */
export function useDocumentEvents({ accessToken, enabled, onJob, onResync }: Options) {
  const [state, setState] = useState<DocumentEventsState>('idle')
  const [isUnavailable, setUnavailable] = useState(false)
  const latest = useRef({ accessToken, onJob, onResync })
  useEffect(() => {
    latest.current = { accessToken, onJob, onResync }
  })
  const hasSession = accessToken !== null
  const shouldConnect = enabled && hasSession && !isUnavailable

  useEffect(() => {
    if (!shouldConnect) return
    const controller = new AbortController()
    const { signal } = controller

    void (async () => {
      let failures = 0
      while (!signal.aborted) {
        const token = latest.current.accessToken
        if (!token) return
        setState('connecting')
        try {
          const stream = await apiClient.requestStream(API_ENDPOINTS.documents.events, {
            accessToken: token,
            signal,
            headers: { Accept: 'text/event-stream' },
          })
          await readServerSentEvents(stream, (event) => {
            if (event.event === 'ready') {
              failures = 0
              setState('live')
              latest.current.onResync()
            } else if (event.event === 'resync') {
              latest.current.onResync()
            } else if (event.event === 'job') {
              const job = parseJobEvent(event.data)
              if (job) latest.current.onJob(job)
            }
          }, signal)
          // Closed by the server: reopen promptly.
          if (!signal.aborted) setState('connecting')
          await wait(RECONNECT_DELAY_MS, signal)
        } catch (error) {
          if (signal.aborted) return
          if (error instanceof ApiClientError) {
            if (error.status === 404 || error.status === 429) {
              setUnavailable(true)
              return
            }
            // 401 after the client's own refresh: the session is over and
            // the auth layer is already signing out.
            if (error.status === 401 || error.status === 403) return
          }
          failures += 1
          setState('connecting')
          await wait(Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** (failures - 1)), signal)
        }
      }
    })()

    return () => {
      controller.abort()
      setState('idle')
    }
  }, [shouldConnect])

  return isUnavailable ? 'unavailable' : shouldConnect ? state : 'idle'
}

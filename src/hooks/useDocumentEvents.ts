import { useEffect, useRef, useState } from 'react'
import { ApiClientError, apiClient } from '../api/client.ts'
import type { DocumentJobEvent } from '../api/contracts/documents.ts'
import { API_ENDPOINTS } from '../api/endpoints.ts'
import { readServerSentEvents } from '../api/sse.ts'

/**
 * - `connecting` — поток открывается или переоткрывается;
 * - `live` — получено `ready`, события приходят;
 * - `unavailable` — у сервера нет потока (404) или он отказывает в ещё одном (429);
 *   до перезагрузки единственным источником остаётся опрос статуса.
 */
export type DocumentEventsState = 'idle' | 'connecting' | 'live' | 'unavailable'

interface Options {
  accessToken: string | null
  /** Держим поток, только пока есть что отслеживать: у аккаунта лимит в 5 потоков. */
  enabled: boolean
  onJob: (event: DocumentJobEvent) => void
  /** После `ready` и `resync` события могли потеряться — перечитываем статусы. */
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
 * Обновления статусов документов через Server-Sent Events (GET /documents/events).
 * EventSource не умеет передавать заголовок Authorization, поэтому поток читается
 * через fetch. Сервер закрывает его, когда истекает access-токен (и примерно раз
 * в минуту в продакшене); это нормально, и поток переоткрывается с текущим токеном.
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
          // Закрыт сервером: быстро переоткрываем.
          if (!signal.aborted) setState('connecting')
          await wait(RECONNECT_DELAY_MS, signal)
        } catch (error) {
          if (signal.aborted) return
          if (error instanceof ApiClientError) {
            if (error.status === 404 || error.status === 429) {
              setUnavailable(true)
              return
            }
            // 401 после собственного продления клиента: сессия закончилась,
            // и слой авторизации уже выполняет выход.
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

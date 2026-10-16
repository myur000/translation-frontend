import { useEffect, useRef } from 'react'
import type { DocumentStatusResponse, TranslationStatus } from '../api/contracts/documents.ts'
import { getTranslationStatus } from '../api/translations.ts'
import { TRANSLATION_REQUEST_TIMEOUT_MS, TRANSLATION_STALL_TIMEOUT_MS } from '../config/translationPolling.ts'
import type { TranslationWaitingIssue } from '../types/document.ts'

export interface PollingTranslationJob {
  documentId: string
  jobId: string
  status: TranslationStatus
  progress: number
}
export interface TranslationStatusUpdate {
  documentId: string
  response: DocumentStatusResponse
}
export interface TranslationWaitingTimeout {
  documentId: string
  jobId: string
  issue: TranslationWaitingIssue
}
interface UseTranslationStatusPollingOptions {
  accessToken: string | null
  jobs: PollingTranslationJob[]
  onUpdate: (updates: TranslationStatusUpdate[]) => void
  onTimeout: (timeouts: TranslationWaitingTimeout[]) => void
  intervalMs?: number
  stallTimeoutMs?: number
  requestTimeoutMs?: number
}
interface Observation {
  jobId: string
  signature: string
  changedAt: number
  respondedAt: number | null
  paused: boolean
}
const signature = (status: TranslationStatus, progress: number) => `${status}:${progress}`

// Bound each status check even if an underlying promise fails to honor abort.
async function requestStatus(jobId: string, token: string, parent: AbortSignal, timeoutMs: number) {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  parent.addEventListener('abort', cancel, { once: true })
  if (parent.aborted) cancel()
  let rejectOnAbort!: () => void
  const aborted = new Promise<never>((_, reject) => {
    rejectOnAbort = () => reject(new DOMException('Status check aborted', 'AbortError'))
    controller.signal.addEventListener('abort', rejectOnAbort, { once: true })
    if (controller.signal.aborted) rejectOnAbort()
  })
  const timeout = window.setTimeout(cancel, timeoutMs)
  try {
    return await Promise.race([
      getTranslationStatus(jobId, { accessToken: token, signal: controller.signal }),
      aborted,
    ])
  } finally {
    window.clearTimeout(timeout)
    parent.removeEventListener('abort', cancel)
    controller.signal.removeEventListener('abort', rejectOnAbort)
  }
}

export function useTranslationStatusPolling({
  accessToken, jobs, onUpdate, onTimeout, intervalMs = 2_500,
  stallTimeoutMs = TRANSLATION_STALL_TIMEOUT_MS,
  requestTimeoutMs = TRANSLATION_REQUEST_TIMEOUT_MS,
}: UseTranslationStatusPollingOptions) {
  const jobsRef = useRef(jobs)
  const observationsRef = useRef(new Map<string, Observation>())
  const hasJobs = jobs.length > 0
  const jobSetKey = jobs.map((job) => `${job.documentId}:${job.jobId}`).sort().join('|')

  useEffect(() => {
    jobsRef.current = jobs
    const activeIds = new Set(jobs.map((job) => job.documentId))
    for (const id of observationsRef.current.keys()) {
      if (!activeIds.has(id)) observationsRef.current.delete(id)
    }
    for (const job of jobs) {
      const previous = observationsRef.current.get(job.documentId)
      const value = signature(job.status, job.progress)
      if (!previous || previous.jobId !== job.jobId) {
        observationsRef.current.set(job.documentId, {
          jobId: job.jobId, signature: value, changedAt: Date.now(),
          respondedAt: null, paused: false,
        })
      } else if (previous.signature !== value) {
        previous.signature = value
        previous.changedAt = Date.now()
      }
    }
  }, [jobs])

  useEffect(() => {
    if (!accessToken || !hasJobs) return
    const controller = new AbortController()
    let requestInProgress = false

    const poll = async () => {
      if (requestInProgress || controller.signal.aborted) return
      const now = Date.now()
      const expired: TranslationWaitingTimeout[] = []
      const currentJobs = jobsRef.current.filter((job) => {
        const observation = observationsRef.current.get(job.documentId)
        if (!observation || observation.paused) return false
        if (now - observation.changedAt < stallTimeoutMs) return true
        observation.paused = true
        expired.push({
          documentId: job.documentId, jobId: job.jobId,
          issue: observation.respondedAt !== null && now - observation.respondedAt < stallTimeoutMs
            ? 'stalled' : 'unreachable',
        })
        return false
      })
      if (expired.length) onTimeout(expired)
      if (!currentJobs.length) return

      requestInProgress = true
      try {
        const results = await Promise.allSettled(currentJobs.map(async (job) => {
          const response = await requestStatus(job.jobId, accessToken, controller.signal, requestTimeoutMs)
          if (controller.signal.aborted) return null
          // Do not apply late responses to a different/replaced/paused job.
          const observation = observationsRef.current.get(job.documentId)
          if (!observation || observation.jobId !== job.jobId || observation.paused) return null
          if (response.job_id !== job.jobId || !['PENDING', 'PROCESSING', 'DONE', 'FAILED'].includes(response.status) ||
              !Number.isFinite(response.progress)) return null
          observation.respondedAt = Date.now()
          const value = signature(response.status, Math.min(100, Math.max(0, response.progress)))
          if (observation.signature !== value) {
            observation.signature = value
            observation.changedAt = Date.now()
          }
          return { documentId: job.documentId, response }
        }))
        if (controller.signal.aborted) return
        const updates = results.flatMap((result) =>
          result.status === 'fulfilled' && result.value ? [result.value] : [])
        if (updates.length) onUpdate(updates)
      } finally {
        requestInProgress = false
      }
    }

    void poll()
    const intervalId = window.setInterval(() => void poll(), intervalMs)
    return () => {
      controller.abort()
      window.clearInterval(intervalId)
    }
  }, [accessToken, hasJobs, jobSetKey, intervalMs, stallTimeoutMs, requestTimeoutMs, onUpdate, onTimeout])
}

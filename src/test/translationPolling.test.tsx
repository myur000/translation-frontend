import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTranslationStatusPolling, type PollingTranslationJob } from '../hooks/useTranslationStatusPolling.ts'
import type { DocumentStatusResponse, TranslationStatus } from '../api/contracts/documents.ts'

const api = vi.hoisted(() => ({ status: vi.fn() }))
vi.mock('../api/translations.ts', () => ({ getTranslationStatus: api.status }))
const job: PollingTranslationJob = { documentId: 'book-1', jobId: 'job-1', status: 'PENDING', progress: 0 }
const response = (id = job.jobId, status: TranslationStatus = 'PENDING', progress = 0): DocumentStatusResponse =>
  ({ job_id: id, status, progress, error_code: null, error_message: null })
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.useFakeTimers()
  api.status.mockReset().mockResolvedValue(response())
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup(jobs = [job]) {
  const onUpdate = vi.fn()
  const onTimeout = vi.fn()
  const rendered = renderHook(({ token, jobs }) => useTranslationStatusPolling({
    accessToken: token, jobs, onUpdate, onTimeout,
    intervalMs: 100, stallTimeoutMs: 1000, requestTimeoutMs: 150,
  }), { initialProps: { token: 'first-token', jobs } })
  return { ...rendered, onUpdate, onTimeout }
}

describe('bounded translation waiting', () => {
  it('pauses a responsive but unchanged PENDING job and stops polling it', async () => {
    const { onTimeout, onUpdate } = setup()
    await advance(999)
    expect(onUpdate).toHaveBeenCalled()
    expect(onTimeout).not.toHaveBeenCalled()
    await advance(1)
    expect(onTimeout).toHaveBeenCalledWith([{ documentId: job.documentId, jobId: job.jobId, issue: 'stalled' }])
    const calls = api.status.mock.calls.length
    await advance(1000)
    expect(api.status).toHaveBeenCalledTimes(calls)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('aborts hung GET requests and pauses instead of waiting forever', async () => {
    api.status.mockReturnValue(new Promise(() => {}))
    const { onTimeout, onUpdate } = setup()
    const signal = api.status.mock.calls[0][1].signal as AbortSignal
    await advance(150)
    expect(signal.aborted).toBe(true)
    await advance(850)
    expect(api.status.mock.calls.length).toBeGreaterThan(1)
    expect(onUpdate).not.toHaveBeenCalled()
    expect(onTimeout).toHaveBeenCalledWith([{ documentId: job.documentId, jobId: job.jobId, issue: 'unreachable' }])
  })

  it('keeps waiting while actual progress changes, then pauses when it stops', async () => {
    let progress = 0
    api.status.mockImplementation(() => Promise.resolve(response(job.jobId, 'PROCESSING', ++progress)))
    const { onTimeout } = setup()
    await advance(2000)
    expect(onTimeout).not.toHaveBeenCalled()
    api.status.mockImplementation(() => Promise.resolve(response(job.jobId, 'PROCESSING', progress)))
    await advance(1000)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('resets the no-progress deadline when PENDING becomes PROCESSING', async () => {
    const { onTimeout } = setup()
    await advance(800)
    api.status.mockResolvedValue(response(job.jobId, 'PROCESSING'))
    await advance(900)
    expect(onTimeout).not.toHaveBeenCalled()
    await advance(200)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('does not reset the deadline when JWT rotates or the parent rerenders', async () => {
    const { rerender, onTimeout } = setup()
    await advance(600)
    rerender({ token: 'renewed-token', jobs: [{ ...job }] })
    await advance(400)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(api.status).toHaveBeenCalledWith(job.jobId, expect.objectContaining({ accessToken: 'renewed-token' }))
  })

  it('allows explicit resume and receives DONE for the same job id', async () => {
    const { rerender, onTimeout, onUpdate } = setup()
    await advance(1000)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    rerender({ token: 'first-token', jobs: [] })
    api.status.mockResolvedValue(response(job.jobId, 'DONE', 100))
    rerender({ token: 'first-token', jobs: [job] })
    await advance(0)
    expect(onUpdate).toHaveBeenLastCalledWith([{ documentId: job.documentId, response: response(job.jobId, 'DONE', 100) }])
  })

  it('tracks deadlines independently for multiple books', async () => {
    const other = { ...job, documentId: 'book-2', jobId: 'job-2' }
    let progress = 0
    api.status.mockImplementation((id: string) => Promise.resolve(
      id === job.jobId ? response() : response(id, 'PROCESSING', ++progress)))
    const { onTimeout } = setup([job, other])
    await advance(2000)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(onTimeout).toHaveBeenCalledWith([{ documentId: job.documentId, jobId: job.jobId, issue: 'stalled' }])
  })

  it('ignores a removed job response arriving while another job remains active', async () => {
    let finish!: (value: DocumentStatusResponse) => void
    const other = { ...job, documentId: 'book-2', jobId: 'job-2' }
    api.status.mockImplementation((id: string) => id === job.jobId
      ? new Promise((resolve) => { finish = resolve })
      : Promise.resolve(response(id)))
    const { rerender, onUpdate } = setup([job, other])
    rerender({ token: 'first-token', jobs: [other] })
    await act(async () => { finish(response(job.jobId, 'DONE', 100)) })
    expect(onUpdate.mock.calls.flatMap(([updates]) => updates).every((update) => update.documentId !== job.documentId)).toBe(true)
  })

  it('cancels requests and timers on unmount without emitting a timeout', async () => {
    api.status.mockReturnValue(new Promise(() => {}))
    const { unmount, onTimeout, onUpdate } = setup()
    const signal = api.status.mock.calls[0][1].signal as AbortSignal
    unmount()
    await advance(2000)
    expect(signal.aborted).toBe(true)
    expect(onTimeout).not.toHaveBeenCalled()
    expect(onUpdate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not count invalid/mismatched status payloads as responses', async () => {
    api.status.mockResolvedValue(response('wrong-job'))
    const { onUpdate, onTimeout } = setup()
    await advance(1000)
    expect(onUpdate).not.toHaveBeenCalled()
    expect(onTimeout).toHaveBeenCalledWith([{ documentId: job.documentId, jobId: job.jobId, issue: 'unreachable' }])
  })
})

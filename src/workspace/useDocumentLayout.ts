import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth.ts'
import { readDocumentLayout, rememberDocumentLayout } from './layoutStorage.ts'
import { DEFAULT_LAYOUT, type WorkspaceLayout } from './workspaceLayout.ts'

interface LayoutState {
  jobId: string | undefined
  layout: WorkspaceLayout
  /** Пользователь выбрал раскладку сам: только такой выбор сохраняется. */
  chosen: boolean
}

/**
 * Раскладка открытого документа. У задачи она читается и сохраняется по `jobId`;
 * у черновика живёт в памяти, а когда черновик отправлен и получил `jobId`,
 * сделанный выбор сохраняется за новой задачей.
 */
export function useDocumentLayout(jobId: string | undefined) {
  const { session } = useAuth()
  const email = session?.email ?? null
  const [state, setState] = useState<LayoutState>(() => initialState(email, jobId))

  // Черновик получил задачу: корректируем состояние во время рендера, без лишней отрисовки.
  if (state.jobId !== jobId) {
    const saved = email && jobId ? readDocumentLayout(email, jobId) : null
    setState(saved
      ? { jobId, layout: saved, chosen: true }
      : { ...state, jobId })
  }

  // Выбор, сделанный в черновике, переносится на появившуюся задачу.
  useEffect(() => {
    if (email && state.jobId && state.chosen) rememberDocumentLayout(email, state.jobId, state.layout)
  }, [email, state])

  const setLayout = (layout: WorkspaceLayout) => {
    setState((current) => ({ ...current, layout, chosen: true }))
  }

  return [state.layout, setLayout] as const
}

function initialState(email: string | null, jobId: string | undefined): LayoutState {
  const saved = email && jobId ? readDocumentLayout(email, jobId) : null
  return { jobId, layout: saved ?? DEFAULT_LAYOUT, chosen: saved !== null }
}

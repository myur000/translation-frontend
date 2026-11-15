import { useEffect, useState } from 'react'
import { getTerms } from '../api/terms.ts'
import { useAuth } from '../auth/useAuth.ts'

const PAGE_SIZE = 100
const MAX_PAGES = 50

/** Термины, привязанные к книге; `null` — без фильтра или ещё грузится. */
export function useBookTermIds(jobId: string | null, revision: number): ReadonlySet<string> | null {
  const { session } = useAuth()
  const accessToken = session?.accessToken ?? null
  const [loaded, setLoaded] = useState<{ key: string; ids: Set<string> } | null>(null)
  const key = jobId ? `${jobId}\n${revision}` : null

  useEffect(() => {
    if (!key || !jobId || !accessToken) return
    const controller = new AbortController()
    const load = async () => {
      const ids = new Set<string>()
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const response = await getTerms({ job_id: jobId, page, size: PAGE_SIZE }, { accessToken, signal: controller.signal })
        for (const item of response.items) ids.add(item.id)
        if (page + 1 >= response.total_pages) break
      }
      return ids
    }
    load().then(
      (ids) => { if (!controller.signal.aborted) setLoaded({ key, ids }) },
      () => { if (!controller.signal.aborted) setLoaded({ key, ids: new Set() }) },
    )
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!jobId) return null
  // Пока перечитываем после правки, прежняя выборка остаётся на месте.
  return loaded?.key.startsWith(`${jobId}\n`) ? loaded.ids : null
}

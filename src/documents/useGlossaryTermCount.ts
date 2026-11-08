import { useEffect, useState } from 'react'
import { getTerms } from '../api/terms.ts'
import { useAuth } from '../auth/useAuth.ts'

interface Count {
  key: string
  value: number
}

/**
 * Количество терминов пользователя для языковой пары, чтобы опцию глоссария
 * предлагать только тогда, когда она что-то изменит. `null`, пока неизвестно.
 */
export function useGlossaryTermCount(
  sourceLanguage: string,
  targetLanguage: string,
  enabled = true,
) {
  const { session } = useAuth()
  const accessToken = session?.accessToken ?? null
  const key = `${sourceLanguage}>${targetLanguage}`
  const [count, setCount] = useState<Count | null>(null)

  useEffect(() => {
    if (!enabled || !accessToken || sourceLanguage === targetLanguage) return
    const controller = new AbortController()
    getTerms(
      { source_lang: sourceLanguage, target_lang: targetLanguage, size: 1 },
      { accessToken, signal: controller.signal },
    ).then(
      (response) => {
        if (!controller.signal.aborted) setCount({ key, value: response.total_elements })
      },
      () => {
        // Необязательная подсказка: без неё опция глоссария просто остаётся скрытой.
        if (!controller.signal.aborted) setCount({ key, value: 0 })
      },
    )
    return () => controller.abort()
  }, [accessToken, enabled, key, sourceLanguage, targetLanguage])

  return enabled && count?.key === key ? count.value : null
}

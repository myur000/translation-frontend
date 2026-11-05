import { useEffect, useState } from 'react'
import { getTerms } from '../api/terms.ts'
import { useAuth } from '../auth/useAuth.ts'

interface Count {
  key: string
  value: number
}

/**
 * Number of the user's terms for a language pair, so the glossary option is
 * offered only when it would change something. `null` while unknown.
 */
export function useGlossaryTermCount(sourceLanguage: string, targetLanguage: string) {
  const { session } = useAuth()
  const accessToken = session?.accessToken ?? null
  const key = `${sourceLanguage}>${targetLanguage}`
  const [count, setCount] = useState<Count | null>(null)

  useEffect(() => {
    if (!accessToken || sourceLanguage === targetLanguage) return
    const controller = new AbortController()
    getTerms(
      { source_lang: sourceLanguage, target_lang: targetLanguage, size: 1 },
      { accessToken, signal: controller.signal },
    ).then(
      (response) => {
        if (!controller.signal.aborted) setCount({ key, value: response.total_elements })
      },
      () => {
        // Optional hint: without it the glossary option simply stays hidden.
        if (!controller.signal.aborted) setCount({ key, value: 0 })
      },
    )
    return () => controller.abort()
  }, [accessToken, key, sourceLanguage, targetLanguage])

  return count?.key === key ? count.value : null
}

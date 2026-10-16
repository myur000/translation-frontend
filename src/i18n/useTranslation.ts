import { useCallback } from 'react'
import { usePreferences } from '../preferences/usePreferences.ts'
import { translate, type TranslationKey } from './translations.ts'

export function useTranslation() {
  const { language } = usePreferences()
  const t = useCallback(
    (key: TranslationKey, variables?: Record<string, string | number>) =>
      translate(language, key, variables),
    [language],
  )

  return { language, t }
}

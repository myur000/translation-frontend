import { useCallback } from 'react'
import { usePreferences } from '../preferences/usePreferences.ts'
import { translate, translateCount, type CountKey, type TranslationKey } from './translations.ts'

export function useTranslation() {
  const { language } = usePreferences()
  const t = useCallback(
    (key: TranslationKey, variables?: Record<string, string | number>) =>
      translate(language, key, variables),
    [language],
  )
  /** С числом: `tc('notes.home.noteCount', 3)` → «3 заметки». */
  const tc = useCallback(
    (key: CountKey, count: number, variables?: Record<string, string | number>) =>
      translateCount(language, key, count, variables),
    [language],
  )

  return { language, t, tc }
}

import { createContext } from 'react'

export type ThemePreference = 'light' | 'dark'
export type InterfaceLanguage = 'ru' | 'en'

export interface PreferencesContextValue {
  theme: ThemePreference
  language: InterfaceLanguage
  /** Синхронная прокрутка колонок в сравнении; по умолчанию включена. */
  isScrollSyncEnabled: boolean
  /** Тихая подсветка цитат из заметок в тексте книги; по умолчанию включена. */
  isQuoteHighlightEnabled: boolean
  setTheme: (theme: ThemePreference) => void
  setLanguage: (language: InterfaceLanguage) => void
  setScrollSyncEnabled: (isEnabled: boolean) => void
  setQuoteHighlightEnabled: (isEnabled: boolean) => void
}

export const PreferencesContext =
  createContext<PreferencesContextValue | null>(null)

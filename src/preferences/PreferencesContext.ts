import { createContext } from 'react'

export type ThemePreference = 'light' | 'dark'
export type InterfaceLanguage = 'ru' | 'en'

export interface PreferencesContextValue {
  theme: ThemePreference
  language: InterfaceLanguage
  /** Синхронная прокрутка колонок в сравнении; по умолчанию включена. */
  isScrollSyncEnabled: boolean
  setTheme: (theme: ThemePreference) => void
  setLanguage: (language: InterfaceLanguage) => void
  setScrollSyncEnabled: (isEnabled: boolean) => void
}

export const PreferencesContext =
  createContext<PreferencesContextValue | null>(null)

import { createContext } from 'react'

export type ThemePreference = 'light' | 'dark'
export type InterfaceLanguage = 'ru' | 'en'

export interface PreferencesContextValue {
  theme: ThemePreference
  language: InterfaceLanguage
  setTheme: (theme: ThemePreference) => void
  setLanguage: (language: InterfaceLanguage) => void
}

export const PreferencesContext =
  createContext<PreferencesContextValue | null>(null)

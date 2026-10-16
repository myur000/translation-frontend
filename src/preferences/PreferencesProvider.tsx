import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  PreferencesContext,
  type InterfaceLanguage,
  type ThemePreference,
} from './PreferencesContext.ts'

export const PREFERENCES_STORAGE_KEY = 'doctranslate.preferences.v1'

interface StoredPreferences {
  theme: ThemePreference
  language: InterfaceLanguage
}

const DEFAULT_PREFERENCES: StoredPreferences = {
  theme: 'light',
  language: 'ru',
}

function readPreferences(): StoredPreferences {
  try {
    const serialized = localStorage.getItem(PREFERENCES_STORAGE_KEY)
    if (!serialized) return DEFAULT_PREFERENCES

    const value: unknown = JSON.parse(serialized)
    if (typeof value !== 'object' || value === null) return DEFAULT_PREFERENCES

    const preferences = value as Partial<StoredPreferences>
    return {
      theme: preferences.theme === 'dark' ? 'dark' : 'light',
      language: preferences.language === 'en' ? 'en' : 'ru',
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(readPreferences)

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme
    document.documentElement.lang = preferences.language
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
  }, [preferences])

  const value = useMemo(
    () => ({
      ...preferences,
      setTheme: (theme: ThemePreference) =>
        setPreferences((current) => ({ ...current, theme })),
      setLanguage: (language: InterfaceLanguage) =>
        setPreferences((current) => ({ ...current, language })),
    }),
    [preferences],
  )

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  )
}

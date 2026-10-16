import { useTranslation } from '../../i18n/useTranslation.ts'
import { usePreferences } from '../../preferences/usePreferences.ts'
import styles from './ThemeToggle.module.css'

export function ThemeToggle() {
  const { theme, setTheme } = usePreferences()
  const { t } = useTranslation()
  const isDark = theme === 'dark'
  const accessibleLabel = t(
    isDark ? 'theme.switchToLight' : 'theme.switchToDark',
  )

  return (
    <button
      type="button"
      className={styles.button}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 2.3v2.1M12 19.6v2.1M4.3 4.3l1.5 1.5M18.2 18.2l1.5 1.5M2.3 12h2.1M19.6 12h2.1M4.3 19.7l1.5-1.5M18.2 5.8l1.5-1.5" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.3 15.1A8.5 8.5 0 0 1 8.9 3.7a8.5 8.5 0 1 0 11.4 11.4Z" />
    </svg>
  )
}

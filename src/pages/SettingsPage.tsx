import { usePreferences } from '../preferences/usePreferences.ts'
import { useTranslation } from '../i18n/useTranslation.ts'
import type {
  InterfaceLanguage,
  ThemePreference,
} from '../preferences/PreferencesContext.ts'
import styles from './SettingsPage.module.css'

export function SettingsPage() {
  const { theme, language, setTheme, setLanguage } = usePreferences()
  const { t } = useTranslation()

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <span>{t('settings.eyebrow')}</span>
        <h1>{t('settings.title')}</h1>
        <p>{t('settings.description')}</p>
      </header>

      <section className={styles.section} aria-labelledby="appearance-title">
        <div className={styles.sectionCopy}>
          <h2 id="appearance-title">{t('settings.appearance')}</h2>
          <p>{t('settings.appearanceDescription')}</p>
        </div>
        <fieldset className={styles.options}>
          <legend>{t('settings.theme')}</legend>
          <PreferenceOption
            name="theme"
            value="light"
            checked={theme === 'light'}
            label={t('settings.light')}
            description={t('settings.lightDescription')}
            preview="light"
            onChange={(value) => setTheme(value as ThemePreference)}
          />
          <PreferenceOption
            name="theme"
            value="dark"
            checked={theme === 'dark'}
            label={t('settings.dark')}
            description={t('settings.darkDescription')}
            preview="dark"
            onChange={(value) => setTheme(value as ThemePreference)}
          />
        </fieldset>
      </section>

      <section className={styles.section} aria-labelledby="language-title">
        <div className={styles.sectionCopy}>
          <h2 id="language-title">{t('settings.languageSection')}</h2>
          <p>{t('settings.languageDescription')}</p>
        </div>
        <fieldset className={styles.options}>
          <legend>{t('settings.interfaceLanguage')}</legend>
          <PreferenceOption
            name="language"
            value="ru"
            checked={language === 'ru'}
            label={t('settings.russian')}
            description="RU"
            onChange={(value) => setLanguage(value as InterfaceLanguage)}
          />
          <PreferenceOption
            name="language"
            value="en"
            checked={language === 'en'}
            label={t('settings.english')}
            description="EN"
            onChange={(value) => setLanguage(value as InterfaceLanguage)}
          />
        </fieldset>
      </section>

      <p className={styles.savedNote}>{t('settings.saved')}</p>
    </div>
  )
}

interface PreferenceOptionProps {
  name: string
  value: string
  checked: boolean
  label: string
  description: string
  preview?: 'light' | 'dark'
  onChange: (value: string) => void
}

function PreferenceOption({
  name,
  value,
  checked,
  label,
  description,
  preview,
  onChange,
}: PreferenceOptionProps) {
  return (
    <label className={`${styles.option} ${checked ? styles.optionActive : ''}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {preview ? (
        <span className={`${styles.themePreview} ${styles[preview]}`} aria-hidden="true">
          <i /><i /><i />
        </span>
      ) : (
        <span className={styles.languagePreview} aria-hidden="true">{description}</span>
      )}
      <span className={styles.optionCopy}>
        <strong>{label}</strong>
        {preview ? <small>{description}</small> : null}
      </span>
      <span className={styles.radioMark} aria-hidden="true" />
    </label>
  )
}

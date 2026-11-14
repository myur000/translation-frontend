import { useId, type ReactElement } from 'react'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { LAYOUT_PRESET_ORDER, type LayoutPreset } from '../../workspace/workspaceLayout.ts'
import styles from './LayoutSwitcher.module.css'

/** Язык колонки: короткий код рисуется на странице, полное название — в подсказке. */
export interface PaneLanguage {
  code: string
  label: string
}

interface LayoutSwitcherProps {
  value: LayoutPreset
  onChange: (preset: LayoutPreset) => void
  source: PaneLanguage
  target: PaneLanguage
}

/**
 * Переключатель раскладки картинками: страница перевода с его языком, раскрытая
 * книга «оригинал | перевод» и страница оригинала. Внутри — нативные
 * радиокнопки, поэтому стрелки, Tab и озвучка «1 из 3» работают без своего кода.
 * Имя каждой кнопки содержит видимый на картинке код языка (WCAG 2.5.3):
 * голосом можно сказать «Перевод RU».
 */
export function LayoutSwitcher({ value, onChange, source, target }: LayoutSwitcherProps) {
  const { t } = useTranslation()
  const name = useId()

  const options: Record<LayoutPreset, { label: string; hint: string; icon: ReactElement }> = {
    translation: {
      label: t('layout.translationOption', { code: target.code }),
      hint: t('layout.translationHint', { language: target.label }),
      icon: <PageIcon code={target.code} />,
    },
    compare: {
      label: t('layout.compareOption', { source: source.code, target: target.code }),
      hint: t('layout.compareHint', { source: source.label, target: target.label }),
      icon: <OpenBookIcon left={source.code} right={target.code} />,
    },
    original: {
      label: t('layout.originalOption', { code: source.code }),
      hint: t('layout.originalHint', { language: source.label }),
      icon: <PageIcon code={source.code} />,
    },
  }

  return (
    <fieldset className={styles.switcher}>
      <legend className={styles.visuallyHidden}>{t('layout.label')}</legend>
      {LAYOUT_PRESET_ORDER.map((preset) => (
        <label key={preset} className={styles.option} title={options[preset].hint}>
          <input
            className={styles.input}
            type="radio"
            name={name}
            value={preset}
            checked={value === preset}
            onChange={() => onChange(preset)}
          />
          <span className={styles.face}>
            {options[preset].icon}
            <span className={styles.visuallyHidden}>{options[preset].label}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

/** Одна страница с загнутым уголком и кодом языка. */
function PageIcon({ code }: { code: string }) {
  return (
    <svg className={styles.page} viewBox="0 0 22 26" aria-hidden="true">
      <path className={styles.sheet} d="M5 1.5h8.5L18.5 6.5V23a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 23V3A1.5 1.5 0 0 1 5 1.5z" />
      <path className={styles.line} d="M13.5 1.5v5h5M6.5 7h4.5" />
      <text className={styles.code} x="11" y="17.2">{code}</text>
    </svg>
  )
}

/** Раскрытая книга: слева оригинал, справа перевод — как колонки на экране. */
function OpenBookIcon({ left, right }: { left: string; right: string }) {
  return (
    <svg className={styles.book} viewBox="0 0 40 26" aria-hidden="true">
      <path className={styles.sheet} d="M20 4.6C16.6 2.6 11.4 1.9 3.5 2.3v19.6c7.9-.4 13.1.3 16.5 2.4 3.4-2.1 8.6-2.8 16.5-2.4V2.3c-7.9-.4-13.1.3-16.5 2.3z" />
      <path className={styles.line} d="M20 4.6v19.7" />
      <text className={styles.code} x="11.8" y="15.4">{left}</text>
      <text className={styles.code} x="28.2" y="15.4">{right}</text>
    </svg>
  )
}

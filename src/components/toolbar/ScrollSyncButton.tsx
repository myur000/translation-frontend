import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './ScrollSyncButton.module.css'

interface ScrollSyncButtonProps {
  isEnabled: boolean
  /**
   * Связывать прокрутку можно только в сравнении. В одной колонке кнопка остаётся
   * на месте (панель не прыгает), но недоступна и объясняет почему; настройка сохраняется.
   */
  isAvailable: boolean
  onToggle: () => void
}

export function ScrollSyncButton({ isEnabled, isAvailable, onToggle }: ScrollSyncButtonProps) {
  const { t } = useTranslation()
  const accessibleLabel = t(isEnabled ? 'toolbar.syncOn' : 'toolbar.syncOff')
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={accessibleLabel}
      aria-pressed={isEnabled}
      // aria-disabled, а не disabled: кнопка остаётся в порядке фокуса, и подсказка видна.
      aria-disabled={!isAvailable || undefined}
      aria-description={isAvailable ? undefined : t('toolbar.syncCompareOnly')}
      title={isAvailable ? accessibleLabel : t('toolbar.syncCompareOnly')}
      onClick={isAvailable ? onToggle : undefined}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect className={styles.track} x="4.5" y="3" width="5" height="18" rx="2.5" />
        <rect className={styles.thumb} x="5.5" y="5" width="3" height="7" rx="1.5" />
        <rect className={styles.track} x="14.5" y="3" width="5" height="18" rx="2.5" />
        <rect className={styles.thumb} x="15.5" y="12" width="3" height="7" rx="1.5" />
      </svg>
    </button>
  )
}

import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './ScrollSyncButton.module.css'

interface ScrollSyncButtonProps { isEnabled: boolean; onToggle: () => void }

export function ScrollSyncButton({ isEnabled, onToggle }: ScrollSyncButtonProps) {
  const { t } = useTranslation()
  const accessibleLabel = t(isEnabled ? 'toolbar.syncOn' : 'toolbar.syncOff')
  return (
    <button type="button" className={styles.button} aria-label={accessibleLabel} aria-pressed={isEnabled} title={accessibleLabel} onClick={onToggle}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect className={styles.track} x="4.5" y="3" width="5" height="18" rx="2.5" />
        <rect className={styles.thumb} x="5.5" y="5" width="3" height="7" rx="1.5" />
        <rect className={styles.track} x="14.5" y="3" width="5" height="18" rx="2.5" />
        <rect className={styles.thumb} x="15.5" y="12" width="3" height="7" rx="1.5" />
      </svg>
    </button>
  )
}

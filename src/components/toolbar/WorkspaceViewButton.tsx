import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './WorkspaceViewButton.module.css'

interface WorkspaceViewButtonProps { isEnabled: boolean; onToggle: () => void }

export function WorkspaceViewButton({ isEnabled, onToggle }: WorkspaceViewButtonProps) {
  const { t } = useTranslation()
  const accessibleLabel = t(isEnabled ? 'toolbar.fullscreenOn' : 'toolbar.fullscreenOff')
  return (
    <button type="button" className={styles.button} aria-label={accessibleLabel} aria-pressed={isEnabled} aria-keyshortcuts="Escape" title={accessibleLabel} onClick={onToggle}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>
    </button>
  )
}

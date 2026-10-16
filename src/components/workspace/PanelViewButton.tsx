import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './PanelViewButton.module.css'

interface PanelViewButtonProps { panelLabel: string; isExpanded: boolean; onClick: () => void }

export function PanelViewButton({ panelLabel, isExpanded, onClick }: PanelViewButtonProps) {
  const { t } = useTranslation()
  const accessibleLabel = t(isExpanded ? 'panel.collapse' : 'panel.expand', { panel: panelLabel })
  return (
    <button type="button" className={styles.button} aria-label={accessibleLabel} aria-pressed={isExpanded} aria-keyshortcuts="Escape" title={`${accessibleLabel}. ${t('zoom.hint')}`} onClick={onClick}>
      {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
    </button>
  )
}
function ExpandIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9 3.5 3.5M3.5 8V3.5H8M15 15l5.5 5.5M16 20.5h4.5V16" /></svg> }
function CollapseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 3.5 9 9M4.5 9H9V4.5M20.5 20.5 15 15M15 19.5V15h4.5" /></svg> }

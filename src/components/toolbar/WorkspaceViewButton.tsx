import { useTranslation } from '../../i18n/useTranslation.ts'
import type { LayoutPreset } from '../../workspace/workspaceLayout.ts'
import styles from './WorkspaceViewButton.module.css'

interface WorkspaceViewButtonProps {
  /** Что откроется на весь экран — то, что сейчас на экране. */
  layout: LayoutPreset
  onOpen: () => void
}

const LABELS = {
  compare: 'toolbar.fullscreenOff',
  translation: 'toolbar.fullscreenTranslation',
  original: 'toolbar.fullscreenOriginal',
} as const

/**
 * Открывает текущую раскладку на весь экран. Выход — Esc: в полноэкранном
 * режиме нижней панели с этой кнопкой нет.
 */
export function WorkspaceViewButton({ layout, onOpen }: WorkspaceViewButtonProps) {
  const { t } = useTranslation()
  const label = t(LABELS[layout])
  return (
    <button type="button" className={styles.button} aria-label={label} title={label} onClick={onOpen}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>
    </button>
  )
}

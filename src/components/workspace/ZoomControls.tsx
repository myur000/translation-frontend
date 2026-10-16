import { useTranslation } from '../../i18n/useTranslation.ts'
import { BOOK_ZOOM_STEP, MAX_BOOK_ZOOM, MIN_BOOK_ZOOM } from '../../hooks/useBookZoom.ts'
import styles from './ZoomControls.module.css'

interface ZoomControlsProps {
  label: string
  zoom: number
  onChange: (zoom: number) => void
}

export function ZoomControls({ label, zoom, onChange }: ZoomControlsProps) {
  const { t } = useTranslation()
  return (
    <div className={styles.controls} role="group" aria-label={t('zoom.label', { panel: label })}>
      <button type="button" disabled={zoom <= MIN_BOOK_ZOOM} aria-label={t('zoom.out', { panel: label })} onClick={() => onChange(zoom - BOOK_ZOOM_STEP)}>−</button>
      <button type="button" className={styles.value} aria-label={t('zoom.reset', { panel: label })} title={t('zoom.hint')} onClick={() => onChange(100)}>{zoom}%</button>
      <button type="button" disabled={zoom >= MAX_BOOK_ZOOM} aria-label={t('zoom.in', { panel: label })} onClick={() => onChange(zoom + BOOK_ZOOM_STEP)}>+</button>
    </div>
  )
}

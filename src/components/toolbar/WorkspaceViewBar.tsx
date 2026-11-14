import { useTranslation } from '../../i18n/useTranslation.ts'
import type { LayoutPreset } from '../../workspace/workspaceLayout.ts'
import { LayoutSwitcher, type PaneLanguage } from './LayoutSwitcher.tsx'
import { NotesToggle } from './NotesToggle.tsx'
import { WorkspaceViewButton } from './WorkspaceViewButton.tsx'
import styles from './WorkspaceViewBar.module.css'

interface WorkspaceViewBarProps {
  layout: LayoutPreset
  onLayoutChange: (preset: LayoutPreset) => void
  source: PaneLanguage
  target: PaneLanguage
  isScrollSyncEnabled: boolean
  onToggleScrollSync: () => void
  notes: { isOpen: boolean; panelId: string; onToggle: () => void }
  onOpenFullscreen: () => void
}

/**
 * Группа «вид документа» внутри нижней панели: что видно на экране и что рядом с
 * книгой (заметки; позже граф). Состав кнопок от раскладки не зависит — иначе панель,
 * выровненная по центру, сдвигалась бы при каждом переключении.
 */
export function WorkspaceViewBar(props: WorkspaceViewBarProps) {
  const { t } = useTranslation()
  return (
    <div className={styles.bar} role="group" aria-label={t('layout.viewBar')}>
      <LayoutSwitcher
        value={props.layout}
        onChange={props.onLayoutChange}
        source={props.source}
        target={props.target}
        scrollSync={{ isEnabled: props.isScrollSyncEnabled, onToggle: props.onToggleScrollSync }}
      />
      {/* Заметки — тоже «что рядом с книгой», поэтому сразу за раскладкой. */}
      <NotesToggle isOpen={props.notes.isOpen} panelId={props.notes.panelId} onToggle={props.notes.onToggle} />
      <span className={styles.separator} aria-hidden="true" />
      <WorkspaceViewButton layout={props.layout} onOpen={props.onOpenFullscreen} />
    </div>
  )
}

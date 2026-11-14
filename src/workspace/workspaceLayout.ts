/**
 * Раскладка рабочей области: основное место и второе.
 *
 * Перевод — главное, ради чего открывают документ; оригинал нужен для сверки.
 * Поэтому раскладка задаётся не набором режимов, а двумя местами: основное
 * (перевод или оригинал) и второе (пусто или другой текст). Следующие виды
 * (заметки, граф, правка) добавятся значениями второго места, а не новыми
 * флагами и режимами.
 */
export type ReadingPane = 'original' | 'translation'
export type SecondarySlot = ReadingPane | null

export interface WorkspaceLayout {
  primary: ReadingPane
  secondary: SecondarySlot
}

/** Готовые раскладки, которые предлагает переключатель в нижней панели. */
export type LayoutPreset = 'translation' | 'compare' | 'original'

export const LAYOUT_PRESETS: Readonly<Record<LayoutPreset, WorkspaceLayout>> = {
  translation: { primary: 'translation', secondary: null },
  compare: { primary: 'translation', secondary: 'original' },
  original: { primary: 'original', secondary: null },
}

/** Порядок в переключателе: от главного (перевод) к справочному (оригинал). */
export const LAYOUT_PRESET_ORDER: readonly LayoutPreset[] = ['translation', 'compare', 'original']

/**
 * Документ без сохранённого выбора открывается в сравнении: после перевода
 * пользователь сначала знакомится с обоими текстами, дальше решает сам.
 */
export const DEFAULT_LAYOUT = LAYOUT_PRESETS.compare

export function showsPane(layout: WorkspaceLayout, pane: ReadingPane) {
  return layout.primary === pane || layout.secondary === pane
}

export function isSinglePane(layout: WorkspaceLayout) {
  return layout.secondary === null
}

/** Готовая раскладка, которой соответствует текущая; колонки всегда идут «оригинал | перевод». */
export function layoutPreset(layout: WorkspaceLayout): LayoutPreset {
  if (showsPane(layout, 'original') && showsPane(layout, 'translation')) return 'compare'
  return layout.primary
}

export function sameLayout(left: WorkspaceLayout, right: WorkspaceLayout) {
  return left.primary === right.primary && left.secondary === right.secondary
}

const PANES: ReadonlySet<unknown> = new Set<ReadingPane>(['original', 'translation'])

/** Раскладка из хранилища: что угодно, кроме допустимой пары мест, отбрасывается. */
export function parseLayout(value: unknown): WorkspaceLayout | null {
  if (typeof value !== 'object' || value === null) return null
  const { primary, secondary } = value as Record<string, unknown>
  if (!PANES.has(primary)) return null
  if (secondary !== null && (!PANES.has(secondary) || secondary === primary)) return null
  return { primary: primary as ReadingPane, secondary: secondary as SecondarySlot }
}

import type { DocumentAction } from '../components/toolbar/DocumentActionsMenu.tsx'
import type { TranslationKey } from '../i18n/translations.ts'
import type { DocumentItem } from '../types/document.ts'

interface DocumentMenuOptions {
  document: DocumentItem
  t: (key: TranslationKey) => string
  isPinned: boolean
  onTogglePin: () => void
  onRate: () => void
  onDelete: () => void
}

/**
 * Пункты меню «⋯» документа: одинаковые в боковой панели и в полосе над документом,
 * чтобы действие нашлось там, где его ищут.
 */
export function documentMenuActions({
  document,
  t,
  isPinned,
  onTogglePin,
  onRate,
  onDelete,
}: DocumentMenuOptions): DocumentAction[] {
  if (!document.jobId) {
    return [{ id: 'remove-draft', label: t('documentActions.removeDraft'), danger: true, onSelect: onDelete }]
  }
  return [
    {
      id: 'pin',
      label: t(isPinned ? 'documentActions.unpin' : 'documentActions.pin'),
      onSelect: onTogglePin,
    },
    ...(document.status === 'ready'
      ? [{ id: 'rate', label: t('documentActions.rate'), onSelect: onRate }]
      : []),
    {
      id: 'delete',
      label: t('documentActions.delete'),
      danger: true,
      disabledReason: document.status === 'processing' ? t('documentActions.processing') : undefined,
      onSelect: onDelete,
    },
  ]
}

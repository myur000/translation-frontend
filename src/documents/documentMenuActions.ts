import type { DocumentAction } from '../components/toolbar/DocumentActionsMenu.tsx'
import type { TranslationKey } from '../i18n/translations.ts'
import type { DocumentItem } from '../types/document.ts'
import { canCancelTranslation } from './translationStatus.ts'

interface DocumentMenuOptions {
  document: DocumentItem
  t: (key: TranslationKey) => string
  isPinned: boolean
  onTogglePin: () => void
  onRate: () => void
  /** Перевод на другой язык; без него пункт не показывается. */
  onRetranslate?: () => void
  /** Отмена идущего перевода; пункт есть только у задач в `PENDING`/`PROCESSING`. */
  onCancelTranslation: () => void
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
  onRetranslate,
  onCancelTranslation,
  onDelete,
}: DocumentMenuOptions): DocumentAction[] {
  if (!document.jobId) {
    return [{ id: 'remove-draft', label: t('documentActions.removeDraft'), icon: 'trash', danger: true, onSelect: onDelete }]
  }
  const isProcessing = document.status === 'processing'
  return [
    {
      id: 'pin',
      label: t(isPinned ? 'documentActions.unpin' : 'documentActions.pin'),
      icon: isPinned ? 'unpin' : 'pin',
      onSelect: onTogglePin,
    },
    ...(document.status === 'ready'
      ? [{ id: 'rate', label: t('documentActions.rate'), icon: 'star' as const, onSelect: onRate }]
      : []),
    ...(onRetranslate
      ? [{
          id: 'retranslate',
          label: t('documentActions.retranslate'),
          icon: 'language' as const,
          disabledReason: isProcessing ? t('documentActions.processing') : undefined,
          onSelect: onRetranslate,
        }]
      : []),
    ...(canCancelTranslation(document)
      ? [{
          id: 'cancel-translation',
          label: t('documentActions.cancelTranslation'),
          icon: 'cancel' as const,
          danger: true,
          onSelect: onCancelTranslation,
        }]
      : []),
    {
      id: 'delete',
      label: t('documentActions.delete'),
      icon: 'trash',
      danger: true,
      disabledReason: isProcessing ? t('documentActions.deleteWhileProcessing') : undefined,
      onSelect: onDelete,
    },
  ]
}

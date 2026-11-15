import type { DocumentAction } from '../components/toolbar/DocumentActionsMenu.tsx'
import type { TranslationKey } from '../i18n/translations.ts'
import type { DocumentItem } from '../types/document.ts'
import type { useReadingProgress } from '../reading/readingProgress.ts'
import { canCancelTranslation } from './translationStatus.ts'

interface DocumentMenuOptions {
  document: DocumentItem
  t: (key: TranslationKey) => string
  isPinned: boolean
  onTogglePin: () => void
  onRate: () => void
  /** Ручная отметка прочтения; только у готового перевода. */
  reading?: { isRead: boolean; onToggle: () => void }
  /** Открыть книгу сразу с её конспектом; без него пункта нет (в самой книге есть кнопка и K). */
  onOpenSummary?: () => void
  /** Перевод на другой язык; без него пункт не показывается. */
  onRetranslate?: () => void
  /** Отмена идущего перевода; пункт есть только у задач в `PENDING`/`PROCESSING`. */
  onCancelTranslation: () => void
  /** Скачать готовый перевод; без него пункта нет (в боковой панели скачивания нет). */
  download?: { isBusy: boolean; onSelect: () => void }
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
  reading,
  onOpenSummary,
  onRetranslate,
  onCancelTranslation,
  download,
  onDelete,
}: DocumentMenuOptions): DocumentAction[] {
  if (!document.jobId) {
    return [{ id: 'remove-draft', label: t('documentActions.removeDraft'), icon: 'trash', danger: true, onSelect: onDelete }]
  }
  const isProcessing = document.status === 'processing'
  return [
    // Главное действие с готовым переводом — первым пунктом.
    ...(download && document.status === 'ready'
      ? [{
          id: 'download',
          label: t(download.isBusy ? 'toolbar.downloading' : 'documentActions.download'),
          icon: 'download' as const,
          disabledReason: download.isBusy ? t('toolbar.downloading') : undefined,
          onSelect: download.onSelect,
        }]
      : []),
    {
      id: 'pin',
      label: t(isPinned ? 'documentActions.unpin' : 'documentActions.pin'),
      icon: isPinned ? 'unpin' : 'pin',
      onSelect: onTogglePin,
    },
    ...(reading
      ? [{
          id: 'reading',
          label: t(reading.isRead ? 'reading.markUnread' : 'reading.markRead'),
          icon: reading.isRead ? 'unread' as const : 'read' as const,
          onSelect: reading.onToggle,
        }]
      : []),
    // Конспект можно начать и пока книга переводится: он о книге целиком, а не о тексте.
    ...(onOpenSummary
      ? [{ id: 'summary', label: t('documentActions.summary'), icon: 'summary' as const, onSelect: onOpenSummary }]
      : []),
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

/** Пункт «Отметить прочитанной / непрочитанной» для меню книги. */
export function readingToggle(reading: ReturnType<typeof useReadingProgress>, jobId: string) {
  const isRead = reading.stateOf(jobId).status === 'read'
  return { isRead, onToggle: () => reading.markRead(jobId, !isRead) }
}

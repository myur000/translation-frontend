import { useState } from 'react'
import { ApiClientError, hasApiErrorCode } from '../../api/client.ts'
import { DocumentUploadPreparationError } from '../../errors/DocumentUploadPreparationError.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { DocumentItem } from '../../types/document.ts'
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx'

interface CancelTranslationDialogProps {
  document: DocumentItem
  onCancelTranslation: (documentId: string) => Promise<void>
  onClose: () => void
}

/**
 * Подтверждение отмены перевода: одно и то же из боковой панели, меню документа
 * и нижней панели. Страницы возвращаются, только если перевод ещё не начался,
 * поэтому для `PROCESSING` диалог прямо предупреждает, что они не вернутся.
 */
export function CancelTranslationDialog({ document, onCancelTranslation, onClose }: CancelTranslationDialogProps) {
  const { t } = useTranslation()
  const [isCanceling, setCanceling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    setCanceling(true)
    setError(null)
    try {
      await onCancelTranslation(document.id)
      onClose()
    } catch (reason) {
      setError(cancelErrorMessage(reason))
      setCanceling(false)
    }
  }

  function cancelErrorMessage(reason: unknown) {
    if (reason instanceof DocumentUploadPreparationError) return reason.message
    if (hasApiErrorCode(reason, 'DOCUMENT_ALREADY_FINISHED')) return t('cancel.finished')
    if (reason instanceof ApiClientError && reason.status === 404) return t('cancel.notFound')
    return t('cancel.failed')
  }

  return (
    <ConfirmDialog
      title={t('cancel.title', { name: document.name })}
      description={t(document.serverStatus === 'PROCESSING' ? 'cancel.descriptionProcessing' : 'cancel.descriptionQueued')}
      confirmLabel={t('cancel.confirm')}
      dismissLabel={t('cancel.keep')}
      busy={isCanceling}
      error={error}
      onConfirm={() => void confirm()}
      onClose={onClose}
    />
  )
}

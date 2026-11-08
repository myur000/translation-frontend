import { useState } from 'react'
import { ApiClientError } from '../../api/client.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { DocumentItem } from '../../types/document.ts'
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx'

interface DeleteDocumentDialogProps {
  document: DocumentItem
  onDelete: (documentId: string) => Promise<void>
  onClose: () => void
}

/** Подтверждение удаления: одно и то же из боковой панели и из меню документа. */
export function DeleteDocumentDialog({ document, onDelete, onClose }: DeleteDocumentDialogProps) {
  const { t } = useTranslation()
  const [isDeleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onDelete(document.id)
      onClose()
    } catch (reason) {
      // 409: задача ещё выполняется, бэкенд удалит её только после завершения.
      setError(reason instanceof ApiClientError && reason.status === 409
        ? t('delete.processing')
        : t('delete.failed'))
      setDeleting(false)
    }
  }

  return (
    <ConfirmDialog
      title={t('delete.title', { name: document.name })}
      description={t('delete.description')}
      confirmLabel={t('delete.confirm')}
      busy={isDeleting}
      error={error}
      onConfirm={() => void confirm()}
      onClose={onClose}
    />
  )
}

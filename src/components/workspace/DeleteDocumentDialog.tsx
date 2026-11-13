import { useState } from 'react'
import { hasApiErrorCode } from '../../api/client.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { useNotesList } from '../../notes/useNotesList.ts'
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
  // Цитаты переживают удаление книги — предупреждаем, в скольких заметках они останутся.
  const quotingNotes = useNotesList(document.jobId ? { job_id: document.jobId, size: 1 } : null, 0)
  const notesKept = quotingNotes.status === 'ready' && quotingNotes.total > 0
    ? ` ${t('delete.notesKept', { count: quotingNotes.total })}` : ''

  const confirm = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onDelete(document.id)
      onClose()
    } catch (reason) {
      // Задача ещё выполняется: удалить её можно после завершения или отмены перевода.
      setError(hasApiErrorCode(reason, 'DOCUMENT_STILL_PROCESSING')
        ? t('delete.processing')
        : t('delete.failed'))
      setDeleting(false)
    }
  }

  return (
    <ConfirmDialog
      title={t('delete.title', { name: document.name })}
      description={`${t('delete.description')}${notesKept}`}
      confirmLabel={t('delete.confirm')}
      busy={isDeleting}
      error={error}
      onConfirm={() => void confirm()}
      onClose={onClose}
    />
  )
}

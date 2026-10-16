import { useEffect, useRef, useState } from 'react'
import { ApiClientError } from '../api/client.ts'
import { downloadTranslation } from '../api/translations.ts'
import { useAuth } from '../auth/useAuth.ts'
import { saveDownloadedFile, translationDownloadFileName } from '../documents/fileDownload.ts'
import { useTranslation } from '../i18n/useTranslation.ts'
import type { DocumentItem } from '../types/document.ts'

export function useTranslationDownload(document: DocumentItem) {
  const { session } = useAuth()
  const { t } = useTranslation()
  const requestRef = useRef<AbortController | null>(null)
  const [isDownloading, setDownloading] = useState(false)
  const [notice, setNotice] = useState('')
  const [isError, setError] = useState(false)
  const canDownload = document.status === 'ready' && Boolean(document.jobId)

  useEffect(() => () => {
    requestRef.current?.abort()
    requestRef.current = null
  }, [document.id, session?.email])

  const download = async () => {
    if (requestRef.current) return
    const showNotice = (message: string, error = true) => {
      setNotice(message)
      setError(error)
    }
    if (!document.jobId) {
      showNotice(t('workspace.downloadDraft'))
      return
    }
    if (document.status !== 'ready') {
      showNotice(t(document.status === 'failed'
        ? 'workspace.downloadFailedTranslation' : 'workspace.downloadProcessing'))
      return
    }
    if (!session) {
      showNotice(t('auth.sessionExpired'))
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setDownloading(true)
    setNotice('')
    setError(false)
    try {
      const result = await downloadTranslation(document.jobId, {
        accessToken: session.accessToken, signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (result.blob.size === 0) {
        showNotice(t('workspace.downloadEmpty'))
        return
      }
      // A misconfigured proxy must not save an HTML page or JSON error as a book.
      const mimeType = result.contentType?.split(';')[0].trim().toLowerCase()
      if (mimeType === 'text/html' || mimeType === 'application/json' || mimeType?.endsWith('+json')) {
        showNotice(t('workspace.downloadInvalidResponse'))
        return
      }
      const name = translationDownloadFileName(result.fileName, document.name, document.targetLanguage)
      saveDownloadedFile(result.blob, name)
      showNotice(t('workspace.downloadStarted', { name }), false)
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof ApiClientError) {
        if (error.status === 401) showNotice(t('auth.sessionExpired'))
        else if (error.status === 403) showNotice(t('workspace.downloadForbidden'))
        else if (error.status === 404) showNotice(t('workspace.downloadNotFound'))
        else if (error.status === 409) showNotice(t('workspace.downloadProcessing'))
        else if (error.status === 410) showNotice(t('workspace.downloadExpired'))
        else if (error.status === 429) showNotice(
          error.retryAfterSeconds
            ? t('workspace.downloadRetryAfter', { seconds: error.retryAfterSeconds })
            : t('workspace.downloadRateLimit'),
        )
        else showNotice(t('workspace.downloadFailed'))
      } else showNotice(t('workspace.downloadFailed'))
    } finally {
      if (requestRef.current === controller) requestRef.current = null
      if (!controller.signal.aborted) setDownloading(false)
    }
  }

  const clearNotice = () => { setNotice(''); setError(false) }
  return { isDownloading, canDownload, notice, isError, download, clearNotice }
}

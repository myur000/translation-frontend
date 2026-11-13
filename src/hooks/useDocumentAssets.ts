import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiClientError } from '../api/client.ts'
import { loadOriginalText } from '../api/documentText.ts'
import { downloadTranslation } from '../api/translations.ts'
import { useAuth } from '../auth/useAuth.ts'
import type { DocumentItem } from '../types/document.ts'
import { fileFormat, type AssetState } from '../viewer/types.ts'

// Постоянные объекты: от ссылки на состояние зависят эффекты просмотра (восстановление прокрутки).
const ORIGINAL_MISSING: AssetState = { status: 'message', message: 'viewer.originalMissing' }
const ORIGINAL_LOADING: AssetState = { status: 'loading' }
const ORIGINAL_UNAVAILABLE: AssetState = { status: 'message', message: 'viewer.originalMissing', retry: true }

export function useDocumentAssets(document: DocumentItem) {
  const { session } = useAuth()
  const accessTokenRef = useRef(session?.accessToken)
  const [retryRevision, setRetryRevision] = useState(0)
  const key = `${session?.email ?? ''}:${document.id}:${document.jobId ?? ''}:${document.status}:${retryRevision}`
  const [result, setResult] = useState<{ key: string; source: AssetState } | null>(null)
  const [remoteOriginal, setRemoteOriginal] = useState<{ key: string; source: AssetState } | null>(null)
  useEffect(() => { accessTokenRef.current = session?.accessToken }, [session?.accessToken])
  const localOriginal = useMemo<AssetState | null>(() => {
    const file = document.sourceFile
    if (!file) return null
    const format = fileFormat(file.name)
    return format ? { status: 'ready', asset: { blob: file, name: file.name, format } }
      : { status: 'message', message: 'viewer.invalidFile' }
  }, [document.sourceFile])
  // Файл оригинала живёт только в памяти вкладки. Без него берём текст с сервера:
  // оформления нет, но книгу можно читать рядом с переводом и после перезагрузки.
  const needsRemoteOriginal = !document.sourceFile && Boolean(document.jobId) && document.status === 'ready'
  // Текст и скачивание перевода делят на бэкенде один файловый слот аккаунта:
  // параллельный второй запрос получает 429. Поэтому текст просим после перевода.
  const translationSettled = result?.key === key

  useEffect(() => {
    if (!needsRemoteOriginal || !translationSettled || !document.jobId || !session?.email) return
    const controller = new AbortController()
    const token = accessTokenRef.current
    if (!token) return
    loadOriginalText(document.jobId, { accessToken: token, signal: controller.signal }).then((text) => {
      if (controller.signal.aborted) return
      setRemoteOriginal({ key, source: !text.available
        ? { status: 'message', message: 'viewer.originalExpired' }
        : text.paragraphs.length
          ? { status: 'text', paragraphs: text.paragraphs, truncated: text.truncated }
          : ORIGINAL_MISSING })
    }, () => {
      if (controller.signal.aborted) return
      // Текст — лишь замена файлу: при ошибке можно повторить или выбрать файл.
      setRemoteOriginal({ key, source: ORIGINAL_UNAVAILABLE })
    })
    return () => controller.abort()
  }, [needsRemoteOriginal, translationSettled, document.jobId, session?.email, key])

  const original: AssetState = localOriginal
    ?? (!needsRemoteOriginal ? ORIGINAL_MISSING
      : remoteOriginal?.key === key ? remoteOriginal.source : ORIGINAL_LOADING)

  useEffect(() => {
    if (!document.jobId || document.status !== 'ready' || !session?.email) return
    const controller = new AbortController()
    const token = accessTokenRef.current
    if (!token) return
    downloadTranslation(document.jobId, { accessToken: token, signal: controller.signal }).then((file) => {
      if (controller.signal.aborted) return
      const format = fileFormat(file.fileName ?? document.name)
      const mime = file.contentType?.split(';')[0].trim().toLowerCase()
      const invalid = !format || !file.blob.size || mime === 'text/html' || mime?.includes('json')
      setResult({ key, source: invalid
        ? { status: 'message', message: 'viewer.invalidFile', retry: true }
        : { status: 'ready', asset: { blob: file.blob, name: file.fileName ?? document.name, format } } })
    }, (error: unknown) => {
      if (controller.signal.aborted) return
      const message = error instanceof ApiClientError && error.status === 410 ? 'viewer.expired'
        : error instanceof ApiClientError && error.status === 409 ? 'viewer.translationPending'
          : error instanceof ApiClientError && error.status === 404 ? 'viewer.notFound'
            : 'viewer.loadFailed'
      setResult({ key, source: { status: 'message', message, retry: true } })
    })
    return () => controller.abort()
  }, [document.jobId, document.id, document.name, document.status, session?.email, key])

  const translation: AssetState = !document.jobId
    ? { status: 'message', message: 'viewer.translationDraft' }
    : document.status === 'failed'
      ? { status: 'message', message: 'viewer.translationFailed' }
    : document.status === 'canceled'
      ? { status: 'message', message: 'viewer.translationCanceled' }
      : document.waitingIssue
        ? { status: 'message', message: document.waitingIssue === 'stalled'
          ? 'viewer.translationStalled' : 'viewer.translationUnreachable', retry: true }
      : document.status !== 'ready'
        ? { status: 'message', message: document.serverStatus === 'PENDING'
          ? 'viewer.translationQueued' : 'viewer.translationPending' }
        : result?.key === key ? result.source : { status: 'loading' }
  return { original, translation, retry: () => setRetryRevision((value) => value + 1) }
}

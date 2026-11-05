import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { ApiClientError } from '../../api/client.ts'
import { createIdempotencyKey } from '../../api/idempotency.ts'
import { isQuotaExceeded } from '../../documents/documentErrors.ts'
import { useGlossaryTermCount } from '../../documents/useGlossaryTermCount.ts'
import { DocumentUploadPreparationError } from '../../errors/DocumentUploadPreparationError.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { POPULAR_LANGUAGES, toCatalogLanguageCode } from '../../languages/languageCatalog.ts'
import { useLanguageCatalog } from '../../languages/useLanguageCatalog.ts'
import type { DocumentItem } from '../../types/document.ts'
import { LanguagePicker } from '../languages/LanguagePicker.tsx'
import styles from './RetranslateDialog.module.css'

export interface RetranslateSubmit {
  targetLanguage: string
  useGlossary: boolean
  idempotencyKey: string
}

interface RetranslateDialogProps {
  document: DocumentItem
  onSubmit: (request: RetranslateSubmit) => Promise<unknown>
  onClose: () => void
}

type T = ReturnType<typeof useTranslation>['t']

function errorMessage(error: unknown, t: T) {
  if (error instanceof DocumentUploadPreparationError) return error.message
  if (!(error instanceof ApiClientError)) return t('retranslate.failed')
  if (error.status === 403) return t('workspace.verifyEmailBeforeUpload')
  if (error.status === 404) return t('document.missingDescription')
  if (error.status === 410) return t('retranslate.sourceExpired')
  if (error.status === 429) {
    return isQuotaExceeded(error) ? t('plans.uploadQuotaExceeded') : t('workspace.uploadRateLimit')
  }
  return error.details?.message || t('retranslate.failed')
}

/** First popular language that is neither the source nor the current target. */
function suggestTarget(source: string, current: string) {
  return POPULAR_LANGUAGES.find((code) => code !== source && code !== current) ?? current
}

export function RetranslateDialog({ document, onSubmit, onClose }: RetranslateDialogProps) {
  const { t } = useTranslation()
  const { getLabel } = useLanguageCatalog()
  const id = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const sourceLanguage = toCatalogLanguageCode(document.sourceLanguage)
  const [targetLanguage, setTargetLanguage] = useState(() =>
    suggestTarget(sourceLanguage, toCatalogLanguageCode(document.targetLanguage)))
  const [useGlossary, setUseGlossary] = useState(false)
  const [isBusy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One key per distinct request: retrying the same request after a lost
  // response reuses it, a changed request must not (the backend answers 422).
  const keys = useRef(new Map<string, string>())
  const termCount = useGlossaryTermCount(sourceLanguage, targetLanguage)
  const isSameLanguage = targetLanguage === sourceLanguage

  useEffect(() => {
    const element = dialogRef.current!
    const previousFocus = window.document.activeElement as HTMLElement | null
    element.showModal()
    return () => {
      element.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSameLanguage || isBusy) return
    const glossary = useGlossary && Boolean(termCount)
    const requestKey = `${targetLanguage}|${glossary}`
    let idempotencyKey = keys.current.get(requestKey)
    if (!idempotencyKey) {
      idempotencyKey = createIdempotencyKey()
      keys.current.set(requestKey, idempotencyKey)
    }

    setBusy(true)
    setError(null)
    try {
      await onSubmit({ targetLanguage, useGlossary: glossary, idempotencyKey })
      onClose()
    } catch (submitError) {
      if (submitError instanceof ApiClientError && submitError.status === 422) {
        keys.current.delete(requestKey)
      }
      setError(errorMessage(submitError, t))
      setBusy(false)
    }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      aria-busy={isBusy}
      onCancel={(event) => {
        event.preventDefault()
        if (!isBusy) onClose()
      }}
    >
      <form onSubmit={(event) => void handleSubmit(event)}>
        <h2 id={`${id}-title`}>{t('retranslate.title')}</h2>
        <p id={`${id}-description`} className={styles.description}>
          {t('retranslate.description', {
            name: document.name,
            source: getLabel(sourceLanguage),
          })}
        </p>

        <div className={styles.field}>
          <span className={styles.label}>{t('toolbar.targetLanguage')}</span>
          <LanguagePicker
            value={targetLanguage}
            label={t('toolbar.targetLanguage')}
            disabled={isBusy}
            onChange={(code) => {
              setTargetLanguage(code)
              setError(null)
            }}
          />
          {isSameLanguage ? (
            <span className={styles.hint} role="status">{t('retranslate.sameLanguage')}</span>
          ) : null}
        </div>

        {termCount ? (
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={useGlossary}
              disabled={isBusy}
              onChange={(event) => setUseGlossary(event.currentTarget.checked)}
            />
            <span>{t('glossary.apply', { count: termCount })}</span>
          </label>
        ) : null}

        {document.billedUnits ? (
          <p className={styles.hint}>{t('retranslate.cost', { units: document.billedUnits })}</p>
        ) : null}

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <div className={styles.actions}>
          <button type="button" disabled={isBusy} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className={styles.primary}
            disabled={isBusy || isSameLanguage}
            aria-busy={isBusy}
          >
            {t(isBusy ? 'retranslate.submitting' : 'retranslate.submit')}
          </button>
        </div>
      </form>
    </dialog>,
    window.document.body,
  )
}

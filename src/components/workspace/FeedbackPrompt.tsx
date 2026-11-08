import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ApiClientError } from '../../api/client.ts'
import { getDocumentFeedback, saveDocumentFeedback } from '../../api/documents.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import {
  rememberFeedbackPromptDismissed,
  type FeedbackPromptMode,
} from '../../documents/feedbackPromptStorage.ts'
import styles from './FeedbackPrompt.module.css'

const RATINGS = [1, 2, 3, 4, 5] as const
/** Лимит бэкенда на длину комментария (TranslationFeedback.MAX_COMMENT_LENGTH). */
const MAX_COMMENT_LENGTH = 2000
const THANKS_VISIBLE_MS = 2500
interface FeedbackPromptProps {
  jobId: string
  documentName: string
  mode: FeedbackPromptMode
  onClose: () => void
}

type Step = 'loading' | 'rate' | 'comment' | 'thanks'

/**
 * Немодальная карточка в углу рабочей области. Звезда сразу сохраняет оценку,
 * комментарий — необязательный второй шаг. Сохранение заменяет предыдущую оценку
 * вместе с комментарием, поэтому текущий комментарий отправляется заново.
 */
export function FeedbackPrompt({ jobId, documentName, mode, onClose }: FeedbackPromptProps) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const accessToken = session?.accessToken ?? null
  const id = useId()
  const [step, setStep] = useState<Step>('loading')
  const [rating, setRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [hovered, setHovered] = useState<number | null>(null)
  const [isSaving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const tokenRef = useRef(accessToken)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    tokenRef.current = accessToken
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const token = tokenRef.current
    if (!token) return
    const controller = new AbortController()
    getDocumentFeedback(jobId, { accessToken: token, signal: controller.signal }).then(
      (response) => {
        if (controller.signal.aborted) return
        // Оценка уже есть: снова предлагать без запроса — лишний шум.
        if (mode === 'auto') return onCloseRef.current()
        setRating(response.rating)
        setComment(response.comment ?? '')
        setStep('rate')
      },
      (loadError: unknown) => {
        if (controller.signal.aborted) return
        const notRated = loadError instanceof ApiClientError && loadError.status === 404
        if (notRated || mode === 'manual') setStep('rate')
        else onCloseRef.current()
      },
    )
    return () => controller.abort()
  }, [jobId, mode])

  useEffect(() => {
    if (step !== 'thanks') return
    const timer = window.setTimeout(() => onCloseRef.current(), THANKS_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [step])

  const save = async (nextRating: number, nextComment: string) => {
    if (!accessToken) return false
    setSaving(true)
    setError('')
    try {
      const response = await saveDocumentFeedback(
        jobId,
        { rating: nextRating, comment: nextComment.trim() || null },
        { accessToken },
      )
      setRating(response.rating)
      setComment(response.comment ?? '')
      return true
    } catch {
      setError(t('feedback.saveFailed'))
      return false
    } finally {
      setSaving(false)
    }
  }

  const rate = async (value: number) => {
    if (isSaving) return
    if (await save(value, comment)) setStep('comment')
  }

  const handleStarsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = rating ?? 0
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      void rate(Math.min(5, current + 1))
    } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowDown') && current > 1) {
      event.preventDefault()
      void rate(current - 1)
    }
  }

  const dismiss = () => {
    if (mode === 'auto' && rating === null) rememberFeedbackPromptDismissed(jobId)
    onClose()
  }

  if (step === 'loading') return null

  const shown = hovered ?? rating ?? 0

  return (
    <section
      className={styles.card}
      role="dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-document`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') dismiss()
      }}
    >
      <button type="button" className={styles.close} aria-label={t('common.close')} onClick={dismiss}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>
      </button>

      {step === 'thanks' ? (
        <p className={styles.thanks} role="status" id={`${id}-title`}>{t('feedback.thanks')}</p>
      ) : (
        <>
          <h2 id={`${id}-title`}>{t('feedback.title')}</h2>
          <p id={`${id}-document`} className={styles.document}>{documentName}</p>

          <div
            className={styles.stars}
            role="radiogroup"
            aria-label={t('feedback.label')}
            aria-busy={isSaving}
            onKeyDown={handleStarsKeyDown}
            onPointerLeave={() => setHovered(null)}
          >
            {RATINGS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={t('feedback.star', { rating: value })}
                tabIndex={value === (rating ?? 1) ? 0 : -1}
                className={`${styles.star} ${value <= shown ? styles.filled : ''}`}
                disabled={isSaving}
                autoFocus={mode === 'manual' && value === (rating ?? 1)}
                onPointerEnter={() => setHovered(value)}
                onClick={() => void rate(value)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
                </svg>
              </button>
            ))}
          </div>

          {step === 'comment' ? (
            <form
              className={styles.commentForm}
              onSubmit={(event) => {
                event.preventDefault()
                if (rating !== null) {
                  void save(rating, comment).then((saved) => { if (saved) setStep('thanks') })
                }
              }}
            >
              <label htmlFor={`${id}-comment`}>{t('feedback.commentLabel')}</label>
              <textarea
                id={`${id}-comment`}
                value={comment}
                maxLength={MAX_COMMENT_LENGTH}
                rows={3}
                placeholder={t('feedback.commentPlaceholder')}
                onChange={(event) => setComment(event.currentTarget.value)}
              />
              <div className={styles.actions}>
                <button type="button" onClick={() => setStep('thanks')}>{t('feedback.skipComment')}</button>
                <button type="submit" className={styles.primary} disabled={isSaving}>
                  {t('feedback.send')}
                </button>
              </div>
            </form>
          ) : mode === 'auto' ? (
            <button type="button" className={styles.later} onClick={dismiss}>{t('feedback.later')}</button>
          ) : null}

          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </>
      )}
    </section>
  )
}

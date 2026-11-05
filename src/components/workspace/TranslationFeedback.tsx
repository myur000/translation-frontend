import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ApiClientError } from '../../api/client.ts'
import { getDocumentFeedback, saveDocumentFeedback } from '../../api/documents.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './TranslationFeedback.module.css'

const RATINGS = [1, 2, 3, 4, 5] as const
/** Backend limit for the comment (TranslationFeedback.MAX_COMMENT_LENGTH). */
const MAX_COMMENT_LENGTH = 2000

interface Feedback {
  rating: number
  comment: string | null
}

type LoadState = 'loading' | 'ready' | 'error'

/**
 * Star rating (1–5) with an optional comment for a finished translation.
 * Saving replaces the previous rating together with its comment, so the
 * current comment is always sent along with a new rating.
 */
export function TranslationFeedback({ jobId }: { jobId: string }) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const accessToken = session?.accessToken ?? null
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [isSaving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [isCommentOpen, setCommentOpen] = useState(false)
  const [draft, setDraft] = useState('')
  // The token rotates every few minutes; the rating must not be re-read for that.
  const tokenRef = useRef(accessToken)
  useEffect(() => {
    tokenRef.current = accessToken
  })
  const hasSession = accessToken !== null

  useEffect(() => {
    const token = tokenRef.current
    if (!hasSession || !token) return
    const controller = new AbortController()
    getDocumentFeedback(jobId, { accessToken: token, signal: controller.signal }).then(
      (response) => {
        if (controller.signal.aborted) return
        setFeedback({ rating: response.rating, comment: response.comment })
        setLoadState('ready')
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        // 404 means "not rated yet", which is the normal starting point.
        setLoadState(error instanceof ApiClientError && error.status === 404 ? 'ready' : 'error')
      },
    )
    return () => controller.abort()
  }, [jobId, hasSession])

  useEffect(() => {
    if (!isCommentOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setCommentOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isCommentOpen])

  const save = async (next: Feedback) => {
    if (!accessToken) return false
    setSaving(true)
    setStatus('')
    try {
      const response = await saveDocumentFeedback(
        jobId,
        { rating: next.rating, comment: next.comment },
        { accessToken },
      )
      setFeedback({ rating: response.rating, comment: response.comment })
      setStatus(t('feedback.saved'))
      return true
    } catch {
      setStatus(t('feedback.saveFailed'))
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleRate = (rating: number) => {
    if (isSaving) return
    void save({ rating, comment: feedback?.comment ?? null })
  }

  // Roving radio group: arrows change the value, as in a native radio set.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = feedback?.rating ?? 0
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      handleRate(Math.min(5, current + 1))
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      if (current > 1) handleRate(current - 1)
    }
  }

  const openComment = () => {
    setDraft(feedback?.comment ?? '')
    setCommentOpen(true)
  }

  const saveComment = async () => {
    if (!feedback) return
    if (await save({ rating: feedback.rating, comment: draft.trim() || null })) {
      setCommentOpen(false)
    }
  }

  if (loadState !== 'ready') return null

  const shown = hovered ?? feedback?.rating ?? 0
  const focusable = feedback?.rating ?? 1

  return (
    <div className={styles.root} ref={rootRef}>
      <div
        className={styles.stars}
        role="radiogroup"
        aria-label={t('feedback.label')}
        aria-busy={isSaving}
        onKeyDown={handleKeyDown}
        onPointerLeave={() => setHovered(null)}
      >
        {RATINGS.map((rating) => (
          <button
            key={rating}
            type="button"
            role="radio"
            aria-checked={feedback?.rating === rating}
            aria-label={t('feedback.star', { rating })}
            tabIndex={rating === focusable ? 0 : -1}
            className={`${styles.star} ${rating <= shown ? styles.filled : ''}`}
            disabled={isSaving}
            onPointerEnter={() => setHovered(rating)}
            onClick={() => handleRate(rating)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
            </svg>
          </button>
        ))}
      </div>

      {feedback ? (
        <button
          type="button"
          className={styles.commentButton}
          aria-expanded={isCommentOpen}
          aria-controls={`${id}-comment`}
          onClick={() => (isCommentOpen ? setCommentOpen(false) : openComment())}
        >
          {t(feedback.comment ? 'feedback.editComment' : 'feedback.addComment')}
        </button>
      ) : null}

      <span className={styles.status} role="status">{status}</span>

      {isCommentOpen ? (
        <div id={`${id}-comment`} className={styles.popover}>
          <label htmlFor={`${id}-text`}>{t('feedback.commentLabel')}</label>
          <textarea
            id={`${id}-text`}
            value={draft}
            maxLength={MAX_COMMENT_LENGTH}
            rows={4}
            placeholder={t('feedback.commentPlaceholder')}
            autoFocus
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setCommentOpen(false)
            }}
          />
          <div className={styles.popoverFooter}>
            <span>{draft.length} / {MAX_COMMENT_LENGTH}</span>
            <button type="button" onClick={() => setCommentOpen(false)}>{t('common.cancel')}</button>
            <button
              type="button"
              className={styles.primary}
              disabled={isSaving}
              onClick={() => void saveComment()}
            >
              {t('feedback.saveComment')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

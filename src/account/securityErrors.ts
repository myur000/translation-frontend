import { ApiClientError, hasApiErrorCode } from '../api/client.ts'
import type { TranslationKey } from '../i18n/translations.ts'

type T = (key: TranslationKey, variables?: Record<string, string | number>) => string

/** Что пошло не так в действии с паролем или кодом; `field` — какое поле подсветить. */
export interface SecurityError {
  message: string
  field?: 'password' | 'code' | 'newPassword' | 'email'
}

export function securityError(error: unknown, t: T): SecurityError {
  if (hasApiErrorCode(error, 'INVALID_CURRENT_PASSWORD')) return { message: t('security.wrongPassword'), field: 'password' }
  if (hasApiErrorCode(error, 'INVALID_SECOND_FACTOR_CODE')) return { message: t('security.wrongCode'), field: 'code' }
  if (hasApiErrorCode(error, 'PASSWORD_UNCHANGED')) return { message: t('security.passwordUnchanged'), field: 'newPassword' }
  // У слабого пароля бэк объясняет причину сам.
  if (hasApiErrorCode(error, 'WEAK_PASSWORD')) return { message: (error as ApiClientError).message, field: 'newPassword' }
  if (hasApiErrorCode(error, 'EMAIL_UNCHANGED')) return { message: t('security.emailUnchanged'), field: 'email' }
  if (hasApiErrorCode(error, 'SECOND_FACTOR_UNAVAILABLE')) return { message: t('security.secondFactorUnavailable') }
  if (error instanceof ApiClientError) {
    if (error.status === 429) {
      return { message: error.retryAfterSeconds
        ? t('error.tooManyWithRetry', { seconds: error.retryAfterSeconds }) : t('error.tooMany') }
    }
    if (error.status === 401) return { message: t('security.sessionEnded') }
    return { message: error.message }
  }
  return { message: t('error.connection') }
}

/** Ограничение бэка: bcrypt учитывает только первые 72 байта пароля. */
export function passwordProblem(password: string, t: T): string | null {
  const bytes = new TextEncoder().encode(password).length
  if (password.length < 8) return t('validation.passwordLength')
  if (bytes > 72) return t('validation.passwordMax')
  return null
}

const startOfDay = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()

/** «сегодня в 14:05», «вчера в 21:40» или «12 ноября» (год — если не текущий). */
export function sessionTime(value: string, now: Date, locale: string, t: T): string {
  const date = new Date(value)
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
  if (days === 0) return t('sessions.today', { time })
  if (days === 1) return t('sessions.yesterday', { time })
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'long', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date)
}

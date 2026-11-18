export type UUID = string
export type ISO8601DateTime = string

/**
 * Коды ошибок, которые фронтенд различает явно (полный список — README бэкенда,
 * раздел «Коды ошибок»). Остальные коды допустимы: неизвестный код обрабатывается
 * по HTTP-статусу, а пользователю показывается `message`.
 */
export type KnownApiErrorCode =
  | 'USAGE_LIMIT_EXCEEDED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'DOCUMENT_NOT_FOUND'
  | 'DOCUMENT_STILL_PROCESSING'
  | 'DOCUMENT_ALREADY_FINISHED'
  | 'SESSION_CHANGED'
  | 'SESSION_NOT_FOUND'
  | 'INVALID_CURRENT_PASSWORD'
  | 'PASSWORD_UNCHANGED'
  | 'WEAK_PASSWORD'
  | 'EMAIL_UNCHANGED'
  | 'EMAIL_ALREADY_USED'
  | 'INVALID_ACTION_LINK'
  | 'LOGIN_CHALLENGE_EXPIRED'
  | 'INVALID_SECOND_FACTOR_CODE'
  | 'SECOND_FACTOR_UNAVAILABLE'
  | 'SECOND_FACTOR_ALREADY_ENABLED'
  | 'SECOND_FACTOR_NOT_ENABLED'
  | 'SECOND_FACTOR_NOT_SET_UP'

// `string & {}` сохраняет подсказки известных кодов и при этом принимает любые другие.
export type ApiErrorCode = KnownApiErrorCode | (string & {})

export interface ApiError {
  timestamp: ISO8601DateTime
  status: number
  /**
   * Стабильный машинный код (`UPPER_SNAKE_CASE`), появился 2026-11-09. Ошибки
   * различаются по нему, а не по тексту `message`. Может отсутствовать у ответов,
   * которые формирует не приложение (например, прокси).
   */
  code?: ApiErrorCode
  message: string
  path: string
  fieldErrors: Record<string, string>
  correlation_id: string
}

export type ApiErrorStatus =
  | 400
  | 401
  | 403
  | 404
  | 409
  | 410
  | 413
  | 415
  | 429
  | 500
  | 503

import { apiClient, type ApiCallOptions, type AuthenticatedApiCallOptions } from './client.ts'
import type { AccountTokenRequest, LoginResponse } from './contracts/auth.ts'
import type {
  AccountSession, EmailChangeRequest, PasswordChangeRequest, RecoveryCodes,
  SecondFactorProof, SecondFactorSetup, SecondFactorStatus,
} from './contracts/accountSecurity.ts'
import { API_ENDPOINTS } from './endpoints.ts'

const routes = API_ENDPOINTS.accountSecurity

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function date(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

export function parseSessions(value: unknown): AccountSession[] {
  if (!Array.isArray(value) || !value.every((item) => record(item) && typeof item.id === 'string' &&
      (item.device === null || typeof item.device === 'string') && date(item.created_at) &&
      date(item.last_used_at) && date(item.expires_at) && typeof item.current === 'boolean')) {
    throw new Error('Invalid sessions response')
  }
  return value as AccountSession[]
}

export function parseSecondFactorStatus(value: unknown): SecondFactorStatus {
  if (!record(value) || typeof value.enabled !== 'boolean' ||
      !Number.isSafeInteger(value.recoveryCodesLeft) || (value.recoveryCodesLeft as number) < 0) {
    throw new Error('Invalid second factor status')
  }
  return { enabled: value.enabled, recoveryCodesLeft: value.recoveryCodesLeft as number }
}

function parseRecoveryCodes(value: unknown): RecoveryCodes {
  if (!record(value) || !Array.isArray(value.recoveryCodes) || value.recoveryCodes.length === 0 ||
      !value.recoveryCodes.every((code) => typeof code === 'string' && code.length > 0)) {
    throw new Error('Invalid recovery codes')
  }
  return { recoveryCodes: value.recoveryCodes as string[] }
}

function parseSetup(value: unknown): SecondFactorSetup {
  if (!record(value) || typeof value.secret !== 'string' || !value.secret ||
      typeof value.otpauthUri !== 'string' || !value.otpauthUri.startsWith('otpauth://')) {
    throw new Error('Invalid second factor setup')
  }
  return { secret: value.secret, otpauthUri: value.otpauthUri }
}

export function changePassword(request: PasswordChangeRequest, options: AuthenticatedApiCallOptions) {
  return apiClient.request<LoginResponse>(routes.password, {
    // Ответ ставит новую refresh-cookie: без credentials браузер её не примет.
    method: 'POST', json: request, accessToken: options.accessToken, signal: options.signal, credentials: 'include',
  })
}

export function requestEmailChange(request: EmailChangeRequest, options: AuthenticatedApiCallOptions) {
  return apiClient.request<void>(routes.emailChange, {
    method: 'POST', json: request, accessToken: options.accessToken, signal: options.signal, responseType: 'void',
  })
}

/** Публичные: ссылку из письма можно открыть на любом устройстве и без входа. */
export function confirmEmailChange(request: AccountTokenRequest, options: ApiCallOptions = {}) {
  return apiClient.request<void>(routes.confirmEmailChange, {
    method: 'POST', json: request, signal: options.signal, responseType: 'void', notifyAccessErrors: false,
  })
}

export function cancelEmailChange(request: AccountTokenRequest, options: ApiCallOptions = {}) {
  return apiClient.request<void>(routes.cancelEmailChange, {
    method: 'POST', json: request, signal: options.signal, responseType: 'void', notifyAccessErrors: false,
  })
}

export async function listSessions(options: AuthenticatedApiCallOptions) {
  return parseSessions(await apiClient.request<unknown>(routes.sessions, {
    method: 'GET', accessToken: options.accessToken, signal: options.signal,
  }))
}

export function revokeSession(sessionId: string, options: AuthenticatedApiCallOptions) {
  return apiClient.request<void>(routes.session(sessionId), {
    method: 'DELETE', accessToken: options.accessToken, signal: options.signal, responseType: 'void',
  })
}

export async function getSecondFactorStatus(options: AuthenticatedApiCallOptions) {
  return parseSecondFactorStatus(await apiClient.request<unknown>(routes.secondFactor, {
    method: 'GET', accessToken: options.accessToken, signal: options.signal,
  }))
}

export async function setupSecondFactor(currentPassword: string, options: AuthenticatedApiCallOptions) {
  return parseSetup(await apiClient.request<unknown>(routes.secondFactorSetup, {
    method: 'POST', json: { currentPassword }, accessToken: options.accessToken, signal: options.signal,
  }))
}

export async function enableSecondFactor(code: string, options: AuthenticatedApiCallOptions) {
  return parseRecoveryCodes(await apiClient.request<unknown>(routes.secondFactorEnable, {
    method: 'POST', json: { code }, accessToken: options.accessToken, signal: options.signal,
  }))
}

export function disableSecondFactor(
  request: { currentPassword: string } & SecondFactorProof, options: AuthenticatedApiCallOptions,
) {
  return apiClient.request<void>(routes.secondFactorDisable, {
    method: 'POST', json: request, accessToken: options.accessToken, signal: options.signal, responseType: 'void',
  })
}

/** Резервным кодом новые коды не получить: нужен код из приложения. */
export async function regenerateRecoveryCodes(
  request: { currentPassword: string; code: string }, options: AuthenticatedApiCallOptions,
) {
  return parseRecoveryCodes(await apiClient.request<unknown>(routes.recoveryCodes, {
    method: 'POST', json: request, accessToken: options.accessToken, signal: options.signal,
  }))
}

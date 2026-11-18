import {
  apiClient,
  type ApiCallOptions,
  type AuthenticatedApiCallOptions,
} from './client.ts'
import type {
  AccountEmailRequest,
  AccountTokenRequest,
  LoginRequest,
  LoginResponse,
  PasswordResetConfirmRequest,
  RegisterRequest,
} from './contracts/auth.ts'
import type { SecondFactorChallenge, SecondFactorLoginRequest } from './contracts/accountSecurity.ts'
import { API_ENDPOINTS } from './endpoints.ts'
import { abortable } from './abortable.ts'

export function register(
  request: RegisterRequest,
  options: ApiCallOptions = {},
) {
  // 202 без тела и для нового, и для уже зарегистрированного email:
  // бэкенд не раскрывает, занят ли адрес.
  return apiClient.request<void>(API_ENDPOINTS.auth.register, {
    method: 'POST',
    json: request,
    responseType: 'void',
    signal: options.signal,
  })
}

/** 200 — сессия; 202 — у аккаунта двухэтапная проверка, код уходит в `loginSecondFactor`. */
export function login(request: LoginRequest, options: ApiCallOptions = {}) {
  return apiClient.request<LoginResponse | SecondFactorChallenge>(API_ENDPOINTS.auth.login, {
    method: 'POST',
    json: request,
    signal: options.signal,
    credentials: 'include',
    notifyAccessErrors: false,
  })
}

export function isSecondFactorChallenge(value: unknown): value is SecondFactorChallenge {
  return typeof value === 'object' && value !== null &&
    (value as Partial<SecondFactorChallenge>).secondFactorRequired === true &&
    typeof (value as Partial<SecondFactorChallenge>).challenge === 'string'
}

export function loginSecondFactor(request: SecondFactorLoginRequest, options: ApiCallOptions = {}) {
  return apiClient.request<LoginResponse>(API_ENDPOINTS.auth.loginSecondFactor, {
    method: 'POST',
    json: request,
    signal: options.signal,
    credentials: 'include',
    notifyAccessErrors: false,
  })
}

export function refreshSession() {
  return apiClient.request<LoginResponse>(API_ENDPOINTS.auth.refresh, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Refresh-Request': 'true' },
    notifyAccessErrors: false,
    skipSessionRecovery: true,
  })
}

export function logoutSession() {
  return apiClient.request<void>(API_ENDPOINTS.auth.logout, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Refresh-Request': 'true' },
    responseType: 'void',
    notifyAccessErrors: false,
    skipSessionRecovery: true,
  })
}

export function logoutAll(options: AuthenticatedApiCallOptions) {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000)
  return abortable(apiClient.request<void>(API_ENDPOINTS.auth.logoutAll, {
    method: 'POST',
    accessToken: options.accessToken,
    signal,
    responseType: 'void',
    credentials: 'include',
    skipSessionRecovery: true,
    notifyAccessErrors: false,
  }), signal)
}

export function requestEmailVerification(
  request: AccountEmailRequest,
  options: ApiCallOptions = {},
) {
  return apiClient.request<void>(
    API_ENDPOINTS.auth.requestEmailVerification,
    {
      method: 'POST',
      json: request,
      signal: options.signal,
      responseType: 'void',
    },
  )
}

export function confirmEmailVerification(
  request: AccountTokenRequest,
  options: ApiCallOptions = {},
) {
  return apiClient.request<void>(
    API_ENDPOINTS.auth.confirmEmailVerification,
    {
      method: 'POST',
      json: request,
      signal: options.signal,
      responseType: 'void',
    },
  )
}

export function requestPasswordReset(
  request: AccountEmailRequest,
  options: ApiCallOptions = {},
) {
  return apiClient.request<void>(API_ENDPOINTS.auth.requestPasswordReset, {
    method: 'POST',
    json: request,
    signal: options.signal,
    responseType: 'void',
  })
}

export function confirmPasswordReset(
  request: PasswordResetConfirmRequest,
  options: ApiCallOptions = {},
) {
  return apiClient.request<void>(API_ENDPOINTS.auth.confirmPasswordReset, {
    method: 'POST',
    json: request,
    signal: options.signal,
    responseType: 'void',
  })
}

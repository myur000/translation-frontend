import type { ApiError } from './contracts/common.ts'
import { createBearerHeaders } from './authHeaders.ts'
import { API_BASE_URL } from './config.ts'

export type ApiResponseType = 'json' | 'void'

export interface ApiCallOptions {
  signal?: AbortSignal
}

export interface AuthenticatedApiCallOptions extends ApiCallOptions {
  accessToken: string
}

export interface ApiClientRequestOptions
  extends Omit<RequestInit, 'body' | 'headers'> {
  accessToken?: string
  body?: BodyInit | null
  headers?: HeadersInit
  json?: unknown
  responseType?: ApiResponseType
  skipSessionRecovery?: boolean
  notifyAccessErrors?: boolean
}

export interface SessionRecovery {
  prepareAccessToken: (requestedToken: string) => Promise<string>
  refreshAccessToken: (rejectedToken: string) => Promise<string>
  onUnauthorized?: (rejectedToken: string) => void
}

export interface ApiBinaryResponse {
  blob: Blob
  contentDisposition: string | null
  contentType: string | null
}

interface ApiClientOptions {
  baseUrl?: string
  fetchImplementation?: typeof fetch
}

export type ApiAccessError = ApiClientError & { status: 401 | 403 }
type ApiAccessErrorListener = (error: ApiAccessError) => void

const accessErrorListeners = new Set<ApiAccessErrorListener>()

export function subscribeToAccessErrors(listener: ApiAccessErrorListener) {
  accessErrorListeners.add(listener)
  return () => {
    accessErrorListeners.delete(listener)
  }
}

function publishAccessError(error: ApiClientError) {
  if (error.status !== 401 && error.status !== 403) {
    return
  }

  for (const listener of accessErrorListeners) {
    listener(error as ApiAccessError)
  }
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function createUrl(baseUrl: string, path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${normalizedPath}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFieldErrors(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((message) => typeof message === 'string')
  )
}

function isApiError(value: unknown): value is ApiError {
  return (
    isRecord(value) &&
    typeof value.timestamp === 'string' &&
    typeof value.status === 'number' &&
    typeof value.message === 'string' &&
    typeof value.path === 'string' &&
    isFieldErrors(value.fieldErrors) &&
    typeof value.correlation_id === 'string'
  )
}

function parseRetryAfter(value: string | null) {
  if (value === null) {
    return null
  }

  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

async function readApiError(response: Response) {
  const contentType = response.headers.get('Content-Type') ?? ''

  if (!contentType.includes('application/json')) {
    return null
  }

  try {
    const body: unknown = await response.json()
    return isApiError(body) ? body : null
  } catch {
    return null
  }
}

export class ApiClientError extends Error {
  readonly status: number
  readonly details: ApiError | null
  readonly correlationId: string | null
  readonly retryAfterSeconds: number | null

  constructor(
    message: string,
    status: number,
    details: ApiError | null,
    correlationId: string | null,
    retryAfterSeconds: number | null,
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.details = details
    this.correlationId = correlationId
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export class ApiClient {
  private readonly baseUrl: string
  private readonly fetchImplementation?: typeof fetch
  private sessionRecovery: SessionRecovery | null = null

  setSessionRecovery(recovery: SessionRecovery) {
    this.sessionRecovery = recovery
    return () => {
      if (this.sessionRecovery === recovery) this.sessionRecovery = null
    }
  }

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? API_BASE_URL)
    this.fetchImplementation = options.fetchImplementation
  }

  async request<T>(
    path: string,
    options: ApiClientRequestOptions = {},
  ): Promise<T> {
    const {
      accessToken,
      body,
      headers: initialHeaders,
      json,
      responseType = 'json',
      skipSessionRecovery = false,
      notifyAccessErrors = true,
      ...requestInit
    } = options

    if (body !== undefined && json !== undefined) {
      throw new TypeError('Use either body or json, not both.')
    }

    const headers = new Headers(initialHeaders)

    if (accessToken !== undefined) {
      const normalizedToken = accessToken.trim()

      if (normalizedToken.length === 0) {
        throw new TypeError('Access token must not be empty.')
      }

      headers.set(
        'Authorization',
        createBearerHeaders(normalizedToken).Authorization,
      )
    }

    let requestBody = body

    if (json !== undefined) {
      headers.set('Content-Type', 'application/json')
      headers.set('Accept', 'application/json')
      requestBody = JSON.stringify(json)
    }

    const { response, token: usedToken } = await this.fetchWithRecovery(
      path, { ...requestInit, headers, body: requestBody },
      accessToken, skipSessionRecovery,
    )

    if (!response.ok) {
      await this.throwResponseError(response, notifyAccessErrors && accessToken !== undefined, usedToken)
    }

    if (responseType === 'void' || response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  }

  async requestBinary(
    path: string,
    options: Omit<ApiClientRequestOptions, 'json' | 'responseType'> = {},
  ): Promise<ApiBinaryResponse> {
    const {
      accessToken, body, headers: initialHeaders,
      skipSessionRecovery = false, notifyAccessErrors = true, ...requestInit
    } = options
    const headers = new Headers(initialHeaders)

    if (accessToken !== undefined) {
      const normalizedToken = accessToken.trim()

      if (normalizedToken.length === 0) {
        throw new TypeError('Access token must not be empty.')
      }

      headers.set(
        'Authorization',
        createBearerHeaders(normalizedToken).Authorization,
      )
    }

    const { response, token: usedToken } = await this.fetchWithRecovery(
      path, { ...requestInit, headers, body }, accessToken, skipSessionRecovery,
    )

    if (!response.ok) {
      await this.throwResponseError(response, notifyAccessErrors && accessToken !== undefined, usedToken)
    }

    return {
      blob: await response.blob(),
      contentDisposition: response.headers.get('Content-Disposition'),
      contentType: response.headers.get('Content-Type'),
    }
  }

  private fetch(input: RequestInfo | URL, init: RequestInit) {
    const fetcher = this.fetchImplementation ?? globalThis.fetch
    return fetcher(input, init)
  }

  private async fetchWithRecovery(
    path: string, init: RequestInit, accessToken: string | undefined, skip: boolean,
  ): Promise<{ response: Response; token: string | undefined }> {
    const recovery = accessToken !== undefined && !skip ? this.sessionRecovery : null
    const headers = new Headers(init.headers)
    const token = recovery ? await recovery.prepareAccessToken(accessToken!) : accessToken
    init.signal?.throwIfAborted()
    if (token !== undefined) headers.set('Authorization', createBearerHeaders(token).Authorization)
    const response = await this.fetch(createUrl(this.baseUrl, path), { ...init, headers })
    if (response.status !== 401 || !recovery || !token || init.signal?.aborted) return { response, token }
    // Streams cannot be replayed. JSON, multipart, Blob and download requests can.
    if (typeof ReadableStream !== 'undefined' && init.body instanceof ReadableStream) return { response, token }
    await response.body?.cancel()
    const refreshedToken = await recovery.refreshAccessToken(token)
    init.signal?.throwIfAborted()
    headers.set('Authorization', createBearerHeaders(refreshedToken).Authorization)
    // Exactly one retry; a second 401 is terminal and never starts another refresh.
    return {
      response: await this.fetch(createUrl(this.baseUrl, path), { ...init, headers }),
      token: refreshedToken,
    }
  }

  private async throwResponseError(response: Response, notify: boolean, token?: string): Promise<never> {
    const details = await readApiError(response)
    const correlationId =
      details?.correlation_id ?? response.headers.get('X-Correlation-ID')

    const error = new ApiClientError(
      details?.message || `Backend returned HTTP ${response.status}.`,
      response.status,
      details,
      correlationId,
      parseRetryAfter(response.headers.get('Retry-After')),
    )

    if (notify) {
      if (error.status === 401 && token) this.sessionRecovery?.onUnauthorized?.(token)
      publishAccessError(error)
    }
    throw error
  }
}

export const apiClient = new ApiClient()

import { ApiClientError, apiClient, type AuthenticatedApiCallOptions } from './client.ts'
import type { DocumentTextParagraph, DocumentTextQuery, DocumentTextResponse } from './contracts/documents.ts'
import { API_ENDPOINTS } from './endpoints.ts'
import type { TextParagraph } from '../viewer/types.ts'

/** Максимум абзацев за один запрос, который принимает бэкенд. */
export const DOCUMENT_TEXT_PAGE_SIZE = 500
/**
 * Предел запросов на один документ (10 000 абзацев — несколько сотен страниц книги).
 * Бэкенд и сам обрезает длинные документы (`truncated`), предел лишь страхует
 * от бесконечного цикла при некорректном `total_pages`.
 */
export const DOCUMENT_TEXT_MAX_PAGES = 20

export function getDocumentText(
  jobId: string,
  query: DocumentTextQuery,
  options: AuthenticatedApiCallOptions,
) {
  const searchParams = new URLSearchParams()
  if (query.page !== undefined) searchParams.set('page', String(query.page))
  if (query.size !== undefined) searchParams.set('size', String(query.size))
  const queryString = searchParams.toString()
  const path = API_ENDPOINTS.documents.text(jobId)
  return apiClient.request<DocumentTextResponse>(queryString ? `${path}?${queryString}` : path, {
    method: 'GET',
    accessToken: options.accessToken,
    signal: options.signal,
  })
}

export interface OriginalText {
  /** `false` — исходник удалён по сроку хранения, показать оригинал нельзя. */
  available: boolean
  /** Номера — как в `/text`: при невыровненном документе часть номеров пропущена. */
  paragraphs: TextParagraph[]
  /** Показана только часть документа: либо обрезал бэкенд, либо сработал предел запросов. */
  truncated: boolean
}

/** Собирает абзацы оригинала со всех страниц ответа `/text`. */
export async function loadOriginalText(
  jobId: string,
  options: AuthenticatedApiCallOptions,
): Promise<OriginalText> {
  const paragraphs: TextParagraph[] = []
  let truncated = false
  for (let page = 0; page < DOCUMENT_TEXT_MAX_PAGES; page += 1) {
    const response = await getDocumentText(jobId, { page, size: DOCUMENT_TEXT_PAGE_SIZE }, options)
    // Исходник удалён — остальные страницы тоже придут без оригинала.
    if (!response.source_available) return { available: false, paragraphs: [], truncated: false }
    for (const paragraph of response.paragraphs) {
      // При aligned: false у сторон разное число абзацев, недостающие приходят как null.
      if (paragraph.source !== null) paragraphs.push({ index: paragraph.index, text: paragraph.source })
    }
    truncated ||= response.truncated
    if (page + 1 >= response.total_pages) return { available: true, paragraphs, truncated }
  }
  return { available: true, paragraphs, truncated: true }
}

/** Текст документа обеими сторонами — для поиска абзаца, из которого взята цитата. */
export interface DocumentText {
  sourceAvailable: boolean
  /** Абзац N оригинала соответствует абзацу N перевода. */
  aligned: boolean
  paragraphs: DocumentTextParagraph[]
  truncated: boolean
}

/** Сколько раз повторить запрос после `429` из-за занятого файлового слота аккаунта. */
const SLOT_RETRIES = 2
const MAX_RETRY_DELAY_MS = 5_000
const textCache = new Map<string, Promise<DocumentText>>()

function delay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

async function pageWithRetry(jobId: string, page: number, options: AuthenticatedApiCallOptions) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await getDocumentText(jobId, { page, size: DOCUMENT_TEXT_PAGE_SIZE }, options)
    } catch (error) {
      // /text делит слот со скачиванием: если пользователь как раз скачивает файл, ждём и повторяем.
      if (!(error instanceof ApiClientError) || error.status !== 429 || attempt >= SLOT_RETRIES) throw error
      await delay(Math.min((error.retryAfterSeconds ?? 1) * 1000, MAX_RETRY_DELAY_MS), options.signal)
    }
  }
}

async function fetchDocumentText(jobId: string, options: AuthenticatedApiCallOptions): Promise<DocumentText> {
  const paragraphs: DocumentTextParagraph[] = []
  let first: DocumentTextResponse | null = null
  let truncated = false
  for (let page = 0; page < DOCUMENT_TEXT_MAX_PAGES; page += 1) {
    const response = await pageWithRetry(jobId, page, options)
    first ??= response
    paragraphs.push(...response.paragraphs)
    truncated ||= response.truncated
    if (page + 1 >= response.total_pages) {
      return { sourceAvailable: first.source_available, aligned: first.aligned, paragraphs, truncated }
    }
  }
  return { sourceAvailable: first?.source_available ?? false, aligned: first?.aligned ?? false, paragraphs, truncated: true }
}

/**
 * Текст готового документа не меняется, поэтому ответ хранится до конца сеанса:
 * повторная цитата из той же книги не занимает файловый слот. Ошибки не кэшируются.
 */
export function loadDocumentText(jobId: string, options: AuthenticatedApiCallOptions) {
  const cached = textCache.get(jobId)
  if (cached) return cached
  const request = fetchDocumentText(jobId, { accessToken: options.accessToken })
  textCache.set(jobId, request)
  request.catch(() => textCache.delete(jobId))
  return request
}

/** Для выхода из аккаунта и тестов. */
export function forgetDocumentText() {
  textCache.clear()
}

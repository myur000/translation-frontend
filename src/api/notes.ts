import { apiClient, type AuthenticatedApiCallOptions } from './client.ts'
import type {
  NoteCreateRequest,
  NoteGraphNodeType,
  NoteGraphResponse,
  NoteListQuery,
  NotePageResponse,
  NoteQuoteRequest,
  NoteQuoteResponse,
  NoteReference,
  NoteResponse,
  NoteUpdateRequest,
} from './contracts/notes.ts'
import { API_ENDPOINTS } from './endpoints.ts'

function withQuery(path: string, query: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') searchParams.set(key, String(value))
  }
  const queryString = searchParams.toString()
  return queryString ? `${path}?${queryString}` : path
}

export function listNotes(query: NoteListQuery, options: AuthenticatedApiCallOptions) {
  return apiClient.request<NotePageResponse>(
    withQuery(API_ENDPOINTS.notes.list, { ...query }),
    { method: 'GET', accessToken: options.accessToken, signal: options.signal },
  )
}

export function getNote(noteId: string, options: AuthenticatedApiCallOptions) {
  return apiClient.request<NoteResponse>(API_ENDPOINTS.notes.note(noteId), {
    method: 'GET',
    accessToken: options.accessToken,
    signal: options.signal,
  })
}

/**
 * Запись требует подтверждённого email. 403 объясняет сама страница заметок,
 * поэтому общий обработчик доступа здесь отключён.
 */
export function createNote(request: NoteCreateRequest, options: AuthenticatedApiCallOptions) {
  return apiClient.request<NoteResponse>(API_ENDPOINTS.notes.list, {
    method: 'POST',
    accessToken: options.accessToken,
    json: request,
    signal: options.signal,
    notifyAccessErrors: false,
  })
}

/** `409` — заметку изменили в другом окне, название занято или достигнут лимит. */
export function updateNote(
  noteId: string,
  request: NoteUpdateRequest,
  options: AuthenticatedApiCallOptions,
) {
  return apiClient.request<NoteResponse>(API_ENDPOINTS.notes.note(noteId), {
    method: 'PUT',
    accessToken: options.accessToken,
    json: request,
    signal: options.signal,
    notifyAccessErrors: false,
  })
}

export function deleteNote(noteId: string, options: AuthenticatedApiCallOptions) {
  return apiClient.request<void>(API_ENDPOINTS.notes.note(noteId), {
    method: 'DELETE',
    accessToken: options.accessToken,
    responseType: 'void',
    signal: options.signal,
  })
}

export function getNoteBacklinks(noteId: string, options: AuthenticatedApiCallOptions) {
  return apiClient.request<NoteReference[]>(API_ENDPOINTS.notes.backlinks(noteId), {
    method: 'GET',
    accessToken: options.accessToken,
    signal: options.signal,
  })
}

/** Цитата из своего готового документа: `404`/`409` — документ чужой, удалён или не готов. */
export function addNoteQuote(noteId: string, quote: NoteQuoteRequest, options: AuthenticatedApiCallOptions) {
  return apiClient.request<NoteQuoteResponse>(API_ENDPOINTS.notes.quotes(noteId), {
    method: 'POST',
    accessToken: options.accessToken,
    json: quote,
    signal: options.signal,
    notifyAccessErrors: false,
  })
}

export function deleteNoteQuote(noteId: string, quoteId: string, options: AuthenticatedApiCallOptions) {
  return apiClient.request<void>(API_ENDPOINTS.notes.quote(noteId, quoteId), {
    method: 'DELETE',
    accessToken: options.accessToken,
    responseType: 'void',
    signal: options.signal,
  })
}

/** Заметки в графе есть всегда; `types` добавляет остальные виды узлов. */
export function getNoteGraph(
  types: Exclude<NoteGraphNodeType, 'note'>[],
  options: AuthenticatedApiCallOptions,
) {
  return apiClient.request<NoteGraphResponse>(
    withQuery(API_ENDPOINTS.notes.graph, { types: types.join(',') || undefined }),
    { method: 'GET', accessToken: options.accessToken, signal: options.signal },
  )
}

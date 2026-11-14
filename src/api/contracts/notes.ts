import type { ISO8601DateTime, UUID } from './common.ts'

/** Колонка документа, из которой взята цитата. */
export type NoteQuoteSide = 'SOURCE' | 'TRANSLATION'

/** Ссылка `[[Название]]` из текста заметки; `note_id: null` — заметки с таким названием нет (заготовка). */
export interface NoteLinkResponse {
  title: string
  note_id: UUID | null
}

/** Двуязычная цитата из документа. Текст переживает удаление документа. */
export interface NoteQuoteResponse {
  id: UUID
  /** `null`, если документ удалён (тогда и `document_available: false`). */
  job_id: UUID | null
  document_name: string | null
  document_available: boolean
  side: NoteQuoteSide
  paragraph_index: number
  quote: string
  /** Абзац другой колонки с тем же номером, если документ выровнен. */
  paired_text: string | null
  source_lang: string
  target_lang: string
  created_at: ISO8601DateTime
}

/**
 * Документ, о котором заметка (конспект книги, T-67): привязка без цитаты. У
 * удалённого документа `document_available: false` и `document_name: null`, а
 * `job_id` остаётся, чтобы связь можно было снять.
 */
export interface NoteDocumentResponse {
  job_id: UUID
  document_name: string | null
  document_available: boolean
  linked_at: ISO8601DateTime
}

/** GET/POST/PUT /api/notes/{id}: заметка целиком. Теги и ссылки backend извлекает из `body` сам. */
export interface NoteResponse {
  id: UUID
  title: string
  body: string
  /** Передаётся в PUT: при расхождении backend отвечает `409`. */
  version: number
  created_at: ISO8601DateTime
  updated_at: ISO8601DateTime
  tags: string[]
  links: NoteLinkResponse[]
  quotes: NoteQuoteResponse[]
  /** Документы, о которых заметка (без цитат). Нет у ответов до T-67 — читать через `?? []`. */
  documents?: NoteDocumentResponse[]
}

/** Элемент списка GET /api/notes. */
export interface NoteSummary {
  id: UUID
  title: string
  /** Начало текста заметки. */
  excerpt: string
  tags: string[]
  quote_count: number
  version: number
  updated_at: ISO8601DateTime
  /** Документы, о которых заметка (конспект), включая удалённые; нет у ответов до T-67. */
  linked_job_ids?: UUID[]
}

export interface NotePageResponse {
  items: NoteSummary[]
  page: number
  size: number
  total_elements: number
  total_pages: number
}

export interface NoteListQuery {
  /** Полнотекстовый поиск по названию и тексту с учётом морфологии (ru, en). */
  q?: string
  /** Тег с `#` или без. */
  tag?: string
  /** Начало названия: подсказка при вводе `[[`. */
  prefix?: string
  /** Заметки с цитатами из документа или привязанные к нему (конспект), каждая один раз. */
  job_id?: UUID
  page?: number
  /** До 100. */
  size?: number
}

export interface NoteQuoteRequest {
  job_id: UUID
  side: NoteQuoteSide
  paragraph_index: number
  /** До 2000 символов. */
  quote: string
  /** До 4000 символов. */
  paired_text?: string | null
}

export interface NoteCreateRequest {
  /** 1–200 символов, без `[ ] | # ^` и переносов; уникально без учёта регистра. */
  title: string
  /** Markdown, до 50 000 символов. */
  body?: string
  quote?: NoteQuoteRequest
  /** Документы, о которых заметка (конспект книги); статус документа не важен. До 50. */
  job_ids?: UUID[]
}

/** POST /api/notes/{id}/documents: привязать заметку к документу без цитаты. */
export interface NoteDocumentRequest {
  job_id: UUID
}

export interface NoteUpdateRequest {
  title: string
  body: string
  version: number
}

/** GET /api/notes/{id}/backlinks: заметки, ссылающиеся на эту. */
export interface NoteReference {
  id: UUID
  title: string
}

export type NoteGraphNodeType = 'note' | 'document' | 'tag' | 'missing' | 'term'
export type NoteGraphEdgeType = 'links' | 'quotes' | 'about' | 'tagged' | 'appears_in'

export interface NoteGraphNode {
  /** `note:<uuid>`, `document:<uuid>`, `tag:<тег>`, `missing:<название>`, `term:<uuid>`. */
  id: string
  type: NoteGraphNodeType
  label: string
  /** id заметки или документа для перехода; `null` у тегов, заготовок и удалённых документов. */
  ref: UUID | null
  deleted: boolean
}

export interface NoteGraphEdge {
  source: string
  target: string
  type: NoteGraphEdgeType
  /** Для `quotes` — число цитат. */
  weight: number
}

/** GET /api/notes/graph?types=… */
export interface NoteGraphResponse {
  nodes: NoteGraphNode[]
  edges: NoteGraphEdge[]
  /** Граф больше 20 000 связей и обрезан. */
  truncated: boolean
}

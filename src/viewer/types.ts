import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { TranslationKey } from '../i18n/translations.ts'

/** Абзац текста с сервера: номер совпадает с `paragraph_index` в `/text` и в цитатах. */
export interface TextParagraph { index: number; text: string }

export type PreviewFormat = 'pdf' | 'docx' | 'doc'
export interface DocumentAsset { blob: Blob; name: string; format: PreviewFormat }
export type AssetState =
  | { status: 'ready'; asset: DocumentAsset }
  /** Оригинал без файла: только абзацы текста, полученные с сервера. */
  | { status: 'text'; paragraphs: TextParagraph[]; truncated: boolean }
  | { status: 'loading' }
  | { status: 'message'; message: TranslationKey; retry?: boolean }

export type DocumentView =
  | { status: 'ready'; kind: 'pdf'; pdf: PDFDocumentProxy; pageCount: number; width: number; height: number; pageSizes: Map<number, { width: number; height: number }> }
  | { status: 'ready'; kind: 'docx'; html: string; pageCount: null }
  | { status: 'ready'; kind: 'text'; paragraphs: TextParagraph[]; truncated: boolean; pageCount: null }
  | { status: 'loading' }
  | { status: 'message'; message: TranslationKey; retry?: boolean }

export function fileFormat(name: string): PreviewFormat | null {
  const extension = name.split('.').at(-1)?.toLowerCase()
  return extension === 'pdf' || extension === 'docx' || extension === 'doc' ? extension : null
}

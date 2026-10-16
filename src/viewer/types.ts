import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { TranslationKey } from '../i18n/translations.ts'

export type PreviewFormat = 'pdf' | 'docx' | 'doc'
export interface DocumentAsset { blob: Blob; name: string; format: PreviewFormat }
export type AssetState =
  | { status: 'ready'; asset: DocumentAsset }
  | { status: 'loading' }
  | { status: 'message'; message: TranslationKey; retry?: boolean }

export type DocumentView =
  | { status: 'ready'; kind: 'pdf'; pdf: PDFDocumentProxy; pageCount: number; width: number; height: number; pageSizes: Map<number, { width: number; height: number }> }
  | { status: 'ready'; kind: 'docx'; html: string; pageCount: null }
  | { status: 'loading' }
  | { status: 'message'; message: TranslationKey; retry?: boolean }

export function fileFormat(name: string): PreviewFormat | null {
  const extension = name.split('.').at(-1)?.toLowerCase()
  return extension === 'pdf' || extension === 'docx' || extension === 'doc' ? extension : null
}

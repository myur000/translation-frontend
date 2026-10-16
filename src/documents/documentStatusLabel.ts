import type { TranslationKey } from '../i18n/translations.ts'
import type { DocumentItem } from '../types/document.ts'

const statusKeys = {
  ready: 'status.ready',
  processing: 'status.processing',
  draft: 'status.draft',
  failed: 'status.failed',
} as const

export function documentStatusLabel(document: DocumentItem): TranslationKey {
  if (document.waitingIssue) return 'status.waitingPaused'
  if (document.serverStatus === 'PENDING') return 'status.queued'
  return statusKeys[document.status]
}

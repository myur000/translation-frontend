import type {
  DocumentMetadataByJobId,
  StoredDocumentMetadata,
} from './documentHistory.ts'

const STORAGE_PREFIX = 'doctranslate.document-metadata.v1.'

function getStorageKey(ownerEmail: string) {
  return `${STORAGE_PREFIX}${ownerEmail.trim().toLowerCase()}`
}

function isMetadata(value: unknown): value is StoredDocumentMetadata {
  if (!value || typeof value !== 'object') return false
  const metadata = value as Partial<StoredDocumentMetadata>
  return (
    typeof metadata.name === 'string' &&
    metadata.name.length > 0 &&
    typeof metadata.documentId === 'string' &&
    metadata.documentId.length > 0
  )
}

export function readDocumentMetadata(ownerEmail: string): DocumentMetadataByJobId {
  try {
    const raw = sessionStorage.getItem(getStorageKey(ownerEmail))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, StoredDocumentMetadata] =>
        isMetadata(entry[1]),
      ),
    )
  } catch {
    return {}
  }
}

export function rememberDocumentMetadata(
  ownerEmail: string,
  jobId: string,
  metadata: StoredDocumentMetadata,
) {
  const current = readDocumentMetadata(ownerEmail)
  sessionStorage.setItem(
    getStorageKey(ownerEmail),
    JSON.stringify({ ...current, [jobId]: metadata }),
  )
}

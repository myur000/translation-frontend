let localDocumentSequence = 0

/** Id of a local draft that has no job yet; unique within the page. */
export function createLocalDocumentId() {
  localDocumentSequence += 1
  return `local-${Date.now()}-${localDocumentSequence}`
}

/** Address of a translation job; the "translation ready" email links here. */
export const documentPath = (jobId: string) => `/documents/${encodeURIComponent(jobId)}`

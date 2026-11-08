let localDocumentSequence = 0

/** Id of a local draft that has no job yet; unique within the page. */
export function createLocalDocumentId() {
  localDocumentSequence += 1
  return `local-${Date.now()}-${localDocumentSequence}`
}

/** Address of a translation job; the "translation ready" email links here. */
export const documentPath = (jobId: string) => `/documents/${encodeURIComponent(jobId)}`

/** Address of a local draft; it lives only until the page is reloaded. */
export const draftPath = (draftId: string) => `/drafts/${encodeURIComponent(draftId)}`

/** Where a document opens: its job once uploaded, otherwise its draft. */
export const pathForDocument = (document: { id: string; jobId?: string }) =>
  document.jobId ? documentPath(document.jobId) : draftPath(document.id)

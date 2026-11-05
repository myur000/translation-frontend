/** Address of a translation job; the "translation ready" email links here. */
export const documentPath = (jobId: string) => `/documents/${encodeURIComponent(jobId)}`

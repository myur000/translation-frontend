let localDocumentSequence = 0

/** Id локального черновика без задачи; уникален в пределах страницы. */
export function createLocalDocumentId() {
  localDocumentSequence += 1
  return `local-${Date.now()}-${localDocumentSequence}`
}

/** Адрес задачи перевода; сюда ведёт письмо «перевод готов». */
export const documentPath = (jobId: string) => `/documents/${encodeURIComponent(jobId)}`

/** Адрес локального черновика; живёт только до перезагрузки страницы. */
export const draftPath = (draftId: string) => `/drafts/${encodeURIComponent(draftId)}`

/** Где открывается документ: после загрузки — его задача, иначе — черновик. */
export const pathForDocument = (document: { id: string; jobId?: string }) =>
  document.jobId ? documentPath(document.jobId) : draftPath(document.id)

/** Состояние перехода, которое просит открытую страницу документа сразу предложить оценку. */
export const FEEDBACK_PROMPT_STATE = { openFeedback: true } as const

export function wantsFeedbackPrompt(state: unknown) {
  return typeof state === 'object' && state !== null && (state as { openFeedback?: unknown }).openFeedback === true
}

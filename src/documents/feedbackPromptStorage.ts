/** `auto` — предложено после завершения перевода; `manual` — вызвано из меню. */
export type FeedbackPromptMode = 'auto' | 'manual'

const DISMISSED_KEY = 'parallel.feedback-prompt.dismissed.v1'
const MAX_REMEMBERED = 200

function readDismissed(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

/** Автоматическое предложение показывается один раз на задачу; «Не сейчас» запоминается. */
export function wasFeedbackPromptDismissed(jobId: string) {
  return readDismissed().includes(jobId)
}

export function rememberFeedbackPromptDismissed(jobId: string) {
  try {
    const next = [jobId, ...readDismissed().filter((item) => item !== jobId)].slice(0, MAX_REMEMBERED)
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
  } catch {
    // Хранилище может быть недоступно (приватный режим); тогда предложение просто может появиться снова.
  }
}

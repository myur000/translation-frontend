/** `auto` — offered after a translation finished; `manual` — asked for from the menu. */
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

/** The automatic prompt is offered once per job; "Not now" is remembered. */
export function wasFeedbackPromptDismissed(jobId: string) {
  return readDismissed().includes(jobId)
}

export function rememberFeedbackPromptDismissed(jobId: string) {
  try {
    const next = [jobId, ...readDismissed().filter((item) => item !== jobId)].slice(0, MAX_REMEMBERED)
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
  } catch {
    // Storage may be unavailable (private mode); the prompt then simply may reappear.
  }
}

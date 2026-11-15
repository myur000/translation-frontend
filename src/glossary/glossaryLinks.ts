/** Переход из глоссария к абзацу книги: `?term=&paragraph=`, книга убирает их из адреса. */
export const TERM_PARAM = 'term'
export const PARAGRAPH_PARAM = 'paragraph'

export function termInBookHref(jobId: string, termId: string, paragraphIndex: number) {
  const params = new URLSearchParams({ [TERM_PARAM]: termId, [PARAGRAPH_PARAM]: String(paragraphIndex) })
  return `/documents/${encodeURIComponent(jobId)}?${params}`
}

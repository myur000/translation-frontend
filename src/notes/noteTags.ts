import type { NoteGraphResponse } from '../api/contracts/notes.ts'
import type { NoteTagCount } from './NotesContext.ts'

/** Размер страницы списка заметок в боковой панели. */
export const NOTES_PAGE_SIZE = 50

/** Теги с числом заметок из графа: отдельного списка тегов у backend нет. */
export function tagCounts(graph: NoteGraphResponse): NoteTagCount[] {
  const counts = new Map<string, number>()
  for (const node of graph.nodes) if (node.type === 'tag') counts.set(node.id, 0)
  for (const edge of graph.edges) {
    if (edge.type === 'tagged' && counts.has(edge.target)) counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1)
  }
  return [...counts]
    .map(([id, count]) => ({ tag: id.slice('tag:'.length), count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag, 'ru'))
}


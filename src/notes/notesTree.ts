import type { NoteGraphResponse } from '../api/contracts/notes.ts'
import { bookTitle } from '../documents/bookTitle.ts'

/** Книга в дереве заметок: её заметки — те, что её цитируют. */
export interface NotesTreeBook {
  /** id задачи; null у удалённого документа — его нельзя открыть, но заметки остаются. */
  jobId: string | null
  /** Ключ узла графа: стабилен и у удалённых документов. */
  key: string
  fileName: string
  title: string
  deleted: boolean
  /** Конспекты книги первыми, затем заметки с цитатами — по названию. */
  noteIds: string[]
  /** Заметки о книге целиком (ребро `about`, T-67). */
  summaryIds: string[]
}

export interface NotesTreeCount {
  label: string
  count: number
}

export interface NotesTree {
  books: NotesTreeBook[]
  /** Заметки без цитат и без привязки к книге: «Без книги». */
  looseNoteIds: string[]
  /** Название каждой заметки по id. */
  titles: ReadonlyMap<string, string>
  tags: NotesTreeCount[]
  /** `[[Ссылки]]` на заметки, которых ещё нет; count — сколько заметок ссылается. */
  missing: NotesTreeCount[]
  truncated: boolean
}

const byLabel = (first: { label: string }, second: { label: string }) =>
  first.label.localeCompare(second.label, undefined, { sensitivity: 'base' })

/**
 * Дерево для панели заметок из одного ответа `/notes/graph?types=document,tag,missing`:
 * книги с их заметками (как папки в Obsidian), заметки без книги, теги с числом
 * заметок и несозданные заметки, на которые уже есть ссылки.
 */
export function buildNotesTree(graph: NoteGraphResponse): NotesTree {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  const titles = new Map<string, string>()
  for (const node of graph.nodes) {
    if (node.type === 'note' && node.ref) titles.set(node.ref, node.label)
  }
  const books = new Map<string, NotesTreeBook>()
  const quoting = new Set<string>()
  const tagCounts = new Map<string, number>()
  const missingCounts = new Map<string, number>()

  for (const edge of graph.edges) {
    const source = nodes.get(edge.source)
    const target = nodes.get(edge.target)
    if (!source?.ref || source.type !== 'note' || !target) continue
    if ((edge.type === 'quotes' || edge.type === 'about') && target.type === 'document') {
      const book = books.get(target.id) ?? {
        jobId: target.deleted ? null : target.ref,
        key: target.id,
        fileName: target.label,
        title: bookTitle(target.label),
        deleted: target.deleted,
        noteIds: [],
        summaryIds: [],
      }
      if (!book.noteIds.includes(source.ref)) book.noteIds.push(source.ref)
      if (edge.type === 'about' && !book.summaryIds.includes(source.ref)) book.summaryIds.push(source.ref)
      books.set(target.id, book)
      quoting.add(source.ref)
    } else if (edge.type === 'tagged' && target.type === 'tag') {
      tagCounts.set(target.label, (tagCounts.get(target.label) ?? 0) + 1)
    } else if (edge.type === 'links' && target.type === 'missing') {
      missingCounts.set(target.label, (missingCounts.get(target.label) ?? 0) + 1)
    }
  }

  const byTitle = (first: string, second: string) =>
    (titles.get(first) ?? '').localeCompare(titles.get(second) ?? '', undefined, { sensitivity: 'base' })
  return {
    books: [...books.values()]
      .map((book) => ({
        ...book,
        // Конспект — главное о книге: он первым в её группе.
        noteIds: book.noteIds.sort((first, second) =>
          Number(book.summaryIds.includes(second)) - Number(book.summaryIds.includes(first)) || byTitle(first, second)),
        summaryIds: book.summaryIds.sort(byTitle),
      }))
      // Удалённые книги — в конце: их заметки живы, но открыть книгу нельзя.
      .sort((first, second) => Number(first.deleted) - Number(second.deleted) || byLabel({ label: first.title }, { label: second.title })),
    looseNoteIds: [...titles.keys()].filter((id) => !quoting.has(id)).sort(byTitle),
    titles,
    tags: [...tagCounts].map(([label, count]) => ({ label, count })).sort((first, second) => second.count - first.count || byLabel(first, second)),
    missing: [...missingCounts].map(([label, count]) => ({ label, count })).sort(byLabel),
    truncated: graph.truncated,
  }
}

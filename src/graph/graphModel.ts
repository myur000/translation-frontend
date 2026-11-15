import type { NoteGraphResponse } from '../api/contracts/notes.ts'
import { bookTitle, coverTone } from '../documents/bookTitle.ts'

/**
 * Узел графа заметок. Конспект — заметка, привязанная к книге целиком (связь
 * `about`): у него свой вид (тетрадь цвета обложки), поэтому это отдельный тип.
 */
export type GraphNodeKind = 'book' | 'summary' | 'note' | 'tag' | 'missing'
export type GraphLinkKind = 'quotes' | 'about' | 'links' | 'tagged'

export interface GraphNode {
  /** Ключ узла сервера: `note:…`, `document:…`, `tag:…`, `missing:…`. */
  id: string
  kind: GraphNodeKind
  label: string
  /** id заметки или задачи книги; `null` у тегов, несозданных и удалённых книг. */
  ref: string | null
  /** Книга удалена: связи видны, открыть нельзя. */
  deleted: boolean
  /** Тон обложки (`--cover-N`): у книги — её, у конспекта — его книги. */
  tone: number | null
  /** Сколько связей: от этого — размер кружка заметки. */
  degree: number
}

export interface GraphLink {
  source: string
  target: string
  kind: GraphLinkKind
  /** У цитаты — сколько цитат из книги: линия тем толще. */
  weight: number
}

export interface GraphModel {
  nodes: GraphNode[]
  links: GraphLink[]
  /** Сервер обрезал граф (больше 20 000 связей). */
  truncated: boolean
}

/** Что прячут фильтры панели. `lonely` — заметки без единой связи. */
export type GraphHiddenKind = 'book' | 'summary' | 'tag' | 'missing' | 'lonely'
export const GRAPH_HIDDEN_KINDS: readonly GraphHiddenKind[] = ['book', 'summary', 'tag', 'missing', 'lonely']

/** Модель графа из ответа `/notes/graph`. Термины (`term`) пока не показываются. */
export function buildGraphModel(response: NoteGraphResponse): GraphModel {
  const summaryBook = new Map<string, string>()
  for (const edge of response.edges) {
    if (edge.type === 'about' && !summaryBook.has(edge.source)) summaryBook.set(edge.source, edge.target)
  }
  const labels = new Map(response.nodes.map((node) => [node.id, node.label]))
  const nodes: GraphNode[] = []
  for (const node of response.nodes) {
    const kind: GraphNodeKind | null = node.type === 'document' ? 'book'
      : node.type === 'note' ? (summaryBook.has(node.id) ? 'summary' : 'note')
        : node.type === 'tag' ? 'tag'
          : node.type === 'missing' ? 'missing'
            : null
    if (!kind) continue
    const bookId = kind === 'summary' ? summaryBook.get(node.id) : kind === 'book' ? node.id : undefined
    const bookFile = bookId ? labels.get(bookId) : undefined
    nodes.push({
      id: node.id,
      kind,
      label: kind === 'book' ? bookTitle(node.label) : kind === 'tag' ? node.label.replace(/^#?/, '#') : node.label,
      ref: node.ref,
      deleted: node.deleted,
      tone: bookFile ? coverTone(bookFile) : null,
      degree: 0,
    })
  }
  const known = new Set(nodes.map((node) => node.id))
  const links: GraphLink[] = response.edges
    .filter((edge) => known.has(edge.source) && known.has(edge.target) && edge.type !== 'appears_in')
    .map((edge) => ({ source: edge.source, target: edge.target, kind: edge.type as GraphLinkKind, weight: Math.max(1, edge.weight) }))
  const degree = new Map<string, number>()
  for (const link of links) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1)
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1)
  }
  for (const node of nodes) node.degree = degree.get(node.id) ?? 0
  return { nodes, links, truncated: response.truncated }
}

/** Видимая часть графа: фильтры прячут узлы, а с ними — их связи. */
export function filterGraph(model: GraphModel, hidden: ReadonlySet<GraphHiddenKind>): GraphModel {
  const nodes = model.nodes.filter((node) => {
    if (node.kind === 'note' && hidden.has('lonely') && node.degree === 0) return false
    return node.kind === 'note' || !hidden.has(node.kind)
  })
  const visible = new Set(nodes.map((node) => node.id))
  const links = model.links.filter((link) => visible.has(link.source) && visible.has(link.target))
  return { nodes, links, truncated: model.truncated }
}

/** Соседи узла (вместе с ним самим): их подсвечивает наведение. */
export function neighbours(links: readonly GraphLink[], id: string): Set<string> {
  const result = new Set([id])
  for (const link of links) {
    if (link.source === id) result.add(link.target)
    if (link.target === id) result.add(link.source)
  }
  return result
}

/** Поиск по подписи без учёта регистра и «ё/е». */
export function matchesGraphQuery(label: string, query: string) {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/ё/g, 'е').trim()
  const needle = normalize(query)
  return Boolean(needle) && normalize(label).includes(needle)
}

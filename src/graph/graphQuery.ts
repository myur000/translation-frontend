import { GRAPH_COLORINGS, GRAPH_HIDDEN_KINDS, type GraphColoring, type GraphHiddenKind } from './graphModel.ts'

/** Раздел «Граф» в рельсе. */
export const GRAPH_PATH = '/graph'

/**
 * Состояние графа в адресе: что спрятано фильтрами, какой узел выбран и что ищут.
 * Панель в рельсе и холст читают и пишут одно и то же; «Назад» и ссылки работают.
 */
export interface GraphQuery {
  hidden: ReadonlySet<GraphHiddenKind>
  /** Раскраска заметок; `none` в адрес не пишется. */
  color: GraphColoring
  /** Выбранный узел (`note:…`, `document:…`): его карточка справа, к нему подлетает камера. */
  node: string | null
  q: string
}

const isHiddenKind = (value: string): value is GraphHiddenKind => (GRAPH_HIDDEN_KINDS as readonly string[]).includes(value)

export function readGraphQuery(search: string): GraphQuery {
  const params = new URLSearchParams(search)
  return {
    hidden: new Set((params.get('hide') ?? '').split(',').filter(isHiddenKind)),
    color: (GRAPH_COLORINGS as readonly string[]).includes(params.get('color') ?? '') ? params.get('color') as GraphColoring : 'none',
    node: params.get('node') || null,
    q: params.get('q') ?? '',
  }
}

export function graphSearch(query: GraphQuery) {
  const params = new URLSearchParams()
  // Порядок фильтров постоянный: один и тот же вид — один и тот же адрес.
  const hidden = GRAPH_HIDDEN_KINDS.filter((kind) => query.hidden.has(kind))
  if (hidden.length) params.set('hide', hidden.join(','))
  if (query.color !== 'none') params.set('color', query.color)
  if (query.node) params.set('node', query.node)
  if (query.q.trim()) params.set('q', query.q.trim())
  const text = params.toString()
  return text ? `?${text}` : ''
}

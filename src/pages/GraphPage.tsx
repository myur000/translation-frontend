import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { GraphCanvas } from '../components/graph/GraphCanvas.tsx'
import { GraphNodeCard } from '../components/graph/GraphNodeCard.tsx'
import { buildGraphModel, filterGraph, matchesGraphQuery, type GraphModel, type GraphNode } from '../graph/graphModel.ts'
import { graphSearch, readGraphQuery } from '../graph/graphQuery.ts'
import { useTranslation } from '../i18n/useTranslation.ts'
import { useNotesGraph } from '../notes/useNotesGraph.ts'
import styles from './GraphPage.module.css'

const EMPTY: GraphModel = { nodes: [], links: [], truncated: false }

/**
 * Раздел «Граф» в рельсе: все заметки, книги, конспекты, теги и несозданные заметки
 * картой связей. Управление (поиск, фильтры, книги) — в панели рядом с рельсом;
 * состояние — в адресе (`readGraphQuery`), поэтому «Назад» и ссылки работают.
 */
export function GraphPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { graph, retry } = useNotesGraph()
  const query = useMemo(() => readGraphQuery(location.search), [location.search])
  // Раскладка пересобирается только при смене ответа сервера или фильтров.
  const model = useMemo(() => (graph.status === 'ready' ? buildGraphModel(graph.response) : EMPTY), [graph])
  const hiddenKey = [...query.hidden].sort().join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visible = useMemo(() => filterGraph(model, query.hidden), [model, hiddenKey])
  const [focusNonce, setFocusNonce] = useState(0)
  const selected = visible.nodes.find((node) => node.id === query.node) ?? null
  // Узел выбран кликом по самой карте — камера остаётся, где была. Выбран откуда угодно
  // ещё (панель, связи в карточке, ссылка) — карта подлетает к нему.
  const [clickedNode, setClickedNode] = useState<string | null>(null)
  const [seenNode, setSeenNode] = useState<string | null>(null)
  if (query.node !== seenNode) {
    setSeenNode(query.node)
    if (query.node && query.node !== clickedNode) setFocusNonce((value) => value + 1)
  }

  const select = (id: string | null, fromMap = false) => {
    setClickedNode(fromMap ? id : null)
    void navigate({ pathname: location.pathname, search: graphSearch({ ...query, node: id }) }, { replace: true })
  }
  const open = (node: GraphNode) => {
    if ((node.kind === 'note' || node.kind === 'summary') && node.ref) void navigate(`/notes/${encodeURIComponent(node.ref)}`)
    else if (node.kind === 'book' && node.ref && !node.deleted) void navigate(`/documents/${encodeURIComponent(node.ref)}`)
    else if (node.kind === 'missing') void navigate(`/notes/new?${new URLSearchParams({ title: node.label })}`)
    else if (node.kind === 'tag') void navigate(`/notes?${new URLSearchParams({ tag: node.label.replace(/^#/, '') })}`)
  }

  const matches = query.q ? visible.nodes.filter((node) => matchesGraphQuery(node.label, query.q)).length : 0
  const counts = {
    notes: model.nodes.filter((node) => node.kind === 'note' || node.kind === 'summary').length,
    books: model.nodes.filter((node) => node.kind === 'book').length,
  }

  let content
  if (graph.status === 'loading' || graph.status === 'idle') {
    content = <p className={styles.state} role="status">{t('graph.loading')}</p>
  } else if (graph.status === 'error') {
    content = (
      <div className={styles.state} role="alert">
        <span>{t('graph.loadError')}</span>
        <button type="button" onClick={retry}>{t('notes.retry')}</button>
      </div>
    )
  } else if (!counts.notes) {
    content = (
      <div className={styles.empty}>
        <h2>{t('graph.emptyTitle')}</h2>
        <p>{t('graph.emptyHint')}</p>
      </div>
    )
  } else {
    content = (
      <div className={styles.body}>
        <div className={styles.canvasArea}>
          <GraphCanvas
            model={visible}
            selectedId={selected?.id ?? null}
            query={query.q}
            focusNonce={focusNonce}
            label={t('graph.canvasLabel', { notes: counts.notes, books: counts.books })}
            onSelect={(id) => select(id, true)}
            onOpen={open}
          />
          <p className={styles.hint}>{t('graph.hint')}</p>
          {/* Холст не читается скринридером и не ходит по Tab — рядом те же узлы списком. */}
          <ul className={styles.visuallyHidden} aria-label={t('graph.nodeList')}>
            {visible.nodes.map((node) => (
              <li key={node.id}>
                <button type="button" aria-pressed={node.id === selected?.id} onClick={() => select(node.id)}>
                  {t(`graph.short.${node.kind}`)}: {node.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {selected ? (
          <GraphNodeCard
            key={selected.id}
            node={selected}
            nodes={model.nodes}
            links={visible.links}
            onSelect={(id) => select(id)}
            onClose={() => select(null, true)}
          />
        ) : null}
      </div>
    )
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1>{t('graph.title')}</h1>
        {graph.status === 'ready' && counts.notes ? (
          <p className={styles.counts}>
            {t('graph.counts', { notes: counts.notes, books: counts.books })}
            {query.q ? ` · ${t('graph.matches', { count: matches })}` : ''}
          </p>
        ) : null}
      </header>
      {graph.status === 'ready' && graph.response.truncated ? <p className={styles.notice} role="status">{t('notesPanel.truncated')}</p> : null}
      {content}
    </section>
  )
}

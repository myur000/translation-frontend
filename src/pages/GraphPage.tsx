import { useId, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { GraphCanvas } from '../components/graph/GraphCanvas.tsx'
import { GraphNodeCard } from '../components/graph/GraphNodeCard.tsx'
import { buildGraphModel, colorGraph, filterGraph, matchesGraphQuery, splitLonely, type GraphModel, type GraphNode } from '../graph/graphModel.ts'
import { graphSearch, readGraphQuery } from '../graph/graphQuery.ts'
import { useTranslation } from '../i18n/useTranslation.ts'
import { useNotesGraph } from '../notes/useNotesGraph.ts'
import styles from './GraphPage.module.css'

const EMPTY: GraphModel = { nodes: [], links: [], truncated: false }
/** Меньше стольких связей — подсказываем, откуда они берутся. */
const SPARSE_LINKS = 10
const SPARSE_HINT_KEY = 'parallel.graph-sparse-hint.v1'

function isSparseHintClosed() {
  try {
    return window.localStorage.getItem(SPARSE_HINT_KEY) === 'closed'
  } catch {
    return false
  }
}

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
  const { connected, lonely } = useMemo(() => splitLonely(visible), [visible])
  // Цвета — по всему графу: спрятанные фильтром теги не сбивают раскраску.
  const colors = useMemo(() => colorGraph(model, query.color), [model, query.color])
  const [isSparseClosed, setSparseClosed] = useState(isSparseHintClosed)
  const sparseTitleId = useId()
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

  const closeSparseHint = () => {
    setSparseClosed(true)
    try {
      window.localStorage.setItem(SPARSE_HINT_KEY, 'closed')
    } catch {
      // Без хранилища подсказка вернётся при следующем заходе.
    }
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
      <>
        <GraphCanvas
          model={connected}
          selectedId={selected?.id ?? null}
          query={query.q}
          tones={colors.tones}
          focusNonce={focusNonce}
          label={t('graph.canvasLabel', { notes: counts.notes, books: counts.books })}
          onSelect={(id, follow) => select(id, !follow)}
          onOpen={open}
        />
        {!isSparseClosed && connected.links.length < SPARSE_LINKS ? (
          <section className={styles.sparse} aria-labelledby={sparseTitleId}>
            <h2 id={sparseTitleId}>{t('graph.sparse.title')}</h2>
            <ul>
              <li><svg viewBox="0 0 30 12" aria-hidden="true"><line x1="1" y1="6" x2="29" y2="6" className={styles.sampleQuote} /></svg>{t('graph.sparse.quote')}</li>
              <li><svg viewBox="0 0 30 12" aria-hidden="true"><line x1="1" y1="6" x2="29" y2="6" className={styles.sampleLink} /></svg>{t('graph.sparse.link')}</li>
              <li><svg viewBox="0 0 30 12" aria-hidden="true"><circle cx="15" cy="6" r="4.5" className={styles.sampleMissing} /></svg>{t('graph.sparse.missing')}</li>
            </ul>
            <button type="button" onClick={closeSparseHint}>{t('graph.sparse.dismiss')}</button>
          </section>
        ) : null}
        {lonely.length ? (
          <div className={styles.lonely} role="group" aria-label={t('graph.lonely', { count: lonely.length })}>
            <span aria-hidden="true">{t('graph.lonely', { count: lonely.length })}</span>
            {lonely.map((node) => (
              <button key={node.id} type="button" aria-pressed={node.id === selected?.id} onClick={() => select(node.id, true)}>
                {node.label}
              </button>
            ))}
          </div>
        ) : null}
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
      </>
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
        {graph.status === 'ready' && graph.response.truncated ? <p className={styles.notice} role="status">{t('notesPanel.truncated')}</p> : null}
      </header>
      <div className={styles.stage}>{content}</div>
    </section>
  )
}

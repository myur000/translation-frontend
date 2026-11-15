import { useMemo, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { buildGraphModel, GRAPH_HIDDEN_KINDS, matchesGraphQuery, type GraphHiddenKind } from '../../graph/graphModel.ts'
import { GRAPH_PATH, graphSearch, readGraphQuery, type GraphQuery } from '../../graph/graphQuery.ts'
import { useNotesGraph } from '../../notes/useNotesGraph.ts'
import { GlyphIcon } from '../ui/GlyphIcon.tsx'
import styles from './GraphSidebarPanel.module.css'

interface GraphSidebarPanelProps {
  /** Панель видна: граф грузится при первом показе. */
  isActive: boolean
}

/**
 * Панель раздела «Граф» рядом с рельсом: поиск узла, фильтры (что показывать на
 * карте) и книги — клик подводит граф к книге. Пишет в адрес `/graph`, который
 * читает холст: управление и карта не держат общего состояния, «Назад» работает.
 */
export function GraphSidebarPanel({ isActive }: GraphSidebarPanelProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { graph } = useNotesGraph(isActive)
  const isGraphRoute = location.pathname === GRAPH_PATH
  const query = isGraphRoute ? readGraphQuery(location.search) : readGraphQuery('')
  const model = useMemo(() => (graph.status === 'ready' ? buildGraphModel(graph.response) : null), [graph])
  const books = model?.nodes.filter((node) => node.kind === 'book') ?? []
  const firstMatch = query.q && model ? model.nodes.find((node) => matchesGraphQuery(node.label, query.q)) : undefined

  const go = (next: Partial<GraphQuery>, replace = true) => {
    void navigate({ pathname: GRAPH_PATH, search: graphSearch({ ...query, ...next }) }, { replace: isGraphRoute && replace })
  }
  const toggle = (kind: GraphHiddenKind) => {
    const hidden = new Set(query.hidden)
    if (hidden.has(kind)) hidden.delete(kind)
    else hidden.add(kind)
    go({ hidden })
  }

  return (
    <div className={styles.panel}>
      <label className={styles.search}>
        <GlyphIcon name="search" />
        <input
          type="search"
          value={query.q}
          placeholder={t('graph.search')}
          aria-label={t('graph.search')}
          onChange={(event) => go({ q: event.currentTarget.value })}
          // Enter — выбрать первое совпадение: карта подлетит к нему.
          onKeyDown={(event) => { if (event.key === 'Enter' && firstMatch) go({ node: firstMatch.id }, false) }}
        />
      </label>

      <fieldset className={styles.filters}>
        <legend>{t('graph.filters')}</legend>
        {GRAPH_HIDDEN_KINDS.map((kind) => {
          // «Одиночные» — наоборот: галочка значит «показывать заметки без связей».
          const isShown = !query.hidden.has(kind)
          return (
            <label key={kind} className={styles.filter}>
              <input type="checkbox" checked={isShown} onChange={() => toggle(kind)} />
              <span className={`${styles.mark} ${styles[`mark_${kind}`]}`} aria-hidden="true" />
              {t(`graph.filter.${kind}`)}
            </label>
          )
        })}
      </fieldset>

      {books.length ? (
        <section className={styles.books} aria-label={t('graph.books')}>
          <h3>{t('graph.books')}</h3>
          <ul>
            {books.map((book) => (
              <li key={book.id}>
                <button
                  type="button"
                  className={`${styles.book} ${query.node === book.id ? styles.bookActive : ''}`}
                  aria-pressed={query.node === book.id}
                  title={t('graph.focusBook', { title: book.label })}
                  onClick={() => go({ node: book.id }, false)}
                  style={{ '--node-tone': `var(--cover-${book.tone ?? 0})` } as CSSProperties}
                >
                  <span className={styles.cover} aria-hidden="true" />
                  <span className={styles.bookTitle}>{book.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {graph.status === 'error' ? <p className={styles.muted} role="alert">{t('graph.loadError')}</p> : null}
    </div>
  )
}

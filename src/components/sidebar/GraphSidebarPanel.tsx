import { useId, useMemo, type CSSProperties, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from '../../i18n/useTranslation.ts'
import {
  buildGraphModel,
  colorGraph,
  GRAPH_COLORINGS,
  GRAPH_HIDDEN_KINDS,
  matchesGraphQuery,
  type GraphHiddenKind,
  type GraphLinkKind,
} from '../../graph/graphModel.ts'
import { GRAPH_PATH, graphSearch, readGraphQuery, type GraphQuery } from '../../graph/graphQuery.ts'
import { useNotesGraph } from '../../notes/useNotesGraph.ts'
import { GlyphIcon } from '../ui/GlyphIcon.tsx'
import styles from './GraphSidebarPanel.module.css'

const LEGEND: [GraphLinkKind, ReactNode][] = [
  ['quotes', <line key="quotes" x1="1" y1="5" x2="27" y2="5" strokeWidth="2.6" />],
  ['links', <g key="links"><line x1="1" y1="5" x2="22" y2="5" strokeWidth="1" /><path d="M27 5l-5.5-3v6z" stroke="none" /></g>],
  ['about', <line key="about" x1="1" y1="5" x2="27" y2="5" strokeWidth="1.4" strokeDasharray="4 3" />],
  ['tagged', <line key="tagged" x1="2" y1="5" x2="27" y2="5" strokeWidth="1.3" strokeDasharray="0.1 3.5" strokeLinecap="round" />],
]

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
  const colors = useMemo(() => (model ? colorGraph(model, query.color) : null), [model, query.color])
  const coloringId = useId()
  const legendId = useId()
  const legend = LEGEND.filter(([kind]) => {
    if (kind === 'about') return !query.hidden.has('summary') && !query.hidden.has('book')
    if (kind === 'tagged') return !query.hidden.has('tag')
    return true
  })
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

      <section className={styles.section} aria-labelledby={coloringId}>
        <h3 id={coloringId}>{t('graph.coloring')}</h3>
        <div className={styles.views} role="group" aria-labelledby={coloringId}>
          {GRAPH_COLORINGS.map((mode) => (
            <button key={mode} type="button" className={styles.viewButton} aria-pressed={query.color === mode} onClick={() => go({ color: mode })}>
              {t(`graph.coloring.${mode}`)}
            </button>
          ))}
        </div>
        {query.color === 'book' ? <p className={styles.muted}>{t('graph.coloring.bookHint')}</p> : null}
        {query.color === 'tag' && colors ? (
          colors.groups.length ? (
            <ul className={styles.swatches} aria-label={t('graph.coloring.tagGroups')}>
              {colors.groups.map((group) => (
                <li key={group.id} style={{ '--group-tone': `var(--graph-group-${group.tone})` } as CSSProperties}>
                  <span className={styles.swatch} aria-hidden="true" />
                  <span className={styles.swatchLabel}>{group.label}</span>
                  <span className={styles.count}>{group.count}</span>
                </li>
              ))}
              {colors.others ? <li className={styles.muted}>{t('graph.coloring.others', { count: colors.others })}</li> : null}
            </ul>
          ) : <p className={styles.muted}>{t('graph.coloring.noTags')}</p>
        ) : null}
      </section>

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
      <section className={styles.section} aria-labelledby={legendId}>
        <h3 id={legendId}>{t('graph.legend')}</h3>
        <ul className={styles.legend}>
          {legend.map(([kind, sample]) => (
            <li key={kind}>
              <svg viewBox="0 0 28 10" aria-hidden="true">{sample}</svg>
              {t(`graph.legend.${kind}`)}
            </li>
          ))}
          <li>
            <svg viewBox="0 0 28 10" aria-hidden="true"><circle cx="14" cy="5" r="4" fill="none" strokeWidth="1" strokeDasharray="2 2" /></svg>
            {t('graph.legend.missing')}
          </li>
        </ul>
      </section>
      {graph.status === 'error' ? <p className={styles.muted} role="alert">{t('graph.loadError')}</p> : null}
    </div>
  )
}

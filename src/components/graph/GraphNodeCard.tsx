import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import type { NoteResponse } from '../../api/contracts/notes.ts'
import { getNote } from '../../api/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { GraphLink, GraphNode } from '../../graph/graphModel.ts'
import { bookNoteHref, bookSummaryHref, noteBooks } from '../../notes/noteBooks.ts'
import { notesSearch } from '../../notes/notesQuery.ts'
import { plainExcerpt } from '../../notes/noteSyntax.ts'
import styles from './GraphNodeCard.module.css'

interface GraphNodeCardProps {
  node: GraphNode
  /** Все узлы и связи графа (не только видимые): у книги считаются все её заметки. */
  nodes: readonly GraphNode[]
  links: readonly GraphLink[]
  onSelect: (id: string) => void
  onClose: () => void
}

type Loaded = { id: string; note: NoteResponse | null }

/**
 * Карточка выбранного узла справа от графа: что это, начало текста (у заметки и
 * конспекта) и куда перейти — открыть, открыть в книге, создать несозданную,
 * заметки с тегом. Ниже — связи узла списком: по ним можно ходить и с клавиатуры.
 */
export function GraphNodeCard({ node, nodes, links, onSelect, onClose }: GraphNodeCardProps) {
  const { t, tc } = useTranslation()
  const { session } = useAuth()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const isNote = node.kind === 'note' || node.kind === 'summary'
  const noteId = isNote ? node.ref : null

  // Текст заметки граф не отдаёт — дочитываем саму заметку, когда её выбрали.
  useEffect(() => {
    const token = session?.accessToken
    if (!noteId || !token) return
    const controller = new AbortController()
    getNote(noteId, { accessToken: token, signal: controller.signal }).then(
      (note) => { if (!controller.signal.aborted) setLoaded({ id: noteId, note }) },
      () => { if (!controller.signal.aborted) setLoaded({ id: noteId, note: null }) },
    )
    return () => controller.abort()
  }, [noteId, session?.accessToken])

  const byId = new Map(nodes.map((item) => [item.id, item]))
  const related = [...new Set(links.flatMap((link) => (link.source === node.id ? [link.target] : link.target === node.id ? [link.source] : [])))]
    .map((id) => byId.get(id))
    .filter((item): item is GraphNode => Boolean(item))
  const note = loaded?.id === noteId ? loaded.note : null
  const book = node.kind === 'summary' ? related.find((item) => item.kind === 'book') : null
  const bookOfNote = note ? noteBooks(note).find((item) => item.isAvailable) : null
  const tone = node.tone !== null ? `var(--cover-${node.tone})` : undefined
  const kindLabel = node.kind === 'summary'
    ? t('graph.kind.summaryOf', { book: book?.label ?? '' })
    : t(`graph.kind.${node.kind}`)

  return (
    <aside className={styles.card} aria-label={t('graph.cardLabel', { title: node.label })}
      style={tone ? ({ '--node-tone': tone } as CSSProperties) : undefined}>
      <div className={styles.header}>
        <span className={styles.kind}>
          <span className={`${styles.mark} ${styles[`mark_${node.kind}`]}`} aria-hidden="true" />
          {kindLabel}
        </span>
        <button type="button" className={styles.close} aria-label={t('graph.closeCard')} title={t('graph.closeCard')} onClick={onClose}>×</button>
      </div>
      <h2 className={styles.title}>{node.label}</h2>

      {isNote ? (
        <>
          {note && note.body.trim() ? <p className={`${styles.excerpt} ${node.kind === 'summary' ? styles.summaryExcerpt : ''}`}>{plainExcerpt(note.body)}</p> : null}
          {node.kind === 'summary' && note ? <p className={styles.meta}>{tc('graph.excerpts', note.quotes.length)}</p> : null}
          <div className={styles.actions}>
            <Link className={styles.action} to={`/notes/${encodeURIComponent(node.ref ?? '')}`}>{t('graph.open')}</Link>
            {bookOfNote && note ? (
              <Link className={`${styles.action} ${styles.primary}`} to={bookNoteHref(bookOfNote.jobId, note.id, bookOfNote.quote?.id)}>
                {t('notes.openInBook')}
              </Link>
            ) : null}
          </div>
        </>
      ) : null}

      {node.kind === 'book' ? (
        <>
          <p className={styles.meta}>
            {tc('notes.home.noteCount', related.filter((item) => item.kind === 'note').length)}
            {related.some((item) => item.kind === 'summary') ? ` · ${tc('notes.home.summaryCount', related.filter((item) => item.kind === 'summary').length)}` : ''}
          </p>
          {node.ref && !node.deleted ? (
            <div className={styles.actions}>
              <Link className={`${styles.action} ${styles.primary}`} to={`/documents/${encodeURIComponent(node.ref)}`}>{t('notes.home.openBook')}</Link>
              <Link className={styles.action} to={bookSummaryHref(node.ref)}>{t('documentActions.summary')}</Link>
            </div>
          ) : <p className={styles.meta}>{t('notes.home.bookDeleted')}</p>}
        </>
      ) : null}

      {node.kind === 'missing' ? (
        <>
          <p className={styles.meta}>{t('graph.missingHint')}</p>
          <div className={styles.actions}>
            <Link className={`${styles.action} ${styles.primary}`} to={`/notes/new?${new URLSearchParams({ title: node.label })}`}>{t('graph.create')}</Link>
          </div>
        </>
      ) : null}

      {node.kind === 'tag' ? (
        <div className={styles.actions}>
          <Link className={styles.action} to={{ pathname: '/notes', search: notesSearch({ tag: node.label.replace(/^#/, '') }) }}>{t('graph.tagNotes')}</Link>
        </div>
      ) : null}

      {related.length ? (
        <section className={styles.related} aria-label={t('graph.related', { count: related.length })}>
          <h3>{t('graph.related', { count: related.length })}</h3>
          <ul>
            {related.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => onSelect(item.id)}
                  style={item.tone !== null ? ({ '--node-tone': `var(--cover-${item.tone})` } as CSSProperties) : undefined}>
                  <span className={`${styles.mark} ${styles[`mark_${item.kind}`]}`} aria-hidden="true" />
                  <span className={styles.relatedLabel}>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  )
}

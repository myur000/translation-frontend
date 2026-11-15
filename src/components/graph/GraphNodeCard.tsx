import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import type { NoteResponse } from '../../api/contracts/notes.ts'
import { getNote } from '../../api/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { coverInitial } from '../../documents/bookTitle.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { CountKey, TranslationKey } from '../../i18n/translations.ts'
import { nodeRelations, type GraphLink, type GraphNode } from '../../graph/graphModel.ts'
import { bookNoteHref, bookSummaryHref, noteBooks } from '../../notes/noteBooks.ts'
import { notesSearch } from '../../notes/notesQuery.ts'
import { plainExcerpt } from '../../notes/noteSyntax.ts'
import styles from './GraphNodeCard.module.css'

interface GraphNodeCardProps {
  node: GraphNode
  nodes: readonly GraphNode[]
  /** Только видимые: карточка показывает то же, что карта. */
  links: readonly GraphLink[]
  onSelect: (id: string) => void
  onClose: () => void
}

type Loaded = { id: string; note: NoteResponse | null }
type RelatedItem = { id: string; weight?: number }

const toneStyle = (tone: number | null) => (tone !== null ? ({ '--node-tone': `var(--cover-${tone})` } as CSSProperties) : undefined)

export function GraphNodeCard({ node, nodes, links, onSelect, onClose }: GraphNodeCardProps) {
  const { t, tc } = useTranslation()
  const { session } = useAuth()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const isNote = node.kind === 'note' || node.kind === 'summary'
  const noteId = isNote ? node.ref : null

  // В графе нет текста заметки.
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
  const relations = nodeRelations(links, node.id)
  const ids = (list: string[]): RelatedItem[] => list.map((id) => ({ id }))
  const groups: [TranslationKey, RelatedItem[]][] = [
    ['graph.rel.quotes', relations.quotes],
    ['graph.rel.about', ids(relations.about)],
    ['graph.rel.summaries', ids(relations.summaries)],
    ['graph.rel.quotedBy', relations.quotedBy],
    ['graph.rel.linksOut', ids(relations.linksOut)],
    ['graph.rel.linksIn', ids(relations.linksIn)],
    ['graph.rel.tags', ids(relations.tags)],
    ['graph.rel.tagged', ids(relations.tagged)],
  ]
  const relatedCount = new Set(groups.flatMap(([, items]) => items.map((item) => item.id))).size

  const note = loaded?.id === noteId ? loaded.note : null
  const bookOfNote = note ? noteBooks(note).find((item) => item.isAvailable) : null
  const summaryBook = node.kind === 'summary' ? byId.get(relations.about[0] ?? '') : undefined
  const kindLabel = summaryBook ? t('graph.kind.summaryOf', { book: summaryBook.label }) : t(`graph.kind.${node.kind}`)
  const quoteTotal = relations.quotes.reduce((sum, item) => sum + item.weight, 0)
  const count = (key: CountKey, value: number) => tc(key, value)

  let meta: string[] = []
  if (node.kind === 'note') {
    meta = [quoteTotal ? count('graph.quotesFromBook', quoteTotal) : t('graph.noBook')]
    if (relations.linksIn.length) meta.push(count('graph.backlinks', relations.linksIn.length))
  } else if (node.kind === 'summary' && note) {
    meta = [count('graph.excerpts', note.quotes.length)]
  } else if (node.kind === 'book') {
    meta = [count('notes.home.noteCount', new Set(relations.quotedBy.map((item) => item.id)).size)]
    if (relations.summaries.length) meta.push(count('notes.home.summaryCount', relations.summaries.length))
  } else if (node.kind === 'tag') {
    meta = [count('notes.home.noteCount', relations.tagged.length)]
  }

  return (
    <aside className={styles.card} aria-label={t('graph.cardLabel', { title: node.label })} style={toneStyle(node.tone)}>
      <div className={styles.header}>
        <span className={styles.kind}>{kindLabel}</span>
        <button type="button" className={styles.close} aria-label={t('graph.closeCard')} title={t('graph.closeCard')} onClick={onClose}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>

      {node.kind === 'book' ? (
        <div className={styles.bookHead}>
          <span className={styles.cover} aria-hidden="true">{coverInitial(node.label)}</span>
          <div className={styles.bookText}>
            <h2 className={styles.title}>{node.label}</h2>
            <p className={styles.meta}>{meta.join(' · ')}</p>
          </div>
        </div>
      ) : (
        <h2 className={styles.title}>{node.label}</h2>
      )}

      {isNote && note?.body.trim() ? (
        <p className={`${styles.excerpt} ${node.kind === 'summary' ? styles.summaryExcerpt : ''}`}>{plainExcerpt(note.body)}</p>
      ) : null}
      {node.kind !== 'book' && meta.length ? <p className={styles.meta}>{meta.join(' · ')}</p> : null}
      {node.kind === 'missing' ? <p className={styles.meta}>{t('graph.missingHint')}</p> : null}
      {node.kind === 'book' && (!node.ref || node.deleted) ? <p className={styles.meta}>{t('notes.home.bookDeleted')}</p> : null}

      {relatedCount ? (
        <section className={styles.related} aria-label={t('graph.related', { count: relatedCount })}>
          {groups.map(([key, items]) => (items.length ? (
            <div key={key} className={styles.group}>
              <h3>{t(key)}</h3>
              <ul>
                {items.map((item) => {
                  const target = byId.get(item.id)
                  if (!target) return null
                  return (
                    <li key={item.id}>
                      <button type="button" className={`${styles.chip} ${target.kind === 'missing' ? styles.chipMissing : ''}`}
                        style={toneStyle(target.tone)} onClick={() => onSelect(target.id)}>
                        {target.kind === 'book' || target.kind === 'summary' ? <span className={styles.chipTone} aria-hidden="true" /> : null}
                        <span className={styles.chipLabel}>{target.label}</span>
                        {item.weight ? <>{' '}<small>{count('graph.quoteCount', item.weight)}</small></> : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null))}
        </section>
      ) : null}

      <div className={styles.actions}>
        {isNote && node.ref ? (
          <>
            <Link className={`${styles.action} ${styles.primary}`} to={`/notes/${encodeURIComponent(node.ref)}`}>{t('graph.openNote')}</Link>
            {bookOfNote && note ? (
              <Link className={styles.action} to={bookNoteHref(bookOfNote.jobId, note.id, bookOfNote.quote?.id)}>{t('graph.inBook')}</Link>
            ) : null}
          </>
        ) : null}
        {node.kind === 'book' && node.ref && !node.deleted ? (
          <>
            <Link className={`${styles.action} ${styles.primary}`} to={`/documents/${encodeURIComponent(node.ref)}`}>{t('notes.home.openBook')}</Link>
            <Link className={styles.action} to={bookSummaryHref(node.ref)}>{t('documentActions.summary')}</Link>
          </>
        ) : null}
        {node.kind === 'missing' ? (
          <Link className={`${styles.action} ${styles.primary}`} to={`/notes/new?${new URLSearchParams({ title: node.label })}`}>{t('graph.create')}</Link>
        ) : null}
        {node.kind === 'tag' ? (
          <Link className={`${styles.action} ${styles.primary}`} to={{ pathname: '/notes', search: notesSearch({ tag: node.label.replace(/^#/, '') }) }}>
            {t('graph.tagNotes')}
          </Link>
        ) : null}
      </div>
    </aside>
  )
}

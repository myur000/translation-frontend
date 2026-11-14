import { useState } from 'react'
import { Link, NavLink, useMatch, useNavigate } from 'react-router'
import type { NoteSummary } from '../../api/contracts/notes.ts'
import { coverTone } from '../../documents/bookTitle.ts'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { NotesTree, NotesTreeBook } from '../../notes/notesTree.ts'
import { useNotes } from '../../notes/useNotes.ts'
import { deleteNote } from '../../api/notes.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { noteErrorMessage } from '../../notes/noteErrors.ts'
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx'
import { useNotesSidebar } from '../../notes/useNotesSidebar.ts'
import { GlyphIcon } from '../ui/GlyphIcon.tsx'
import styles from './NotesSidebarPanel.module.css'

type View = 'books' | 'recent'
const LOOSE_KEY = 'loose'

interface NotesSidebarPanelProps {
  /** Панель видна; данные грузятся при первом показе и дальше остаются. */
  isActive: boolean
}

/**
 * Панель раздела «Заметки» в боковой панели: дерево «книга → заметки» как папки
 * в Obsidian, недавние, теги и заметки, на которые уже ссылаются, но которых ещё
 * нет. Клик по заметке открывает её на странице раздела.
 */
export function NotesSidebarPanel({ isActive }: NotesSidebarPanelProps) {
  const { t } = useTranslation()
  const { revision, drafts, notesChanged } = useNotes()
  const { session } = useAuth()
  const navigate = useNavigate()
  // Удаление прямо из панели: та же проверка, что на странице заметки.
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string; busy: boolean; error: string | null } | null>(null)
  // Граф не грузим, пока панель ни разу не открыли.
  const [wasShown, setWasShown] = useState(isActive)
  if (isActive && !wasShown) setWasShown(true)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('')
  const [view, setView] = useState<View>('books')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const { data, results, retry } = useNotesSidebar(wasShown, revision, query, tag)
  const noteMatch = useMatch('/notes/:noteId')
  const activeNoteId = noteMatch?.params.noteId !== 'new' ? noteMatch?.params.noteId ?? null : null
  const isFiltering = Boolean(query.trim() || tag)

  const excerpts = new Map(data.status === 'ready' ? data.recent.map((note) => [note.id, note.excerpt]) : [])

  const removeNote = async () => {
    const token = session?.accessToken
    if (!token || !pendingDelete) return
    const { id } = pendingDelete
    setPendingDelete({ ...pendingDelete, busy: true, error: null })
    try {
      await deleteNote(id, { accessToken: token })
      drafts.clear(id)
      setPendingDelete(null)
      notesChanged()
      // Удалена открытая заметка — её страницы больше нет, возвращаемся к списку.
      if (activeNoteId === id) void navigate('/notes', { replace: true })
    } catch (caught) {
      const message = noteErrorMessage(caught)
      setPendingDelete((current) => current && { ...current, busy: false, error: message.kind === 'key' ? t(message.key) : message.text })
    }
  }

  const renderNote = (id: string, title: string, excerpt?: string, isSummary = false) => (
    <li key={id} className={styles.noteRow}>
      <NavLink to={`/notes/${id}`} className={({ isActive: isCurrent }) => `${styles.note} ${isCurrent ? styles.noteActive : ''}`}>
        <span className={styles.noteTitle}>
          {isSummary ? (
            // Тетрадь — конспект книги: заметка о ней целиком, а не об абзаце.
            <svg className={styles.summaryIcon} viewBox="0 0 16 16" role="img" aria-label={t('notesPanel.summary')}>
              <path d="M4 2.5h8.5v11H4zM4 2.5v11M2.5 5h3M2.5 8h3M2.5 11h3M7 6h3.5" />
            </svg>
          ) : null}
          {title}
        </span>
        {excerpt ? <span className={styles.excerpt}>{excerpt}</span> : null}
      </NavLink>
      <button
        type="button"
        className={styles.deleteButton}
        aria-label={t('notesPanel.deleteNote', { title })}
        title={t('notesPanel.deleteNote', { title })}
        onClick={() => setPendingDelete({ id, title, busy: false, error: null })}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.8 4.5h10.4M6.3 4.5V2.8h3.4v1.7M4.3 4.5l.7 8.7h6l.7-8.7M6.7 7v3.8M9.3 7v3.8" /></svg>
      </button>
    </li>
  )
  const renderSummaries = (items: NoteSummary[]) => (
    <ul className={styles.notes}>{items.map((note) => renderNote(note.id, note.title, note.excerpt))}</ul>
  )

  const renderGroup = (key: string, label: string, noteIds: string[], tree: NotesTree, book?: NotesTreeBook) => {
    // Книга с открытой заметкой раскрыта сама; единственная группа — тоже.
    const isOpen = expanded[key] ?? (noteIds.includes(activeNoteId ?? '') || tree.books.length + (tree.looseNoteIds.length ? 1 : 0) === 1)
    const listId = `notes-group-${key}`
    return (
      <li key={key} className={styles.group}>
        <button
          type="button"
          className={styles.groupButton}
          aria-expanded={isOpen}
          aria-controls={listId}
          title={book?.deleted ? t('notesPanel.deletedBook') : book?.fileName}
          onClick={() => setExpanded((current) => ({ ...current, [key]: !isOpen }))}
        >
          <svg className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
          {book
            ? <span className={`${styles.cover} ${book.deleted ? styles.coverDeleted : ''}`} style={{ background: `var(--cover-${coverTone(book.fileName)})` }} aria-hidden="true" />
            : <GlyphIcon name="notes" className={styles.looseIcon} />}
          <span className={styles.groupLabel}>{label}</span>
          <span className={styles.groupCount}>{noteIds.length}</span>
        </button>
        {isOpen ? (
          <ul id={listId} className={`${styles.notes} ${styles.nested}`}>
            {noteIds.map((id) => renderNote(id, tree.titles.get(id) ?? '', excerpts.get(id), book?.summaryIds.includes(id)))}
          </ul>
        ) : null}
      </li>
    )
  }

  const renderTree = (tree: NotesTree, recent: NoteSummary[]) => {
    if (!tree.titles.size) {
      return (
        <p className={styles.empty}>
          {t('notesPanel.empty')}{' '}
          <Link to="/notes/new">{t('notesPanel.newNote')}</Link>
        </p>
      )
    }
    return (
      <>
        <div className={styles.views} role="group" aria-label={t('notesPanel.viewLabel')}>
          {(['books', 'recent'] as const).map((value) => (
            <button key={value} type="button" className={styles.viewButton} aria-pressed={view === value} onClick={() => setView(value)}>
              {t(value === 'books' ? 'notesPanel.byBooks' : 'notesPanel.recent')}
            </button>
          ))}
        </div>
        {view === 'books' ? (
          <ul className={styles.groups} aria-label={t('notesPanel.byBooks')}>
            {tree.books.map((book) => renderGroup(book.key, book.title, book.noteIds, tree, book))}
            {tree.looseNoteIds.length ? renderGroup(LOOSE_KEY, t('notesPanel.loose'), tree.looseNoteIds, tree) : null}
          </ul>
        ) : renderSummaries(recent)}

        {tree.tags.length ? (
          <section className={styles.section} aria-label={t('notesPanel.tags')}>
            <h3 className={styles.sectionTitle}>{t('notesPanel.tags')}</h3>
            <div className={styles.tags}>
              {tree.tags.map((item) => (
                <button key={item.label} type="button" className={styles.tag} onClick={() => setTag(item.label)}>
                  #{item.label.replace(/^#/, '')} <span className={styles.tagCount}>{item.count}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {tree.missing.length ? (
          <section className={styles.section} aria-label={t('notesPanel.missing')}>
            <h3 className={styles.sectionTitle}>{t('notesPanel.missing')}<span>{tree.missing.length}</span></h3>
            <ul className={styles.notes}>
              {tree.missing.map((item) => (
                <li key={item.label}>
                  <Link
                    to={`/notes/new?title=${encodeURIComponent(item.label)}`}
                    className={styles.missing}
                    aria-label={t('notesPanel.createMissing', { title: item.label })}
                    title={t('notesPanel.createMissing', { title: item.label })}
                  >
                    <GlyphIcon name="plus" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {tree.truncated ? <p className={styles.empty}>{t('notesPanel.truncated')}</p> : null}
      </>
    )
  }

  return (
    <>
      <label className={styles.search}>
        <GlyphIcon name="search" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape' && query) { event.stopPropagation(); setQuery('') } }}
          placeholder={t('notesPanel.search')}
          aria-label={t('notesPanel.search')}
        />
      </label>
      {tag ? (
        <button type="button" className={styles.activeTag} onClick={() => setTag('')} aria-label={t('notesPanel.clearTag', { tag: `#${tag.replace(/^#/, '')}` })}>
          #{tag.replace(/^#/, '')} <span aria-hidden="true">×</span>
        </button>
      ) : null}

      <div className={styles.body}>
        {isFiltering ? (
          results.status === 'ready' ? (results.items.length ? renderSummaries(results.items) : <p className={styles.empty} role="status">{t('sidebar.noMatches')}</p>)
            : results.status === 'error' ? <ErrorState onRetry={retry} />
              : <p className={styles.empty} role="status">{t('notes.loading')}</p>
        ) : data.status === 'ready' ? renderTree(data.tree, data.recent)
          : data.status === 'error' ? <ErrorState onRetry={retry} />
            : <p className={styles.empty} role="status">{t('notes.loading')}</p>}
      </div>
      {pendingDelete ? (
        <ConfirmDialog
          title={t('notes.deleteTitle')}
          description={t('notes.deleteDescription', { title: pendingDelete.title })}
          confirmLabel={t('notes.delete')}
          busy={pendingDelete.busy}
          error={pendingDelete.error}
          onConfirm={() => void removeNote()}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}
    </>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <p className={styles.empty} role="alert">
      {t('notesPanel.error')}{' '}
      <button type="button" className={styles.retry} onClick={onRetry}>{t('notes.retry')}</button>
    </p>
  )
}

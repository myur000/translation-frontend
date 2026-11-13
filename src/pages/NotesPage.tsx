import { useLocation, useParams } from 'react-router'
import { NoteCreateView } from '../components/notes/NoteCreateView.tsx'
import { NoteDetailView } from '../components/notes/NoteDetailView.tsx'
import { NotesHome } from '../components/notes/NotesHome.tsx'

/** Раздел «Заметки»: `/notes`, `/notes/new`, `/notes/:noteId`. */
export function NotesPage({ isNew = false }: { isNew?: boolean }) {
  const { noteId } = useParams()
  const location = useLocation()
  // key: новая заметка из другой заготовки ([[…]]) и каждая заметка — со своим состоянием правки.
  if (isNew) return <NoteCreateView key={new URLSearchParams(location.search).get('title') ?? ''} />
  return noteId ? <NoteDetailView key={noteId} noteId={noteId} /> : <NotesHome />
}

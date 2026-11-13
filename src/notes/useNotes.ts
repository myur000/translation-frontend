import { useContext } from 'react'
import { NotesContext } from './NotesContext.ts'

export function useNotes() {
  const context = useContext(NotesContext)
  if (!context) throw new Error('useNotes must be used inside NotesProvider')
  return context
}

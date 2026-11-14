import { useEffect } from 'react'
import { useNotes } from './useNotes.ts'

/**
 * Граф заметок из `NotesProvider`. Вне раздела «Заметки» граф не грузится,
 * пока он кому-то не понадобится (`enabled`), — например, пока панель
 * заметок ни разу не открыли. Все потребители делят один запрос.
 */
export function useNotesGraph(enabled = true) {
  const { notesGraph, requestNotesGraph, retryNotesGraph } = useNotes()
  useEffect(() => {
    if (enabled) requestNotesGraph()
  }, [enabled, requestNotesGraph])
  return { graph: notesGraph, retry: retryNotesGraph }
}

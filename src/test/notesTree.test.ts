import { describe, expect, it } from 'vitest'
import type { NoteGraphResponse } from '../api/contracts/notes.ts'
import { buildNotesTree } from '../notes/notesTree.ts'

const note = (id: string, label: string) => ({ id: `note:${id}`, type: 'note' as const, label, ref: id, deleted: false })
const graph = (overrides: Partial<NoteGraphResponse>): NoteGraphResponse => ({ nodes: [], edges: [], truncated: false, ...overrides })

describe('notes tree', () => {
  it('groups notes by the books they quote, deleted books last', () => {
    const tree = buildNotesTree(graph({
      nodes: [
        note('n-1', 'Шторм'), note('n-2', 'Ветер'), note('n-3', 'Без цитат'),
        { id: 'document:old', type: 'document', label: 'archive.pdf', ref: null, deleted: true },
        { id: 'document:j-2', type: 'document', label: 'salt_and_iron.pdf', ref: 'j-2', deleted: false },
        { id: 'document:j-1', type: 'document', label: 'ledger.docx', ref: 'j-1', deleted: false },
      ],
      edges: [
        { source: 'note:n-1', target: 'document:j-1', type: 'quotes', weight: 1 },
        { source: 'note:n-2', target: 'document:j-1', type: 'quotes', weight: 3 },
        // Заметка цитирует две книги — она в обеих.
        { source: 'note:n-1', target: 'document:j-2', type: 'quotes', weight: 1 },
        { source: 'note:n-2', target: 'document:old', type: 'quotes', weight: 1 },
      ],
    }))

    expect(tree.books.map((book) => [book.title, book.noteIds, book.jobId])).toEqual([
      ['Ledger', ['n-2', 'n-1'], 'j-1'],
      ['Salt and iron', ['n-1'], 'j-2'],
      ['Archive', ['n-2'], null],
    ])
    expect(tree.looseNoteIds).toEqual(['n-3'])
    expect(tree.titles.get('n-2')).toBe('Ветер')
  })

  it('counts tags and links to notes that do not exist yet', () => {
    const tree = buildNotesTree(graph({
      nodes: [
        note('n-1', 'А'), note('n-2', 'Б'),
        { id: 'tag:сюжет', type: 'tag', label: 'сюжет', ref: null, deleted: false },
        { id: 'tag:герои', type: 'tag', label: 'герои', ref: null, deleted: false },
        { id: 'missing:лексика', type: 'missing', label: 'Лексика', ref: null, deleted: false },
      ],
      edges: [
        { source: 'note:n-1', target: 'tag:герои', type: 'tagged', weight: 1 },
        { source: 'note:n-1', target: 'tag:сюжет', type: 'tagged', weight: 1 },
        { source: 'note:n-2', target: 'tag:сюжет', type: 'tagged', weight: 1 },
        { source: 'note:n-1', target: 'missing:лексика', type: 'links', weight: 1 },
        { source: 'note:n-2', target: 'missing:лексика', type: 'links', weight: 1 },
        // Ссылка на существующую заметку в «несозданные» не попадает.
        { source: 'note:n-1', target: 'note:n-2', type: 'links', weight: 1 },
      ],
      truncated: true,
    }))

    expect(tree.tags).toEqual([{ label: 'сюжет', count: 2 }, { label: 'герои', count: 1 }])
    expect(tree.missing).toEqual([{ label: 'Лексика', count: 2 }])
    expect(tree.looseNoteIds).toEqual(['n-1', 'n-2'])
    expect(tree.truncated).toBe(true)
  })

  it('puts the summary of a book first in its group instead of «no book»', () => {
    const tree = buildNotesTree(graph({
      nodes: [
        note('n-1', 'Абзац'), note('n-2', 'Конспект'),
        { id: 'document:j-1', type: 'document', label: 'ledger.docx', ref: 'j-1', deleted: false },
      ],
      edges: [
        { source: 'note:n-1', target: 'document:j-1', type: 'quotes', weight: 1 },
        { source: 'note:n-2', target: 'document:j-1', type: 'about', weight: 1 },
      ],
    }))
    expect(tree.books[0]).toMatchObject({ noteIds: ['n-2', 'n-1'], summaryIds: ['n-2'] })
    expect(tree.looseNoteIds).toEqual([])
  })
})

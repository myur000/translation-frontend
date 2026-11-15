import { afterEach, describe, expect, it } from 'vitest'
import type { NoteResponse } from '../api/contracts/notes.ts'
import { nextSummaryTitle, pickCurrentSummary, readCurrentSummary, textClickTarget, writeCurrentSummary } from '../notes/bookSummaries.ts'

const titles = {
  first: (book: string) => `Конспект — ${book}`,
  numbered: (book: string, number: number) => `Конспект ${number} — ${book}`,
}
const summary = (id: string, title: string) => ({ id, title }) as NoteResponse

afterEach(() => localStorage.clear())

describe('summaries of a book', () => {
  it('names a new summary with the first free title, ignoring case', () => {
    expect(nextSummaryTitle(titles, 'Ledger', [])).toBe('Конспект — Ledger')
    expect(nextSummaryTitle(titles, 'Ledger', [summary('a', 'конспект — ledger')])).toBe('Конспект 2 — Ledger')
    expect(nextSummaryTitle(titles, 'Ledger', [summary('a', 'Конспект — Ledger'), summary('b', 'Конспект 2 — Ledger'), summary('c', 'Персонажи')]))
      .toBe('Конспект 3 — Ledger')
  })

  it('picks the remembered summary while it exists, otherwise the first one', () => {
    const list = [summary('a', 'Конспект'), summary('b', 'Персонажи')]
    expect(pickCurrentSummary(list, 'b')?.id).toBe('b')
    expect(pickCurrentSummary(list, 'deleted')?.id).toBe('a')
    expect(pickCurrentSummary([], 'b')).toBeNull()
  })

  it('remembers the current summary per book and per account and survives broken storage', () => {
    writeCurrentSummary('reader@example.com', 'job-1', 'a')
    writeCurrentSummary('reader@example.com', 'job-2', 'b')
    expect(readCurrentSummary('reader@example.com', 'job-1')).toBe('a')
    expect(readCurrentSummary('reader@example.com', 'job-2')).toBe('b')
    expect(readCurrentSummary('other@example.com', 'job-1')).toBeNull()
    localStorage.setItem('parallel.current-summary.v1.broken@example.com', '{oops')
    expect(readCurrentSummary('broken@example.com', 'job-1')).toBeNull()
    localStorage.setItem('parallel.current-summary.v1.array@example.com', '["a"]')
    expect(readCurrentSummary('array@example.com', '0')).toBeNull()
  })

  it('decides what a click on a quoted word opens: notes, the summary or a choice', () => {
    const summaries = new Set(['s-1'])
    expect(textClickTarget(['n-1', 'n-2'], summaries)).toEqual({ kind: 'notes', noteIds: ['n-1', 'n-2'] })
    expect(textClickTarget(['s-1'], summaries)).toEqual({ kind: 'summary', noteId: 's-1' })
    // Слово и в заметке, и в конспекте — выбирает человек.
    expect(textClickTarget(['n-1', 's-1'], summaries)).toEqual({ kind: 'choice', noteIds: ['n-1'], summaryIds: ['s-1'] })
  })
})

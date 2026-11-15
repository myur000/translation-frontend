import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteResponse } from '../api/contracts/notes.ts'
import { useQuoteClicks } from '../hooks/useQuoteClicks.ts'
import type { BookQuote } from '../notes/bookQuotes.ts'
import { notesAtPoint, type QuoteHit } from '../notes/quoteMarkerLayout.ts'

const note = { id: 'n-1', title: 'Шторм', body: '', version: 1, created_at: '', updated_at: '', tags: [], links: [], quotes: [] } as NoteResponse
const quote: BookQuote = { id: 'q-1', noteId: 'n-1', noteTitle: 'Шторм', side: 'TRANSLATION', paragraphIndex: 1,
  quote: 'ветер дул', pairedText: null, paragraphText: null, note }
/** Прямоугольник цитаты на экране: строка 100…300 по горизонтали, 40…60 по вертикали. */
const quoteRect = { left: 100, right: 300, top: 40, bottom: 60, width: 200, height: 20, x: 100, y: 40, toJSON: () => ({}) } as DOMRect

function Column({ onOpen, onHover }: { onOpen: (ids: string[]) => void; onHover: (ids: string[]) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useQuoteClicks({ viewportRef: ref, column: 'TRANSLATION', quotes: [quote], layoutKey: 'translation', onOpen, onHover })
  return (
    <div ref={ref} role="region" aria-label="Колонка">
      <article>
        <p data-paragraph-index="1">Тогда ветер дул с северо-востока. <a href="#x">ссылка</a></p>
      </article>
    </div>
  )
}

const originalGetClientRects = Range.prototype.getClientRects
beforeEach(() => {
  // jsdom не считает раскладку: у любого диапазона — прямоугольник цитаты.
  Range.prototype.getClientRects = () => [quoteRect] as unknown as DOMRectList
})
afterEach(() => {
  cleanup()
  Range.prototype.getClientRects = originalGetClientRects
  window.getSelection()?.removeAllRanges()
})

describe('notes at a point', () => {
  it('finds a note only inside the lines of its quote', () => {
    const range = document.createRange()
    const hits: QuoteHit[] = [{ noteId: 'n-1', range }, { noteId: 'n-1', range }, { noteId: 'n-2', range }]
    expect(notesAtPoint(hits, 150, 50)).toEqual(['n-1', 'n-2'])
    // Пустое место справа от строки — мимо цитаты.
    expect(notesAtPoint(hits, 400, 50)).toEqual([])
  })
})

describe('clicks on quotes in the book', () => {
  it('opens the note of the clicked quote', () => {
    const onOpen = vi.fn()
    render(<Column onOpen={onOpen} onHover={vi.fn()} />)
    fireEvent.click(screen.getByText(/Тогда ветер/), { clientX: 150, clientY: 50 })
    expect(onOpen).toHaveBeenCalledWith(['n-1'])
  })

  it('leaves selections, links and clicks beside the quote alone', () => {
    const onOpen = vi.fn()
    render(<Column onOpen={onOpen} onHover={vi.fn()} />)
    const paragraph = screen.getByText(/Тогда ветер/)
    fireEvent.click(paragraph, { clientX: 400, clientY: 50 })
    fireEvent.click(screen.getByRole('link', { name: 'ссылка' }), { clientX: 150, clientY: 50 })
    // Выделение текста — не клик по цитате.
    const selection = document.createRange()
    selection.selectNodeContents(paragraph)
    window.getSelection()?.addRange(selection)
    fireEvent.click(paragraph, { clientX: 150, clientY: 50 })
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('shows a pointer over a quote and reports its notes for the margin cards', async () => {
    const onHover = vi.fn()
    render(<Column onOpen={vi.fn()} onHover={onHover} />)
    const column = screen.getByRole('region', { name: 'Колонка' })
    fireEvent.pointerMove(screen.getByText(/Тогда ветер/), { clientX: 150, clientY: 50 })
    await act(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())))
    expect(onHover).toHaveBeenLastCalledWith(['n-1'])
    expect(column.hasAttribute('data-over-quote')).toBe(true)

    fireEvent.pointerLeave(column)
    expect(onHover).toHaveBeenLastCalledWith([])
    expect(column.hasAttribute('data-over-quote')).toBe(false)
  })
})

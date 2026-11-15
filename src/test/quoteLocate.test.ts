import { afterEach, describe, expect, it } from 'vitest'
import type { NoteResponse } from '../api/contracts/notes.ts'
import type { DocumentText } from '../api/documentText.ts'
import { noteBookQuotes, withParagraphTexts, type BookQuote } from '../notes/bookQuotes.ts'
import { findQuoteElement } from '../notes/quoteHighlight.ts'
import { placeMarkers } from '../notes/quoteMarkerLayout.ts'

// Как DOCX после mammoth: абзацы без номеров. «он» и «было» встречаются в нескольких.
const PARAGRAPHS = [
  'Журнал смотрителя маяка',
  'Элиас Марроу присматривал за маяком, и каждый вечер он записывал ветер.',
  'В ночь шторма ветер дул с северо-востока, что было необычно.',
  'Незадолго до полуночи он увидел свет, и было слишком низко для огня.',
  'Когда он поднял глаза, огонь исчез.',
]

function renderColumn() {
  const viewport = document.createElement('div')
  const article = document.createElement('article')
  for (const text of PARAGRAPHS) {
    const paragraph = document.createElement('p')
    paragraph.textContent = text
    article.append(paragraph)
  }
  viewport.append(article)
  document.body.append(viewport)
  return { viewport, paragraphs: [...article.querySelectorAll('p')] }
}

const quote = (overrides: Partial<BookQuote>): BookQuote => ({
  id: 'q-1', noteId: 'n-1', noteTitle: 'Заметка', side: 'TRANSLATION', paragraphIndex: 4,
  quote: 'он', pairedText: null, paragraphText: null, note: {} as NoteResponse, ...overrides,
})

afterEach(() => { document.body.innerHTML = '' })

describe('finding the paragraph of a quote', () => {
  it('uses the paragraph text, not the first block with the same words', () => {
    const { viewport, paragraphs } = renderColumn()
    // «он» есть в абзацах 1, 3 и 4; цитата сделана в абзаце 4.
    expect(findQuoteElement(viewport, 4, 'он', PARAGRAPHS[4])).toBe(paragraphs[4])
    expect(findQuoteElement(viewport, 3, 'было', PARAGRAPHS[3])).toBe(paragraphs[3])
  })

  it('falls back to the block nearest to the paragraph number without the text', () => {
    const { viewport, paragraphs } = renderColumn()
    expect(findQuoteElement(viewport, 4, 'он')).toBe(paragraphs[4])
    expect(findQuoteElement(viewport, 2, 'было')).toBe(paragraphs[2])
    // Длинная цитата однозначна и без номера.
    expect(findQuoteElement(viewport, 0, 'увидел свет')).toBe(paragraphs[3])
  })

  it('labels a marker with its own paragraph, even if the note quotes others too', () => {
    const { viewport } = renderColumn()
    const markers = placeMarkers(viewport, 'TRANSLATION', [
      quote({ id: 'q-1', paragraphIndex: 1, quote: 'он', paragraphText: PARAGRAPHS[1] }),
      quote({ id: 'q-2', paragraphIndex: 4, quote: 'поднял', paragraphText: PARAGRAPHS[4] }),
    ])
    expect(markers.map((marker) => marker.paragraphIndex)).toEqual([1, 4])
    expect(markers.every((marker) => marker.noteIds.join() === 'n-1')).toBe(true)
  })
})

describe('book quotes with paragraph texts', () => {
  const text: DocumentText = { sourceAvailable: true, aligned: true, truncated: false, paragraphs: [
    { index: 0, source: 'The Ledger', translation: 'Журнал' },
    { index: 3, source: 'He saw a light.', translation: 'Он увидел свет.' },
  ] }

  it('adds the paragraph of each quote in its own column', () => {
    const quotes = withParagraphTexts([
      quote({ side: 'TRANSLATION', paragraphIndex: 3 }),
      quote({ id: 'q-2', side: 'SOURCE', paragraphIndex: 3 }),
      quote({ id: 'q-3', paragraphIndex: 7 }),
    ], text)
    expect(quotes.map((item) => item.paragraphText)).toEqual(['Он увидел свет.', 'He saw a light.', null])
    expect(withParagraphTexts([quote({})], null)[0].paragraphText).toBeNull()
  })

  it('turns a saved note into the quotes of this book only', () => {
    const note = { id: 'n-5', title: 'Свет', quotes: [
      { id: 'q-a', job_id: 'job-1', side: 'TRANSLATION', paragraph_index: 3, quote: 'свет', paired_text: 'a light' },
      { id: 'q-b', job_id: 'job-2', side: 'SOURCE', paragraph_index: 1, quote: 'x', paired_text: null },
    ] } as unknown as NoteResponse
    expect(noteBookQuotes(note, 'job-1')).toEqual([expect.objectContaining({ id: 'q-a', noteId: 'n-5', paragraphIndex: 3, quote: 'свет', note })])
  })
})

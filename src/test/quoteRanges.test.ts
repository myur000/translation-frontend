import { afterEach, describe, expect, it, vi } from 'vitest'
import { findQuoteRange, NOTE_QUOTE_HIGHLIGHT, setQuoteHighlightRanges } from '../notes/quoteRanges.ts'

function paragraph(html: string) {
  const element = document.createElement('p')
  element.innerHTML = html
  document.body.append(element)
  return element
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('quote range in a paragraph', () => {
  it('spans inline markup and ignores differences in spaces and soft hyphens', () => {
    const element = paragraph('В ночь <em>шторма</em>  ветер\u00a0дул с се\u00adверо-востока, что было необычно.')
    expect(findQuoteRange(element, 'шторма ветер дул с северо-востока')?.toString())
      .toBe('шторма  ветер\u00a0дул с се\u00adверо-востока')
  })

  it('highlights the matching start of a truncated quote or one that runs into the next paragraph', () => {
    const element = paragraph('Незадолго до полуночи он увидел свет. Дальше текст абзаца.')
    expect(findQuoteRange(element, 'он увидел свет. Дальше…')?.toString()).toBe('он увидел свет. Дальше')
    expect(findQuoteRange(element, 'он увидел свет. Дальше текст абзаца. Следующий абзац')?.toString())
      .toBe('он увидел свет. Дальше текст абзаца.')
  })

  it('skips service layers and returns null when the quote is not in the paragraph', () => {
    const element = paragraph('<span data-quote-ignore="">2</span>Ветер дул с северо-востока.')
    expect(findQuoteRange(element, '2Ветер')).toBeNull()
    expect(findQuoteRange(element, 'Ветер дул')?.toString()).toBe('Ветер дул')
    expect(findQuoteRange(element, 'Этого текста нет в абзаце')).toBeNull()
    expect(findQuoteRange(element, '   ')).toBeNull()
  })
})

describe('shared quote highlight', () => {
  it('keeps ranges of both columns and removes the highlight when both are empty', () => {
    const highlights = new Map<string, { ranges: Range[] }>()
    vi.stubGlobal('CSS', { highlights })
    vi.stubGlobal('Highlight', class { ranges: Range[]; constructor(...ranges: Range[]) { this.ranges = ranges } })
    const original = {}
    const translation = {}
    const range = () => document.createRange()

    setQuoteHighlightRanges(original, [range()])
    setQuoteHighlightRanges(translation, [range(), range()])
    expect(highlights.get(NOTE_QUOTE_HIGHLIGHT)?.ranges).toHaveLength(3)

    setQuoteHighlightRanges(original, [])
    expect(highlights.get(NOTE_QUOTE_HIGHLIGHT)?.ranges).toHaveLength(2)
    setQuoteHighlightRanges(translation, [])
    expect(highlights.has(NOTE_QUOTE_HIGHLIGHT)).toBe(false)
  })
})

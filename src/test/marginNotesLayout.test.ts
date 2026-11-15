import { describe, expect, it } from 'vitest'
import { CARD_MAX_WIDTH, CARD_MIN_WIDTH, draftAnchor, fitMarginNotes, placeCards, STAGE_HYSTERESIS, SUMMARY_MAX_WIDTH } from '../notes/marginNotesLayout.ts'

const slot = (key: string, anchor: number, height = 60) => ({ key, anchor, height })

describe('margin notes fit', () => {
  // Колонка 1100px, отступы 2×24, зазоры 2×16: свободно 1100 − 48 − 32 − ширина страницы.
  it('puts full cards on the margin when there is room', () => {
    expect(fitMarginNotes(1100, 640, null)).toEqual({ stage: 'margin', cardWidth: CARD_MAX_WIDTH, reservedSpace: CARD_MAX_WIDTH + 32 })
  })

  it('gives an open summary a wider margin when there is room', () => {
    expect(fitMarginNotes(1300, 640, 'margin', SUMMARY_MAX_WIDTH)).toEqual({ stage: 'margin', cardWidth: SUMMARY_MAX_WIDTH, reservedSpace: SUMMARY_MAX_WIDTH + 32 })
    // Места меньше — сколько есть, как у обычных карточек.
    expect(fitMarginNotes(1100, 640, 'margin', SUMMARY_MAX_WIDTH).cardWidth).toBe(380)
  })

  it('narrows the cards before giving up the margin', () => {
    expect(fitMarginNotes(1100, 800, 'margin')).toEqual({ stage: 'margin', cardWidth: 220, reservedSpace: 252 })
    expect(fitMarginNotes(1100, 820, 'margin').cardWidth).toBe(CARD_MIN_WIDTH)
  })

  it('switches to popovers when the page is too wide, with a gap before coming back', () => {
    expect(fitMarginNotes(1100, 821, 'margin')).toEqual({ stage: 'popover', cardWidth: 0, reservedSpace: 0 })
    // Обратно на поля — только с запасом, чтобы на границе карточки не мигали.
    expect(fitMarginNotes(1100, 820, 'popover').stage).toBe('popover')
    expect(fitMarginNotes(1100, 820 - STAGE_HYSTERESIS, 'popover').stage).toBe('margin')
  })
})

describe('margin cards placement', () => {
  it('keeps cards at their paragraphs and pushes overlapping ones down', () => {
    const tops = placeCards([slot('c', 300), slot('a', 100), slot('b', 120)], null)
    expect(Object.fromEntries(tops)).toEqual({ a: 100, b: 168, c: 300 })
  })

  it('gives the open card its exact place: cards above move up, below move down', () => {
    const tops = placeCards([slot('a', 100), slot('b', 120, 200), slot('c', 140)], 'b')
    expect(Object.fromEntries(tops)).toEqual({ a: 52, b: 120, c: 328 })
  })

  it('never lifts cards above the start of the book', () => {
    const tops = placeCards([slot('a', 10), slot('b', 20)], 'b')
    expect(Object.fromEntries(tops)).toEqual({ a: 10, b: 78 })
    expect(placeCards([], 'x').size).toBe(0)
  })
})

describe('draft anchor', () => {
  it('measures the place in the text, not on the screen', () => {
    const viewport = document.createElement('div')
    Object.defineProperties(viewport, { scrollTop: { value: 900 }, clientHeight: { value: 800 } })
    viewport.getBoundingClientRect = () => ({ top: 50 }) as DOMRect
    // Новая заметка — на четверти экрана от места чтения; цитата — у выделения.
    expect(draftAnchor(viewport)).toBe(1100)
    expect(draftAnchor(viewport, 275)).toBe(1125)
  })
})

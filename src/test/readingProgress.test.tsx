import { cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  parseReadingRecord,
  readingState,
  readReadingRecords,
  recordReading,
  setMarkedRead,
  type ReadingRecord,
} from '../reading/readingProgress.ts'
import { measureReading, READING_DWELL_MS, useReadingTracker } from '../reading/useReadingTracker.ts'

const EMAIL = 'reader@example.com'
const record = (overrides: Partial<ReadingRecord>): ReadingRecord =>
  ({ position: 0, furthest: 0, markedRead: false, openedAt: 0, ...overrides })

/** Колонка с абзацами заданной высоты; jsdom не верстает, поэтому прямоугольники задаём сами. */
function column(viewportHeight: number, paragraphs: number, scrollTop: number, paragraphHeight = 100) {
  const viewport = document.createElement('div')
  const article = document.createElement('article')
  const note = document.createElement('p')
  note.dataset.quoteIgnore = ''
  note.textContent = 'Служебная подпись'
  article.append(note)
  const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
  viewport.getBoundingClientRect = () => rect(0, viewportHeight)
  for (let index = 0; index < paragraphs; index += 1) {
    const paragraph = document.createElement('p')
    paragraph.textContent = `Абзац ${index + 1}`
    paragraph.getBoundingClientRect = () => rect(index * paragraphHeight - scrollTop, paragraphHeight)
    article.append(paragraph)
  }
  viewport.append(article)
  document.body.append(viewport)
  return viewport
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('reading state', () => {
  it('goes from not started to a percentage to finished', () => {
    expect(readingState(undefined)).toEqual({ status: 'new' })
    expect(readingState(record({ furthest: 0.02 }))).toEqual({ status: 'new' })
    expect(readingState(record({ furthest: 0.384 }))).toEqual({ status: 'reading', percent: 38 })
    // 94,9% округляется вниз: «95%» у непрочитанной книги выглядело бы ошибкой.
    expect(readingState(record({ furthest: 0.949 }))).toEqual({ status: 'reading', percent: 94 })
    expect(readingState(record({ furthest: 0.95 }))).toEqual({ status: 'read' })
    expect(readingState(record({ furthest: 0.1, markedRead: true }))).toEqual({ status: 'read' })
  })

  it('rejects broken stored records and clamps fractions', () => {
    expect(parseReadingRecord({ position: 'x', furthest: 0.5 })).toBeNull()
    expect(parseReadingRecord(null)).toBeNull()
    expect(parseReadingRecord({ position: -1, furthest: 7, markedRead: 'yes' }))
      .toEqual({ position: 0, furthest: 1, markedRead: false, openedAt: 0 })
  })
})

describe('reading records', () => {
  it('keeps the furthest point when the reader goes back and resets it on "mark as unread"', () => {
    recordReading(EMAIL, 'job-1', 0.5, 0.6, 1)
    recordReading(EMAIL, 'job-1', 0.1, 0.2, 2)
    expect(readReadingRecords(EMAIL)['job-1']).toEqual({ position: 0.1, furthest: 0.6, markedRead: false, openedAt: 2 })

    setMarkedRead(EMAIL, 'job-1', true)
    expect(readingState(readReadingRecords(EMAIL)['job-1'])).toEqual({ status: 'read' })
    setMarkedRead(EMAIL, 'job-1', false)
    // Снятая отметка сбрасывает и подсчёт: книга снова «не начата», место чтения остаётся.
    expect(readReadingRecords(EMAIL)['job-1']).toMatchObject({ position: 0.1, furthest: 0, markedRead: false })
  })

  it('survives a corrupted storage entry', () => {
    localStorage.setItem('parallel.reading-progress.v1.reader@example.com', '{not json')
    expect(readReadingRecords(EMAIL)).toEqual({})
  })
})

describe('reading measure', () => {
  it('counts paragraphs on screen and skips service captions', () => {
    // 10 абзацев по 100px, экран 300px, прокручено на 400px: видны абзацы 5–7.
    expect(measureReading(column(300, 10, 400))).toEqual({ position: 0.4, seen: 0.7 })
  })

  it('counts PDF pages instead of text lines', () => {
    const viewport = column(300, 0, 0)
    for (let page = 1; page <= 4; page += 1) {
      const element = document.createElement('article')
      element.dataset.documentPage = String(page)
      element.getBoundingClientRect = () => ({ top: (page - 1) * 800, bottom: page * 800, height: 800 }) as DOMRect
      viewport.append(element)
    }
    expect(measureReading(viewport)).toEqual({ position: 0, seen: 0.25 })
  })

  it('measures nothing in a hidden or empty column', () => {
    expect(measureReading(column(0, 5, 0))).toBeNull()
    expect(measureReading(column(300, 0, 0))).toBeNull()
  })
})

describe('reading tracker', () => {
  function Tracker({ viewport }: { viewport: HTMLElement }) {
    const ref = useRef<HTMLElement | null>(viewport)
    useReadingTracker(EMAIL, 'job-1', ref, 'translation')
    return null
  }

  it('records a place only after the reader stays on it', () => {
    vi.useFakeTimers()
    const viewport = column(300, 10, 900)
    render(<Tracker viewport={viewport} />)

    // Прокрутка перезапускает ожидание: пролистанное мимо не засчитывается.
    vi.advanceTimersByTime(READING_DWELL_MS - 100)
    viewport.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(READING_DWELL_MS - 100)
    expect(readReadingRecords(EMAIL)['job-1']).toBeUndefined()

    vi.advanceTimersByTime(100)
    expect(readReadingRecords(EMAIL)['job-1']).toMatchObject({ position: 0.9, furthest: 1 })
  })
})

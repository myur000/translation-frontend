import { describe, expect, it } from 'vitest'
import { bookTitle, COVER_TONES, coverInitial, coverTone, matchesBookQuery } from '../documents/bookTitle.ts'

describe('book title on the shelf', () => {
  it('turns a file name into a readable title', () => {
    expect(bookTitle('lighthouse-keepers-ledger.docx')).toBe('Lighthouse keepers ledger')
    expect(bookTitle('english_course_book.pdf')).toBe('English course book')
    expect(bookTitle('отчёт__2024 - финал.doc')).toBe('Отчёт 2024 финал')
    // Точка внутри названия — не расширение.
    expect(bookTitle('Vol. 2 Notes')).toBe('Vol. 2 Notes')
    expect(bookTitle('.docx')).toBe('.docx')
  })

  it('puts the first letter or digit on the cover', () => {
    expect(coverInitial('журнал смотрителя')).toBe('Ж')
    expect(coverInitial('«2024» отчёт')).toBe('2')
    expect(coverInitial('—')).toBe('•')
  })

  it('gives the same book the same cover tone in any language pair', () => {
    expect(coverTone('ledger.docx')).toBe(coverTone('Ledger.DOCX'))
    const tones = new Set(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf', 'f.pdf', 'g.pdf', 'h.pdf'].map(coverTone))
    expect([...tones].every((tone) => tone >= 0 && tone < COVER_TONES)).toBe(true)
    expect(tones.size).toBeGreaterThan(1)
  })

  it('finds a book by title or file name ignoring case and ё', () => {
    expect(matchesBookQuery('lighthouse-keepers-ledger.docx', 'keepers led')).toBe(true)
    expect(matchesBookQuery('lighthouse-keepers-ledger.docx', 'keepers-ledger')).toBe(true)
    expect(matchesBookQuery('Ёжик в тумане.pdf', 'ежик')).toBe(true)
    expect(matchesBookQuery('report.pdf', '   ')).toBe(true)
    expect(matchesBookQuery('report.pdf', 'договор')).toBe(false)
  })
})

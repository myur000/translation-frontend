import { describe, expect, it } from 'vitest'
import { openWikiLinkAt } from '../notes/caretCoordinates.ts'
import { renderNoteMarkdown } from '../notes/noteMarkdown.ts'
import { noteTitleProblem, parseWikiLink, plainExcerpt, readTag } from '../notes/noteSyntax.ts'

function render(body: string, links: { title: string; note_id: string | null }[] = []) {
  const container = document.createElement('div')
  container.innerHTML = renderNoteMarkdown(body, links)
  return container
}

describe('note syntax (mirrors backend NoteRules / NoteMarkup)', () => {
  it('validates titles like the backend', () => {
    expect(noteTitleProblem('  Сроки  ')).toBeNull()
    expect(noteTitleProblem('   ')).toBe('empty')
    expect(noteTitleProblem('a'.repeat(201))).toBe('tooLong')
    for (const title of ['A[b', 'A]b', 'A|b', 'A#b', 'A^b', 'A\nb']) expect(noteTitleProblem(title)).toBe('forbidden')
  })

  it('parses link targets, aliases, headings and same-note anchors', () => {
    expect(parseWikiLink('Сроки')).toEqual({ target: 'Сроки', label: 'Сроки' })
    expect(parseWikiLink('Сроки|десять дней')).toEqual({ target: 'Сроки', label: 'десять дней' })
    expect(parseWikiLink('Сроки#Оплата')).toEqual({ target: 'Сроки', label: 'Сроки#Оплата' })
    expect(parseWikiLink('#Заголовок').target).toBeNull()
  })

  it('reads tags only where the backend does', () => {
    expect(readTag('#право', 0)).toEqual({ raw: '#право', tag: 'право' })
    expect(readTag('(#Право/Договор/)', 1)?.tag).toBe('право/договор')
    expect(readTag('a#b', 1)).toBeNull()
    expect(readTag('#2026', 0)).toBeNull()
    expect(readTag('# Заголовок', 0)).toBeNull()
  })

  it('finds an unfinished [[link before the caret only', () => {
    expect(openWikiLinkAt('См. [[Сро', 9)).toEqual({ start: 4, fragment: 'Сро' })
    expect(openWikiLinkAt('См. [[Сроки]] и', 15)).toBeNull()
    expect(openWikiLinkAt('[[Сроки|под', 11)).toBeNull()
    expect(openWikiLinkAt('[[a\nb', 5)).toBeNull()
  })

  it('turns raw markdown excerpts into readable text', () => {
    expect(plainExcerpt('Срок — **десять дней**. См. [[Сроки|сроки]] и [сайт](https://a.test) #договор'))
      .toBe('Срок — десять дней. См. сроки и сайт #договор')
    expect(plainExcerpt('# Заголовок\n- пункт `код`')).toBe('Заголовок пункт код')
  })
})

describe('note markdown rendering', () => {
  it('links existing notes by id and marks missing ones as placeholders', () => {
    const view = render('См. [[Сроки|десять дней]] и [[Штрафы]].', [{ title: 'сроки', note_id: 'n-1' }])
    const [existing, missing] = view.querySelectorAll('a.wikilink')
    expect(existing.getAttribute('href')).toBe('/notes/n-1')
    expect(existing.textContent).toBe('десять дней')
    expect(missing.classList.contains('wikilink-missing')).toBe(true)
    expect(missing.getAttribute('href')).toBe('/notes/new?title=%D0%A8%D1%82%D1%80%D0%B0%D1%84%D1%8B')
  })

  it('renders tags as filter links but ignores links and tags inside code', () => {
    const view = render('Тема #Право. `[[Не ссылка]] #нетег`\n\n```\n#тоже_нет\n```')
    expect([...view.querySelectorAll('a.note-tag')].map((tag) => tag.getAttribute('href'))).toEqual(['/notes?tag=%D0%BF%D1%80%D0%B0%D0%B2%D0%BE'])
    expect(view.querySelectorAll('a.wikilink')).toHaveLength(0)
    expect(view.querySelector('code')?.textContent).toBe('[[Не ссылка]] #нетег')
  })

  it('never outputs raw HTML, scripts, dangerous URLs or remote images', () => {
    const view = render([
      '<img src=x onerror="alert(1)"><script>alert(1)</script>',
      '[js](javascript:alert(1)) [data](data:text/html,x) [proto](//evil.test) ![pixel](https://tracker.test/p.png)',
    ].join('\n\n'))
    expect(view.querySelector('img, script')).toBeNull()
    expect(view.textContent).toContain('<script>alert(1)</script>')
    for (const anchor of view.querySelectorAll('a')) expect(anchor.getAttribute('href') ?? '').not.toMatch(/^(javascript:|data:|\/\/)/)
    // Текст «onerror=» остаётся видимым как текст, но ни у одного элемента нет обработчика.
    expect(view.querySelector('[onerror]')).toBeNull()
    // Картинка не загружается сама: остаётся ссылкой с подписью.
    const pixel = [...view.querySelectorAll('a')].find((anchor) => anchor.textContent === 'pixel')
    expect(pixel?.getAttribute('href')).toBe('https://tracker.test/p.png')
    expect(view.textContent).not.toContain('!pixel')
  })

  it('keeps the start number of ordered lists', () => {
    expect(render('3. третий\n4. четвёртый').querySelector('ol')?.getAttribute('start')).toBe('3')
  })

  it('opens external http(s) links in a new tab without leaking the opener', () => {
    const link = render('[Сайт](https://example.test/page)').querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://example.test/page')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })
})

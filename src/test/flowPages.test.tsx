import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { flowPage, flowPageTop } from '../reading/flowPages.ts'
import { useFlowPages } from '../reading/useFlowPages.ts'

afterEach(() => cleanup())

// Колонка 800px, книга 10 800px: прокрутить можно 10 000px, страниц оригинала — 260.
const HEIGHT = 10_800
const VIEW = 800
const TOTAL = 260

describe('pages of a book without page markup', () => {
  it('counts the page from the share of the scroll: top is the first, the end is the last', () => {
    expect(flowPage(0, HEIGHT, VIEW, TOTAL)).toBe(1)
    expect(flowPage(5_000, HEIGHT, VIEW, TOTAL)).toBe(131)
    expect(flowPage(10_000, HEIGHT, VIEW, TOTAL)).toBe(260)
    // Прокрутка за край (упругий скролл) не даёт несуществующих страниц.
    expect(flowPage(-40, HEIGHT, VIEW, TOTAL)).toBe(1)
    expect(flowPage(10_400, HEIGHT, VIEW, TOTAL)).toBe(260)
  })

  it('stays on the first page when everything fits or the book has one page', () => {
    expect(flowPage(0, 600, VIEW, TOTAL)).toBe(1)
    expect(flowPage(3_000, HEIGHT, VIEW, 1)).toBe(1)
    expect(flowPageTop(5, 600, VIEW, TOTAL)).toBe(0)
  })

  it('scrolls to the start of a page so that the counter shows exactly that page', () => {
    for (const page of [1, 2, 4, 130, 259, 260]) {
      const top = flowPageTop(page, HEIGHT, VIEW, TOTAL)
      expect(flowPage(top, HEIGHT, VIEW, TOTAL)).toBe(page)
    }
    expect(flowPageTop(260, HEIGHT, VIEW, TOTAL)).toBe(10_000)
    // Номера за пределами книги прижимаются к её краям.
    expect(flowPageTop(0, HEIGHT, VIEW, TOTAL)).toBe(flowPageTop(1, HEIGHT, VIEW, TOTAL))
    expect(flowPageTop(999, HEIGHT, VIEW, TOTAL)).toBe(10_000)
  })
})

/** Колонка книги и счётчик, как в нижней панели. jsdom не считает раскладку — размеры задаём. */
function Reader({ total }: { total: number | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const pages = useFlowPages(ref, total, 'translation')
  return (
    <>
      <div ref={ref} role="region" aria-label="Колонка" />
      <output aria-label="Страница">{pages.page}</output>
      <button type="button" onClick={() => pages.goTo(pages.page + 1)}>Дальше</button>
    </>
  )
}

describe('page counter of the reading column', () => {
  it('follows the scroll and turns a page by scrolling the column', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Reader total={null} />)
    const column = screen.getByRole('region', { name: 'Колонка' })
    Object.defineProperty(column, 'scrollHeight', { configurable: true, value: HEIGHT })
    Object.defineProperty(column, 'clientHeight', { configurable: true, value: VIEW })
    rerender(<Reader total={TOTAL} />)
    expect(screen.getByRole('status', { name: 'Страница' }).textContent).toBe('1')

    await user.click(screen.getByRole('button', { name: 'Дальше' }))
    expect(column.scrollTop).toBe(flowPageTop(2, HEIGHT, VIEW, TOTAL))
    expect(screen.getByRole('status', { name: 'Страница' }).textContent).toBe('2')

    // Прокрутка пересчитывается раз в кадр.
    column.scrollTop = 5_000
    await act(async () => {
      column.dispatchEvent(new Event('scroll'))
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    })
    expect(screen.getByRole('status', { name: 'Страница' }).textContent).toBe('131')
  })
})

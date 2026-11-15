import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountContext, type AccountContextValue } from '../account/AccountContext.ts'
import type { AccountUsageResponse } from '../api/contracts/account.ts'
import { HistorySidebarPanel } from '../components/sidebar/HistorySidebarPanel.tsx'
import { dayLabel, filterHistory, groupByDay, historyDocuments, historySearch, readHistoryQuery } from '../history/historyQuery.ts'
import { HistoryPage } from '../pages/HistoryPage.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'
import type { DocumentItem } from '../types/document.ts'
import { installDialogPolyfill } from './dialogPolyfill.ts'

const api = vi.hoisted(() => ({ getTerms: vi.fn() }))
vi.mock('../api/terms.ts', () => api)
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => ({ session: { email: 'reader@example.com', accessToken: 'jwt' } }) }))

const at = (daysAgo: number, hours = 14, minutes = 20) => {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}
const doc = (id: string, extra: Partial<DocumentItem>): DocumentItem => ({
  id, jobId: `job-${id}`, name: 'the-archive.pdf', sourceLanguage: 'eng_Latn', targetLanguage: 'rus_Cyrl', pages: 1, status: 'ready', ...extra,
})
const documents: DocumentItem[] = [
  doc('a', { name: 'the-archive.pdf', status: 'processing', progress: 62, billedUnits: 212, glossaryTermCount: 18, createdAt: at(0) }),
  doc('b', { name: 'poyasnitelnaya-zapiska.docx', sourceLanguage: 'rus_Cyrl', targetLanguage: 'eng_Latn', status: 'failed', billedUnits: 34,
    errorMessage: 'Сервис перевода не ответил.', glossaryTermCount: null, createdAt: at(0, 11) }),
  doc('c', { name: 'lighthouse-keepers-ledger.docx', status: 'ready', billedUnits: 48, createdAt: at(3, 9, 41) }),
  doc('d', { name: 'draft.docx', status: 'draft', jobId: undefined }),
]
const usage: AccountUsageResponse = {
  plan_code: 'FREE', plan_display_name: 'Бесплатный', feature_code: 'TRANSLATION' as never, period_type: 'MONTH' as never,
  unlimited: false, limit_units: 500, used_units: 184, remaining_units: 316, resets_at: '2026-12-01T00:00:00Z',
}
const account: AccountContextValue = {
  usage: { data: usage, loading: false, failed: false },
  subscription: { data: null, loading: false, failed: false },
  reload: () => {},
}

function Location() {
  const location = useLocation()
  return <output aria-label="Адрес">{location.pathname}{decodeURIComponent(location.search)}</output>
}

const retranslate = vi.fn()
function renderHistory(path = '/history', withPanel = false, children?: ReactNode) {
  const context = {
    documents, historyState: 'ready', retryHistory: vi.fn(), selectDocument: vi.fn(),
    retranslateDocument: retranslate, deleteDocument: vi.fn(),
  }
  render(
    <PreferencesProvider>
      <AccountContext.Provider value={account}>
        <MemoryRouter initialEntries={[path]}>
          {withPanel ? <HistorySidebarPanel documents={documents} /> : null}
          <Routes>
            <Route element={<Outlet context={context} />}>
              <Route path="/history" element={<HistoryPage />} />
            </Route>
            <Route path="*" element={null} />
          </Routes>
          <Location />
          {children}
        </MemoryRouter>
      </AccountContext.Provider>
    </PreferencesProvider>,
  )
  return context
}
const address = () => screen.getByRole('status', { name: 'Адрес' }).textContent
const row = (title: string) => screen.getByRole('button', { name: title }).closest('li')!

let restoreDialog: () => void
beforeAll(() => { restoreDialog = installDialogPolyfill() })
afterAll(() => restoreDialog())
beforeEach(() => {
  api.getTerms.mockReset()
  api.getTerms.mockResolvedValue({ items: [], page: 0, size: 1, total_elements: 3, total_pages: 3 })
  retranslate.mockReset()
})
afterEach(() => cleanup())

describe('history rules', () => {
  it('groups translations by day, newest first, and names the days', () => {
    const days = groupByDay(historyDocuments(documents))
    expect(days.map((day) => day.documents.map((document) => document.id))).toEqual([['a', 'b'], ['c']])
    const now = new Date()
    const words = { today: 'сегодня', yesterday: 'вчера', undated: 'без даты' }
    expect(dayLabel(days[0], now, 'ru', words)).toBe('сегодня')
    const yesterday = groupByDay([doc('y', { createdAt: at(1) })])[0]
    expect(dayLabel(yesterday, now, 'ru', words)).toBe('вчера')
    expect(dayLabel(days[1], now, 'ru', words)).toMatch(/^\d{1,2} [а-я]+$/)
  })

  it('filters by status group and language pair, and keeps filters in the address', () => {
    const all = historyDocuments(documents)
    expect(all.map((document) => document.id)).toEqual(['a', 'b', 'c'])
    expect(filterHistory(all, { status: 'active', pair: null }).map((document) => document.id)).toEqual(['a'])
    expect(filterHistory(all, { status: 'all', pair: 'rus_Cyrl>eng_Latn' }).map((document) => document.id)).toEqual(['b'])
    expect(readHistoryQuery(historySearch({ status: 'failed', pair: 'eng_Latn>rus_Cyrl' }))).toEqual({ status: 'failed', pair: 'eng_Latn>rus_Cyrl' })
    expect(readHistoryQuery('?status=bogus')).toEqual({ status: 'all', pair: null })
  })
})

describe('history page', () => {
  it('shows each translation with its languages, pages, glossary and state', () => {
    renderHistory()
    expect(screen.getByRole('heading', { name: 'История переводов', level: 1 })).toBeTruthy()
    expect(screen.getByText('3 документа')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Сегодня' })).toBeTruthy()

    const archive = row('The archive')
    expect(within(archive).getByText('EN → RU · 212 стр. · глоссарий: 18 терминов')).toBeTruthy()
    expect(within(archive).getByText('Переводится · 62%')).toBeTruthy()
    expect(within(archive).getByRole('progressbar', { name: '«The archive»: переведено 62%' })).toBeTruthy()

    const failed = row('Poyasnitelnaya zapiska')
    expect(within(failed).getByText('RU → EN · 34 стр. · без глоссария')).toBeTruthy()
    expect(within(failed).getByText('Сервис перевода не ответил.')).toBeTruthy()

    const ledger = row('Lighthouse keepers ledger')
    expect(within(ledger).getByText('Готов')).toBeTruthy()
    expect(within(ledger).getByText(/^09:41/)).toBeTruthy()
    expect(screen.queryByText('Draft')).toBeNull()
  })

  it('opens a book and retries a failed translation into the same language', async () => {
    const user = userEvent.setup()
    const context = renderHistory()
    await user.click(within(row('Lighthouse keepers ledger')).getByRole('button', { name: 'Открыть →' }))
    expect(context.selectDocument).toHaveBeenCalledWith('c')

    await user.click(within(row('Poyasnitelnaya zapiska')).getByRole('button', { name: 'Повторить' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /Английский/ })).toBeTruthy()
    // Упал без глоссария — повтор тоже без него.
    expect((await within(dialog).findByRole('checkbox') as HTMLInputElement).checked).toBe(false)
  })

  it('narrows the list by the panel filters and shows the month’s pages', async () => {
    const user = userEvent.setup()
    renderHistory('/history', true)
    const status = screen.getByRole('heading', { name: 'Статус' }).closest('section')!
    expect(within(status).getByRole('button', { name: 'Все 3' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(within(status).getByRole('button', { name: 'Ошибки 1' }))
    expect(address()).toBe('/history?status=failed')
    expect(screen.getByText('1 документ')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'The archive' })).toBeNull()

    const languages = screen.getByRole('heading', { name: 'Языки' }).closest('section')!
    await user.click(within(languages).getByRole('button', { name: 'EN → RU 2' }))
    expect(screen.getByText('Под эти фильтры ничего не подходит.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Сбросить фильтр' }))
    expect(address()).toBe('/history')

    expect(screen.getByText('184')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Потрачено 184 из 500 страниц' })).toBeTruthy()
    expect(screen.getByText('осталось 316 из 500')).toBeTruthy()
  })
})

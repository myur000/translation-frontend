import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QuoteSelectionButton } from '../components/notes/QuoteSelectionButton.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'

afterEach(() => cleanup())

const selection = {
  side: 'TRANSLATION' as const, text: 'долго', blockText: null, paragraphIndex: 5,
  rect: { top: 300, left: 200, width: 60, height: 20 } as DOMRect,
}

describe('buttons over a selection in the book', () => {
  it('offers both «To note» and «To summary» side by side', async () => {
    const user = userEvent.setup()
    const onQuote = vi.fn()
    const onSummary = vi.fn()
    render(<PreferencesProvider><QuoteSelectionButton selection={selection} onQuote={onQuote} onSummary={onSummary} /></PreferencesProvider>)
    const group = screen.getByRole('group', { name: 'Что сделать с выделением' })
    expect(group.textContent).toBe('В заметкуВ конспект')
    await user.click(screen.getByRole('button', { name: 'В конспект' }))
    expect(onSummary).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'В заметку' }))
    expect(onQuote).toHaveBeenCalledOnce()
  })

  it('shows only «To note» for a book that cannot have a summary yet', () => {
    render(<PreferencesProvider><QuoteSelectionButton selection={selection} onQuote={vi.fn()} /></PreferencesProvider>)
    expect(screen.queryByRole('button', { name: 'В конспект' })).toBeNull()
  })
})

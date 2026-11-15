import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QuoteChoiceMenu } from '../components/notes/QuoteChoiceMenu.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'

afterEach(() => cleanup())

function renderMenu() {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(
    <PreferencesProvider>
      <QuoteChoiceMenu x={120} y={200} summaryTone={2} onPick={onPick} onClose={onClose} choices={[
        { noteId: 'n-1', title: 'Терпение Элиаса', kind: 'note' },
        { noteId: 's-1', title: 'Конспект — Ledger', kind: 'summary' },
      ]} />
      <button type="button">Снаружи</button>
    </PreferencesProvider>,
  )
  return { onPick, onClose }
}

describe('choice between a note and a summary on the same word', () => {
  it('offers both with the keyboard ready and opens the chosen one', async () => {
    const user = userEvent.setup()
    const { onPick } = renderMenu()
    const menu = screen.getByRole('menu', { name: 'Этот фрагмент есть и в заметке, и в конспекте' })
    expect(menu).toBeTruthy()
    // Фокус сразу на первом пункте: стрелка вниз — конспект, Enter — открыть.
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Заметка «Терпение Элиаса»' }))
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Конспект «Конспект — Ledger»' }))
    await user.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith({ noteId: 's-1', title: 'Конспект — Ledger', kind: 'summary' })
  })

  it('closes on Esc and on a click outside without choosing', async () => {
    const user = userEvent.setup()
    const { onPick, onClose } = renderMenu()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Снаружи' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onPick).not.toHaveBeenCalled()
  })
})

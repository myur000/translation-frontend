import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAnchoredPosition, type FloatingAnchor } from '../hooks/useAnchoredPosition.ts'

const anchorAt = (top: number, left: number, width = 40, height = 20): FloatingAnchor => ({
  getBoundingClientRect: () => ({ top, left, width, height, bottom: top + height, right: left + width, x: left, y: top, toJSON: () => ({}) }) as DOMRect,
})
const card = { current: null }
const options = { width: 380, maxHeight: 560 }

afterEach(() => vi.unstubAllGlobals())

describe('anchored card position', () => {
  it('opens below the word when there is room and keeps inside the screen', async () => {
    vi.stubGlobal('innerWidth', 1500)
    vi.stubGlobal('innerHeight', 900)
    const anchor = anchorAt(200, 1400)
    const { result } = renderHook(() => useAnchoredPosition(anchor, card, options))
    await waitFor(() => expect(result.current).not.toBeNull())
    // Под словом с зазором; справа край экрана, поэтому карточка сдвинута влево.
    expect(result.current).toMatchObject({ top: 230, left: 1500 - 380 - 10, maxHeight: 560 })
  })

  it('opens above an anchor near the bottom and shrinks to the room above', async () => {
    vi.stubGlobal('innerWidth', 1500)
    vi.stubGlobal('innerHeight', 900)
    const anchor = anchorAt(500, 600, 200, 60)
    const { result } = renderHook(() => useAnchoredPosition(anchor, card, options))
    await waitFor(() => expect(result.current).not.toBeNull())
    // Ниже 320px, выше 480px: карточка над панелью и не выше места над ней.
    expect(result.current?.maxHeight).toBe(480)
    expect(result.current?.left).toBe(600 + 100 - 190)
  })

  it('is not placed without an anchor', () => {
    const { result } = renderHook(() => useAnchoredPosition(null, card, options))
    expect(result.current).toBeNull()
  })
})
